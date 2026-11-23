from __future__ import annotations

from agentic.runtime.contracts import ProviderError
from conftest import FakeProvider, create_chat


async def _ask(client, headers, chat_id: str, request_id: str, until: str | None):
    body = {
        "context_type": "chat",
        "context_id": chat_id,
        "content": "What is this about?",
        "model_id": "gemini-test",
        "client_request_id": request_id,
    }
    if until is not None:
        body["context_until_message_id"] = until
    return await client.post("/api/quick-assistant/messages/stream", headers=headers, json=body)


async def test_quick_assistant_only_sees_main_chat_up_to_snapshot(client, demo_headers, provider: FakeProvider):
    created = await create_chat(client, demo_headers)
    chat_id = created["chat"]["id"]
    later = await client.post(
        f"/api/chats/{chat_id}/messages",
        headers=demo_headers,
        json={"content": "Later secret follow-up", "client_request_id": "later-1"},
    )
    assert later.status_code == 201, later.text

    response = await _ask(client, demo_headers, chat_id, "qa-1", created["message"]["id"])
    assert response.status_code == 200, response.text
    context = provider.calls[-1][0][0].content
    assert "Analyze revenue" in context
    assert "Later secret follow-up" not in context

    response = await _ask(client, demo_headers, chat_id, "qa-2", None)
    assert response.status_code == 200, response.text
    assert "Later secret follow-up" in provider.calls[-1][0][0].content


async def test_quick_assistant_rejects_snapshot_from_another_chat(client, demo_headers):
    first = await create_chat(client, demo_headers, "create-a")
    second = await create_chat(client, demo_headers, "create-b")
    response = await _ask(client, demo_headers, first["chat"]["id"], "qa-x", second["message"]["id"])
    assert response.status_code == 422


async def test_quick_assistant_drops_questions_whose_answer_failed(client, demo_headers, provider: FakeProvider):
    created = await create_chat(client, demo_headers)
    chat_id = created["chat"]["id"]
    provider.failure = ProviderError("provider_error", "Gemini generation failed.")
    await _ask(client, demo_headers, chat_id, "qa-fail", None)
    provider.failure = None

    body = {"context_type": "chat", "context_id": chat_id, "content": "Second question", "model_id": "gemini-test", "client_request_id": "qa-ok"}
    assert (await client.post("/api/quick-assistant/messages/stream", headers=demo_headers, json=body)).status_code == 200
    turns = provider.calls[-1][0]
    assert [turn.content for turn in turns[1:]] == ["Second question"]
