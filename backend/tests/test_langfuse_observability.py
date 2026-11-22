import os
from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from backend.app import app
from backend.observability import RunTracker, is_langfuse_configured


def test_health_reports_langfuse_status():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert "langfuse_configured" in data
    assert isinstance(data["langfuse_configured"], bool)


def test_run_tracker_without_langfuse():
    """Verify RunTracker functions cleanly with local logging when Langfuse is unconfigured."""
    with patch("backend.observability.get_langfuse", return_value=None):
        tracker = RunTracker(
            run_id="test-run-no-lf",
            chat_id="test-chat",
            user_query="What is 10 + 20?",
            model="gemini-3.1-flash-lite",
        )
        assert tracker.lf is None
        assert tracker.lf_agent_obs is None

        tracker.start_tool("run_python_code", "call-1", "step-1", {"code": "10+20"})
        tracker.end_tool("run_python_code", output={"stdout": "30"})
        tracker.record_first_token()
        trace = tracker.finish(final_response="30", status="completed", turn_count=1)

        assert trace["status"] == "completed"
        assert trace["metrics"]["total_response_time_ms"] > 0
        assert len(trace["tools"]) == 1
        assert trace["tools"][0]["output"] == {"stdout": "30"}


def test_run_tracker_with_langfuse_mocked():
    """Verify RunTracker delegates spans, traces, and scores to Langfuse when configured."""
    mock_lf = MagicMock()
    mock_agent_obs = MagicMock()
    mock_tool_obs = MagicMock()

    mock_lf.start_observation.return_value = mock_agent_obs
    mock_agent_obs.start_observation.return_value = mock_tool_obs

    with patch("backend.observability.get_langfuse", return_value=mock_lf):
        tracker = RunTracker(
            run_id="test-run-lf",
            chat_id="test-chat-lf",
            user_query="Run SQL query",
            model="gemini-3.1-flash-lite",
            dataset_path="/tmp/test.csv",
        )
        assert tracker.lf == mock_lf
        assert tracker.lf_agent_obs == mock_agent_obs
        mock_lf.start_observation.assert_called_once_with(
            name="dsai_agent_run",
            as_type="agent",
            input={"query": "Run SQL query"},
            metadata={
                "run_id": "test-run-lf",
                "chat_id": "test-chat-lf",
                "model": "gemini-3.1-flash-lite",
                "dataset_path": "/tmp/test.csv",
            },
        )

        # 1. Start Tool
        tracker.start_tool("run_duckdb_sql", "call-sql", "step-sql", {"sql": "SELECT 1"})
        mock_agent_obs.start_observation.assert_called_once_with(
            name="run_duckdb_sql",
            as_type="tool",
            input={"sql": "SELECT 1"},
            metadata={"call_id": "call-sql", "step_id": "step-sql"},
        )

        # 2. End Tool
        tracker.end_tool("run_duckdb_sql", output={"rows": [{"1": 1}]})
        mock_tool_obs.update.assert_called_once_with(
            output={"rows": [{"1": 1}]},
            level="DEFAULT",
            status_message=None,
        )
        mock_tool_obs.end.assert_called_once()

        # 3. Finish Run
        tracker.record_first_token()
        trace = tracker.finish(final_response="Found 1 row.", status="completed", turn_count=2)

        # Verify agent observation update & scores
        mock_agent_obs.update.assert_called_once_with(
            output="Found 1 row.",
            level="DEFAULT",
            status_message=None,
        )
        # Check that score_trace was called for key metrics
        score_calls = [call.kwargs.get("name") or call.args[0] for call in mock_agent_obs.score_trace.call_args_list]
        assert "total_response_time_ms" in score_calls
        assert "sub_5s" in score_calls
        assert "turns" in score_calls
        assert "ttft_ms" in score_calls

        mock_agent_obs.end.assert_called_once()
        mock_lf.flush.assert_called_once()


def test_generation_and_retriever_tracing():
    """Verify RunTracker supports generation observations and retriever observation types."""
    mock_lf = MagicMock()
    mock_agent_obs = MagicMock()
    mock_gen_obs = MagicMock()
    mock_search_obs = MagicMock()

    mock_lf.start_observation.return_value = mock_agent_obs

    def start_obs_router(name, as_type="span", **kwargs):
        if as_type == "generation":
            return mock_gen_obs
        elif as_type == "retriever":
            return mock_search_obs
        return MagicMock()

    mock_agent_obs.start_observation.side_effect = start_obs_router

    with patch("backend.observability.get_langfuse", return_value=mock_lf):
        tracker = RunTracker(
            run_id="run-gen-test",
            chat_id="chat-gen-test",
            user_query="Search for AI trends",
            model="gemini-3.1-flash-lite",
            user_id="analyst-1",
        )

        # 1. Start & End LLM Generation
        tracker.start_generation(
            name="gemini_turn_1",
            input_data=[{"role": "user", "parts": ["Search for AI trends"]}],
            model="gemini-3.1-flash-lite",
        )
        mock_agent_obs.start_observation.assert_any_call(
            name="gemini_turn_1",
            as_type="generation",
            model="gemini-3.1-flash-lite",
            input=[{"role": "user", "parts": ["Search for AI trends"]}],
        )

        tracker.end_generation(
            name="gemini_turn_1",
            output_data={"text": "Calling search...", "tool_calls": ["web_search"]},
        )
        mock_gen_obs.update.assert_called_once_with(
            output={"text": "Calling search...", "tool_calls": ["web_search"]},
            usage_details=None,
        )
        mock_gen_obs.end.assert_called_once()

        # 2. Start & End Retriever Tool
        tracker.start_tool("web_search", "call-s1", "step-s1", {"query": "AI trends 2026"})
        mock_agent_obs.start_observation.assert_any_call(
            name="web_search",
            as_type="retriever",
            input={"query": "AI trends 2026"},
            metadata={"call_id": "call-s1", "step_id": "step-s1"},
        )

        tracker.end_tool("web_search", output={"results": ["Trend A", "Trend B"]})
        mock_search_obs.update.assert_called_once_with(
            output={"results": ["Trend A", "Trend B"]},
            level="DEFAULT",
            status_message=None,
        )
        mock_search_obs.end.assert_called_once()

        # 3. Finish
        trace = tracker.finish(final_response="Here are the top AI trends.")
        score_calls = [call.kwargs.get("name") or call.args[0] for call in mock_agent_obs.score_trace.call_args_list]
        assert "tool_calls_count" in score_calls

