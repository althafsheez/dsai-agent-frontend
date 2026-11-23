"""Charts no preset covers (AI-written Python scripts run in a restricted process) and multi-dataset analysis."""
from __future__ import annotations

import json

import pytest
from httpx import AsyncClient

from app.services import dataset_relations
from app.services.dashboard_script import ScriptError, run_script

OWNER = {"X-Demo-User-Id": "user-you"}
DS = [{"id": "d", "name": "s.csv", "columns": ["region", "rev"], "rows": [["N", "10"], ["S", "30"], ["N", "5"]]}]
GOOD = """
from collections import defaultdict
totals = defaultdict(float)
for region, value in zip(col(datasets[0], "region"), col(datasets[0], "rev")):
    if num(value) is not None:
        totals[region] += num(value)
result = {"kind": "bar", "title": "Revenue per region", "labels": list(totals), "series": list(totals.values())}
"""


def test_script_runs_and_returns_a_drawable_result() -> None:
    assert run_script(GOOD, DS) == {"kind": "bar", "title": "Revenue per region", "labels": ["N", "S"], "series": [15.0, 30.0]}


@pytest.mark.parametrize("script", [
    "import os\nresult = 1", "import socket", "result = ().__class__", "open('/etc/passwd')", "x = getattr(1, 'real')",
    "result = '{0.__class__}'.format(1)", "result = {'kind': 'bar'}", "result = {'kind': 'bubble', 'labels': [1, 2], 'series': [1, 2]}", "x = [1] * 10**11", "while True:\n    pass",
])
def test_script_is_refused_or_fails_safely(script: str) -> None:
    with pytest.raises(ScriptError):
        run_script(script, DS)


def test_script_cannot_see_the_app_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DSAI_SECRET_FOR_TEST", "hunter2")
    with pytest.raises(ScriptError):
        run_script("import os\nresult = {'kind': 'kpi', 'value': len(os.environ)}", DS)


def test_datasets_that_disagree_are_reported_not_merged() -> None:
    a = {"id": "a", "name": "a.csv", "columns": ["order_id", "region", "revenue"], "rows": [[str(i), "N", str(i * 10)] for i in range(1, 21)]}
    b = {"id": "b", "name": "b.csv", "columns": ["order_id", "region", "revenue"], "rows": [[str(i), "N", str(i * 10 + (5 if i in (3, 4) else 0))] for i in range(1, 21)]}
    report = dataset_relations.analyze([a, b])
    pair = report["pairs"][0]
    assert report["conflict"] is True and pair["key"] == "order_id" and pair["matched_rows"] == 20
    conflict = pair["conflicts"][0]
    assert conflict["column"] == "revenue" and conflict["differing"] == 2 and conflict["of"] == 20 and conflict["examples"][0]["key"] == "3"

    same = dataset_relations.analyze([a, {**a, "id": "c", "name": "c.csv"}])
    assert same["conflict"] is False and "agree" in same["pairs"][0]["summary"]
    none = dataset_relations.analyze([a, {"id": "z", "name": "z.csv", "columns": ["x"], "rows": [["1"]]}])
    assert none["pairs"][0]["shared_columns"] == [] and "share no column" in none["pairs"][0]["summary"]


async def upload(client: AsyncClient, content: bytes, name: str = "sales.csv") -> str:
    files = {"file": (name, content, "text/csv")}
    form = {"scope_type": "library", "scope_id": "x", "client_upload_id": f"up-{name}"}
    return (await client.post("/api/resources/upload", headers=OWNER, files=files, data=form)).json()["resource"]["id"]


def queue(provider, *replies: str) -> None:
    pending = list(replies)

    async def stream_text(turns, model_id, effort=None):
        yield pending.pop(0)

    provider.stream_text = stream_text


async def test_ai_writes_a_script_retries_on_error_and_the_chart_runs(client: AsyncClient, provider) -> None:
    dataset_id = await upload(client, b"region,rev\nN,10\nS,30\nN,5\n")
    queue(provider, "```python\nresult = {'kind': 'bar', 'labels': ['a']}\n```", f"```python\n{GOOD}\n```")
    response = await client.post("/api/dashboards/ai/custom", headers=OWNER, json={"request": "Revenue per region", "dataset_ids": [dataset_id], "model_id": "gemini-test"})
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["result"]["labels"] == ["N", "S"] and body["widget"]["type"] == "custom" and "totals" in body["widget"]["script"]

    run = await client.post("/api/dashboards/custom/run", headers=OWNER, json={"script": body["widget"]["script"], "dataset_ids": [dataset_id]})
    assert run.json()["result"]["series"] == [15.0, 30.0]
    refused = await client.post("/api/dashboards/custom/run", headers=OWNER, json={"script": "import os", "dataset_ids": [dataset_id]})
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "dashboard_script_failed"
    assert (await client.post("/api/dashboards/custom/run", headers={"X-Demo-User-Id": "user-shared"}, json={"script": GOOD, "dataset_ids": [dataset_id]})).status_code == 404


async def test_tune_turns_an_unusual_request_into_a_script_widget_and_the_card_previews_it(client: AsyncClient, provider) -> None:
    dataset_id = await upload(client, b"region,rev\nN,10\nS,30\nN,5\n")
    brief = {"id": dataset_id, "name": "sales.csv", "row_count": 3, "columns": [{"name": "region"}, {"name": "rev"}], "rows": [["N", "10"]]}
    tuned = {"name": "Sales", "widgets": [{"type": "custom", "title": "Revenue per region", "dataset_id": dataset_id, "request": "total revenue per region"}], "notes": ["Added a custom chart"], "slicers": []}
    queue(provider, json.dumps(tuned), f"```python\n{GOOD}\n```")
    response = await client.post("/api/dashboards/ai/tune", headers=OWNER, json={"instruction": "Show total revenue per region", "widgets": [], "datasets": [brief], "model_id": "gemini-test"})
    assert response.status_code == 200, response.text
    widget = response.json()["widgets"][0]
    assert widget["type"] == "custom" and widget["script"] and any("Python script" in note for note in response.json()["notes"])

    saved = (await client.put("/api/dashboards", headers=OWNER, json={"id": "db-py", "name": "Py", "widgets": [widget], "dataset_ids": [dataset_id]})).json()
    tile = saved["preview"]["tiles"][0]
    assert tile["type"] == "bar" and tile["labels"] == ["N", "S"] and tile["series"] == [15.0, 30.0]


async def test_analyze_endpoint_compares_two_uploaded_files(client: AsyncClient) -> None:
    left = await upload(client, b"order_id,revenue\n" + b"".join(f"{i},{i * 10}\n".encode() for i in range(1, 11)), "a.csv")
    right = await upload(client, b"order_id,revenue\n" + b"".join(f"{i},{i * 10 + (1 if i == 2 else 0)}\n".encode() for i in range(1, 11)), "b.csv")
    report = (await client.post("/api/dashboards/ai/analyze", headers=OWNER, json={"dataset_ids": [left, right]})).json()
    assert report["conflict"] is True and report["pairs"][0]["conflicts"][0]["differing"] == 1


def test_a_stalled_ai_call_is_retried_instead_of_hanging_forever(monkeypatch):
    import asyncio

    from app.services import dashboard_ai

    monkeypatch.setattr(dashboard_ai, "ATTEMPT_SECONDS", 0.05)
    calls = []

    class Stalls:
        async def stream_text(self, messages, model_id, effort):
            calls.append(1)
            if len(calls) == 1:
                await asyncio.sleep(5)
            yield '{"ok": true}'

    assert asyncio.run(dashboard_ai._ask(Stalls(), "hi", "m", None)) == {"ok": True}
    assert len(calls) == 2
