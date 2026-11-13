from __future__ import annotations

import asyncio

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.agent import AgentRunner, RunnerCancelled
from app.agent.tools import ToolContext, ToolDefinition, ToolRegistry
from app.models import AgentRun, SteeringInstruction
from app.providers import ChatTurn, ProviderError, ProviderEvent
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
    discovered = (await client.get(f"/api/chats/{created['chat']['id']}/runs", headers=demo_headers)).json()["items"]
    assert [item["id"] for item in discovered] == [run_id]
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


@pytest.mark.asyncio
async def test_runner_executes_registered_tools_and_forwards_public_events() -> None:
    class ToolProvider(FakeProvider):
        async def stream_with_tools(self, messages, model_id, effort, tools, execute_tool, max_steps):
            assert tools[0].name == "echo"
            yield ProviderEvent("tool.started", {"tool_call_id": "call-1", "name": "echo", "arguments": {"value": "hello"}})
            result = await execute_tool("echo", {"value": "hello"})
            yield ProviderEvent("tool.completed", {"tool_call_id": "call-1", "name": "echo", "output": result})
            yield ProviderEvent("message.delta", {"text": result["value"]})

    async def echo(arguments, context):
        assert context.run_id == "run-tools"
        return {"value": arguments["value"]}

    registry = ToolRegistry()
    registry.register(ToolDefinition("echo", "Echo a value", {"type": "object"}, echo))
    runner = AgentRunner(ToolProvider(), registry)
    events = [event async for event in runner.run(
        [ChatTurn("user", "echo hello")],
        "gemini-test",
        "low",
        lambda: False,
        ToolContext("run-tools", "chat-tools", "user-you"),
    )]
    assert [event.type for event in events] == ["tool.started", "tool.completed", "message.delta"]
    started, completed, _ = events
    assert started.data["step_id"] != "call-1"
    assert started.data["run_id"] == "run-tools"
    assert started.data["message_id"] == ""
    assert started.data["summary"] == "Starting echo."
    assert completed.data["step_id"] == started.data["step_id"]
    assert isinstance(completed.data["duration_ms"], int)
    assert events[-1].data == {"text": "hello"}


async def test_queue_runs_next_and_steer_restarts_same_run(tmp_path, demo_headers: dict[str, str]) -> None:
    from app.config import Settings
    from app.main import create_app

    class BlockingProvider(FakeProvider):
        def __init__(self) -> None:
            super().__init__()
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def stream_text(self, messages, model_id, effort):
            self.validate_selection(model_id, effort)
            self.calls.append((messages, model_id, effort))
            call_number = len(self.calls)
            if call_number == 1:
                self.started.set()
                await self.release.wait()
                yield "Initial response."
            elif call_number == 2:
                assert messages[-1] == ChatTurn(role="user", content="High-priority steering instruction: Focus on enterprise")
                yield "Steered response."
            else:
                assert messages[-1] == ChatTurn(role="user", content="Compare last quarter")
                yield "Queued response."

    provider = BlockingProvider()
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'queue-steer.db'}",
        storage_root=tmp_path / "storage",
    )
    app = create_app(settings=settings, provider=provider)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await create_chat(client, demo_headers)
            stream_task = asyncio.create_task(client.post(
                f"/api/chats/{created['chat']['id']}/messages/stream",
                headers=demo_headers,
                json={
                    "user_message_id": created["message"]["id"],
                    "model_id": "gemini-test",
                    "effort": "high",
                    "client_request_id": "active-run",
                },
            ))
            await asyncio.wait_for(provider.started.wait(), timeout=2)
            with app.state.session_factory() as session:
                active_run = session.scalar(select(AgentRun).where(AgentRun.status == "running"))
                assert active_run is not None
                active_run_id = active_run.id

            queued = await client.post(
                f"/api/runs/{active_run_id}/queue",
                headers=demo_headers,
                json={
                    "content": "Compare last quarter",
                    "model_id": "gemini-test",
                    "effort": "medium",
                    "client_request_id": "queued-run",
                },
            )
            assert queued.status_code == 201, queued.text
            assert queued.json()["message"]["status"] == "queued"

            steered = await client.post(
                f"/api/runs/{active_run_id}/steer",
                headers=demo_headers,
                json={"content": "Focus on enterprise", "client_request_id": "steer-run"},
            )
            assert steered.status_code == 201, steered.text
            assert steered.json()["instruction"]["status"] == "received"

            provider.release.set()
            response = await asyncio.wait_for(stream_task, timeout=3)
            assert response.status_code == 200
            events = parse_sse(response.text)
            assert "steer.applied" in [event["type"] for event in events]
            assert "steer.unapplied" not in [event["type"] for event in events]
            assert [event["type"] for event in events].count("agent.completed") == 2
            assert len({event["run_id"] for event in events if event["type"] == "agent.started"}) == 2
            with app.state.session_factory() as session:
                runs = list(session.scalars(select(AgentRun).order_by(AgentRun.created_at)))
                instruction = session.scalar(select(SteeringInstruction))
                assert [run.status for run in runs] == ["completed", "completed"]
                assert instruction is not None
                assert instruction.run_id == runs[0].id
                assert instruction.status == "applied"


async def test_stop_during_run_cancels_without_completing(tmp_path, demo_headers: dict[str, str]) -> None:
    from app.config import Settings
    from app.main import create_app

    class CancellableProvider(FakeProvider):
        def __init__(self) -> None:
            super().__init__()
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def stream_text(self, messages, model_id, effort):
            self.validate_selection(model_id, effort)
            self.started.set()
            await self.release.wait()
            yield "This partial answer must be retained."

    provider = CancellableProvider()
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'cancel-run.db'}",
        storage_root=tmp_path / "storage",
    )
    app = create_app(settings=settings, provider=provider)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await create_chat(client, demo_headers)
            stream_task = asyncio.create_task(client.post(
                f"/api/chats/{created['chat']['id']}/messages/stream",
                headers=demo_headers,
                json={
                    "user_message_id": created["message"]["id"],
                    "model_id": "gemini-test",
                    "effort": "high",
                    "client_request_id": "cancel-run",
                },
            ))
            await asyncio.wait_for(provider.started.wait(), timeout=2)
            with app.state.session_factory() as session:
                active_run = session.scalar(select(AgentRun).where(AgentRun.status == "running"))
                assert active_run is not None
                active_run_id = active_run.id

            cancel = await client.post(
                f"/api/runs/{active_run_id}/cancel",
                headers=demo_headers,
                json={"reason": "user"},
            )
            assert cancel.status_code == 202
            provider.release.set()
            response = await asyncio.wait_for(stream_task, timeout=3)
            events = parse_sse(response.text)
            assert events[-1]["type"] == "agent.cancelled"
            assert "agent.completed" not in [event["type"] for event in events]
            with app.state.session_factory() as session:
                run = session.get(AgentRun, active_run_id)
                assert run is not None and run.status == "cancelled"


async def test_paused_queue_can_be_resumed_after_a_failed_run(tmp_path, demo_headers: dict[str, str]) -> None:
    from app.config import Settings
    from app.main import create_app

    class FailingThenSuccessfulProvider(FakeProvider):
        def __init__(self) -> None:
            super().__init__()
            self.started = asyncio.Event()
            self.release = asyncio.Event()

        async def stream_text(self, messages, model_id, effort):
            self.validate_selection(model_id, effort)
            self.calls.append((messages, model_id, effort))
            if len(self.calls) == 1:
                self.started.set()
                await self.release.wait()
                raise ProviderError("provider_error", "The provider failed.")
            yield "Recovered queued response."

    provider = FailingThenSuccessfulProvider()
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'resume-queue.db'}",
        storage_root=tmp_path / "storage",
    )
    app = create_app(settings=settings, provider=provider)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await create_chat(client, demo_headers)
            stream_task = asyncio.create_task(client.post(
                f"/api/chats/{created['chat']['id']}/messages/stream",
                headers=demo_headers,
                json={
                    "user_message_id": created["message"]["id"],
                    "model_id": "gemini-test",
                    "effort": "high",
                    "client_request_id": "failing-run",
                },
            ))
            await asyncio.wait_for(provider.started.wait(), timeout=2)
            with app.state.session_factory() as session:
                active_run = session.scalar(select(AgentRun).where(AgentRun.status == "running"))
                assert active_run is not None
                active_run_id = active_run.id
            queued = await client.post(
                f"/api/runs/{active_run_id}/queue",
                headers=demo_headers,
                json={
                    "content": "Try this after the failure",
                    "model_id": "gemini-test",
                    "effort": "medium",
                    "client_request_id": "paused-queue",
                },
            )
            assert queued.status_code == 201
            provider.release.set()
            failed = await asyncio.wait_for(stream_task, timeout=3)
            assert "agent.failed" in [event["type"] for event in parse_sse(failed.text)]

            resumed = await client.post(
                f"/api/chats/{created['chat']['id']}/queue/resume/stream",
                headers=demo_headers,
            )
            assert resumed.status_code == 200
            assert "agent.completed" in [event["type"] for event in parse_sse(resumed.text)]
            with app.state.session_factory() as session:
                statuses = list(session.scalars(select(AgentRun.status).order_by(AgentRun.created_at)))
                assert statuses == ["failed", "completed"]
