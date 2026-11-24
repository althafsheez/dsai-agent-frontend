"""Runs workflows for real, on a schedule or on demand.

A workflow is a trigger (manual or a schedule) plus an ordered list of steps. Every step has an input and writes an output, and both
are stored on the run as it goes, so a person can watch a run happen. Step kinds:

    data       read one or more Library datasets
    script     a Python script (written by the AI) run in the restricted runner on those datasets
    ai         the model answers a prompt about the datasets and what the earlier steps produced
    condition  stop the run quietly unless the previous number passes a test
    notify     deliver the previous output (in-app only: no mail or chat provider is configured)
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from agentic.runtime.contracts import ChatTurn, ProviderError

from ..models import FileObject, Resource, User, WorkflowDefinition, WorkflowRunRecord
from .dashboard_script import ScriptError, run_script
from .dataset_preview import read_csv_rows

log = logging.getLogger(__name__)

STEP_KINDS = ("data", "script", "ai", "condition", "notify")
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MAX_TEXT = 4000
AI_SECONDS = 60


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- schedule

def schedule_label(config: dict[str, Any]) -> str:
    frequency = config.get("frequency", "daily")
    hours, _, minutes = str(config.get("time", "09:00")).partition(":")
    try:
        clock = f"{int(hours) % 12 or 12}:{int(minutes or 0):02d} {'PM' if int(hours) >= 12 else 'AM'}"
    except ValueError:
        clock = "9:00 AM"
    if frequency == "hourly":
        return "Every hour"
    if frequency == "weekly":
        return f"Every {config.get('day', 'Monday')} at {clock}"
    if frequency == "monthly":
        return f"Monthly on day {config.get('day_of_month', '1')} at {clock}"
    return f"Every day at {clock}"


def next_run_after(config: dict[str, Any], after: datetime) -> datetime:
    """The next time a schedule fires after `after`. Clock times are in the server's local time zone."""
    local = _utc(after).astimezone()
    frequency = config.get("frequency", "daily")
    if frequency == "hourly":
        return (local.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)).astimezone(timezone.utc)
    hours, _, minutes = str(config.get("time", "09:00")).partition(":")
    try:
        hour, minute = min(max(int(hours), 0), 23), min(max(int(minutes or 0), 0), 59)
    except ValueError:
        hour, minute = 9, 0
    candidate = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if frequency == "weekly":
        target = WEEKDAYS.index(config.get("day", "Monday")) if config.get("day", "Monday") in WEEKDAYS else 0
        candidate += timedelta(days=(target - candidate.weekday()) % 7)
        if candidate <= local:
            candidate += timedelta(days=7)
    elif frequency == "monthly":
        day = min(max(int(config.get("day_of_month", 1) or 1), 1), 28)
        candidate = candidate.replace(day=day)
        if candidate <= local:
            year, month = (candidate.year + 1, 1) if candidate.month == 12 else (candidate.year, candidate.month + 1)
            candidate = candidate.replace(year=year, month=month)
    elif candidate <= local:
        candidate += timedelta(days=1)
    return candidate.astimezone(timezone.utc)


def refresh_schedule(item: WorkflowDefinition, now: datetime | None = None) -> None:
    """Keeps `next_run_at` in step with the state and the schedule."""
    trigger = item.trigger or {}
    if item.state == "active" and trigger.get("kind") == "schedule":
        item.next_run_at = next_run_after(trigger.get("config") or {}, now or now_utc())
    else:
        item.next_run_at = None


# ---------------------------------------------------------------- data

def load_dataset(session: Session, storage: Any, owner_id: str, dataset_id: str) -> dict[str, Any] | None:
    from ..routes.dashboards import can_view_dataset  # imported here: routes import services, not the other way round

    row = session.execute(select(Resource, FileObject).join(FileObject, FileObject.id == Resource.file_object_id).where(Resource.id == dataset_id)).one_or_none()
    owner = session.get(User, owner_id)
    if row is None or owner is None or (row[0].created_by != owner_id and not can_view_dataset(session, owner, dataset_id)):
        return None
    try:
        rows = read_csv_rows(row[0].name, storage.read_bytes(row[1].relative_storage_path))
    except OSError:
        return None
    return None if rows is None else {"id": dataset_id, "name": row[0].name, "columns": [column["name"] for column in rows["columns"]], "rows": rows["rows"]}


def _clip(value: Any, limit: int = MAX_TEXT) -> Any:
    text = json.dumps(value, default=str)
    if len(text) <= limit:
        return value
    return {"truncated": True, "preview": text[:limit]}


def _brief(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"name": d["name"], "rows": len(d["rows"]), "columns": d["columns"]} for d in datasets]


def _number_from(output: Any) -> float | None:
    if isinstance(output, dict):
        for key in ("value", "max"):
            if isinstance(output.get(key), (int, float)):
                return float(output[key])
        series = output.get("series")
        if isinstance(series, list) and series and all(isinstance(item, (int, float)) for item in series):
            return float(max(series))
        for item in output.values():
            number = _number_from(item)
            if number is not None:
                return number
    return None


# ---------------------------------------------------------------- steps

class StepFailure(Exception):
    pass


async def _model_id(provider: Any) -> str:
    chosen = getattr(provider, "default_model_id", None)
    if chosen:
        return chosen
    models, _ = await provider.list_models()
    return models[0].id


async def _run_step(app: Any, session: Session, owner_id: str, step: dict[str, Any], ctx: dict[str, Any]) -> tuple[Any, Any, list[str]]:
    """Returns (input, output, log lines) for one step, or raises StepFailure."""
    kind, config = step.get("kind"), step.get("config") or {}
    logs: list[str] = []
    ids = [item for item in config.get("dataset_ids", []) if isinstance(item, str)]

    async def datasets() -> list[dict[str, Any]]:
        if ctx["datasets"] and not ids:
            return ctx["datasets"]
        loaded = [item for item in (load_dataset(session, app.state.storage, owner_id, dataset_id) for dataset_id in ids) if item]
        if ids and len(loaded) != len(ids):
            raise StepFailure("One of the datasets could not be read (deleted, or no longer visible to the workflow's owner).")
        return loaded or ctx["datasets"]

    if kind == "data":
        if not ids:
            raise StepFailure("Choose at least one dataset for this step.")
        loaded = await datasets()
        ctx["datasets"] = loaded
        logs += [f"Read {len(item['rows']):,} rows and {len(item['columns'])} columns from {item['name']}" for item in loaded]
        return {"dataset_ids": ids}, {"datasets": _brief(loaded)}, logs

    if kind == "script":
        script = (config.get("script") or "").strip()
        if not script:
            raise StepFailure("This step has no script yet. Open the workflow and choose “Build with AI”.")
        loaded = await datasets()
        ctx["datasets"] = loaded
        logs.append(f"Running the script on {', '.join(item['name'] for item in loaded) or 'no data'}")
        try:
            result = await asyncio.to_thread(run_script, script, loaded)
        except ScriptError as exc:
            raise StepFailure(str(exc)) from exc
        logs.append(f"The script returned a {result.get('kind')} result")
        return {"datasets": _brief(loaded), "request": step.get("detail", "")}, result, logs

    if kind == "ai":
        prompt = (step.get("detail") or "").strip()
        if not prompt:
            raise StepFailure("Write what the AI should do in this step.")
        loaded = await datasets()
        ctx["datasets"] = loaded
        sample = "\n".join(f"- {item['name']} ({len(item['rows'])} rows): columns {', '.join(item['columns'])}\n  first rows: {json.dumps(item['rows'][:5])}" for item in loaded)
        previous = json.dumps(_clip(ctx["last"], 2500), default=str) if ctx["last"] is not None else "nothing yet"
        full = f"{prompt}\n\nDatasets:\n{sample or 'none'}\n\nOutput of the previous step: {previous}\n\nAnswer in plain text, short and specific, with the real numbers."
        logs.append("Asking the model")
        try:
            async def collect() -> str:
                reply = ""
                async for chunk in app.state.provider.stream_text([ChatTurn(role="user", content=full)], await _model_id(app.state.provider), None):
                    reply += chunk
                return reply
            reply = await asyncio.wait_for(collect(), AI_SECONDS)
        except asyncio.TimeoutError as exc:
            raise StepFailure("The AI took too long to answer.") from exc
        except ProviderError as exc:
            raise StepFailure(f"The AI was unavailable: {exc}") from exc
        logs.append(f"Received {len(reply)} characters")
        return {"prompt": prompt, "previous_output": _clip(ctx["last"], 800)}, {"text": reply.strip()}, logs

    if kind == "condition":
        operator, wanted = config.get("operator", "greater"), config.get("value", "0")
        number = _number_from(ctx["last"])
        if number is None:
            raise StepFailure("The previous step produced no number to check.")
        try:
            limit = float(wanted)
        except (TypeError, ValueError) as exc:
            raise StepFailure(f"“{wanted}” is not a number.") from exc
        passed = {"greater": number > limit, "less": number < limit, "equals": number == limit}.get(operator, False)
        logs.append(f"{number:g} {operator} {limit:g}: {'passed' if passed else 'not met, the run stops here'}")
        ctx["stop"] = not passed
        return {"number": number, "test": f"{operator} {limit:g}"}, {"passed": passed}, logs

    if kind == "notify":
        recipient = (config.get("recipient") or "the workflow owner").strip()
        last = ctx["last"]
        message = last.get("text") if isinstance(last, dict) and isinstance(last.get("text"), str) else json.dumps(_clip(last, 1500), default=str)
        logs.append(f"Delivered in the app for {recipient} (no email or chat provider is configured)")
        return {"to": recipient, "channel": "in-app"}, {"message": message, "delivered": "in-app"}, logs

    raise StepFailure(f"Unknown step type “{kind}”.")


def _save(session: Session, run: WorkflowRunRecord, results: list[dict[str, Any]]) -> None:
    """JSON columns are only written when SQLAlchemy sees a change, so the list is copied and flagged every time."""
    run.results = [dict(item) for item in results]
    flag_modified(run, "results")
    session.commit()


def _initial_results(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"step_id": step["id"], "title": step.get("title") or step["kind"], "kind": step["kind"], "status": "pending", "input": None, "output": None, "logs": [], "error": "", "started_at": None, "finished_at": None} for step in steps]


def create_run(session: Session, workflow: WorkflowDefinition, trigger: str) -> WorkflowRunRecord:
    steps = workflow.steps or []
    run = WorkflowRunRecord(workflow_id=workflow.id, workflow_name=workflow.name, trigger=trigger, plan=[], started_at=now_utc(), status="running", results=_initial_results(steps))
    session.add(run)
    workflow.last_run_at = run.started_at
    session.commit()
    return run


def launch(app: Any, run_id: str, owner_id: str) -> None:
    """Runs a created run in the background; the task is kept so it is not garbage collected."""
    tasks: set = app.state.workflow_tasks
    task = asyncio.create_task(execute_run(app, run_id, owner_id))
    tasks.add(task)
    task.add_done_callback(tasks.discard)


async def execute_run(app: Any, run_id: str, owner_id: str) -> None:
    with app.state.session_factory() as session:
        run = session.get(WorkflowRunRecord, run_id)
        workflow = session.get(WorkflowDefinition, run.workflow_id) if run else None
        if run is None:
            return
        steps = list(workflow.steps or []) if workflow else []
        ctx: dict[str, Any] = {"datasets": [], "last": None, "stop": False}
        failed = False
        for index, step in enumerate(steps):
            session.refresh(run)
            results = [dict(item) for item in run.results]
            if run.cancelled_at is not None:
                for item in results[index:]:
                    item["status"] = "cancelled"
                run.status, run.finished_at = "cancelled", now_utc()
                _save(session, run, results)
                return
            if failed or ctx["stop"]:
                results[index]["status"] = "skipped"
                _save(session, run, results)
                continue
            results[index].update(status="running", started_at=now_utc().isoformat())
            _save(session, run, results)
            try:
                step_input, output, logs = await _run_step(app, session, owner_id, step, ctx)
                results[index].update(status="success", input=_clip(step_input), output=_clip(output), logs=logs)
                ctx["last"] = output
            except StepFailure as exc:
                results[index].update(status="failed", error=str(exc)[:600], logs=[str(exc)[:300]])
                failed, run.error = True, f"Step {index + 1} (“{step.get('title', '')}”) failed: {exc}"[:800]
            except Exception as exc:  # a bug in one step must not leave the run "running" forever
                log.exception("Workflow step crashed")
                results[index].update(status="failed", error=f"Unexpected error: {type(exc).__name__}", logs=["Unexpected error"])
                failed, run.error = True, f"Step {index + 1} crashed: {type(exc).__name__}"
            results[index]["finished_at"] = now_utc().isoformat()
            _save(session, run, results)
        session.refresh(run)
        if run.cancelled_at is None:
            run.status = "failed" if failed else "success"
            run.finished_at = now_utc()
        session.commit()


# ---------------------------------------------------------------- scheduler

def due_workflows(session: Session, now: datetime) -> list[WorkflowDefinition]:
    return [item for item in session.scalars(select(WorkflowDefinition).where(WorkflowDefinition.state == "active", WorkflowDefinition.next_run_at.is_not(None))) if _utc(item.next_run_at) <= now]


async def tick(app: Any, now: datetime | None = None) -> int:
    """Starts every active workflow whose time has come. Returns how many were started."""
    moment = now or now_utc()
    started = 0
    with app.state.session_factory() as session:
        for workflow in due_workflows(session, moment):
            run = create_run(session, workflow, "schedule")
            workflow.next_run_at = next_run_after((workflow.trigger or {}).get("config") or {}, moment)
            session.commit()
            launch(app, run.id, workflow.owner_id)
            started += 1
    return started


async def scheduler_loop(app: Any, every: int) -> None:
    while True:
        await asyncio.sleep(every)
        try:
            await tick(app)
        except Exception:
            log.exception("Workflow scheduler pass failed")


def reconcile_stale_workflow_runs(session: Session) -> None:
    """A run that was going when the server stopped can never finish: mark it failed so it does not look alive."""
    for run in session.scalars(select(WorkflowRunRecord).where(WorkflowRunRecord.status == "running")):
        results = [dict(item) for item in run.results]
        for item in results:
            if item["status"] in ("running", "pending"):
                item["status"] = "failed" if item["status"] == "running" else "skipped"
                if item["status"] == "failed":
                    item["error"] = "The server restarted while this step was running."
        run.status, run.finished_at, run.error = "failed", now_utc(), "The server restarted during the run."
        _save(session, run, results)
    session.commit()
