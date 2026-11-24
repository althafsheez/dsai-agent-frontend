"""Dashboard access control, sharing, data refresh and prompt-based tuning."""
from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from app.models import Resource
from app.routes import connectors

OWNER = {"X-Demo-User-Id": "user-you"}
OTHER = {"X-Demo-User-Id": "user-shared"}
DATASET = {
    "id": "d1", "name": "sales.csv", "row_count": 3,
    "columns": [{"name": "region", "data_type": "string"}, {"name": "revenue", "data_type": "string"}],
    "rows": [["North", "10"], ["South", "20"]],
}


def board(**extra) -> dict:
    return {"id": "db-share", "name": "Sales", "widgets": [], **extra}


async def put(client: AsyncClient, headers: dict, **extra):
    return await client.put("/api/dashboards", headers=headers, json=board(**extra))


async def test_draft_is_private_until_shared_or_published(client: AsyncClient) -> None:
    assert (await put(client, OWNER)).json()["role"] == "owner"
    assert (await client.get("/api/dashboards/db-share", headers=OTHER)).status_code == 404
    assert (await client.get("/api/dashboards", headers=OTHER)).json()["items"] == []
    assert (await put(client, OTHER, name="Hijack")).status_code == 404

    published = await put(client, OWNER, status="published")
    assert published.json()["status"] == "published"
    seen = await client.get("/api/dashboards/db-share", headers=OTHER)
    assert seen.status_code == 200 and seen.json()["role"] == "viewer" and seen.json()["ownership"] == "shared"
    assert "shares" not in seen.json()


async def test_viewer_cannot_change_or_delete_editor_cannot_share(client: AsyncClient) -> None:
    await put(client, OWNER, shares=[{"user_id": "user-shared", "role": "viewer"}])
    viewer = await client.get("/api/dashboards/db-share", headers=OTHER)
    assert viewer.json()["role"] == "viewer"
    assert (await put(client, OTHER, name="Nope")).status_code == 403
    assert (await client.delete("/api/dashboards/db-share", headers=OTHER)).status_code == 403

    shares = (await client.get("/api/dashboards/db-share", headers=OWNER)).json()["shares"]
    assert shares == [{"user_id": "user-shared", "name": "Shared Demo", "role": "viewer"}]

    await put(client, OWNER, shares=[{"user_id": "user-shared", "role": "editor"}])
    edited = await put(client, OTHER, name="Team edit", status="published", shares=[], refresh_minutes=5)
    assert edited.status_code == 200
    body = edited.json()
    assert body["role"] == "editor" and body["name"] == "Team edit" and body["refresh_minutes"] == 5
    owner_view = (await client.get("/api/dashboards/db-share", headers=OWNER)).json()
    assert owner_view["status"] == "draft"
    assert [share["role"] for share in owner_view["shares"]] == ["editor"]
    assert (await client.delete("/api/dashboards/db-share", headers=OTHER)).status_code == 403
    assert (await client.delete("/api/dashboards/db-share", headers=OWNER)).status_code == 204


async def test_shares_ignore_unknown_people_and_self(client: AsyncClient) -> None:
    saved = await put(client, OWNER, shares=[
        {"user_id": "nobody", "role": "viewer"}, {"user_id": "user-you", "role": "editor"}, {"user_id": "user-shared", "role": "viewer"},
    ])
    assert [share["user_id"] for share in saved.json()["shares"]] == ["user-shared"]
    people = (await client.get("/api/dashboards/people", headers=OWNER)).json()["items"]
    assert [person["id"] for person in people] == ["user-shared"]


async def test_refresh_interval_is_validated(client: AsyncClient) -> None:
    assert (await put(client, OWNER, refresh_minutes=15)).json()["refresh_minutes"] == 15
    assert (await put(client, OWNER, refresh_minutes=7)).status_code == 422


async def upload_dataset(client: AsyncClient, content: bytes = b"region,revenue\nN,1\nS,2\n") -> str:
    files = {"file": ("sales.csv", content, "text/csv")}
    form = {"scope_type": "library", "scope_id": "x", "client_upload_id": "up-1"}
    response = await client.post("/api/resources/upload", headers=OWNER, files=files, data=form)
    return response.json()["resource"]["id"]


async def test_shared_dashboard_makes_its_dataset_readable(client: AsyncClient) -> None:
    dataset_id = await upload_dataset(client)
    assert (await client.get(f"/api/datasets/{dataset_id}/rows", headers=OTHER)).status_code == 404
    await put(client, OWNER, dataset_ids=[dataset_id], shares=[{"user_id": "user-shared", "role": "viewer"}])
    rows = await client.get(f"/api/datasets/{dataset_id}/rows", headers=OTHER)
    assert rows.status_code == 200
    data = rows.json()
    assert data["total_rows"] == 2 and data["refreshed_at"] and data["version"] and data["syncable"] is False
    await put(client, OWNER, dataset_ids=[dataset_id], status="draft", shares=[])
    assert (await client.get(f"/api/datasets/{dataset_id}/rows", headers=OTHER)).status_code == 404


async def test_drive_dataset_resync_replaces_data_in_place(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    dataset_id = await upload_dataset(client)
    app = client._transport.app  # type: ignore[attr-defined]
    with app.state.session_factory() as session:
        resource = session.get(Resource, dataset_id)
        resource.metadata_json = {**resource.metadata_json, "source_connector": "google-drive", "drive_file_id": "f1"}
        session.commit()
    assert (await client.get(f"/api/datasets/{dataset_id}/rows", headers=OWNER)).json()["syncable"] is True

    current = {"content": b"region,revenue\nN,1\nS,2\n"}

    async def fake_download(client, token, file_id):
        return "sales.csv", "text/csv", current["content"], {"drive_file_id": file_id, "drive_modified_at": "2026-11-24T00:00:00Z"}

    async def fake_token(*args, **kwargs):
        return "token"

    monkeypatch.setattr(connectors.drive, "require_connection", lambda *a, **k: object())
    monkeypatch.setattr(connectors.drive, "access_token", fake_token)
    monkeypatch.setattr(connectors.drive, "download_file", fake_download)

    first = await client.post(f"/api/datasets/{dataset_id}/sync", headers=OWNER)
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "unchanged"
    before = (await client.get(f"/api/datasets/{dataset_id}/rows", headers=OWNER)).json()

    current["content"] = b"region,revenue\nN,1\nS,2\nE,3\n"
    changed = await client.post(f"/api/datasets/{dataset_id}/sync", headers=OWNER)
    assert changed.json()["status"] == "updated"
    after = (await client.get(f"/api/datasets/{dataset_id}/rows", headers=OWNER)).json()
    assert after["total_rows"] == 3 and after["version"] != before["version"]
    library = (await client.get("/api/library", headers=OWNER)).json()["items"]
    assert [item["row_count"] for item in library if item["id"] == dataset_id] == [3]


async def test_sync_rejects_local_datasets(client: AsyncClient) -> None:
    dataset_id = await upload_dataset(client)
    response = await client.post(f"/api/datasets/{dataset_id}/sync", headers=OWNER)
    assert response.status_code == 422 and response.json()["error"]["code"] == "not_syncable"


def tune_body(**extra) -> dict:
    widgets = [
        {"id": "w1", "type": "kpi", "title": "Revenue", "dataset_id": "d1", "y": "revenue", "agg": "sum", "span": 1},
        {"id": "w2", "type": "bar", "title": "Revenue by region", "dataset_id": "d1", "x": "region", "y": "revenue", "agg": "sum", "span": 2},
    ]
    return {"instruction": "Make the bar a pie and filter by region", "widgets": widgets, "slicers": [], "name": "Sales",
            "datasets": [DATASET], "model_id": "gemini-test", "effort": "low", **extra}


async def test_tune_changes_what_was_asked_and_keeps_ids(client: AsyncClient, provider) -> None:
    reply = {"name": "Sales", "widgets": [
        {"id": "w1", "type": "kpi", "title": "Revenue", "dataset_id": "d1", "y": "revenue", "agg": "sum", "span": 1},
        {"id": "w2", "type": "pie", "title": "Revenue share by region", "dataset_id": "d1", "x": "REGION", "y": "revenue", "agg": "sum", "span": 2},
    ], "slicers": ["Region", "ghost", "region"], "notes": ["Turned the bar into a pie."], "suggestions": ["Add a table", "Show average revenue", "x", "y"]}
    provider.chunks = [json.dumps(reply)]
    response = await client.post("/api/dashboards/ai/tune", headers=OWNER, json=tune_body())
    assert response.status_code == 200, response.text
    data = response.json()
    assert [(widget["id"], widget["type"]) for widget in data["widgets"]] == [("w1", "kpi"), ("w2", "pie")]
    assert data["widgets"][1]["x"] == "region"
    assert data["slicers"] == ["region"]
    assert data["notes"] == ["Turned the bar into a pie."]
    assert data["suggestions"] == ["Add a table", "Show average revenue", "x"]
    prompt = provider.calls[-1][0][0].content
    assert "Make the bar a pie" in prompt and '"id": "w2"' in prompt


async def test_tune_fails_cleanly(client: AsyncClient, provider) -> None:
    provider.chunks = ["not json at all"]
    response = await client.post("/api/dashboards/ai/tune", headers=OWNER, json=tune_body())
    assert response.status_code == 502 and response.json()["error"]["code"] == "dashboard_ai_failed"
    provider.chunks = [json.dumps({"widgets": []})]
    assert (await client.post("/api/dashboards/ai/tune", headers=OWNER, json=tune_body())).status_code == 502


async def test_generate_also_returns_filters_and_follow_ups(client: AsyncClient, provider) -> None:
    provider.chunks = [json.dumps({"name": "S", "description": "", "widgets": [
        {"type": "bar", "title": "By region", "dataset_id": "d1", "x": "region", "y": "revenue", "agg": "sum"}],
        "slicers": ["region"], "suggestions": ["Add a KPI row"]})]
    body = {k: v for k, v in tune_body().items() if k not in ("instruction", "widgets", "slicers", "name")}
    response = await client.post("/api/dashboards/ai/generate", headers=OWNER, json={**body, "prompt": "Sales by region"})
    assert response.json()["slicers"] == ["region"] and response.json()["suggestions"] == ["Add a KPI row"]


async def test_old_snapshot_without_sharing_columns_still_imports(client: AsyncClient, tmp_path) -> None:
    from app.config import Settings
    from app.db import make_engine
    from app.main import create_app
    from app.snapshot import import_snapshot

    shared = tmp_path / "old-shared"
    shared.mkdir()
    old_row = {"id": "db-old", "owner_id": "user-you", "name": "Old", "description": "", "status": "published", "pinned": False,
               "slicers": [], "dataset_ids": [], "widgets": [], "created_at": "2026-11-01T00:00:00+00:00", "updated_at": "2026-11-01T00:00:00+00:00"}
    (shared / "snapshot.json").write_text(json.dumps({"version": 1, "tables": {"dashboards": [old_row]}}))
    settings = Settings(database_url=f"sqlite:///{tmp_path / 'old.db'}", storage_root=tmp_path / "old-storage", auto_create_schema=True)
    app = create_app(settings=settings, provider=client._transport.app.state.provider)  # type: ignore[attr-defined]
    engine = make_engine(settings.database_url)
    async with app.router.lifespan_context(app):
        assert import_snapshot(engine, settings.storage_root, shared)["dashboards"] == 1
        with engine.connect() as connection:
            from sqlalchemy import text
            row = connection.execute(text("select shares, refresh_minutes from dashboards where id='db-old'")).one()
        assert json.loads(row[0]) == [] and row[1] == 0
    engine.dispose()


async def test_listing_preview_is_built_from_the_data_and_pins_are_personal(client: AsyncClient) -> None:
    dataset_id = await upload_dataset(client, b"region,revenue\nN,10\nN,5\nS,20\nE,1\n")
    widgets = [
        {"id": "k", "type": "kpi", "title": "Revenue", "dataset_id": dataset_id, "y": "revenue", "agg": "sum", "span": 1},
        {"id": "b", "type": "bar", "title": "By region", "dataset_id": dataset_id, "x": "region", "y": "revenue", "agg": "sum", "span": 2},
    ]
    saved = (await put(client, OWNER, widgets=widgets, dataset_ids=[dataset_id], status="published")).json()
    tiles = saved["preview"]["tiles"]
    assert [tile["type"] for tile in tiles] == ["kpi", "bar"]
    assert tiles[0]["value"] == "36" and tiles[1]["series"] == [20.0, 15.0, 1.0] and tiles[1]["labels"] == ["S", "N", "E"]

    rich = [
        {"id": "h", "type": "histogram", "title": "Spread", "dataset_id": dataset_id, "x": "revenue", "agg": "count", "span": 1},
        {"id": "s", "type": "scatter", "title": "Dots", "dataset_id": dataset_id, "x": "revenue", "y": "revenue", "agg": "sum", "span": 1},
        {"id": "g", "type": "gauge", "title": "Avg", "dataset_id": dataset_id, "y": "revenue", "agg": "avg", "span": 1},
        {"id": "f", "type": "funnel", "title": "Funnel", "dataset_id": dataset_id, "x": "region", "y": "revenue", "agg": "sum", "span": 2},
    ]
    kinds = (await put(client, OWNER, id="db-rich", widgets=rich, dataset_ids=[dataset_id])).json()["preview"]["tiles"]
    assert [tile["type"] for tile in kinds] == ["histogram", "scatter", "gauge", "funnel"]
    assert len(kinds[0]["series"]) == 10 and sum(kinds[0]["series"]) == 4 and kinds[2]["ratio"] == 0.45

    empty = (await client.put("/api/dashboards", headers=OWNER, json={"id": "db-empty", "name": "Empty"})).json()
    assert empty["preview"] == {"tiles": [], "total": 0}

    pinned = await client.put("/api/dashboards/db-share/pin", headers=OTHER, json={"pinned": True})
    assert pinned.status_code == 200 and pinned.json()["pinned"] is True
    assert (await client.get("/api/dashboards/db-share", headers=OWNER)).json()["pinned"] is False
    assert pinned.json()["updated_at"] == saved["updated_at"]
    assert (await client.get("/api/dashboards/db-share", headers=OTHER)).json()["pinned"] is True
    assert (await client.put("/api/dashboards/db-share/pin", headers=OTHER, json={"pinned": False})).json()["pinned"] is False
    assert (await client.put("/api/dashboards/db-empty/pin", headers=OTHER, json={"pinned": True})).status_code == 404


async def test_server_pulls_changed_drive_files_for_dashboards_on_auto_refresh(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from app.services import dashboard_sync

    dataset_id = await upload_dataset(client, b"region,revenue\nN,1\nS,2\n")
    app = client._transport.app  # type: ignore[attr-defined]
    with app.state.session_factory() as session:
        resource = session.get(Resource, dataset_id)
        resource.metadata_json = {**resource.metadata_json, "source_connector": "google-drive", "drive_file_id": "f1", "refreshed_at": "2020-01-01T00:00:00+00:00"}
        session.commit()
    widgets = [{"id": "k", "type": "kpi", "title": "Revenue", "dataset_id": dataset_id, "y": "revenue", "agg": "sum", "span": 1}]
    saved = (await put(client, OWNER, widgets=widgets, dataset_ids=[dataset_id], refresh_minutes=5, status="published")).json()
    assert saved["preview"]["tiles"][0]["value"] == "3"
    assert saved["sources"] == [{"name": "sales.csv", "provider": "google-drive", "refreshed_at": "2020-01-01T00:00:00+00:00", "error": None}]

    current = {"content": b"region,revenue\nN,1\nS,2\nE,40\n", "fail": False}

    async def fake_download(client, token, file_id):
        if current["fail"]:
            raise dashboard_sync.APIError(401, "connector_reauth_required", "Reconnect Google Drive.")
        return "sales.csv", "text/csv", current["content"], {"drive_file_id": file_id}

    async def fake_token(*args, **kwargs):
        return "token"

    monkeypatch.setattr(dashboard_sync.drive, "require_connection", lambda *a, **k: object())
    monkeypatch.setattr(dashboard_sync.drive, "access_token", fake_token)
    monkeypatch.setattr(dashboard_sync.drive, "download_file", fake_download)

    await put(client, OWNER, widgets=widgets, dataset_ids=[dataset_id], refresh_minutes=5, status="draft")
    assert await dashboard_sync.sync_due(app) == {}  # a draft never uses compute, only a published dashboard is kept live
    saved = (await put(client, OWNER, widgets=widgets, dataset_ids=[dataset_id], refresh_minutes=5, status="published")).json()

    assert await dashboard_sync.sync_due(app) == {"sales.csv": "updated"}
    after = (await client.get("/api/dashboards/db-share", headers=OWNER)).json()
    assert after["preview"]["tiles"][0]["value"] == "43"
    assert after["updated_at"] == saved["updated_at"]  # a background refresh is not an edit

    assert await dashboard_sync.sync_due(app) == {}  # just checked, not due again yet

    with app.state.session_factory() as session:
        resource = session.get(Resource, dataset_id)
        resource.metadata_json = {**resource.metadata_json, "refreshed_at": "2020-01-01T00:00:00+00:00"}
        session.commit()
    current["fail"] = True
    assert await dashboard_sync.sync_due(app) == {"sales.csv": "error"}
    assert (await client.get("/api/dashboards/db-share", headers=OWNER)).json()["sources"][0]["error"] == "Reconnect Google Drive."
