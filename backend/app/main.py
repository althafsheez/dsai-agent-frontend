from __future__ import annotations

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from agentic.execution.e2b import E2BSandboxPool
from agentic.providers.gemini import GeminiProvider
from agentic.runtime.contracts import LLMProvider
from agentic.runtime.runner import AgentRunner
from agentic.tools.defaults import build_tool_registry

from .config import Settings, get_settings
from .db import make_engine, make_session_factory
from . import snapshot
from .migrations import upgrade_schema
from .errors import APIError, api_error_handler
from .routes import chats, connectors, dashboards, meta, quick_assistant, resources, runs, workflow_store, workspaces
from .services.agent_adapter import AgentToolAdapter
from .services.identity import seed_demo_users
from .services import dashboard_sync
from .services.runs import RunCoordinator, reconcile_stale_runs
from .storage import LocalFileStorage


def create_app(
    settings: Settings | None = None, provider: LLMProvider | None = None, connector_http: httpx.AsyncClient | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    llm_provider = provider or GeminiProvider(
        api_key=settings.gemini_api_key,
        models=settings.gemini_models,
        default_model_id=settings.default_model_id,
    )
    sandbox_pool = E2BSandboxPool(settings.e2b_api_key)
    storage = LocalFileStorage(settings.storage_root)
    connector_client = connector_http or httpx.AsyncClient(timeout=httpx.Timeout(30.0), follow_redirects=False)
    tool_registry = build_tool_registry(
        sandbox_pool, AgentToolAdapter(session_factory, storage),
        tavily_api_key=settings.tavily_api_key,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        if settings.auto_create_schema:
            upgrade_schema(engine)
        performance_logger = logging.getLogger("agentic.performance")
        if not performance_logger.hasHandlers():
            performance_logger.addHandler(logging.StreamHandler())
        performance_logger.disabled = False
        performance_logger.setLevel(logging.INFO)
        settings.storage_root.mkdir(parents=True, exist_ok=True)
        with session_factory() as session:
            seed_demo_users(session)
        if settings.import_shared_data and snapshot.is_fresh(engine):
            snapshot.import_snapshot(engine, settings.storage_root, settings.shared_data_dir)
        with session_factory() as session:
            reconcile_stale_runs(session)
        sync_task = asyncio.create_task(dashboard_sync.sync_loop(app, settings.dashboard_sync_seconds)) if settings.dashboard_sync_seconds > 0 else None
        yield
        if sync_task is not None:
            sync_task.cancel()
        await connector_client.aclose()
        engine.dispose()

    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.add_exception_handler(APIError, api_error_handler)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.settings = settings
    app.state.engine = engine
    app.state.session_factory = session_factory
    app.state.provider = llm_provider
    app.state.runner = AgentRunner(llm_provider, tool_registry, settings.max_agent_steps)
    app.state.sandbox_pool = sandbox_pool
    app.state.run_coordinator = RunCoordinator()
    app.state.storage = storage
    app.state.connector_http = connector_client
    app.include_router(meta.router)
    app.include_router(workspaces.router)
    app.include_router(chats.router)
    app.include_router(resources.router)
    app.include_router(resources.catalog_router)
    app.include_router(runs.router)
    app.include_router(quick_assistant.router)
    app.include_router(connectors.router)
    app.include_router(connectors.sync_router)
    app.include_router(dashboards.router)
    app.include_router(dashboards.run_router)
    app.include_router(dashboards.store_router)
    app.include_router(workflow_store.router)
    return app


app = create_app()
