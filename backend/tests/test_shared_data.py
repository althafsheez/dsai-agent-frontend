"""Shared storage: dashboards live server-side and a snapshot lets a fresh clone start with the same data."""
from __future__ import annotations

from httpx import AsyncClient

from app.config import Settings
from app.db import make_engine
from app.main import create_app
from app.snapshot import export_snapshot, import_snapshot, is_fresh
from tests.conftest import create_chat


async def test_dashboard_crud_is_shared(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    body = {"id": "db-test", "name": "  Sales  ", "description": "d", "dataset_ids": ["d1"], "slicers": ["region"],
            "widgets": [{"id": "w1", "type": "kpi", "title": "T", "dataset_id": "d1", "agg": "count", "span": 1}]}
    saved = await client.put("/api/dashboards", headers=demo_headers, json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["name"] == "Sales" and saved.json()["ownership"] == "owned"

    other = {"X-Demo-User-Id": "user-alex"}
    listed = await client.get("/api/dashboards", headers=other)
    if listed.status_code == 200:
        mine = [item for item in listed.json()["items"] if item["id"] == "db-test"]
        assert mine and mine[0]["ownership"] == "shared"

    updated = await client.put("/api/dashboards", headers=demo_headers, json={**body, "name": "Renamed", "pinned": True})
    assert updated.json()["name"] == "Renamed" and updated.json()["pinned"] is True
    assert len((await client.get("/api/dashboards", headers=demo_headers)).json()["items"]) == 1

    assert (await client.delete("/api/dashboards/db-test", headers=demo_headers)).status_code == 204
    assert (await client.get("/api/dashboards/db-test", headers=demo_headers)).status_code == 404


async def test_snapshot_round_trip_into_fresh_database(client: AsyncClient, demo_headers: dict[str, str], tmp_path) -> None:
    await create_chat(client, demo_headers)
    await client.put("/api/dashboards", headers=demo_headers, json={"id": "db-snap", "name": "Snap", "widgets": []})
    app = client._transport.app  # type: ignore[attr-defined]
    settings: Settings = app.state.settings
    shared = tmp_path / "shared"
    counts = export_snapshot(app.state.engine, settings.storage_root, shared)
    assert counts["chats"] == 1 and counts["dashboards"] == 1
    assert "connector_connections" not in (shared / "snapshot.json").read_text()

    fresh_settings = Settings(database_url=f"sqlite:///{tmp_path / 'fresh.db'}", storage_root=tmp_path / "fresh-storage",
                              auto_create_schema=True, import_shared_data=True, shared_data_dir=shared)
    fresh = create_app(settings=fresh_settings, provider=app.state.provider)
    engine = make_engine(fresh_settings.database_url)
    async with fresh.router.lifespan_context(fresh):
        assert not is_fresh(engine)
        again = import_snapshot(engine, fresh_settings.storage_root, shared)
        assert "chats" not in again and "dashboards" not in again
    engine.dispose()


async def test_workflow_store_crud_and_runs(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    body = {"id": "wf-test", "name": "  Weekly  ", "description": "d", "state": "draft",
            "trigger": {"kind": "manual", "label": "Manual"}, "steps": [{"id": "s1", "kind": "ai", "title": "Q", "detail": ""}]}
    saved = await client.put("/api/workflow-store", headers=demo_headers, json=body)
    assert saved.status_code == 200, saved.text
    assert saved.json()["name"] == "Weekly"

    assert (await client.put("/api/workflow-store/wf-test/state", headers=demo_headers, json={"state": "active"})).json()["state"] == "active"

    started = await client.post("/api/workflow-store/wf-test/run", headers=demo_headers)
    assert started.status_code == 201 and started.json()["workflow_name"] == "Weekly"
    run_id = started.json()["id"]
    cancelled = (await client.post(f"/api/workflow-store/runs/{run_id}/cancel", headers=demo_headers)).json()
    assert cancelled["cancelled_at"] or cancelled["status"] != "running"
    assert len((await client.get("/api/workflow-store/runs?workflow_id=wf-test", headers=demo_headers)).json()["items"]) == 1

    assert (await client.delete("/api/workflow-store/wf-test", headers=demo_headers)).status_code == 204
    assert (await client.get("/api/workflow-store/wf-test", headers=demo_headers)).status_code == 404
    assert (await client.get(f"/api/workflow-store/runs/{run_id}", headers=demo_headers)).status_code == 404


async def test_library_upload_is_standalone(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    files = {"file": ("standalone.csv", b"a,b\n1,2\n3,4\n", "text/csv")}
    form = {"scope_type": "library", "scope_id": "ignored", "client_upload_id": "lib-1"}
    response = await client.post("/api/resources/upload", headers=demo_headers, files=files, data=form)
    assert response.status_code == 201, response.text
    resource_id = response.json()["resource"]["id"]
    library = (await client.get("/api/library", headers=demo_headers)).json()["items"]
    mine = [item for item in library if item["id"] == resource_id]
    assert mine and mine[0]["workspace_id"] is None and mine[0]["uploaded_in_library"] is True
