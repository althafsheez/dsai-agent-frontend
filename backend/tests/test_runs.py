from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.agent import AgentRunner, RunnerCancelled
from app.providers import ChatTurn, ProviderError
from conftest import FakeProvider, create_chat, parse_sse


async def start_run(
    client: AsyncClient,
    headers: dict[str, str],
    chat_id: str,
    message_id: str,
    request_id: str = "run-1",
) -> list[dict]:
    response = await client.post(
        f"/api/chats/{chat_id}/messages/stream",
        headers=headers,
        json={
            "user_message_id": message_id,
            "model_id": "gemini-test",
            "effort": "high",
            "client_request_id": request_id,
        },
    )
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/event-stream")
    return parse_sse(response.text)


async def test_agent_sse_persists_text_events_and_reasoning_selection(
    client: AsyncClient, demo_headers: dict[str, str], provider: FakeProvider
) -> None:
    created = await create_chat(client, demo_headers)
    events = await start_run(client, demo_headers, created["chat"]["id"], created["message"]["id"])
    assert [event["type"] for event in events] == [
        "agent.started",
        "message.created",
        "message.delta",
        "message.delta",
        "message.completed",
        "agent.completed",
    ]
    run_id = events[0]["data"]["run"]["id"]
    assert provider.calls[0][1:] == ("gemini-test", "high")
    assert provider.calls[0][0][-1] == ChatTurn(role="user", content="Analyze revenue")

    run = (await client.get(f"/api/runs/{run_id}", headers=demo_headers)).json()
    assert run["status"] == "completed"
    persisted = (await client.get(f"/api/runs/{run_id}/events", headers=demo_headers)).json()["items"]
    assert [event["sequence"] for event in persisted] == list(range(1, 7))
    messages = (await client.get(
        f"/api/chats/{created['chat']['id']}/messages", headers=demo_headers
    )).json()["items"]
    assert messages[-1]["content"] == "Hello from Gemini"
    assert messages[-1]["status"] == "completed"


async def test_retry_reuses_original_user_message(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    created = await create_chat(client, demo_headers)
    first_events = await start_run(client, demo_headers, created["chat"]["id"], created["message"]["id"])
    first_run_id = first_events[0]["data"]["run"]["id"]
    retry = await client.post(
        f"/api/runs/{first_run_id}/retry/stream",
        headers=demo_headers,
        json={"client_request_id": "retry-1", "effort": "low"},
    )
    assert retry.status_code == 200
    retry_events = parse_sse(retry.text)
    second_run = retry_events[0]["data"]["run"]
    assert second_run["previous_run_id"] == first_run_id
    assert second_run["user_message_id"] == created["message"]["id"]

    messages = (await client.get(
        f"/api/chats/{created['chat']['id']}/messages", headers=demo_headers
    )).json()["items"]
    assert [message["role"] for message in messages].count("user") == 1
    assert [message["role"] for message in messages].count("assistant") == 2


@pytest.mark.parametrize(
    ("model_id", "effort", "code"),
    [("not-allowed", "low", "invalid_model"), ("gemini-test", "extreme", "invalid_effort")],
)
async def test_model_and_effort_validation(
    client: AsyncClient,
    demo_headers: dict[str, str],
    model_id: str,
    effort: str,
    code: str,
) -> None:
    created = await create_chat(client, demo_headers)
    response = await client.post(
        f"/api/chats/{created['chat']['id']}/messages/stream",
        headers=demo_headers,
        json={
            "user_message_id": created["message"]["id"],
            "model_id": model_id,
            "effort": effort,
            "client_request_id": f"invalid-{code}",
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == code


async def test_provider_failure_is_persisted(tmp_path, demo_headers: dict[str, str]) -> None:
    from app.config import Settings
    from app.main import create_app

    provider = FakeProvider(failure=ProviderError("quota_exceeded", "Gemini quota was exceeded."))
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'failure.db'}",
        storage_root=tmp_path / "storage",
    )
    app = create_app(settings=settings, provider=provider)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await create_chat(client, demo_headers)
            events = await start_run(client, demo_headers, created["chat"]["id"], created["message"]["id"])
            assert events[-1]["type"] == "agent.failed"
            assert events[-1]["data"]["error"]["code"] == "quota_exceeded"
            run_id = events[0]["data"]["run"]["id"]
            assert (await client.get(f"/api/runs/{run_id}", headers=demo_headers)).json()["status"] == "failed"


async def test_unexpected_runner_error_is_sanitized(tmp_path, demo_headers: dict[str, str]) -> None:
    from app.config import Settings
    from app.main import create_app

    provider = FakeProvider(failure=RuntimeError("secret transport detail"))
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'unexpected.db'}",
        storage_root=tmp_path / "storage",
    )
    app = create_app(settings=settings, provider=provider)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await create_chat(client, demo_headers)
            events = await start_run(client, demo_headers, created["chat"]["id"], created["message"]["id"])
            assert events[-1]["type"] == "agent.failed"
            assert events[-1]["data"]["error"] == {
                "code": "agent_error",
                "message": "Agent execution failed.",
            }
            assert "secret" not in events[-1]["data"]["error"]["message"]


@pytest.mark.asyncio
async def test_runner_honors_cancellation_checkpoint() -> None:
    provider = FakeProvider(chunks=["one", "two"])
    runner = AgentRunner(provider)
    cancelled = False
    stream = runner.run(
        [ChatTurn(role="user", content="hello")],
        "gemini-test",
        "low",
        lambda: cancelled,
    )
    first = await anext(stream)
    assert first.data == {"text": "one"}
    cancelled = True
    with pytest.raises(RunnerCancelled):
        await anext(stream)
