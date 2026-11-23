from __future__ import annotations

import asyncio
import hashlib

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from agentic.execution.e2b import E2BSandboxPool
from agentic.runtime.contracts import ChatTurn, ProviderError, ToolContext
from agentic.runtime.events import ProviderEvent, RunnerCancelled
from agentic.runtime.runner import AgentRunner
from agentic.tools.registry import ToolDefinition, ToolRegistry
from app.models import AgentRun, SteeringInstruction
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


@pytest.mark.parametrize("uses_sandbox", [False, True], ids=["greeting", "sandbox"])
async def test_selective_staging_through_backend_adapter(tmp_path, demo_headers, monkeypatch, uses_sandbox):
    from app.config import Settings
    from app.main import create_app

    outputs = {
        "/home/user/outputs/result.csv": b"value\n42\n",
        "/home/user/outputs/chart.png": b"chart bytes",
        "/home/user/outputs/report.pdf": b"%PDF-1.4\nreport",
    }
    selected = {}
    staged = []
    acknowledged = []
    closed = []
    executions = []

    class ToolProvider(FakeProvider):
        async def stream_with_tools(self, messages, model_id, effort, tools, execute_tool, max_steps, *, tool_context):
            question = "Analyze iris" if uses_sandbox else "Hi"
            assert messages[-1] == ChatTurn("user", question)
            inventory = {file["resource_id"]: file for file in tool_context["files"]}
            assert len(inventory) == 43
            iris_file = inventory[selected["iris"]]
            assert iris_file["name"] == "iris.csv"
            assert iris_file["resource_type"] == "dataset"
            assert iris_file["size_bytes"] == len(b"value\n21\n")
            assert inventory[selected["other_iris"]]["path"] != iris_file["path"]
            assert selected["unrelated"] not in inventory
            assert not staged
            if not uses_sandbox:
                yield ProviderEvent("message.delta", {"text": "Hello"})
                return
            calls = [
                ("execute_python", {"code": "print(42)"}, True),
                ("generate_visualization", {"code": "chart", "resource_ids": [selected["iris"]]}, True),
                ("read_file", {"path": iris_file["path"]}, True),
                ("lookup_data", {"resource_id": selected["sales"], "sql": "SELECT * FROM dataset"}, True),
                ("read_file", {"resource_id": selected["other_iris"]}, True),
                ("read_file", {"resource_id": selected["unrelated"]}, False),
                ("lookup_data", {"path": "/home/user/inputs/missing.csv", "sql": "SELECT * FROM dataset"}, False),
                ("execute_python", {"code": "not called", "resource_ids": ["nonexistent"]}, False),
            ]
            for index, (name, arguments, allowed) in enumerate(calls):
                data = {"tool_call_id": f"call-{index}", "name": name}
                yield ProviderEvent("tool.started", {**data, "arguments": arguments})
                result = await execute_tool(name, arguments)
                assert bool(result.get("error")) is not allowed
                if name == "lookup_data" and allowed:
                    assert result["rows"] == [{"value": 5}]
                yield ProviderEvent("tool.completed" if allowed else "tool.failed", {**data, "output": result})
            yield ProviderEvent("message.delta", {"text": "Done"})

    async def upload_input(run_id, filename, content):
        path = E2BSandboxPool.input_path(filename)
        staged.append((run_id, path, content))
        return path

    async def execute(run_id, code, timeout):
        executions.append(run_id)
        if code == "print(42)":
            assert not staged
            return {"success": True, "stdout": "42"}
        if code == "chart":
            assert [content for _, _, content in staged] == [b"value\n21\n"]
            return {
                "success": True,
                "generated_files": [
                    {"path": path, "sha256": hashlib.sha256(content).hexdigest()}
                    for path, content in outputs.items()
                ],
            }
        assert "SELECT * FROM dataset" in code
        assert [content for _, _, content in staged] == [b"value\n21\n", b"value\n5\n"]
        return {"success": True, "stdout": '[{"value":5}]'}

    async def read_text(run_id, path):
        return {"content": next(content.decode() for _, actual, content in staged if actual == path)}

    async def read_output_bytes(run_id, path):
        return outputs[path]

    async def close(run_id):
        closed.append(run_id)

    app = create_app(Settings(
        _env_file=None, database_url=f"sqlite:///{tmp_path / 'agent-adapter.db'}",
        storage_root=tmp_path / "storage",
    ), provider=ToolProvider())
    sandbox = app.state.sandbox_pool
    for name, handler in (
        ("upload_input", upload_input), ("execute", execute), ("read_text", read_text),
        ("read_output_bytes", read_output_bytes), ("close", close),
        ("acknowledge_output", lambda run_id, path, digest: acknowledged.append(path)),
    ):
        monkeypatch.setattr(sandbox, name, handler)
    monkeypatch.setattr(sandbox, "_start_sync", lambda run_id: pytest.fail("Unexpected live sandbox startup"))

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            question = "Analyze iris" if uses_sandbox else "Hi"
            chat_response = await client.post("/api/chats", headers=demo_headers, json={
                "content": question, "client_request_id": "selective-inputs",
            })
            chat = chat_response.json()
            other_chat = await create_chat(client, demo_headers, "create-other")
            chat_id = chat["chat"]["id"]
            uploads = [
                ("iris", chat_id, "iris.csv", b"value\n21\n"),
                ("other_iris", chat_id, "iris.csv", b"value\n99\n"),
                ("sales", chat_id, "sales.csv", b"value\n5\n"),
                ("unrelated", other_chat["chat"]["id"], "unrelated.csv", b"value\n0\n"),
                *((str(n), chat_id, f"extra-{n}.csv", b"value\n1\n") for n in range(40)),
            ]
            for key, target, name, content in uploads:
                uploaded = await client.post("/api/resources/upload", headers=demo_headers, data={
                    "scope_type": "chat", "scope_id": target, "client_upload_id": key,
                }, files={"file": (name, content, "text/csv")})
                assert uploaded.status_code == 201, uploaded.text
                selected[key] = uploaded.json()["resource"]["id"]

            events = await start_run(client, demo_headers, chat_id, chat["message"]["id"])
            assert events[-1]["type"] == "agent.completed", events[-1]
            run_id = events[-1]["run_id"]
            assert closed == [run_id]
            if not uses_sandbox:
                assert staged == acknowledged == executions == []
                assert not any(event["type"].startswith("tool.") for event in events)
                return

            assert executions == [run_id] * 3
            assert [content for _, _, content in staged] == [b"value\n21\n", b"value\n5\n", b"value\n99\n"]
            assert all(upload_run_id == run_id for upload_run_id, _, _ in staged)
            assert acknowledged == list(outputs)
            started = [event["data"] for event in events if event["type"] == "tool.started"]
            assert [[file["id"] for file in step["input_resources"]] for step in started] == [
                [], [selected["iris"]], [selected["iris"]], [selected["sales"]], [selected["other_iris"]], [], [], [],
            ]
            results = [event["data"] for event in events if event["type"] in {"tool.completed", "tool.failed"}]
            assert [(step["step_id"], step["tool_call_id"]) for step in started] == [
                (step["step_id"], step["tool_call_id"]) for step in results
            ]

            for event in events:
                if event["type"] not in {"dataset.created", "artifact.created"}:
                    continue
                resource = event["data"][event["type"].split(".")[0]]
                assert resource["producing_step_id"] == started[1]["step_id"]
                assert resource["input_resource_ids"] == [selected["iris"]]
                download = await client.get(f"/api/resources/{resource['id']}/download", headers=demo_headers)
                assert download.content == outputs[f"/home/user/outputs/{resource['name']}"]
                if event["type"] == "artifact.created":
                    saved = await client.post(f"/api/resources/{resource['id']}/library", headers=demo_headers)
                    assert saved.status_code == 201
            library = await client.get("/api/library", headers=demo_headers)
            assert {item["name"] for item in library.json()["items"]} == {"chart.png", "report.pdf"}


@pytest.mark.parametrize(("message", "expects_tools"), [("Hi!", False), ("Hi, analyze input.csv", True)])
async def test_gemini_uses_tools_only_when_greeting_includes_a_request(monkeypatch, message, expects_tools):
    from agentic.agent.react_loop import ReActAgent
    from agentic.providers.gemini import GeminiProvider
    from agentic.runtime.contracts import ProviderTool

    provider = GeminiProvider(api_key=None, models="gemini-test:medium", default_model_id="gemini-test")
    monkeypatch.setattr(provider, "_client", object())

    async def stream_turns(**kwargs):
        assert bool(kwargs["config"].tools) is expects_tools
        assert ("input.csv" in kwargs["config"].system_instruction) is expects_tools
        assert [(turn.role, turn.parts[0].text) for turn in kwargs["contents"]] == [("user", message)]
        if not expects_tools:
            result = await kwargs["execute_tool"]("list_files", {})
            assert "Reply directly" in result["error"]
        yield {"type": "delta", "content": "Test response"}

    async def execute_tool(name, arguments):
        pytest.fail("The mock stream does not execute tools.")

    monkeypatch.setattr(ReActAgent, "stream_turns", staticmethod(stream_turns))
    events = [event async for event in provider.stream_with_tools(
        [ChatTurn("user", message)], "gemini-test", "medium",
        (ProviderTool("list_files", "List files", {"type": "object"}),), execute_tool, 8,
        tool_context={"files": [{"name": "input.csv"}]},
    )]
    assert events == [ProviderEvent("message.delta", {"text": "Test response"})]


@pytest.mark.parametrize("with_files", [False, True])
async def test_queue_runs_next_and_steer_restarts_same_run(tmp_path, demo_headers: dict[str, str], with_files) -> None:
    from app.config import Settings
    from app.main import create_app
    from app.services.agent_adapter import AgentToolAdapter

    final_question = "Compare both quarters by region" if with_files else "Compare last quarter by region"

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
                await asyncio.wait_for(self.release.wait(), timeout=5)
                yield "Initial response."
            elif call_number == 2:
                assert messages[-1] == ChatTurn(role="user", content="High-priority steering instruction: Focus on enterprise")
                yield "Steered response."
            elif call_number == 3:
                assert messages[-1] == ChatTurn(role="user", content="Run this first")
                yield "Moved response."
            else:
                assert messages[-3:] == [
                    ChatTurn(role="user", content="Run this first"),
                    ChatTurn(role="assistant", content="Moved response."),
                    ChatTurn(role="user", content=final_question),
                ]
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

            queue_url = f"/api/runs/{active_run_id}/queue"
            body = {
                "content": "Compare last quarter",
                "model_id": "gemini-test",
                "effort": "medium",
                "client_request_id": "queued-run",
            }
            library_id = None
            if with_files:
                other = await create_chat(client, demo_headers, "library-source")
                uploaded = await client.post("/api/resources/upload", headers=demo_headers, data={
                    "scope_type": "chat", "scope_id": other["chat"]["id"], "client_upload_id": "saved-input",
                }, files={"file": ("saved.csv", b"value\n2\n", "text/csv")})
                assert uploaded.status_code == 201
                library_id = uploaded.json()["resource"]["id"]
                assert (await client.post(f"/api/resources/{library_id}/library", headers=demo_headers)).status_code == 201

                rejected = await client.post(f"{queue_url}/with-files", headers=demo_headers, data=body, files=[
                    ("files", ("quarter.csv", b"value\n1\n", "text/csv")),
                    ("files", ("unsupported.exe", b"x", "application/octet-stream")),
                ])
                assert rejected.status_code == 415
                queued = await client.post(f"{queue_url}/with-files", headers=demo_headers, data={
                    **body, "resource_ids": library_id,
                }, files=[
                    ("files", ("quarter.csv", b"value\n1\n", "text/csv")),
                    ("files", ("query.sql", b"SELECT 1", "text/plain")),
                ])
            else:
                queued = await client.post(queue_url, headers=demo_headers, json=body)
            assert queued.status_code == 201, queued.text
            queued_payload = queued.json()
            original_message = queued_payload["message"]
            assert original_message["status"] == "queued"
            queued_id = queued_payload["run"]["id"]
            if with_files:
                assert len(original_message["attachment_refs"]) == 3
                assert library_id in {item["resource_id"] for item in original_message["attachment_refs"]}
                adapter = AgentToolAdapter(app.state.session_factory, app.state.storage)
                current_context = ToolContext(active_run_id, created["chat"]["id"], demo_headers["X-Demo-User-Id"])
                before = await adapter.prepare(current_context, E2BSandboxPool.input_path)
                assert "files" not in before

            edited = await client.patch(f"/api/runs/{queued_id}/queue", headers=demo_headers, json={
                "content": "Compare last quarter by region",
            })
            assert edited.status_code == 200
            assert edited.json()["id"] == original_message["id"]
            assert edited.json()["attachment_refs"] == original_message["attachment_refs"]
            if with_files:
                removed_ids = [
                    item["resource_id"] for item in original_message["attachment_refs"]
                    if item["name"] in {"query.sql", "saved.csv"}
                ]
                edit_url = f"/api/runs/{queued_id}/queue/with-files"
                form = {"content": final_question, "remove_resource_ids": removed_ids}
                new_file = ("files", ("region.csv", b"region,value\nNorth,3\n", "text/csv"))
                rejected = await client.patch(edit_url, headers=demo_headers, data={
                    **form, "client_upload_ids": ["region-file", "unsupported-file"],
                }, files=[new_file, ("files", ("unsupported.exe", b"x", "application/octet-stream"))])
                assert rejected.status_code == 415
                messages = await client.get(f"/api/chats/{created['chat']['id']}/messages", headers=demo_headers)
                saved = next(item for item in messages.json()["items"] if item["id"] == original_message["id"])
                assert saved["content"] == edited.json()["content"]
                assert saved["attachment_refs"] == original_message["attachment_refs"]

                for _ in range(2):  # Retrying the same upload keeps the attachment IDs stable.
                    updated = await client.patch(edit_url, headers=demo_headers, data={
                        **form, "client_upload_ids": "region-file",
                    }, files=[new_file])
                    assert updated.status_code == 200, updated.text
                    assert updated.json()["id"] == original_message["id"]
                    assert updated.json()["content"] == form["content"]
                    assert sorted(item["name"] for item in updated.json()["attachment_refs"]) == ["quarter.csv", "region.csv"]
                library = await client.get("/api/library", headers=demo_headers)
                assert [item["id"] for item in library.json()["items"]] == [library_id]

            other_question = await client.post(queue_url, headers=demo_headers, json={
                **body, "content": "Run this first", "client_request_id": "moved-run",
            })
            assert other_question.status_code == 201
            moved_id = other_question.json()["run"]["id"]
            order_url = f"/api/chats/{created['chat']['id']}/queue/order"
            assert (await client.patch(order_url, headers=demo_headers, json={"run_ids": [moved_id, active_run_id]})).status_code == 409
            assert (await client.patch(order_url, headers=demo_headers, json={"run_ids": [moved_id, queued_id]})).status_code == 204

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
            assert [event["type"] for event in events].count("agent.completed") == 3
            assert [event["run_id"] for event in events if event["type"] == "agent.started"] == [active_run_id, moved_id, queued_id]
            if with_files:
                next_context = ToolContext(queued_id, created["chat"]["id"], demo_headers["X-Demo-User-Id"])
                following = await adapter.prepare(next_context, E2BSandboxPool.input_path)
                assert sorted(item["name"] for item in following["files"]) == ["quarter.csv", "region.csv"]
                late_edit = await client.patch(edit_url, headers=demo_headers, data={
                    **form, "client_upload_ids": "late-file",
                }, files=[new_file])
                assert late_edit.status_code == 409
            assert (await client.patch(
                f"/api/runs/{queued_id}/queue", headers=demo_headers, json={"content": "Too late"},
            )).status_code == 409
            with app.state.session_factory() as session:
                runs = list(session.scalars(select(AgentRun).order_by(AgentRun.created_at)))
                instruction = session.scalar(select(SteeringInstruction))
                assert [run.status for run in runs] == ["completed", "completed", "completed"]
                assert instruction is not None
                assert instruction.run_id == runs[0].id
                assert instruction.status == "applied"


async def test_steering_reuses_staged_files_and_stop_closes_the_sandbox(tmp_path, demo_headers, monkeypatch):
    from app.config import Settings
    from app.main import create_app

    entered = asyncio.Queue()
    release = [asyncio.Event(), asyncio.Event()]
    uploads = []
    closed = []

    class ToolProvider(FakeProvider):
        rounds = 0

        async def stream_with_tools(self, messages, model_id, effort, tools, execute_tool, max_steps, *, tool_context):
            turn = self.rounds
            self.rounds += 1
            if turn == 1:
                assert messages[-1].content.endswith("Keep the result concise")
            args = {"code": str(turn), "resource_ids": [tool_context["files"][0]["id"]]}
            data = {"tool_call_id": f"call-{turn}", "name": "execute_python"}
            yield ProviderEvent("tool.started", {**data, "arguments": args})
            result = await execute_tool("execute_python", args)
            yield ProviderEvent("tool.completed", {**data, "output": result})

    async def upload(run_id, filename, content):
        uploads.append(run_id)
        return E2BSandboxPool.input_path(filename)

    async def execute(run_id, code, timeout):
        assert uploads == [run_id]
        await entered.put(run_id)
        await release[int(code)].wait()
        return {"success": True}

    async def close(run_id):
        closed.append(run_id)

    app = create_app(Settings(
        _env_file=None, database_url=f"sqlite:///{tmp_path / 'staging-steer.db'}",
        storage_root=tmp_path / "storage",
    ), provider=ToolProvider())
    for name, callback in (("upload_input", upload), ("execute", execute), ("close", close)):
        monkeypatch.setattr(app.state.sandbox_pool, name, callback)

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await create_chat(client, demo_headers)
            chat_id = created["chat"]["id"]
            uploaded = await client.post("/api/resources/upload", headers=demo_headers, data={
                "scope_type": "chat", "scope_id": chat_id, "client_upload_id": "input",
            }, files={"file": ("iris.csv", b"value\n42\n", "text/csv")})
            assert uploaded.status_code == 201
            run = asyncio.create_task(start_run(client, demo_headers, chat_id, created["message"]["id"]))
            try:
                run_id = await asyncio.wait_for(entered.get(), timeout=3)
                steered = await client.post(f"/api/runs/{run_id}/steer", headers=demo_headers, json={
                    "content": "Keep the result concise", "client_request_id": "steer-staging",
                })
                assert steered.status_code == 201
                release[0].set()
                assert await asyncio.wait_for(entered.get(), timeout=3) == run_id
                assert closed == []
                stopped = await client.post(f"/api/runs/{run_id}/cancel", headers=demo_headers, json={"reason": "user"})
                assert stopped.status_code == 202
                release[1].set()
                events = await asyncio.wait_for(run, timeout=3)
                assert "steer.applied" in [event["type"] for event in events]
                assert events[-1]["type"] == "agent.cancelled"
                assert uploads == closed == [run_id]
            finally:
                for signal in release:
                    signal.set()
                if not run.done():
                    run.cancel()
                    await asyncio.gather(run, return_exceptions=True)


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
                await asyncio.wait_for(self.release.wait(), timeout=5)
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
            second = await client.post(f"/api/runs/{active_run_id}/queue", headers=demo_headers, json={
                "content": "Move this ahead before resuming",
                "model_id": "gemini-test", "client_request_id": "paused-queue-second",
            })
            assert second.status_code == 201
            order = [second.json()["run"]["id"], queued.json()["run"]["id"]]
            provider.release.set()
            failed = await asyncio.wait_for(stream_task, timeout=3)
            assert "agent.failed" in [event["type"] for event in parse_sse(failed.text)]
            reordered = await client.patch(
                f"/api/chats/{created['chat']['id']}/queue/order", headers=demo_headers, json={"run_ids": order},
            )
            assert reordered.status_code == 204

            resumed = await asyncio.wait_for(client.post(
                f"/api/chats/{created['chat']['id']}/queue/resume/stream", headers=demo_headers,
            ), timeout=3)
            assert resumed.status_code == 200
            events = parse_sse(resumed.text)
            assert [event["run_id"] for event in events if event["type"] == "agent.started"] == order
            assert [event["run_id"] for event in events if event["type"] == "agent.completed"] == order
            with app.state.session_factory() as session:
                statuses = list(session.scalars(select(AgentRun.status).order_by(AgentRun.created_at)))
                assert statuses == ["failed", "completed", "completed"]


async def test_chat_stream_runs_react_tool_turn_and_final_synthesis(tmp_path, demo_headers, monkeypatch):
    from google.genai import models, types

    from app.config import Settings
    from app.main import create_app

    calls = []

    async def generate_stream(self, *, model, contents, config):
        calls.append(config)
        if len(calls) == 1:
            assert config.tools
            call = types.FunctionCall(name="load_memory", id="memory-1", args={})
            parts = [types.Part(text="internal", thought=True), types.Part(function_call=call)]
        else:
            assert config.tool_config.function_calling_config.mode == "NONE"
            response = contents[-2].parts[0].function_response
            assert response.id == "memory-1"
            assert response.response == {"memories": []}
            parts = [types.Part.from_text(text="No saved memories.")]

        async def chunks():
            yield types.GenerateContentResponse(candidates=[
                types.Candidate(content=types.Content(role="model", parts=parts)),
            ])
        return chunks()

    monkeypatch.setattr(models.AsyncModels, "generate_content_stream", generate_stream)
    app = create_app(Settings(
        database_url=f"sqlite:///{tmp_path / 'react.db'}", storage_root=tmp_path / "storage",
        gemini_models="test-model:low", gemini_api_key="test-key", max_agent_steps=1,
    ))
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            created = await create_chat(client, demo_headers)
            path = f"/api/chats/{created['chat']['id']}/messages"
            response = await client.post(f"{path}/stream", headers=demo_headers, json={
                "user_message_id": created["message"]["id"], "client_request_id": "react-run",
                "model_id": "test-model", "effort": "low",
            })
            events = parse_sse(response.text)
            assert [e["type"] for e in events if e["type"].startswith("tool.")] == ["tool.started", "tool.completed"]
            assert events[-1]["type"] == "agent.completed"
            assert "internal" not in response.text
            messages = (await client.get(path, headers=demo_headers)).json()["items"]
            assert messages[-1]["content"] == "No saved memories."
            assert len(calls) == 2
