from __future__ import annotations

import base64
import hashlib
from types import SimpleNamespace

import pytest
from e2b_code_interpreter.models import Execution, Result
from google.genai import types

from app.agent import AgentRunner, RunnerCancelled
from app.agent.sandbox import E2BSandboxPool
from app.agent.tools import ToolContext, ToolDefinition, ToolRegistry
from app.config import Settings
from app.providers import ChatTurn
from app.providers.gemini import GeminiProvider


PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=")


class FakeFiles:
    def __init__(self):
        self.content = {}

    def make_dir(self, path):
        return False

    def write(self, path, content):
        self.content[path] = content.encode() if isinstance(content, str) else content

    def read(self, path, format="text"):
        content = self.content[path]
        return content if format == "bytes" else content.decode()

    def list(self, path):
        return [SimpleNamespace(name=name.rsplit("/", 1)[-1], path=name, type="file", size=len(content))
                for name, content in self.content.items() if name.startswith(path + "/")]


def model_response(*parts: types.Part) -> types.GenerateContentResponse:
    return types.GenerateContentResponse(candidates=[
        types.Candidate(content=types.Content(role="model", parts=list(parts)))
    ])


def python_call(call_id: str = "python-1") -> types.Part:
    return types.Part(
        function_call=types.FunctionCall(id=call_id, name="execute_python", args={"code": "21 * 2"}),
        thought_signature=b"preserve-this-signature",
    )


def fake_gemini(generate_content) -> GeminiProvider:
    provider = GeminiProvider(Settings(_env_file=None, gemini_api_key=None, gemini_models="gemini-test"))
    provider._client = SimpleNamespace(aio=SimpleNamespace(models=SimpleNamespace(generate_content=generate_content)))
    return provider


async def test_function_results_preserve_gemini_call_id_and_signature() -> None:
    call = python_call()
    requests = []

    async def generate_content(**kwargs):
        requests.append(kwargs)
        if len(requests) == 1:
            return model_response(call)
        contents = kwargs["contents"]
        assert contents[-2].parts[0].thought_signature == call.thought_signature
        response = contents[-1].parts[0].function_response
        assert response.id == call.function_call.id
        assert response.response == {"success": True, "text": "42"}
        return model_response(types.Part.from_text(text="42"))

    async def execute_tool(name, arguments):
        return {"success": True, "text": "42"}

    events = [event async for event in fake_gemini(generate_content).stream_with_tools(
        [ChatTurn("user", "Calculate 21 * 2 in Python")], "gemini-test", None, (), execute_tool, 3,
    )]
    assert events[-1].data == {"text": "42"}


async def test_provider_does_not_turn_cancellation_into_provider_failure() -> None:
    async def generate_content(**kwargs):
        return model_response(python_call())

    async def execute_tool(name, arguments):
        raise RunnerCancelled

    with pytest.raises(RunnerCancelled):
        async for _ in fake_gemini(generate_content).stream_with_tools(
            [ChatTurn("user", "Calculate")], "gemini-test", None, (), execute_tool, 3,
        ):
            pass


async def test_steering_keeps_tool_history_and_prepares_and_cleans_once() -> None:
    model_calls = 0
    tool_calls = 0
    lifecycle = []
    steering_pending = False

    async def generate_content(**kwargs):
        nonlocal model_calls
        model_calls += 1
        if model_calls == 1:
            return model_response(python_call())
        contents = kwargs["contents"]
        assert any(part.function_response for content in contents for part in content.parts)
        assert contents[-1].role == "user"
        assert "Focus only on Kerala" in contents[-1].parts[0].text
        return model_response(types.Part.from_text(text="Kerala result"))

    async def prepare(context):
        lifecycle.append("prepare")
        return {"files": [{"path": "/home/user/inputs/sales.csv"}]}

    async def cleanup(context):
        lifecycle.append("cleanup")

    async def execute(arguments, context):
        nonlocal steering_pending, tool_calls
        tool_calls += 1
        steering_pending = True
        return {"success": True, "text": "42"}

    def poll(checkpoint):
        nonlocal steering_pending
        if steering_pending:
            steering_pending = False
            return ["Focus only on Kerala"]
        return []

    registry = ToolRegistry(prepare=prepare, cleanup=cleanup)
    registry.register(ToolDefinition("execute_python", "Python", {"type": "object"}, execute))
    runner = AgentRunner(fake_gemini(generate_content), registry)
    events = [event async for event in runner.run(
        [ChatTurn("user", "Analyse sales")], "gemini-test", None, lambda: False,
        ToolContext("run-1", "chat-1", "user-1"), poll,
    )]
    assert events[-1].data == {"text": "Kerala result"}
    assert tool_calls == 1
    assert lifecycle == ["prepare", "cleanup"]


async def test_steering_skips_remaining_calls_and_matches_every_function_response() -> None:
    pending = False
    tool_calls = 0
    model_calls = 0

    async def generate_content(**kwargs):
        nonlocal model_calls
        model_calls += 1
        if model_calls == 1:
            return model_response(python_call("python-1"), python_call("python-2"))
        responses = kwargs["contents"][-2].parts
        assert [part.function_response.id for part in responses] == ["python-1", "python-2"]
        assert responses[0].function_response.response["text"] == "42"
        assert responses[1].function_response.response["skipped"] is True
        assert "Kerala" in kwargs["contents"][-1].parts[0].text
        return model_response(types.Part.from_text(text="Updated analysis"))

    async def execute_tool(name, arguments):
        nonlocal pending, tool_calls
        tool_calls += 1
        pending = True
        return {"success": True, "text": "42"}

    def poll(checkpoint):
        nonlocal pending
        if pending:
            pending = False
            return ["Focus on Kerala"]
        return []

    events = [event async for event in fake_gemini(generate_content).stream_with_tools(
        [ChatTurn("user", "Analyse")], "gemini-test", None, (), execute_tool, 3, poll_steering=poll,
    )]
    assert tool_calls == 1
    assert events[-1].data["text"] == "Updated analysis"


async def test_tool_argument_errors_are_returned_to_model_for_recovery() -> None:
    model_calls = 0

    async def generate_content(**kwargs):
        nonlocal model_calls
        model_calls += 1
        if model_calls == 1:
            return model_response(python_call())
        result = kwargs["contents"][-1].parts[0].function_response.response
        assert result["success"] is False
        assert "private detail" not in result["error"]
        return model_response(types.Part.from_text(text="I can correct the tool arguments."))

    async def failing_tool(arguments, context):
        raise ValueError("private detail")

    registry = ToolRegistry()
    registry.register(ToolDefinition("execute_python", "Python", {"type": "object"}, failing_tool))
    runner = AgentRunner(fake_gemini(generate_content), registry)
    events = [event async for event in runner.run(
        [ChatTurn("user", "Analyse")], "gemini-test", None, lambda: False, ToolContext("run-1", "chat-1", "user-1"),
    )]
    assert [event.type for event in events] == ["tool.started", "tool.failed", "message.delta"]


async def test_python_returns_last_expression_not_only_stdout(monkeypatch) -> None:
    pool = E2BSandboxPool("test-key")
    sandbox = SimpleNamespace(
        run_code=lambda *args, **kwargs: Execution(results=[Result(text="42", is_main_result=True)]),
        files=SimpleNamespace(list=lambda path: []),
    )
    monkeypatch.setattr(pool, "_start_sync", lambda run_id: sandbox)
    result = await pool.execute("run-1", "21 * 2", 30)
    assert result["success"] is True
    assert result["text"] == "42"


async def test_output_scan_failure_does_not_report_python_failure(monkeypatch) -> None:
    def list_files(path):
        raise OSError("Temporary file service failure")

    pool = E2BSandboxPool("test-key")
    sandbox = SimpleNamespace(
        run_code=lambda *args, **kwargs: Execution(results=[Result(text="42", is_main_result=True)]),
        files=SimpleNamespace(list=list_files),
    )
    monkeypatch.setattr(pool, "_start_sync", lambda run_id: sandbox)
    result = await pool.execute("run-1", "21 * 2", 30)
    assert result["success"] is True
    assert result["text"] == "42"
    assert result["warnings"]


async def test_displayed_chart_is_collected_without_sending_base64_to_model(monkeypatch) -> None:
    files = FakeFiles()
    sandbox = SimpleNamespace(files=files, run_code=lambda *args, **kwargs: Execution(
        results=[Result(png=base64.b64encode(PNG).decode())],
    ))
    pool = E2BSandboxPool("test-key")
    monkeypatch.setattr(pool, "_start_sync", lambda run_id: sandbox)
    result = await pool.execute("run-1", "plt.show()", 30)
    generated = result["generated_files"][0]
    assert files.read(generated["path"], format="bytes") == PNG
    assert generated["name"].endswith(".png")
    assert "png" not in str(result["results"])


def test_outputs_are_retried_until_persisted_and_changed_versions_are_discovered() -> None:
    pool = E2BSandboxPool("test-key")
    files = FakeFiles()
    files.write("/home/user/outputs/result.csv", b"total\n42\n")
    sandbox = SimpleNamespace(files=files)
    first = pool._scan_outputs_sync("run-1", sandbox)
    assert len(first) == 1
    assert pool._scan_outputs_sync("run-1", sandbox) == first
    pool.acknowledge_output("run-1", first[0]["path"], first[0]["sha256"])
    assert pool._scan_outputs_sync("run-1", sandbox) == []
    files.write("/home/user/outputs/result.csv", b"total\n84\n")
    changed = pool._scan_outputs_sync("run-1", sandbox)
    assert changed[0]["sha256"] == hashlib.sha256(b"total\n84\n").hexdigest()


def test_failed_sandbox_initialization_closes_the_allocated_sandbox(monkeypatch) -> None:
    from e2b_code_interpreter import Sandbox
    from app.agent.sandbox import SandboxUnavailable

    closed = []

    def make_dir(path):
        raise OSError("test-key: directory service failed")

    sandbox = SimpleNamespace(files=SimpleNamespace(make_dir=make_dir), kill=lambda: closed.append(True))
    monkeypatch.setattr(Sandbox, "create", lambda **kwargs: sandbox)
    pool = E2BSandboxPool("test-key")
    with pytest.raises(SandboxUnavailable) as error:
        pool._start_sync("run-1")
    assert closed == [True]
    assert "test-key" not in str(error.value)
    assert "directory service failed" in str(error.value)
