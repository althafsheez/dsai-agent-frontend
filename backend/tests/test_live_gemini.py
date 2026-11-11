from __future__ import annotations

import os

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import Settings
from app.main import create_app
from conftest import parse_sse


@pytest.mark.live
@pytest.mark.skipif(os.getenv("DSAI_LIVE_GEMINI") != "1", reason="Set DSAI_LIVE_GEMINI=1 to run")
async def test_real_gemini_initial_and_follow_up(tmp_path) -> None:
    base = Settings()
    if not base.gemini_api_key:
        pytest.skip("DSAI_GEMINI_API_KEY is not configured")
    settings = Settings(
        database_url=f"sqlite:///{tmp_path / 'live.db'}",
        storage_root=tmp_path / "storage",
        auto_create_schema=True,
    )
    app = create_app(settings=settings)
    headers = {"X-Demo-User-Id": "user-you"}

    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            models_response = await client.get("/api/models", headers=headers)
            assert models_response.status_code == 200, models_response.text
            model_payload = models_response.json()
            assert model_payload["models"], model_payload["configuration_status"]
            model = next(
                (item for item in model_payload["models"] if item["id"] == model_payload["default_model_id"]),
                model_payload["models"][0],
            )
            effort = model["default_effort"]

            chat_response = await client.post(
                "/api/chats",
                headers=headers,
                json={
                    "workspace_id": None,
                    "content": "Reply briefly with the words DSAI live.",
                    "client_request_id": "live-chat-create",
                },
            )
            assert chat_response.status_code == 201, chat_response.text
            created = chat_response.json()

            first_response = await client.post(
                f"/api/chats/{created['chat']['id']}/messages/stream",
                headers=headers,
                json={
                    "user_message_id": created["message"]["id"],
                    "model_id": model["id"],
                    "effort": effort,
                    "client_request_id": "live-run-one",
                },
            )
            assert first_response.status_code == 200, first_response.text
            first_events = parse_sse(first_response.text)
            assert first_events[-1]["type"] == "agent.completed", first_events[-1]
            assert any(event["type"] == "message.delta" for event in first_events)

            follow_up = await client.post(
                f"/api/chats/{created['chat']['id']}/messages",
                headers=headers,
                json={"content": "Now reply briefly with FOLLOW-UP OK.", "client_request_id": "live-follow-up"},
            )
            assert follow_up.status_code == 201, follow_up.text
            second_response = await client.post(
                f"/api/chats/{created['chat']['id']}/messages/stream",
                headers=headers,
                json={
                    "user_message_id": follow_up.json()["id"],
                    "model_id": model["id"],
                    "effort": effort,
                    "client_request_id": "live-run-two",
                },
            )
            second_events = parse_sse(second_response.text)
            assert second_events[-1]["type"] == "agent.completed", second_events[-1]

            messages = (await client.get(
                f"/api/chats/{created['chat']['id']}/messages",
                headers=headers,
            )).json()["items"]
            assert [message["role"] for message in messages] == [
                "user",
                "assistant",
                "user",
                "assistant",
            ]
            assert all(message["content"] for message in messages)
