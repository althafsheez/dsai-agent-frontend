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
