from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, Request
from fastapi.exception_handlers import request_validation_exception_handler
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from agentic.execution.e2b import E2BSandboxPool
from agentic.providers.gemini import GeminiProvider
from agentic.runtime.contracts import LLMProvider
from agentic.runtime.runner import AgentRunner
from agentic.tools.defaults import build_tool_registry

from .config import Settings, get_settings
from .db import make_engine, make_session_factory
from .migrations import upgrade_schema
from .errors import APIError, api_error_handler
from .connectors.security import LOCAL_ENVIRONMENTS, protect_local_connector_api
from .connectors.service import ConnectionService
from .connectors.tools import register_postgres_tools
from .routes import chats, connectors, meta, quick_assistant, resources, runs, workspaces
from .services.agent_adapter import AgentToolAdapter
from .services.identity import seed_demo_users
from .services.runs import RunCoordinator, reconcile_stale_runs
from .storage import LocalFileStorage


def create_app(settings: Settings | None = None, provider: LLMProvider | None = None) -> FastAPI:
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
    connections = ConnectionService(settings)
    tool_registry = build_tool_registry(
        sandbox_pool, AgentToolAdapter(session_factory, storage, connections),
        tavily_api_key=settings.tavily_api_key,
    )
    if settings.environment in LOCAL_ENVIRONMENTS:
        register_postgres_tools(tool_registry, session_factory, connections)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
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
            reconcile_stale_runs(session)
        yield
        engine.dispose()

    app = FastAPI(
        title=settings.app_name, version="0.1.0", lifespan=lifespan,
        dependencies=[Depends(protect_local_connector_api)],
    )
    app.add_exception_handler(APIError, api_error_handler)

    @app.exception_handler(RequestValidationError)
    async def validate_request(request: Request, exc: RequestValidationError):
        if request.url.path.startswith("/api/connectors"):
            return await api_error_handler(request, APIError(
                422, "invalid_connector_request", "Check the PostgreSQL connection or query fields.",
            ))
        path = request.url.path
        if path.startswith(("/api/chats/", "/api/runs/")) and path.endswith(("/stream", "/runs")):
            return await api_error_handler(request, APIError(
                422, "invalid_run_request", "Check the analysis request fields.",
            ))
        return await request_validation_exception_handler(request, exc)
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
    app.state.run_coordinator = RunCoordinator(development=settings.environment == "development")
    app.state.storage = storage
    app.state.connections = connections
    app.include_router(meta.router)
    app.include_router(workspaces.router)
    app.include_router(chats.router)
    app.include_router(resources.router)
    app.include_router(resources.catalog_router)
    app.include_router(runs.router)
    app.include_router(quick_assistant.router)
    app.include_router(connectors.router)
    return app


app = create_app()
