from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .agent import AgentRunner
from .agent.default_tools import build_tool_registry
from .agent.sandbox import E2BSandboxPool
from .config import Settings, get_settings
from .db import Base, make_engine, make_session_factory
from .errors import APIError, api_error_handler
from .providers import GeminiProvider, LLMProvider
from .routes import chats, meta, resources, runs, workspaces
from .services.identity import seed_demo_users
from .services.runs import RunCoordinator, reconcile_stale_runs
from .storage import LocalFileStorage


def create_app(settings: Settings | None = None, provider: LLMProvider | None = None) -> FastAPI:
    settings = settings or get_settings()
    engine = make_engine(settings.database_url)
    session_factory = make_session_factory(engine)
    llm_provider = provider or GeminiProvider(settings)
    sandbox_pool = E2BSandboxPool(settings.e2b_api_key)
    storage = LocalFileStorage(settings.storage_root)
    tool_registry = build_tool_registry(settings, session_factory, sandbox_pool, storage)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if settings.auto_create_schema:
            Base.metadata.create_all(engine)
        settings.storage_root.mkdir(parents=True, exist_ok=True)
        with session_factory() as session:
            seed_demo_users(session)
            reconcile_stale_runs(session)
        yield
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
    app.include_router(meta.router)
    app.include_router(workspaces.router)
    app.include_router(chats.router)
    app.include_router(resources.router)
    app.include_router(resources.catalog_router)
    app.include_router(runs.router)
    return app


app = create_app()
