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


async def test_workspace_detail_context_and_shared_dataset_scope(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    workspace = (await client.post(
        "/api/workspaces", headers=demo_headers,
        json={"name": "Research", "description": "Shared work", "ai_context": "Use fiscal quarters."},
    )).json()
    context = (await client.get(f"/api/workspaces/{workspace['id']}/context-files", headers=demo_headers)).json()["items"]
    assert [(item["name"], item["content"]) for item in context] == [("ai-instructions.md", "Use fiscal quarters.")]

    created = await client.post("/api/chats", headers=demo_headers, json={
        "workspace_id": workspace["id"], "content": "Analyze revenue", "client_request_id": "workspace-chat",
    })
    assert created.status_code == 201
    chat_id = created.json()["chat"]["id"]
    listed = await client.get(f"/api/workspaces/{workspace['id']}/chats", headers=demo_headers)
    assert [chat["id"] for chat in listed.json()["items"]] == [chat_id]

    uploaded = await client.post("/api/resources/upload", headers=demo_headers, data={
        "scope_type": "workspace", "scope_id": workspace["id"], "client_upload_id": "workspace-data",
    }, files={"file": ("shared.csv", b"id,value\n001,5\n", "text/csv")})
    assert uploaded.status_code == 201
    workspace_datasets = await client.get("/api/datasets", headers=demo_headers, params={"workspace_id": workspace["id"]})
    effective_datasets = await client.get("/api/datasets", headers=demo_headers, params={"chat_id": chat_id})
    assert [item["name"] for item in workspace_datasets.json()["items"]] == ["shared.csv"]
    assert [item["name"] for item in effective_datasets.json()["items"]] == ["shared.csv"]

    workflow = await client.post(
        f"/api/workspaces/{workspace['id']}/workflows", headers=demo_headers,
        json={"name": "Weekly revenue", "description": "Summarize revenue each week"},
    )
    assert workflow.status_code == 201
    link = await client.post(
        f"/api/workspaces/{workspace['id']}/workflows/{workflow.json()['id']}/chats",
        headers=demo_headers, json={"chat_id": chat_id},
    )
    assert link.status_code == 201
    workflow_chats = await client.get(
        f"/api/workspaces/{workspace['id']}/workflows/{workflow.json()['id']}/chats", headers=demo_headers,
    )
    assert workflow_chats.json()["items"][0]["chat"]["id"] == chat_id


async def test_moving_a_chat_keeps_chat_scoped_data_and_adds_workspace_data(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    workspace = (await client.post("/api/workspaces", headers=demo_headers, json={"name": "Moved chat"})).json()
    standalone = await client.post("/api/chats", headers=demo_headers, json={
        "content": "Analyze", "client_request_id": "standalone-to-move",
    })
    chat_id = standalone.json()["chat"]["id"]
    uploaded = await client.post("/api/resources/upload", headers=demo_headers, data={
        "scope_type": "chat", "scope_id": chat_id, "client_upload_id": "chat-only",
    }, files={"file": ("chat-only.csv", b"value\n1\n", "text/csv")})
    assert uploaded.status_code == 201
    workspace_upload = await client.post("/api/resources/upload", headers=demo_headers, data={
        "scope_type": "workspace", "scope_id": workspace["id"], "client_upload_id": "workspace-only",
    }, files={"file": ("workspace-only.csv", b"value\n2\n", "text/csv")})
    assert workspace_upload.status_code == 201
    moved = await client.patch(f"/api/chats/{chat_id}", headers=demo_headers, json={"workspace_id": workspace["id"]})
    assert moved.status_code == 200
    assert moved.json()["workspace_id"] == workspace["id"]
    effective = await client.get("/api/datasets", headers=demo_headers, params={"chat_id": chat_id})
    assert {item["name"] for item in effective.json()["items"]} == {"chat-only.csv", "workspace-only.csv"}


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


async def test_chat_update_is_utc_and_moves_chat_to_most_recent(
    client: AsyncClient, demo_headers: dict[str, str]
) -> None:
    older = await create_chat(client, demo_headers, request_id="older-chat")
    newer = await create_chat(client, demo_headers, request_id="newer-chat")
    before = (await client.get("/api/chats", headers=demo_headers)).json()["items"]
    assert [item["id"] for item in before[:2]] == [newer["chat"]["id"], older["chat"]["id"]]

    updated = await client.patch(
        f"/api/chats/{older['chat']['id']}",
        headers=demo_headers,
        json={"title": "Updated older chat"},
    )
    assert updated.status_code == 200
    assert updated.json()["updated_at"].endswith(("Z", "+00:00"))
    after = (await client.get("/api/chats", headers=demo_headers)).json()["items"]
    assert after[0]["id"] == older["chat"]["id"]
    assert after[0]["title"] == "Updated older chat"


async def test_chat_resource_upload_is_classified_and_idempotent(
    client: AsyncClient, demo_headers: dict[str, str]
) -> None:
    created = await create_chat(client, demo_headers)
    data = {
        "scope_type": "chat",
        "scope_id": created["chat"]["id"],
        "message_id": created["message"]["id"],
        "client_upload_id": "upload-sales-1",
    }
    first = await client.post(
        "/api/resources/upload",
        headers=demo_headers,
        data=data,
        files={"file": ("sales.csv", b"month,revenue\nJan,10\n", "text/csv")},
    )
    assert first.status_code == 201, first.text
    assert first.json()["resource"]["resource_type"] == "dataset"

    repeated = await client.post(
        "/api/resources/upload",
        headers=demo_headers,
        data=data,
        files={"file": ("sales.csv", b"month,revenue\nJan,10\n", "text/csv")},
    )
    assert repeated.status_code == 201
    assert repeated.json()["resource"]["id"] == first.json()["resource"]["id"]

    artifact = await client.post(
        "/api/resources/upload",
        headers=demo_headers,
        data={**data, "client_upload_id": "upload-report-1"},
        files={"file": ("summary.pdf", b"%PDF-1.4 report", "application/pdf")},
    )
    assert artifact.status_code == 201
    assert artifact.json()["resource"]["resource_type"] == "artifact"

    datasets = await client.get(
        "/api/datasets", headers=demo_headers, params={"chat_id": created["chat"]["id"]}
    )
    artifacts = await client.get(
        "/api/artifacts", headers=demo_headers, params={"chat_id": created["chat"]["id"]}
    )
    assert [item["name"] for item in datasets.json()["items"]] == ["sales.csv"]
    assert datasets.json()["items"][0]["scope_type"] == "chat"
    assert datasets.json()["items"][0]["source"] == "input"
    assert [item["name"] for item in artifacts.json()["items"]] == ["summary.pdf"]
    assert artifacts.json()["items"][0]["kind"] == "pdf"
    assert artifacts.json()["items"][0]["source"] == "input"

    library = await client.post(
        f"/api/resources/{first.json()['resource']['id']}/library", headers=demo_headers
    )
    assert library.status_code == 201
    assert library.json()["in_library"] is True
    refreshed_datasets = await client.get(
        "/api/datasets", headers=demo_headers, params={"chat_id": created["chat"]["id"]}
    )
    assert refreshed_datasets.json()["items"][0]["in_library"] is True
    saved = await client.get("/api/library", headers=demo_headers)
    assert saved.status_code == 200
    assert saved.json()["items"][0]["name"] == "sales.csv"
    assert saved.json()["items"][0]["resource_type"] == "dataset"
    assert saved.json()["items"][0]["library_category"] == "dataset"

    removed = await client.delete(
        f"/api/resources/{first.json()['resource']['id']}/library", headers=demo_headers
    )
    assert removed.status_code == 204
    assert (await client.get("/api/library", headers=demo_headers)).json()["items"] == []

    message = (await client.get(
        f"/api/chats/{created['chat']['id']}/messages", headers=demo_headers
    )).json()["items"][0]
    assert message["attachment_refs"] == [
        {"resource_type": "dataset", "resource_id": first.json()["resource"]["id"]},
        {"resource_type": "artifact", "resource_id": artifact.json()["resource"]["id"]},
    ]

    preview = await client.get(
        f"/api/datasets/{first.json()['resource']['id']}/preview",
        headers=demo_headers,
    )
    assert preview.status_code == 200
    assert preview.json()["columns"] == [
        {"name": "month", "data_type": "string"},
        {"name": "revenue", "data_type": "string"},
    ]
    assert preview.json()["rows"] == [["Jan", "10"]]


async def test_unread_chat_appears_in_activity_and_opening_marks_it_read(
    client: AsyncClient, demo_headers: dict[str, str]
) -> None:
    created = await create_chat(client, demo_headers)
    chat_id = created["chat"]["id"]
    unread = await client.patch(
        f"/api/chats/{chat_id}", headers=demo_headers, json={"is_unread": True}
    )
    assert unread.status_code == 200
    assert unread.json()["is_unread"] is True
    activity = await client.get("/api/chats/activity/list", headers=demo_headers)
    assert [chat["id"] for chat in activity.json()["items"]] == [chat_id]

    opened = await client.post(
        f"/api/chats/{chat_id}/presence", headers=demo_headers, json={"viewing": True}
    )
    assert opened.status_code == 204
    assert (await client.get(f"/api/chats/{chat_id}", headers=demo_headers)).json()["is_unread"] is False
    assert (await client.get("/api/chats/activity/list", headers=demo_headers)).json()["items"] == []
