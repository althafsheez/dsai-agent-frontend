from __future__ import annotations

import asyncio
import base64
from types import SimpleNamespace

import pytest
from e2b_code_interpreter import Sandbox
from e2b_code_interpreter.models import Execution, ExecutionError, Logs, Result
from google.genai import types
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.config import Settings
from app.main import create_app
from app.models import AgentRun
from conftest import create_chat, parse_sse
from test_agent_execution import FakeFiles, PNG, fake_gemini, model_response


@pytest.mark.parametrize("script_fails", [False, True])
async def test_uploaded_data_and_partial_outputs_survive_sandbox_cleanup(tmp_path, monkeypatch, script_fails):
    files = FakeFiles()
    closed = []
    created = []

    def run_code(code, **kwargs):
        assert any(path.startswith("/home/user/inputs/") and content == b"amount\n42\n" for path, content in files.content.items())
        files.write("/home/user/outputs/summary.csv", b"total\n42\n")
        return Execution(
            results=[Result(text="42", is_main_result=True), Result(png=base64.b64encode(PNG).decode())],
            logs=Logs(stdout=["42\n"]),
            error=ExecutionError(name="ValueError", value="later step failed", traceback="test traceback") if script_fails else None,
        )

    sandbox = SimpleNamespace(files=files, run_code=run_code, kill=lambda: closed.append(True))

    def create_sandbox(**kwargs):
        created.append(sandbox)
        return sandbox

    monkeypatch.setattr(Sandbox, "create", create_sandbox)
    model_calls = 0

    async def generate_content(**kwargs):
        nonlocal model_calls
        model_calls += 1
        if model_calls == 1:
            assert "/home/user/inputs/" in str(kwargs["contents"])
            return model_response(types.Part(function_call=types.FunctionCall(
                id="analysis-1", name="execute_python", args={"code": "analyse uploaded data"},
            )))
        result = kwargs["contents"][-1].parts[0].function_response
        assert result.id == "analysis-1"
        assert result.response["success"] is not script_fails
        assert len(result.response["resources"]) == 2
        return model_response(types.Part.from_text(text="Partial files saved." if script_fails else "Total is 42."))

    settings = Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'pipeline.db'}", storage_root=tmp_path / "storage", e2b_api_key="test-key")
    app = create_app(settings, provider=fake_gemini(generate_content))
    headers = {"X-Demo-User-Id": "user-you"}
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            chat = await create_chat(client, headers)
            uploaded = await client.post("/api/resources/upload", headers=headers,
                data={"scope_type": "chat", "scope_id": chat["chat"]["id"], "message_id": chat["message"]["id"], "client_upload_id": "input-1"},
                files={"file": ("sales.csv", b"amount\n42\n", "text/csv")})
            assert uploaded.status_code == 201, uploaded.text
            response = await client.post(f"/api/chats/{chat['chat']['id']}/messages/stream", headers=headers,
                json={"user_message_id": chat["message"]["id"], "model_id": "gemini-test", "client_request_id": "run-1"})
            events = parse_sse(response.text)
            assert events[-1]["type"] == "agent.completed", events[-1]
            assert ("tool.failed" if script_fails else "tool.completed") in [event["type"] for event in events]
            dataset = next(event["data"]["dataset"] for event in events if event["type"] == "dataset.created")
            artifact = next(event["data"]["artifact"] for event in events if event["type"] == "artifact.created")
            assert closed == [True]
            assert len(created) == 1
            for resource, expected in [(dataset, b"total\n42\n"), (artifact, PNG)]:
                download = await client.get(f"/api/resources/{resource['id']}/download", headers=headers)
                assert download.status_code == 200
                assert download.content == expected


async def test_steering_during_model_call_retains_tool_context_and_publishes_acknowledgement(tmp_path):
    blocked = asyncio.Event()
    release = asyncio.Event()
    calls = 0

    async def generate_content(**kwargs):
        nonlocal calls
        calls += 1
        if calls == 1:
            return model_response(types.Part(function_call=types.FunctionCall(
                id="memory-1", name="load_memory", args={},
            )))
        if calls == 2:
            blocked.set()
            await release.wait()
            return model_response(types.Part.from_text(text="Superseded answer"))
        contents = kwargs["contents"]
        assert any(part.function_response for content in contents for part in content.parts)
        assert "Kerala" in contents[-1].parts[0].text
        return model_response(types.Part.from_text(text="Kerala answer"))

    settings = Settings(_env_file=None, database_url=f"sqlite:///{tmp_path / 'steering.db'}", storage_root=tmp_path / "storage")
    app = create_app(settings, provider=fake_gemini(generate_content))
    headers = {"X-Demo-User-Id": "user-you"}
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            chat = await create_chat(client, headers)
            task = asyncio.create_task(client.post(f"/api/chats/{chat['chat']['id']}/messages/stream", headers=headers,
                json={"user_message_id": chat["message"]["id"], "model_id": "gemini-test", "client_request_id": "run-1"}))
            await asyncio.wait_for(blocked.wait(), 2)
            with app.state.session_factory() as session:
                run = session.scalar(select(AgentRun).where(AgentRun.status == "running"))
                run_id = run.id
            steered = await client.post(f"/api/runs/{run_id}/steer", headers=headers,
                json={"content": "Focus on Kerala", "client_request_id": "steer-1"})
            assert steered.status_code == 201
            release.set()
            response = await asyncio.wait_for(task, 3)
            events = parse_sse(response.text)
            event_types = [event["type"] for event in events]
            assert event_types.index("steer.applied") < event_types.index("message.delta")
            assert next(event["data"]["text"] for event in events if event["type"] == "message.delta") == "Kerala answer"
            assert event_types[-1] == "agent.completed"
            assert calls == 3
