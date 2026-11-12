from __future__ import annotations

from httpx import AsyncClient

from conftest import create_chat


async def test_health_and_model_discovery(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    assert (await client.get("/health")).json() == {"status": "ok", "database": "ready"}
    assert (await client.get("/api/health")).status_code == 200

    response = await client.get("/api/models", headers=demo_headers)
    assert response.status_code == 200
    assert response.json() == {
        "default_model_id": "gemini-test",
        "models": [
            {
                "id": "gemini-test",
                "label": "Gemini Test",
                "supported_efforts": ["low", "medium", "high"],
                "default_effort": "medium",
            }
        ],
        "configuration_status": "ready",
    }


async def test_workspace_creation_and_demo_access(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    response = await client.post(
        "/api/workspaces",
        headers=demo_headers,
        json={"name": "Revenue Planning", "description": "Quarterly analysis"},
    )
    assert response.status_code == 201
    assert response.json()["created_by"] == "user-you"
    assert (await client.get("/api/workspaces", headers=demo_headers)).json()["items"][0]["name"] == "Revenue Planning"

    denied = await client.get("/api/workspaces", headers={"X-Demo-User-Id": "missing"})
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "invalid_demo_user"


async def test_chat_creation_is_idempotent_and_messages_are_ordered(
    client: AsyncClient, demo_headers: dict[str, str]
) -> None:
    created = await create_chat(client, demo_headers)
    repeated = await create_chat(client, demo_headers)
    assert repeated["chat"]["id"] == created["chat"]["id"]
    assert repeated["message"]["id"] == created["message"]["id"]

    second = await client.post(
        f"/api/chats/{created['chat']['id']}/messages",
        headers=demo_headers,
        json={"content": "Focus on APAC", "client_request_id": "message-2"},
    )
    assert second.status_code == 201
    messages = (await client.get(
        f"/api/chats/{created['chat']['id']}/messages", headers=demo_headers
    )).json()["items"]
    assert [message["content"] for message in messages] == ["Analyze revenue", "Focus on APAC"]


async def test_chat_ownership_is_enforced(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    created = await create_chat(client, demo_headers)
    response = await client.get(
        f"/api/chats/{created['chat']['id']}",
        headers={"X-Demo-User-Id": "user-shared"},
    )
    assert response.status_code == 403


async def test_chat_can_be_renamed_archived_and_soft_deleted(
    client: AsyncClient, demo_headers: dict[str, str]
) -> None:
    created = await create_chat(client, demo_headers)
    chat_id = created["chat"]["id"]

    updated = await client.patch(
        f"/api/chats/{chat_id}",
        headers=demo_headers,
        json={"title": "Updated analysis", "archived": True},
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Updated analysis"
    assert updated.json()["title_source"] == "manual"
    assert updated.json()["archived_at"] is not None

    deleted = await client.delete(f"/api/chats/{chat_id}", headers=demo_headers)
    assert deleted.status_code == 204
    assert (await client.get(f"/api/chats/{chat_id}", headers=demo_headers)).status_code == 404
    listed_ids = {
        item["id"] for item in (await client.get("/api/chats", headers=demo_headers)).json()["items"]
    }
    assert chat_id not in listed_ids
