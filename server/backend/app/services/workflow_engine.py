"""Runs workflows for real, on a schedule or on demand.

A workflow is a trigger (manual or a schedule) plus an ordered list of steps. Every step has an input and writes an output, and both
are stored on the run as it goes, so a person can watch a run happen. Step kinds:

    data       read one or more Library datasets
    script     a Python script (written by the AI) run in the restricted runner on those datasets
    ai         the model answers a prompt about the datasets and what the earlier steps produced
    condition  stop the run quietly unless the previous number passes a test
    notify     retain the previous output in the run or save its files to the Library
"""
from __future__ import annotations

import asyncio
import calendar
import csv
import io
import json
import logging
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from agentic.runtime.contracts import ChatTurn, InputSource, ProviderError, ToolContext
from agentic.runtime.events import RunnerCancelled

from ..errors import APIError
from ..models import FileObject, Resource, ResourceLink, User, WorkflowDefinition, WorkflowRunRecord
from . import action_builder
from .dashboard_script import ScriptError, run_script
from .dataset_preview import read_csv_rows
from .resource_uploads import save_owned_resource_to_library

log = logging.getLogger(__name__)

STEP_KINDS = ("data", "script", "ai", "condition", "notify")
WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
MAX_TEXT = 4000
AI_SECONDS = 180


def _utc(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- schedule

def validate_schedule(config: dict[str, Any]) -> None:
    if "rules" not in config:
        return
    rules = config["rules"]
    if not isinstance(rules, list) or not 1 <= len(rules) <= 20:
        raise ValueError("A schedule needs between 1 and 20 rules.")
    for rule in rules:
        if not isinstance(rule, dict) or rule.get("unit") not in ("seconds", "minutes", "hours", "days", "weeks", "months"):
            raise ValueError("Invalid schedule interval.")
        unit = rule["unit"]
        def number(key: str, low: int, high: int) -> int:
            value = rule.get(key)
            if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
                raise ValueError(f"Invalid schedule {key}.")
            return value
        number("interval", 1, {"seconds": 59, "minutes": 59, "hours": 23, "days": 31, "weeks": 52, "months": 12}[unit])
        if unit in ("hours", "days", "weeks", "months"):
            number("minute", 0, 59)
        if unit in ("days", "weeks", "months"):
            number("hour", 0, 23)
        if unit == "months":
            day = number("day_of_month", 1, 31)
            if day > 28 and not any(day <= calendar.monthrange(year, month)[1] for year in range(2000, 2400) for month in range(1, 13) if (year * 12 + month - 1) % rule["interval"] == 0):
                raise ValueError("This interval never reaches the selected day of month.")
        if unit == "weeks":
            days = rule.get("weekdays")
            if not isinstance(days, list) or not days or any(day not in WEEKDAYS for day in days):
                raise ValueError("Choose at least one weekday.")


def _next_rule(rule: dict[str, Any], after: datetime) -> datetime:
    """Intervals align to calendar boundaries, with weeks starting Monday."""
    local = _utc(after).astimezone()
    unit, interval = rule["unit"], rule["interval"]
    if unit in ("seconds", "minutes"):
        seconds = interval * (60 if unit == "minutes" else 1)
        timestamp = local.timestamp()
        return datetime.fromtimestamp((int(timestamp // seconds) + 1) * seconds, timezone.utc)
    minute, hour = rule.get("minute", 0), rule.get("hour", 0)
    if unit == "hours":
        candidate = local.replace(minute=minute, second=0, microsecond=0)
        epoch_hours = candidate.toordinal() * 24 + candidate.hour
        candidate += timedelta(hours=(-epoch_hours) % interval)
        if candidate <= local:
            candidate += timedelta(hours=interval)
        return candidate.astimezone(timezone.utc)
    candidate = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    if unit == "days":
        candidate += timedelta(days=(-candidate.toordinal()) % interval)
        if candidate <= local:
            candidate += timedelta(days=interval)
    elif unit == "weeks":
        monday = candidate - timedelta(days=candidate.weekday())
        week_index = (monday.toordinal() - 1) // 7
        monday += timedelta(weeks=(-week_index) % interval)
        for week in (monday, monday + timedelta(weeks=interval)):
            for day in range(7):
                value = week + timedelta(days=day)
                if WEEKDAYS[day] in rule["weekdays"] and value > local:
                    return value.astimezone(timezone.utc)
        raise ValueError("No weekdays selected")
    else:
        month_index = candidate.year * 12 + candidate.month - 1
        month_index += (-month_index) % interval
        # Gregorian dates repeat every 400 years; some intervals can never hit the requested day.
        for _ in range(4800):
            year, month0 = divmod(month_index, 12)
            month = month0 + 1
            day = rule["day_of_month"]
            if day <= calendar.monthrange(year, month)[1]:
                value = candidate.replace(year=year, month=month, day=day)
                if value > local:
                    return value.astimezone(timezone.utc)
            month_index += interval
        raise ValueError("This interval never reaches the selected day of month.")
    return candidate.astimezone(timezone.utc)


def schedule_label(config: dict[str, Any]) -> str:
    if "rules" in config:
        return ", ".join(f"Every {r['interval']} {r['unit']}" for r in config["rules"])
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
    if "rules" in config:
        validate_schedule(config)
        return min(_next_rule(rule, after) for rule in config["rules"])
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
    if not models:
        raise ProviderError("model_unavailable", "No AI model is configured.")
    return models[0].id


async def _run_workflow_ai(
    app: Any, owner_id: str, run_id: str, step_id: str, prompt: str, datasets: list[dict], model_id: str,
    effort: str | None, report: Callable[..., None],
) -> dict:
    inputs = {}
    for index, dataset in enumerate(datasets):
        file = io.StringIO(newline="")
        writer = csv.writer(file)
        writer.writerow(dataset["columns"])
        writer.writerows([
            [json.dumps(cell, ensure_ascii=False) if isinstance(cell, (list, dict, bool)) else cell for cell in row]
            for row in dataset["rows"]
        ])
        content = file.getvalue().encode()
        inputs[dataset["id"]] = InputSource(f"dataset-{index + 1}.csv", lambda content=content: content)
    context = ToolContext(
        run_id=f"workflow-{run_id}-{step_id}", chat_id="", user_id=owner_id,
        transient_inputs=inputs, workflow_run_id=run_id, workflow_step_id=step_id,
    )

    def cancelled() -> bool:
        with app.state.session_factory() as db:
            current = db.get(WorkflowRunRecord, run_id)
            return current is None or current.cancelled_at is not None

    messages = [ChatTurn(role="user", content=prompt)]
    reply = ""
    resources: dict[str, dict] = {}
    writing = False
    try:
        async for event in app.state.runner.run(
            messages, model_id, effort, cancelled, context,
            allowed_tools=frozenset({"execute_python", "lookup_data", "read_file", "generate_visualization", "list_files"}),
        ):
            if event.type == "progress":
                label = event.data.get("label")
                if isinstance(label, str) and label:
                    report(label)
            elif event.type == "tool.started":
                name = str(event.data.get("name") or "tool").replace("_", " ")
                report(f"Running {name}")
            elif event.type == "message.delta":
                reply += str(event.data.get("text", ""))
                if not writing:
                    writing = True
                    report("Writing the response")
            elif event.type in {"tool.completed", "tool.failed"}:
                writing = False
                previous_count = len(resources)
                for resource in event.data.get("resources", []):
                    if isinstance(resource, dict) and isinstance(resource.get("id"), str):
                        resources[resource["id"]] = resource
                summary = str(event.data.get("summary", "Tool finished."))
                error = event.data.get("error")
                if event.type == "tool.failed" and isinstance(error, str):
                    summary = f"{summary} {error}"
                if len(resources) > previous_count:
                    count = len(resources) - previous_count
                    summary = f"{summary} Saved {count} {'file' if count == 1 else 'files'}."
                report(summary, output={"resources": list(resources.values())} if resources else None)
            if len(reply) > 16_000:
                break
    finally:
        await app.state.runner.close(context)
    if not reply.strip() and not resources:
        raise StepFailure("The AI step returned no answer or files.")
    return {"kind": "ai_result", "text": reply[:16_000].strip(), "resources": list(resources.values())}


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
        if config.get("connection_id"):
            try:
                action = action_builder.from_step(step)
                user = session.get(User, owner_id)
                if user is None:
                    raise StepFailure("The workflow owner is unavailable.")
                adapter = action_builder.check_action(app.state.connections, session, user, action)
                table = await adapter.execute(action.arguments)
            except APIError as exc:
                raise StepFailure(f"{exc.message} ({exc.code})") from None
            table["output_id"] = f"{ctx['run_id']}:{step['id']}"
            ctx["query_table"] = table
            ctx["datasets"] = [{
                "id": table["output_id"], "name": "PostgreSQL result", "columns": table["columns"], "rows": table["rows"],
            }]
            return (
                {"connection_id": action.connection_id, "operation": action.operation, "sql": action.arguments["sql"]},
                table, [f"PostgreSQL returned {table['row_count']} rows in {table['duration_ms']} ms."],
            )
        if not ids:
            raise StepFailure("Choose at least one dataset for this step.")
        loaded = await datasets()
        ctx["datasets"] = loaded
        ctx.pop("query_table", None)
        logs += [f"Read {len(item['rows']):,} rows and {len(item['columns'])} columns from {item['name']}" for item in loaded]
        return {"dataset_ids": ids}, {"datasets": _brief(loaded)}, logs

    if kind == "script":
        script = (config.get("script") or "").strip()
        if not script:
            raise StepFailure("This step has no script yet. Open the workflow and choose “Build step”.")
        loaded = await datasets()
        if (
            (config.get("script_for") and config["script_for"] != step.get("detail"))
            or (isinstance(config.get("script_dataset_ids"), list) and config["script_dataset_ids"] != [item["id"] for item in loaded])
        ):
            raise StepFailure("Rebuild this Custom step with its current instructions and datasets.")
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
        report = ctx["ai_progress"]
        report("Preparing inputs for the AI step", input={"prompt": prompt})
        loaded = await datasets()
        step_input = {"prompt": prompt, "datasets": _brief(loaded), "previous_output": _clip(ctx["last"], 800)}
        query_table = ctx.get("query_table") if not ids else None
        full = prompt
        if query_table:
            step_input["output_id"] = query_table["output_id"]
        if query_table is None or ctx["last"] is not query_table:
            sample = "\n".join(f"- {item['name']} ({len(item['rows'])} rows): columns {', '.join(item['columns'])}\n  first rows: {json.dumps(item['rows'][:5])}" for item in loaded)
            previous = json.dumps(_clip(ctx["last"], 2500), default=str) if ctx["last"] is not None else "nothing yet"
            full = f"{prompt}\n\nDatasets:\n{sample[:10_000] or 'none'}\n\nOutput of the previous step: {previous}\n\nUse the real numbers and provide the requested deliverables."
        report("Resolving the AI model", input=step_input)
        try:
            model_id = config.get("model_id") or await _model_id(app.state.provider)
            effort = config.get("effort") or None
            selection = app.state.provider.validate_selection(model_id, effort)
            effort = effort or selection.default_effort
            report(f"Asking {model_id}", input={**step_input, "model": model_id, "effort": effort})
            result = await asyncio.wait_for(
                _run_workflow_ai(app, owner_id, ctx["run_id"], step["id"], full, loaded, model_id, effort, report),
                AI_SECONDS,
            )
        except asyncio.TimeoutError as exc:
            raise StepFailure(f"The AI step reached its {AI_SECONDS}-second limit. The input, progress log and any generated files are available below.") from exc
        except ProviderError as exc:
            turn = (exc.diagnostic or {}).get("turn")
            stage = f" on analysis turn {turn}" if isinstance(turn, int) else ""
            raise StepFailure(f"The AI failed{stage}: {exc} ({exc.code}).") from exc
        logs.append(f"Received {len(result['text'])} characters and {len(result['resources'])} files.")
        return step_input, result if result["resources"] else {"text": result["text"]}, logs

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
        last = ctx["last"]
        resources = {"resources": last["resources"]} if isinstance(last, dict) and last.get("resources") else {}
        if config.get("destination") == "library":
            files = resources.get("resources", [])
            if not files:
                raise StepFailure("The previous step returned no files. Generate a file before saving it to the Library.")
            ids = {file["id"] for file in files}
            owned = set(session.scalars(select(Resource.id).join(ResourceLink, ResourceLink.resource_id == Resource.id).where(
                Resource.id.in_(ids), Resource.created_by == owner_id,
                ResourceLink.scope_type == "workflow", ResourceLink.scope_id == ctx["run_id"],
            )))
            if owned != ids:
                raise StepFailure("One or more files are unavailable to this workflow.")
            if ctx.get("test"):
                message = f"Test run would save {len(ids)} file(s) to your Library."
            else:
                try:
                    for resource_id in sorted(ids):
                        save_owned_resource_to_library(session, owner_id, resource_id)
                except SQLAlchemyError:
                    session.rollback()
                    raise StepFailure("Could not save the files to your Library.") from None
                message = f"Saved {len(ids)} file(s) to your Library."
            return {"destination": "library"}, {"message": message, **resources}, [message]
        recipient = (config.get("recipient") or "the workflow owner").strip()
        message = last.get("text") if isinstance(last, dict) and isinstance(last.get("text"), str) else json.dumps(_clip(last, 1500), default=str)
        if ctx.get("test"):
            return {"to": recipient, "channel": "in-app"}, {"message": message, **resources}, ["Test preview. Skipped delivery."]
        logs.append(f"Delivered in the app for {recipient} (no email or chat provider is configured)")
        return {"to": recipient, "channel": "in-app"}, {"message": message, "delivered": "in-app", **resources}, logs

    raise StepFailure(f"Unknown step type “{kind}”.")


def _save(session: Session, run: WorkflowRunRecord, results: list[dict[str, Any]]) -> None:
    """JSON columns are only written when SQLAlchemy sees a change, so the list is copied and flagged every time."""
    run.results = [dict(item) for item in results]
    flag_modified(run, "results")
    session.commit()


def _initial_results(steps: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{"step_id": step["id"], "title": step.get("title") or step["kind"], "kind": step["kind"], "status": "pending", "input": None, "output": None, "logs": [], "error": "", "started_at": None, "finished_at": None} for step in steps]


def create_run(
    session: Session, workflow: WorkflowDefinition, trigger: str, *, test_steps: list[dict[str, Any]] | None = None,
) -> WorkflowRunRecord:
    steps = test_steps if test_steps is not None else workflow.steps or []
    run = WorkflowRunRecord(workflow_id=workflow.id, workflow_name=workflow.name, trigger=trigger, plan=steps, started_at=now_utc(), status="running", results=_initial_results(steps))
    session.add(run)
    if trigger != "test":
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
        steps = run.plan or (list(workflow.steps or []) if workflow else [])
        ctx: dict[str, Any] = {"datasets": [], "last": None, "stop": False, "test": run.trigger == "test", "run_id": run.id}
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
            if step.get("kind") == "ai":
                def report(message: str, *, input: dict | None = None, output: dict | None = None) -> None:
                    current = results[index]
                    message = message[:240]
                    if current.get("progress") != message:
                        current["logs"] = [*current["logs"][-31:], message]
                    current["progress"] = message
                    if input is not None:
                        current["input"] = _clip(input, 8000)
                    if output is not None:
                        current["output"] = output
                    _save(session, run, results)

                ctx["ai_progress"] = report
            try:
                step_input, output, logs = await _run_step(app, session, owner_id, step, ctx)
                saved_output = output if isinstance(output, dict) and (output.get("kind") == "query_table" or output.get("resources")) else _clip(output)
                if results[index]["input"] is None:
                    results[index]["input"] = _clip(step_input)
                results[index].update(status="success", output=saved_output, logs=[*results[index]["logs"], *logs])
                ctx["last"] = output
            except RunnerCancelled:
                for item in results[index:]:
                    item["status"] = "cancelled"
                run.status, run.finished_at = "cancelled", now_utc()
                _save(session, run, results)
                return
            except StepFailure as exc:
                results[index].update(status="failed", error=str(exc)[:600], logs=[*results[index]["logs"], str(exc)[:300]])
                failed, run.error = True, f"Step {index + 1} (“{step.get('title', '')}”) failed: {exc}"[:800]
            except Exception as exc:  # a bug in one step must not leave the run "running" forever
                log.exception("Workflow step crashed")
                results[index].update(status="failed", error=f"Unexpected error: {type(exc).__name__}", logs=[*results[index]["logs"], "Unexpected error"])
                failed, run.error = True, f"Step {index + 1} crashed: {type(exc).__name__}"
            results[index]["finished_at"] = now_utc().isoformat()
            _save(session, run, results)
        session.refresh(run)
        run.status = "cancelled" if run.cancelled_at is not None else "failed" if failed else "success"
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
