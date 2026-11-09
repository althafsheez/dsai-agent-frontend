from __future__ import annotations

from collections.abc import AsyncIterator

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from app.providers import ChatTurn, ModelInfo, ProviderError


class FakeProvider:
    default_model_id = "gemini-test"

    def __init__(self, chunks: list[str] | None = None, failure: Exception | None = None):
        self.chunks = chunks or ["Hello", " from Gemini"]
        self.failure = failure
        self.calls: list[tuple[list[ChatTurn], str, str | None]] = []
        self.model = ModelInfo(
            id="gemini-test",
            label="Gemini Test",
            supported_efforts=("low", "medium", "high"),
            default_effort="medium",
        )

    async def list_models(self) -> tuple[list[ModelInfo], str]:
        return [self.model], "ready"

    def validate_selection(self, model_id: str, effort: str | None) -> ModelInfo:
        if model_id != self.model.id:
            raise ProviderError("invalid_model", "The selected Gemini model is not allowed.")
        if effort is not None and effort not in self.model.supported_efforts:
            raise ProviderError("invalid_effort", "The selected reasoning effort is not supported.")
        return self.model

    async def stream_text(
        self, messages: list[ChatTurn], model_id: str, effort: str | None
    ) -> AsyncIterator[str]:
        self.validate_selection(model_id, effort)
        self.calls.append((messages, model_id, effort))
        if self.failure:
            raise self.failure
        for chunk in self.chunks:
            yield chunk


@pytest.fixture
def provider() -> FakeProvider:
    return FakeProvider()


@pytest_asyncio.fixture
async def client(tmp_path, provider: FakeProvider) -> AsyncIterator[AsyncClient]:
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'test.db'}",
        storage_root=tmp_path / "storage",
        auto_create_schema=True,
        cors_origins=["http://localhost:3000"],
    )
    app = create_app(settings=settings, provider=provider)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
            yield test_client


@pytest.fixture
def demo_headers() -> dict[str, str]:
    return {"X-Demo-User-Id": "user-you"}


async def create_chat(client: AsyncClient, headers: dict[str, str], request_id: str = "create-1") -> dict:
    response = await client.post(
        "/api/chats",
        headers=headers,
        json={"workspace_id": None, "content": "Analyze revenue", "client_request_id": request_id},
    )
    assert response.status_code == 201, response.text
    return response.json()


def parse_sse(response_text: str) -> list[dict]:
    import json

    events: list[dict] = []
    for frame in response_text.strip().split("\n\n"):
        data_lines = [line[6:] for line in frame.splitlines() if line.startswith("data: ")]
        if data_lines:
            events.append(json.loads("\n".join(data_lines)))
    return events
