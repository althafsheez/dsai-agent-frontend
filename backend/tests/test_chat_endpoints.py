import json
import os
import pytest
from httpx import ASGITransport, AsyncClient

from backend.app import app
from backend.observability import HUMAN_LOG_PATH, JSONL_LOG_PATH


@pytest.mark.asyncio
async def test_models_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/models")
        assert resp.status_code == 200
        data = resp.json()
        assert "default_model_id" in data
        assert len(data["models"]) >= 1


@pytest.mark.asyncio
async def test_chat_lifecycle_and_streaming():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Create chat
        create_resp = await client.post(
            "/api/chats",
            json={"content": "What is 15 * 8? Show the calculation.", "workspace_id": None},
        )
        assert create_resp.status_code == 200
        chat_data = create_resp.json()
        assert "chat" in chat_data
        assert "message" in chat_data
        chat_id = chat_data["chat"]["id"]

        # 2. Get messages
        msg_resp = await client.get(f"/api/chats/{chat_id}/messages")
        assert msg_resp.status_code == 200
        messages = msg_resp.json()["items"]
        assert len(messages) >= 1
        user_msg_id = messages[0]["id"]

        # 3. Stream chat run
        stream_resp = await client.post(
            f"/api/chats/{chat_id}/messages/stream",
            json={"user_message_id": user_msg_id},
        )
        assert stream_resp.status_code == 200
        assert "text/event-stream" in stream_resp.headers.get("content-type", "")

        events = []
        for line in stream_resp.text.split("\n"):
            line = line.strip()
            if line.startswith("data: "):
                payload = json.loads(line[6:])
                events.append(payload)

        # Check expected SSE event lifecycle
        event_types = [e.get("type") for e in events]
        assert "agent.started" in event_types
        assert "run.completed" in event_types

        # Verify total duration is reported in the run.completed event
        completed_evt = next(e for e in events if e.get("type") == "run.completed")
        run_data = completed_evt["data"]["run"]
        assert "duration_ms" in run_data
        assert run_data["duration_ms"] > 0
        assert "metrics" in run_data
        assert run_data["metrics"]["total_response_time_ms"] > 0

        # 4. Check assistant message in database
        updated_msgs = (await client.get(f"/api/chats/{chat_id}/messages")).json()["items"]
        assert len(updated_msgs) >= 2
        assistant_msgs = [m for m in updated_msgs if m["role"] == "assistant"]
        assert len(assistant_msgs) == 1
        assert assistant_msgs[0]["status"] == "completed"


@pytest.mark.asyncio
async def test_csv_upload_and_registration():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        csv_bytes = b"id,val\n1,100\n2,200\n3,300\n"
        files = {"file": ("test_upload.csv", csv_bytes, "text/csv")}
        data = {
            "scope_type": "chat",
            "scope_id": "test-chat-obs",
            "client_upload_id": "upload-obs-1",
        }
        resp = await client.post("/api/resources/upload", files=files, data=data)
        assert resp.status_code == 200
        res = resp.json()
        assert res["resource"]["resource_type"] == "dataset"
        assert res["resource"]["name"] == "test_upload.csv"

        # Check datasets list
        datasets = (await client.get("/api/datasets?chat_id=test-chat-obs")).json()["items"]
        assert len(datasets) >= 1
        assert datasets[0]["name"] == "test_upload.csv"
        assert datasets[0]["row_count"] == 3


@pytest.mark.asyncio
async def test_observability_logging_and_api():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Check observability endpoint
        obs_resp = await client.get("/api/observability/runs")
        assert obs_resp.status_code == 200
        traces = obs_resp.json()["traces"]
        assert isinstance(traces, list)

        # Check that log files exist on disk
        assert os.path.exists(JSONL_LOG_PATH)
        assert os.path.exists(HUMAN_LOG_PATH)

        # Verify human-readable log has content
        with open(HUMAN_LOG_PATH, "r", encoding="utf-8") as f:
            content = f.read()
            assert "TOTAL RESPONSE TIME" in content
            assert "USER QUERY" in content
