"""Smoke coverage for endpoints that the feature tests do not exercise directly."""
from __future__ import annotations

from httpx import AsyncClient

from conftest import create_chat, parse_sse

CSV = b"region,revenue\nnorth,10\nsouth,20\n"


async def upload(client: AsyncClient, headers: dict[str, str], *, filename: str, data: bytes, content_type: str, chat: dict) -> str:
    response = await client.post(
        "/api/resources/upload",
        headers=headers,
        data={
            "scope_type": "chat",
            "scope_id": chat["chat"]["id"],
            "message_id": chat["message"]["id"],
            "client_upload_id": f"up-{filename}",
        },
        files={"file": (filename, data, content_type)},
    )
    assert response.status_code == 201, response.text
    return response.json()["resource"]["id"]


async def test_workspace_crud_and_context_files(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    created = await client.post("/api/workspaces", headers=demo_headers, json={"name": "Ops"})
    assert created.status_code == 201, created.text
    workspace_id = created.json()["id"]

    assert (await client.get(f"/api/workspaces/{workspace_id}", headers=demo_headers)).json()["name"] == "Ops"
    renamed = await client.patch(f"/api/workspaces/{workspace_id}", headers=demo_headers, json={"name": "Ops 2", "pinned": True})
    assert renamed.status_code == 200 and renamed.json()["name"] == "Ops 2" and renamed.json()["pinned_at"]

    base = f"/api/workspaces/{workspace_id}/context-files"
    made = await client.post(base, headers=demo_headers, json={"name": "notes.md", "content": "# hi"})
    assert made.status_code in (200, 201), made.text
    file_id = made.json()["id"]
    edited = await client.patch(f"{base}/{file_id}", headers=demo_headers, json={"content": "# changed"})
    assert edited.status_code == 200 and edited.json()["content"] == "# changed"
    assert (await client.delete(f"{base}/{file_id}", headers=demo_headers)).status_code in (200, 204)
    assert (await client.get(base, headers=demo_headers)).json()["items"] == []

    assert (await client.delete(f"/api/workspaces/{workspace_id}", headers=demo_headers)).status_code in (200, 204)
    assert (await client.get(f"/api/workspaces/{workspace_id}", headers=demo_headers)).status_code == 404


async def test_workspace_workflows_and_linked_chats(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    workspace_id = (await client.post("/api/workspaces", headers=demo_headers, json={"name": "Flows"})).json()["id"]
    base = f"/api/workspaces/{workspace_id}/workflows"
    made = await client.post(base, headers=demo_headers, json={"name": "Weekly report", "description": "Runs on Mondays"})
    assert made.status_code in (200, 201), made.text
    workflow_id = made.json()["id"]
    assert [item["id"] for item in (await client.get(base, headers=demo_headers)).json()["items"]] == [workflow_id]

    chat_id = (await create_chat(client, demo_headers))["chat"]["id"]
    link = await client.post(f"{base}/{workflow_id}/chats", headers=demo_headers, json={"chat_id": chat_id})
    assert link.status_code in (200, 201), link.text
    linked = await client.get(f"{base}/{workflow_id}/chats", headers=demo_headers)
    assert linked.status_code == 200
    assert chat_id in {item["chat"]["id"] for item in linked.json()["items"]}

    missing = await client.post(f"{base}/{workflow_id}/chats", headers=demo_headers, json={"chat_id": "does-not-exist"})
    assert missing.status_code == 404


async def test_workflow_endpoints_reject_unknown_workspace(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    assert (await client.get("/api/workspaces/nope/workflows", headers=demo_headers)).status_code == 404
    assert (await client.post("/api/workspaces/nope/workflows", headers=demo_headers, json={"name": "x"})).status_code == 404


async def test_dataset_preview_download_and_library_toggle(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    chat = await create_chat(client, demo_headers)
    resource_id = await upload(client, demo_headers, filename="sales.csv", data=CSV, content_type="text/csv", chat=chat)

    preview = await client.get(f"/api/datasets/{resource_id}/preview", headers=demo_headers)
    assert preview.status_code == 200, preview.text
    assert "region" in preview.text

    # Datasets are previewed through /api/datasets, never as a raw browser file.
    assert (await client.get(f"/api/resources/{resource_id}/preview", headers=demo_headers)).status_code == 415

    download = await client.get(f"/api/resources/{resource_id}/download", headers=demo_headers)
    assert download.status_code == 200 and download.content == CSV

    assert (await client.post(f"/api/resources/{resource_id}/library", headers=demo_headers)).status_code in (200, 201, 204)
    assert resource_id in {item["id"] for item in (await client.get("/api/library", headers=demo_headers)).json()["items"]}
    assert (await client.delete(f"/api/resources/{resource_id}/library", headers=demo_headers)).status_code in (200, 204)
    assert resource_id not in {item["id"] for item in (await client.get("/api/library", headers=demo_headers)).json()["items"]}


async def test_artifacts_listing_includes_uploaded_image(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    chat = await create_chat(client, demo_headers)
    chat_id = chat["chat"]["id"]
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 32
    resource_id = await upload(client, demo_headers, filename="chart.png", data=png, content_type="image/png", chat=chat)
    artifacts = await client.get("/api/artifacts", headers=demo_headers, params={"chat_id": chat_id})
    assert artifacts.status_code == 200, artifacts.text
    assert [item["name"] for item in artifacts.json()["items"]] == ["chart.png"]
    image = await client.get(f"/api/resources/{resource_id}/preview", headers=demo_headers)
    assert image.status_code == 200 and image.headers["content-type"] == "image/png"


async def test_chat_presence_and_plain_message_endpoints(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    chat_id = (await create_chat(client, demo_headers))["chat"]["id"]
    presence = await client.post(f"/api/chats/{chat_id}/presence", headers=demo_headers, json={"viewing": True})
    assert presence.status_code in (200, 204), presence.text

    posted = await client.post(
        f"/api/chats/{chat_id}/messages", headers=demo_headers, json={"content": "And by region?", "client_request_id": "m-2"}
    )
    assert posted.status_code in (200, 201), posted.text
    messages = (await client.get(f"/api/chats/{chat_id}/messages", headers=demo_headers)).json()["items"]
    assert [m["content"] for m in messages if m["role"] == "user"] == ["Analyze revenue", "And by region?"]


async def test_run_creation_endpoint_and_cancel(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    created = await create_chat(client, demo_headers)
    chat_id, message_id = created["chat"]["id"], created["message"]["id"]
    started = await client.post(
        f"/api/chats/{chat_id}/runs",
        headers=demo_headers,
        json={"user_message_id": message_id, "model_id": "gemini-test", "effort": "low", "client_request_id": "r-1"},
    )
    assert started.status_code in (200, 201), started.text
    run_id = parse_sse(started.text)[0]["data"]["run"]["id"]
    cancelled = await client.post(f"/api/runs/{run_id}/cancel", headers=demo_headers, json={"reason": "user"})
    assert cancelled.status_code in (200, 202, 204, 409), cancelled.text


async def test_unknown_ids_return_404_not_500(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    for method, path in [
        ("get", "/api/chats/none"),
        ("get", "/api/chats/none/messages"),
        ("get", "/api/chats/none/runs"),
        ("get", "/api/runs/none"),
        ("get", "/api/runs/none/events"),
        ("get", "/api/resources/none/download"),
        ("get", "/api/resources/none/preview"),
        ("get", "/api/datasets/none/preview"),
        ("get", "/api/workspaces/none"),
        ("get", "/api/workspaces/none/chats"),
        ("get", "/api/workspaces/none/context-files"),
        ("get", "/api/workspaces/none/datasets/download"),
        ("get", "/api/workspaces/none/invites"),
    ]:
        response = await getattr(client, method)(path, headers=demo_headers)
        assert response.status_code == 404, f"{method.upper()} {path} -> {response.status_code}: {response.text[:200]}"
