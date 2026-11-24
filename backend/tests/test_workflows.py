"""Workflows: schedules, real step-by-step runs with stored input/output, the scheduler, cancellation and the AI planner."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from httpx import AsyncClient

from app.models import WorkflowDefinition, WorkflowRunRecord
from app.services import workflow_engine

OWNER = {"X-Demo-User-Id": "user-you"}
OTHER = {"X-Demo-User-Id": "user-shared"}
CSV = b"region,revenue\nNorth,10\nSouth,30\nNorth,5\n"
SCRIPT = (
    "from collections import defaultdict\n"
    "totals = defaultdict(float)\n"
    "for region, value in zip(col(datasets[0], 'region'), col(datasets[0], 'revenue')):\n"
    "    totals[region] += num(value) or 0\n"
    "result = {'kind': 'kpi', 'title': 'Total', 'value': sum(totals.values())}\n"
)


async def upload(client: AsyncClient, content: bytes = CSV, name: str = "sales.csv") -> str:
    files = {"file": (name, content, "text/csv")}
    form = {"scope_type": "library", "scope_id": "x", "client_upload_id": f"up-{name}"}
    return (await client.post("/api/resources/upload", headers=OWNER, files=files, data=form)).json()["resource"]["id"]


def definition(dataset_id: str, steps: list[dict] | None = None, **extra) -> dict:
    base = [
        {"id": "s1", "kind": "data", "title": "Read", "detail": "", "config": {"dataset_ids": [dataset_id]}},
        {"id": "s2", "kind": "script", "title": "Total", "detail": "Sum revenue", "config": {"script": SCRIPT}},
        {"id": "s3", "kind": "notify", "title": "Tell me", "detail": "", "config": {"recipient": "me"}},
    ]
    return {"name": "Daily revenue", "state": "draft", "trigger": {"kind": "manual", "config": {}}, "steps": steps or base, **extra}


async def wait_for(client: AsyncClient, run_id: str, headers=OWNER, tries: int = 100) -> dict:
    for _ in range(tries):
        run = (await client.get(f"/api/workflow-store/runs/{run_id}", headers=headers)).json()
        if run["status"] != "running":
            return run
        await asyncio.sleep(0.05)
    raise AssertionError("run did not finish")


def test_schedule_labels_and_next_run() -> None:
    assert workflow_engine.schedule_label({"frequency": "daily", "time": "09:00"}) == "Every day at 9:00 AM"
    assert workflow_engine.schedule_label({"frequency": "weekly", "day": "Friday", "time": "17:30"}) == "Every Friday at 5:30 PM"
    after = datetime(2026, 11, 24, 12, 0, tzinfo=timezone.utc)
    daily = workflow_engine.next_run_after({"frequency": "daily", "time": "09:00"}, after)
    assert after < daily <= after + timedelta(days=1, minutes=1)
    hourly = workflow_engine.next_run_after({"frequency": "hourly"}, after)
    assert hourly.astimezone().minute == 0 and 0 < (hourly - after).total_seconds() <= 3600
    weekly = workflow_engine.next_run_after({"frequency": "weekly", "day": "Monday", "time": "08:00"}, after)
    assert weekly.astimezone().weekday() == 0 and weekly > after
    monthly = workflow_engine.next_run_after({"frequency": "monthly", "day_of_month": 5, "time": "08:00"}, after)
    assert monthly.astimezone().day == 5 and monthly > after


@pytest.mark.asyncio
async def test_run_now_records_each_steps_input_and_output(client: AsyncClient) -> None:
    dataset = await upload(client)
    saved = (await client.put("/api/workflow-store", headers=OWNER, json=definition(dataset))).json()
    started = await client.post(f"/api/workflow-store/{saved['id']}/run", headers=OWNER)
    assert started.status_code == 201 and started.json()["status"] == "running"
    run = await wait_for(client, started.json()["id"])
    assert run["status"] == "success" and [step["status"] for step in run["results"]] == ["success"] * 3
    assert run["results"][0]["output"]["datasets"][0]["rows"] == 3
    assert run["results"][1]["output"]["value"] == 45 and run["results"][1]["input"]["datasets"][0]["name"] == "sales.csv"
    assert run["results"][2]["output"]["delivered"] == "in-app" and "45" in run["results"][2]["output"]["message"]
    assert run["finished_at"] and run["results"][1]["logs"]
    history = (await client.get("/api/workflow-store/runs", headers=OWNER)).json()["items"]
    assert [item["id"] for item in history] == [run["id"]]


@pytest.mark.asyncio
async def test_a_failing_step_stops_the_run_and_marks_the_rest_skipped(client: AsyncClient) -> None:
    dataset = await upload(client)
    steps = definition(dataset)["steps"]
    steps[1]["config"]["script"] = "import os\nresult = 1"
    saved = (await client.put("/api/workflow-store", headers=OWNER, json=definition(dataset, steps))).json()
    run = await wait_for(client, (await client.post(f"/api/workflow-store/{saved['id']}/run", headers=OWNER)).json()["id"])
    assert run["status"] == "failed" and "Step 2" in run["error"]
    assert [step["status"] for step in run["results"]] == ["success", "failed", "skipped"] and run["results"][1]["error"]


@pytest.mark.asyncio
async def test_condition_step_stops_quietly_when_not_met(client: AsyncClient) -> None:
    dataset = await upload(client)
    steps = definition(dataset)["steps"]
    steps.insert(2, {"id": "c", "kind": "condition", "title": "Over 100", "detail": "", "config": {"operator": "greater", "value": "100"}})
    saved = (await client.put("/api/workflow-store", headers=OWNER, json=definition(dataset, steps))).json()
    run = await wait_for(client, (await client.post(f"/api/workflow-store/{saved['id']}/run", headers=OWNER)).json()["id"])
    assert run["status"] == "success" and [step["status"] for step in run["results"]] == ["success", "success", "success", "skipped"]
    assert run["results"][2]["output"] == {"passed": False}


@pytest.mark.asyncio
async def test_ai_step_uses_the_data_and_previous_output(client: AsyncClient, provider) -> None:
    dataset = await upload(client)
    provider.chunks = ["North leads with 15."]
    steps = definition(dataset)["steps"]
    steps.insert(2, {"id": "a", "kind": "ai", "title": "Summarise", "detail": "Summarise revenue by region", "config": {}})
    saved = (await client.put("/api/workflow-store", headers=OWNER, json=definition(dataset, steps))).json()
    run = await wait_for(client, (await client.post(f"/api/workflow-store/{saved['id']}/run", headers=OWNER)).json()["id"])
    assert run["results"][2]["output"] == {"text": "North leads with 15."}
    assert "North" in provider.calls[-1][0][0].content and "45" in provider.calls[-1][0][0].content
    assert run["results"][3]["output"]["message"] == "North leads with 15."


@pytest.mark.asyncio
async def test_cancel_stops_before_the_next_step(client: AsyncClient, monkeypatch: pytest.MonkeyPatch) -> None:
    dataset = await upload(client)
    saved = (await client.put("/api/workflow-store", headers=OWNER, json=definition(dataset))).json()
    original = workflow_engine._run_step

    async def slow(*args, **kwargs):
        await asyncio.sleep(0.3)
        return await original(*args, **kwargs)

    monkeypatch.setattr(workflow_engine, "_run_step", slow)
    run_id = (await client.post(f"/api/workflow-store/{saved['id']}/run", headers=OWNER)).json()["id"]
    await asyncio.sleep(0.1)
    assert (await client.post(f"/api/workflow-store/runs/{run_id}/cancel", headers=OWNER)).status_code == 200
    run = await wait_for(client, run_id, tries=200)
    assert run["status"] == "cancelled" and run["results"][-1]["status"] == "cancelled"


@pytest.mark.asyncio
async def test_scheduler_runs_what_is_due_and_sets_the_next_time(client: AsyncClient) -> None:
    dataset = await upload(client)
    body = definition(dataset, state="active", trigger={"kind": "schedule", "config": {"frequency": "daily", "time": "09:00"}})
    saved = (await client.put("/api/workflow-store", headers=OWNER, json=body)).json()
    assert saved["schedule"] == "Every day at 9:00 AM" and saved["next_run_at"]
    app = client._transport.app  # type: ignore[attr-defined]
    with app.state.session_factory() as session:
        item = session.get(WorkflowDefinition, saved["id"])
        item.next_run_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        session.commit()
    assert await workflow_engine.tick(app) == 1
    assert await workflow_engine.tick(app) == 0
    runs = (await client.get("/api/workflow-store/runs", headers=OWNER)).json()["items"]
    assert len(runs) == 1 and runs[0]["trigger"] == "schedule"
    assert (await wait_for(client, runs[0]["id"]))["status"] == "success"
    after = (await client.get(f"/api/workflow-store/{saved['id']}", headers=OWNER)).json()
    assert datetime.fromisoformat(after["next_run_at"]) > datetime.now(timezone.utc) and after["last_run_at"]


@pytest.mark.asyncio
async def test_paused_workflow_is_not_scheduled_and_others_cannot_touch_it(client: AsyncClient) -> None:
    dataset = await upload(client)
    body = definition(dataset, state="active", trigger={"kind": "schedule", "config": {"frequency": "hourly"}})
    saved = (await client.put("/api/workflow-store", headers=OWNER, json=body)).json()
    paused = (await client.put(f"/api/workflow-store/{saved['id']}/state", headers=OWNER, json={"state": "inactive"})).json()
    assert paused["next_run_at"] is None
    assert (await client.get(f"/api/workflow-store/{saved['id']}", headers=OTHER)).status_code == 404
    assert (await client.post(f"/api/workflow-store/{saved['id']}/run", headers=OTHER)).status_code == 404
    assert (await client.get("/api/workflow-store", headers=OTHER)).json()["items"] == []
    assert (await client.delete(f"/api/workflow-store/{saved['id']}", headers=OTHER)).status_code == 204
    assert (await client.get(f"/api/workflow-store/{saved['id']}", headers=OWNER)).status_code == 200


@pytest.mark.asyncio
async def test_empty_workflow_cannot_run(client: AsyncClient) -> None:
    saved = (await client.put("/api/workflow-store", headers=OWNER, json={"name": "Empty", "trigger": {"kind": "manual", "config": {}}, "steps": []})).json()
    assert (await client.post(f"/api/workflow-store/{saved['id']}/run", headers=OWNER)).status_code == 422


@pytest.mark.asyncio
async def test_restart_marks_unfinished_runs_failed(client: AsyncClient) -> None:
    app = client._transport.app  # type: ignore[attr-defined]
    with app.state.session_factory() as session:
        run = WorkflowRunRecord(workflow_id="w", workflow_name="W", trigger="manual", plan=[], started_at=datetime.now(timezone.utc), status="running",
                                results=[{"step_id": "a", "status": "running", "error": ""}, {"step_id": "b", "status": "pending", "error": ""}])
        session.add(run)
        session.commit()
        workflow_engine.reconcile_stale_workflow_runs(session)
        session.refresh(run)
        assert run.status == "failed" and [item["status"] for item in run.results] == ["failed", "skipped"] and run.finished_at


@pytest.mark.asyncio
async def test_ai_plan_turns_a_prompt_into_steps_and_build_writes_scripts(client: AsyncClient, provider) -> None:
    dataset = await upload(client)
    plan = {"name": "Revenue watch", "description": "Daily total", "prompt": "Add up revenue by region each day.", "steps": [
        {"kind": "script", "title": "Total revenue", "detail": "Sum revenue", "config": {}}, {"kind": "notify", "title": "Tell me", "detail": "", "config": {}}, {"kind": "bogus"}]}
    provider.chunks = [json.dumps(plan)]
    reply = await client.post("/api/workflow-store/ai/plan", headers=OWNER, json={"prompt": "add up revenue daily", "dataset_ids": [dataset], "model_id": "gemini-test"})
    assert reply.status_code == 200, reply.text
    result = reply.json()
    assert [step["kind"] for step in result["steps"]] == ["data", "script", "notify"]
    assert result["steps"][0]["config"]["dataset_ids"] == [dataset] and result["prompt"].startswith("Add up revenue")

    provider.chunks = ["```python\n" + SCRIPT + "```"]
    built = await client.post("/api/workflow-store/ai/build", headers=OWNER, json={"steps": result["steps"], "dataset_ids": [dataset], "model_id": "gemini-test"})
    assert built.status_code == 200, built.text
    script_step = built.json()["steps"][1]
    assert "totals" in script_step["config"]["script"] and "tested" in built.json()["notes"][0]


@pytest.mark.asyncio
async def test_ai_endpoints_validate_input(client: AsyncClient) -> None:
    assert (await client.post("/api/workflow-store/ai/plan", headers=OWNER, json={"prompt": "", "model_id": "gemini-test"})).status_code == 422
    assert (await client.post("/api/workflow-store/ai/plan", headers=OWNER, json={"prompt": "hello there", "model_id": "nope"})).status_code == 422
    assert (await client.post("/api/workflow-store/ai/build", headers=OWNER, json={"steps": [], "dataset_ids": [], "model_id": "gemini-test"})).status_code == 422
