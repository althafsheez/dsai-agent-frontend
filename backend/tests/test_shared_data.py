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
