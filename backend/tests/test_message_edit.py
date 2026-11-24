"""Editing a question replaces it and drops everything after it so the re-run answers from earlier context only."""
from __future__ import annotations

from httpx import AsyncClient

from conftest import create_chat, parse_sse


async def run_turn(client: AsyncClient, headers: dict[str, str], chat_id: str, message_id: str, request_id: str) -> None:
    response = await client.post(
        f"/api/chats/{chat_id}/runs", headers=headers,
        json={"user_message_id": message_id, "model_id": "gemini-test", "effort": "low", "client_request_id": request_id})
    assert response.status_code == 200, response.text
    assert any(event["type"] == "agent.completed" for event in parse_sse(response.text)), response.text


async def add_question(client: AsyncClient, headers: dict[str, str], chat_id: str, text: str, request_id: str) -> str:
    response = await client.post(f"/api/chats/{chat_id}/messages", headers=headers, json={"content": text, "client_request_id": request_id})
    assert response.status_code in (200, 201), response.text
    return response.json()["id"]


async def conversation(client: AsyncClient, headers: dict[str, str]) -> tuple[str, list[str]]:
    created = await create_chat(client, headers)
    chat_id = created["chat"]["id"]
    ids = [created["message"]["id"]]
    await run_turn(client, headers, chat_id, ids[0], "r-1")
    ids.append(await add_question(client, headers, chat_id, "Second question", "m-2"))
    await run_turn(client, headers, chat_id, ids[1], "r-2")
    return chat_id, ids


async def messages(client: AsyncClient, headers: dict[str, str], chat_id: str) -> list[dict]:
    return (await client.get(f"/api/chats/{chat_id}/messages", headers=headers)).json()["items"]


async def test_edit_rewrites_question_and_drops_later_turns(client: AsyncClient, demo_headers: dict[str, str], provider) -> None:
    chat_id, ids = await conversation(client, demo_headers)
    assert len(await messages(client, demo_headers, chat_id)) == 4

    edited = await client.patch(f"/api/chats/{chat_id}/messages/{ids[0]}", headers=demo_headers, json={"content": "  Analyze churn  "})
    assert edited.status_code == 200, edited.text
    assert edited.json()["content"] == "Analyze churn"
    remaining = await messages(client, demo_headers, chat_id)
    assert [m["id"] for m in remaining] == [ids[0]]

    await run_turn(client, demo_headers, chat_id, ids[0], "r-3")
    after = await messages(client, demo_headers, chat_id)
    assert [m["role"] for m in after] == ["user", "assistant"]
    # The re-run saw only the edited question, not the removed turns.
    assert [turn.content for turn in provider.calls[-1][0]] == ["Analyze churn"]


async def test_edit_middle_question_keeps_earlier_context(client: AsyncClient, demo_headers: dict[str, str], provider) -> None:
    chat_id, ids = await conversation(client, demo_headers)
    await client.patch(f"/api/chats/{chat_id}/messages/{ids[1]}", headers=demo_headers, json={"content": "Rewritten second"})
    assert [m["content"] for m in await messages(client, demo_headers, chat_id)][::2] == ["Analyze revenue", "Rewritten second"]
    assert len(await messages(client, demo_headers, chat_id)) == 3

    await run_turn(client, demo_headers, chat_id, ids[1], "r-3")
    contents = [turn.content for turn in provider.calls[-1][0]]
    assert contents[0] == "Analyze revenue" and contents[-1] == "Rewritten second" and len(contents) == 3


async def test_edit_validation(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    chat_id, ids = await conversation(client, demo_headers)
    assistant = (await messages(client, demo_headers, chat_id))[1]["id"]
    base = f"/api/chats/{chat_id}/messages"
    assert (await client.patch(f"{base}/{assistant}", headers=demo_headers, json={"content": "x"})).status_code == 422
    assert (await client.patch(f"{base}/missing", headers=demo_headers, json={"content": "x"})).status_code == 422
    assert (await client.patch(f"{base}/{ids[0]}", headers=demo_headers, json={"content": ""})).status_code == 422
    assert (await client.patch(f"{base}/{ids[0]}", headers=demo_headers, json={"content": "   "})).status_code == 422
    assert (await client.patch(f"/api/chats/nope/messages/{ids[0]}", headers=demo_headers, json={"content": "x"})).status_code == 404
    other = {"X-Demo-User-Id": "user-shared"}
    assert (await client.patch(f"{base}/{ids[0]}", headers=other, json={"content": "x"})).status_code == 403
    assert len(await messages(client, demo_headers, chat_id)) == 4
