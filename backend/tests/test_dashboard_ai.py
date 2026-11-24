"""Prompt-to-dashboard and AI review: model output is always repaired against the real columns."""
from __future__ import annotations

import json

from httpx import AsyncClient

DATASET = {
    "id": "d1", "name": "sales.csv", "row_count": 5,
    "columns": [{"name": "region", "data_type": "string"}, {"name": "units", "data_type": "string"}, {"name": "revenue", "data_type": "string"}],
    "rows": [["North", "120", "2400"], ["South", "95", "1900"], ["East", "60", "3000"]],
}


def body(**extra) -> dict:
    return {"datasets": [DATASET], "model_id": "gemini-test", "effort": "low", **extra}


async def test_generate_builds_widgets_and_repairs_bad_columns(client: AsyncClient, demo_headers: dict[str, str], provider) -> None:
    reply = {"name": "Sales", "description": "Regional sales", "widgets": [
        {"type": "kpi", "title": "Revenue", "dataset_id": "d1", "y": "Revenue", "agg": "sum"},
        {"type": "bar", "title": "Units by region", "dataset_id": "d1", "x": "REGION", "y": "units", "agg": "sum", "span": 2},
        {"type": "pie", "title": "Bad", "dataset_id": "d1", "x": "nope", "y": "region", "agg": "avg"},
        {"type": "sankey", "title": "Unknown type", "dataset_id": "d1"},
    ]}
    provider.chunks = ["Here you go:\n```json\n", json.dumps(reply), "\n```"]
    response = await client.post("/api/dashboards/ai/generate", headers=demo_headers, json=body(prompt="Show regional sales"))
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["name"] == "Sales"
    kinds = [widget["type"] for widget in data["widgets"]]
    assert kinds == ["kpi", "bar", "pie"]
    kpi, bar, pie = data["widgets"]
    assert kpi["y"] == "revenue" and kpi["span"] == 1
    assert bar["x"] == "region" and bar["y"] == "units"
    assert pie["x"] == "region" and pie["y"] in ("units", "revenue")
    assert any("unknown chart type" in note for note in data["notes"])


async def test_generate_fails_cleanly_on_unusable_reply(client: AsyncClient, demo_headers: dict[str, str], provider) -> None:
    provider.chunks = ["Sorry, I cannot do that."]
    response = await client.post("/api/dashboards/ai/generate", headers=demo_headers, json=body(prompt="Make something"))
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "dashboard_ai_failed"


async def test_review_applies_ai_fixes_and_notes(client: AsyncClient, demo_headers: dict[str, str], provider) -> None:
    broken = [{"id": "w1", "type": "bar", "title": "Chart", "dataset_id": "d1", "x": "region", "y": "region", "agg": "sum", "span": 2}]
    fixed = {"widgets": [{"id": "w1", "type": "bar", "title": "Revenue by region", "dataset_id": "d1", "x": "region", "y": "revenue", "agg": "sum", "span": 2}], "notes": ["Renamed the chart."]}
    provider.chunks = [json.dumps(fixed)]
    response = await client.post("/api/dashboards/ai/review", headers=demo_headers, json=body(widgets=broken))
    data = response.json()
    assert response.status_code == 200 and data["ai"] is True
    assert data["widgets"][0]["title"] == "Revenue by region"
    assert "Renamed the chart." in data["notes"]


async def test_review_falls_back_to_automatic_fixes_when_ai_is_down(client: AsyncClient, demo_headers: dict[str, str], provider) -> None:
    provider.chunks = ["not json"]
    broken = [{"id": "w1", "type": "bar", "title": "Chart", "dataset_id": "d1", "x": "region", "y": "region", "agg": "sum"}]
    response = await client.post("/api/dashboards/ai/review", headers=demo_headers, json=body(widgets=broken))
    data = response.json()
    assert response.status_code == 200 and data["ai"] is False
    assert data["widgets"][0]["y"] in ("units", "revenue")
    assert any("AI review was unavailable" in note for note in data["notes"])


async def test_generate_retries_once_after_a_provider_failure(client: AsyncClient, demo_headers: dict[str, str], provider) -> None:
    from agentic.runtime.contracts import ProviderError

    good = json.dumps({"name": "Retry", "widgets": [{"type": "table", "title": "Rows", "dataset_id": "d1"}]})
    attempts = {"n": 0}
    original = provider.stream_text

    async def flaky(messages, model_id, effort):
        attempts["n"] += 1
        if attempts["n"] == 1:
            raise ProviderError("provider_error", "boom")
        async for chunk in original(messages, model_id, effort):
            yield chunk

    provider.chunks = [good]
    provider.stream_text = flaky
    response = await client.post("/api/dashboards/ai/generate", headers=demo_headers, json=body(prompt="Anything at all"))
    assert response.status_code == 200, response.text
    assert attempts["n"] == 2  # failed once, then succeeded


async def test_dataset_rows_returns_up_to_the_limit(client: AsyncClient, demo_headers: dict[str, str]) -> None:
    from conftest import create_chat

    created = await create_chat(client, demo_headers)
    chat_id = created["chat"]["id"]
    csv_bytes = ("a,b\n" + "".join(f"{i},{i * 2}\n" for i in range(150))).encode()
    upload = await client.post(
        "/api/resources/upload", headers=demo_headers,
        data={"scope_type": "chat", "scope_id": chat_id, "client_upload_id": "rows-1"},
        files={"file": ("rows.csv", csv_bytes, "text/csv")})
    assert upload.status_code in (200, 201), upload.text
    resource_id = upload.json()["resource"]["id"]
    full = (await client.get(f"/api/datasets/{resource_id}/rows", headers=demo_headers)).json()
    assert len(full["rows"]) == 150 and full["total_rows"] == 150 and full["truncated"] is False
    capped = (await client.get(f"/api/datasets/{resource_id}/rows?limit=100", headers=demo_headers)).json()
    assert len(capped["rows"]) == 100 and capped["truncated"] is True
    assert (await client.get(f"/api/datasets/{resource_id}/rows?limit=6001", headers=demo_headers)).status_code == 422


async def test_ask_falls_back_to_another_model_when_the_chosen_one_stays_busy(monkeypatch) -> None:
    from agentic.runtime.contracts import ModelInfo, ProviderError

    from app.services import dashboard_ai

    calls: list[str] = []

    class Busy:
        async def list_models(self):
            return [ModelInfo("busy", "Busy", (), None), ModelInfo("spare", "Spare", (), None)], "busy"

        async def stream_text(self, turns, model_id, effort):
            calls.append(model_id)
            if model_id == "busy":
                raise ProviderError("unavailable", "Service unavailable")
            yield '{"ok": true}'

    async def no_wait(_seconds):
        return None

    monkeypatch.setattr(dashboard_ai.asyncio, "sleep", no_wait)
    assert await dashboard_ai._ask(Busy(), "prompt", "busy", None) == {"ok": True}
    assert calls == ["busy", "busy", "busy", "spare"]
