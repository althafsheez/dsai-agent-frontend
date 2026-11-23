from __future__ import annotations

import asyncio
import json
import logging
import re
from typing import Any

from agentic.runtime.contracts import ChatTurn, LLMProvider, ProviderError

from .dashboard_script import MAX_SCRIPT, ScriptError, run_script, validate_script

logger = logging.getLogger(__name__)

WIDGET_TYPES = {"custom", "kpi", "gauge", "bar", "hbar", "line", "area", "pie", "radar", "funnel", "treemap", "histogram", "scatter", "table"}
NO_CATEGORY = {"kpi", "gauge", "table"}
NUMERIC_X = {"histogram", "scatter"}
AGGREGATES = {"sum", "avg", "count"}
MAX_WIDGETS = 12

SPEC = (
    'Widget JSON: {"type":"kpi|gauge|bar|hbar|line|area|pie|radar|funnel|treemap|histogram|scatter|table","title":str,"dataset_id":str,'
    '"x":column|null,"y":column|null,"agg":"sum|avg|count","span":1|2|3}. '
    "x is the category column (bar/hbar/line/area/pie/radar/funnel/treemap); y is the numeric column to aggregate (omit for count); "
    "kpi, gauge (an average against the column's maximum) and table need no x; histogram takes a numeric x and counts rows per range; "
    "scatter takes a numeric x and a numeric y (one dot per row). Mix chart types so the dashboard is varied: ranking charts (hbar, funnel), "
    "composition (pie, treemap), trend (line, area), distribution (histogram), relationship (scatter), comparison across many measures (radar). "
    'If a request cannot be shown with any of those types (a calculation across datasets, a ratio, a cohort, a custom ranking, anything unusual), '
    'add {"type":"custom","title":str,"dataset_id":str,"datasets":[ids it needs],"request":"what to compute and how to show it, in words"}; '
    "the app then writes and runs a Python script for it. Use custom only when no preset type fits. "
    "Use only dataset ids and column names that appear in the schema."
)


def _is_number(value: Any) -> bool:
    if value is None or value == "":
        return False
    try:
        float(value)
    except (TypeError, ValueError):
        return False
    return True


class Schema:
    def __init__(self, datasets: list[dict[str, Any]]) -> None:
        self.datasets = {item["id"]: item for item in datasets}

    def column(self, dataset_id: str, name: Any) -> str | None:
        columns = [column["name"] for column in self.datasets[dataset_id].get("columns", [])]
        if not isinstance(name, str):
            return None
        if name in columns:
            return name
        lowered = {column.lower().strip(): column for column in columns}
        return lowered.get(name.lower().strip())

    def is_numeric(self, dataset_id: str, column: str) -> bool:
        dataset = self.datasets[dataset_id]
        names = [item["name"] for item in dataset.get("columns", [])]
        index = names.index(column)
        values = [row[index] for row in dataset.get("rows", []) if index < len(row) and row[index] not in (None, "")]
        return bool(values) and all(_is_number(value) for value in values)

    def first_numeric(self, dataset_id: str) -> str | None:
        return next((item["name"] for item in self.datasets[dataset_id].get("columns", []) if self.is_numeric(dataset_id, item["name"])), None)

    def first_category(self, dataset_id: str) -> str | None:
        names = [item["name"] for item in self.datasets[dataset_id].get("columns", [])]
        return next((name for name in names if not self.is_numeric(dataset_id, name)), names[0] if names else None)


def sanitize_widgets(raw: Any, datasets: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    """Make every widget drawable against the real columns. Returns the cleaned widgets and what was changed."""
    notes: list[str] = []
    if not isinstance(raw, list):
        return [], ["The AI did not return a widget list."]
    schema = Schema(datasets)
    cleaned: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    for index, item in enumerate(raw[:MAX_WIDGETS * 2]):
        if len(cleaned) >= MAX_WIDGETS:
            notes.append(f"Kept the first {MAX_WIDGETS} widgets.")
            break
        if not isinstance(item, dict):
            continue
        label = str(item.get("title") or f"Widget {index + 1}")[:80]
        wtype = str(item.get("type", "")).lower()
        if wtype not in WIDGET_TYPES:
            notes.append(f"Removed “{label}”: unknown chart type.")
            continue
        dataset_id = item.get("dataset_id")
        if dataset_id not in schema.datasets:
            if len(schema.datasets) == 1:
                dataset_id = next(iter(schema.datasets))
                notes.append(f"“{label}” pointed at an unknown dataset; moved to {schema.datasets[dataset_id]['name']}.")
            else:
                notes.append(f"Removed “{label}”: its dataset is not selected.")
                continue
        if wtype == "custom":
            ids = [value for value in item.get("datasets", []) if isinstance(value, str) and value in schema.datasets] if isinstance(item.get("datasets"), list) else []
            script = str(item.get("script") or "")
            if script:
                try:
                    validate_script(script)
                except ScriptError as exc:
                    notes.append(f"“{label}”: the script was refused ({exc}); it will be rewritten.")
                    script = ""
            span = item.get("span") if item.get("span") in (1, 2, 3) else 2
            widget_id = str(item.get("id") or "")
            if not widget_id or widget_id in used_ids:
                widget_id = f"w-ai-{index}-{len(cleaned)}"
            used_ids.add(widget_id)
            cleaned.append({"id": widget_id, "type": "custom", "title": label, "dataset_id": dataset_id, "datasets": ids or [dataset_id], "x": None, "y": None, "agg": "count",
                            "span": span, "script": script, "request": str(item.get("request") or label)[:400]})
            continue
        agg = str(item.get("agg", "sum")).lower()
        if agg not in AGGREGATES:
            agg = "sum"
        y = schema.column(dataset_id, item.get("y"))
        x = schema.column(dataset_id, item.get("x"))
        if wtype in NUMERIC_X:
            x = x if x and schema.is_numeric(dataset_id, x) else schema.first_numeric(dataset_id)
            if x is None:
                notes.append(f"Removed “{label}”: {wtype} needs a numeric column.")
                continue
            if wtype == "histogram":
                y, agg = None, "count"
            else:
                y = y if y and y != x and schema.is_numeric(dataset_id, y) else next((c["name"] for c in schema.datasets[dataset_id].get("columns", []) if c["name"] != x and schema.is_numeric(dataset_id, c["name"])), None)
                if y is None:
                    notes.append(f"Removed “{label}”: scatter needs two numeric columns.")
                    continue
                agg = "sum"
        elif wtype not in NO_CATEGORY:
            if x is None:
                x = schema.first_category(dataset_id)
                notes.append(f"“{label}” had no valid category column; used {x}.")
            if x is None:
                notes.append(f"Removed “{label}”: no category column to group by.")
                continue
        else:
            x = None
        if wtype == "table":
            y, agg = None, "count"
        elif wtype in NUMERIC_X:
            pass
        elif wtype == "gauge":
            agg = "avg"
            y = y if y and schema.is_numeric(dataset_id, y) else schema.first_numeric(dataset_id)
            if y is None:
                notes.append(f"Removed “{label}”: a gauge needs a numeric column.")
                continue
        elif agg != "count":
            if y is None or not schema.is_numeric(dataset_id, y):
                fallback = schema.first_numeric(dataset_id)
                if fallback is None:
                    agg, y = "count", None
                    notes.append(f"“{label}” has no numeric column; switched to a count.")
                else:
                    notes.append(f"“{label}” used a non-numeric value column; switched to {fallback}.")
                    y = fallback
        else:
            y = None
        try:
            span = int(item.get("span", 0))
        except (TypeError, ValueError):
            span = 0
        if span not in (1, 2, 3):
            span = {"kpi": 1, "gauge": 1, "table": 3}.get(wtype, 2)
        widget_id = str(item.get("id") or "")
        if not widget_id or widget_id in used_ids:
            widget_id = f"w-ai-{index}-{len(cleaned)}"
        used_ids.add(widget_id)
        cleaned.append({"id": widget_id, "type": wtype, "title": label, "dataset_id": dataset_id, "x": x, "y": y, "agg": agg, "span": span})
    return cleaned, notes


def clean_slicers(raw: Any, datasets: list[dict[str, Any]], widgets: list[dict[str, Any]]) -> list[str]:
    """Keep slicer columns that exist in a dataset some widget actually uses (case-insensitive), at most 4."""
    if not isinstance(raw, list):
        return []
    used = {widget["dataset_id"] for widget in widgets}
    known = {column["name"].lower().strip(): column["name"] for dataset in datasets if dataset["id"] in used for column in dataset.get("columns", [])}
    result: list[str] = []
    for item in raw:
        name = known.get(item.lower().strip()) if isinstance(item, str) else None
        if name and name not in result:
            result.append(name)
    return result[:4]


def clean_suggestions(raw: Any) -> list[str]:
    if not isinstance(raw, list):
        return []
    return [item.strip()[:90] for item in raw if isinstance(item, str) and item.strip()][:3]


def _schema_text(datasets: list[dict[str, Any]]) -> str:
    lines = []
    for dataset in datasets:
        columns = ", ".join(f"{column['name']} ({column.get('data_type', 'string')})" for column in dataset.get("columns", []))
        sample = json.dumps(dataset.get("rows", [])[:4])[:700]
        lines.append(f"- id={dataset['id']} name={dataset['name']} rows={dataset.get('row_count')}\n  columns: {columns}\n  sample rows: {sample}")
    return "\n".join(lines)


def _context(text: str) -> str:
    """What the app learned about how the selected datasets relate, and the user's choice about conflicts."""
    return f"\nHow these datasets relate (from the app; follow the user's choice when files disagree):\n{text[:3000]}\n" if text.strip() else ""


def _extract_json(text: str) -> Any:
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    candidate = fenced.group(1) if fenced else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the reply")
    return json.loads(candidate[start:end + 1])


ATTEMPT_SECONDS = 45


async def _stream_reply(provider: LLMProvider, prompt: str, model_id: str, effort: str | None) -> str:
    reply = ""
    async for chunk in provider.stream_text([ChatTurn(role="user", content=prompt)], model_id, effort):
        reply += chunk
    return reply


async def _ask(provider: LLMProvider, prompt: str, model_id: str, effort: str | None) -> Any:
    """Up to 3 attempts: Gemini intermittently fails calls (or stalls without answering) that succeed when repeated."""
    last: Exception | None = None

    for attempt in range(3):
        try:
            return _extract_json(await asyncio.wait_for(_stream_reply(provider, prompt, model_id, effort), ATTEMPT_SECONDS))
        except asyncio.TimeoutError:
            last = ProviderError("provider_timeout", "The AI took too long to answer.")
            logger.warning("Dashboard AI attempt %d timed out after %ds", attempt + 1, ATTEMPT_SECONDS)
        except (ProviderError, ValueError) as exc:
            last = exc
            logger.warning("Dashboard AI attempt failed: %s (%s)", exc, repr(exc.__cause__)[:300] if exc.__cause__ else "no cause")
            if exc.__cause__ is not None and attempt < 2:
                await asyncio.sleep(2 * (attempt + 1))  # Gemini "high demand" spikes are short; waiting beats three instant retries.
    assert last is not None
    raise last


async def generate(provider: LLMProvider, prompt: str, datasets: list[dict[str, Any]], model_id: str, effort: str | None, context: str = "") -> dict[str, Any]:
    request = (
        "You design BI dashboards (like Power BI). Reply with ONLY a JSON object: "
        '{"name": str, "description": str, "widgets": [widget, ...], "slicers": [column, ...], "suggestions": [str, ...]}. '
        f"Build 5 to 9 widgets: KPIs first, then charts that answer the request, then a table if useful. {SPEC} "
        "slicers: 2 to 3 category columns people would filter by. "
        "suggestions: 3 short follow-up requests the user could ask next to improve this dashboard.\n\n"
        f"Datasets:\n{_schema_text(datasets)}\n{_context(context)}\nUser request: {prompt}"
    )
    try:
        data = await _ask(provider, request, model_id, effort)
    except (ProviderError, ValueError) as exc:
        return {"ok": False, "error": f"The AI could not build a dashboard: {exc}", "widgets": [], "notes": []}
    widgets, notes = sanitize_widgets(data.get("widgets"), datasets)
    if not widgets:
        return {"ok": False, "error": "The AI did not produce any drawable widgets. Try rephrasing the request.", "widgets": [], "notes": notes}
    return {"ok": True, "name": str(data.get("name") or "")[:80], "description": str(data.get("description") or "")[:300], "widgets": widgets, "notes": notes,
            "slicers": clean_slicers(data.get("slicers"), datasets, widgets), "suggestions": clean_suggestions(data.get("suggestions"))}


async def tune(
    provider: LLMProvider, instruction: str, widgets: list[dict[str, Any]], slicers: list[str], name: str,
    datasets: list[dict[str, Any]], model_id: str, effort: str | None, context: str = "",
) -> dict[str, Any]:
    """Apply a plain-language change to an existing dashboard. Everything returned is repaired against the real columns."""
    current, _ = sanitize_widgets(widgets, datasets)
    request = (
        "You edit an existing BI dashboard exactly as the user asks. The user may ask for anything: add, remove or replace charts, "
        "change chart types, aggregations, titles, widths (span 1 to 3 of a 3-column grid) or order, add or remove filters (slicers), "
        "rename the dashboard. Change only what was asked and keep every other widget and its id unchanged. "
        'Reply with ONLY a JSON object: {"name": str, "widgets": [widget, ...], "slicers": [column, ...], '
        '"notes": [short strings describing each change you made], "suggestions": [3 short follow-up requests]}. '
        f"{SPEC}\n\nDatasets:\n{_schema_text(datasets)}\n\nDashboard name: {name}\n"
        f"Current widgets:\n{json.dumps(current)}\nCurrent slicers: {json.dumps(slicers)}\n{_context(context)}\nUser request: {instruction}"
    )
    try:
        data = await _ask(provider, request, model_id, effort)
    except (ProviderError, ValueError) as exc:
        return {"ok": False, "error": f"The AI could not change the dashboard: {exc}", "widgets": [], "notes": []}
    changed, repairs = sanitize_widgets(data.get("widgets"), datasets)
    if not changed:
        return {"ok": False, "error": "The AI did not return any drawable widgets. Try rephrasing the request.", "widgets": [], "notes": repairs}
    ai_notes = [str(note)[:200] for note in data["notes"] if isinstance(note, str)][:8] if isinstance(data.get("notes"), list) else []
    slicer_raw = data["slicers"] if isinstance(data.get("slicers"), list) else slicers
    return {
        "ok": True, "name": str(data.get("name") or name)[:80], "widgets": changed, "notes": ai_notes + repairs,
        "slicers": clean_slicers(slicer_raw, datasets, changed), "suggestions": clean_suggestions(data.get("suggestions")),
    }


async def review(provider: LLMProvider, widgets: list[dict[str, Any]], datasets: list[dict[str, Any]], model_id: str, effort: str | None) -> dict[str, Any]:
    """Deterministic repair first (always runs), then an AI pass for chart choice, titles and layout."""
    repaired, notes = sanitize_widgets(widgets, datasets)
    request = (
        "You review BI dashboards. Fix wrong chart types for the data, misleading or vague titles, duplicate widgets, "
        "and poor layout (KPIs span 1, charts span 2, tables span 3). Keep widget ids. "
        'Reply with ONLY a JSON object: {"widgets": [widget, ...], "notes": [short strings describing each change]}. '
        f"{SPEC}\n\nDatasets:\n{_schema_text(datasets)}\n\nCurrent widgets:\n{json.dumps(repaired)}"
    )
    try:
        data = await _ask(provider, request, model_id, effort)
    except (ProviderError, ValueError):
        notes.append("The AI review was unavailable; only automatic fixes were applied.")
        return {"ok": True, "ai": False, "widgets": repaired, "notes": notes}
    improved, more = sanitize_widgets(data.get("widgets"), datasets)
    ai_notes = [str(note)[:200] for note in data.get("notes", []) if isinstance(note, str)][:8] if isinstance(data.get("notes"), list) else []
    if not improved:
        notes.append("The AI review returned nothing usable; kept the automatic fixes.")
        return {"ok": True, "ai": False, "widgets": repaired, "notes": notes}
    return {"ok": True, "ai": True, "widgets": improved, "notes": notes + ai_notes + more}


SCRIPT_CONTRACT = (
    "Write a short Python 3 script. Variables already defined: `datasets` (list of {id, name, columns: [names], rows: [[cells as strings]]}), "
    "`data` (the same, keyed by id), `num(value)` (string to float or None), `col(dataset, column_name)` (list of that column's cells). "
    "Only these imports work: math, statistics, collections, datetime, itertools, re, json, functools, heapq, bisect, decimal, fractions, string, random. "
    "No files, network, eval or dunder attributes. Compute what is asked, then set `result` to one dict: "
    '{"kind": bar|hbar|line|area|pie|radar|funnel|treemap|histogram, "title": str, "labels": [str], "series": [number]} for categories, '
    '{"kind": "scatter", "points": [[x, y], ...]}, {"kind": "table", "columns": [str], "rows": [[...]]}, '
    '{"kind": "kpi", "value": number, "label": str} or {"kind": "gauge", "value": number, "max": number}. '
    "Keep at most 30 labels. Skip rows whose numbers are None. Reply with ONLY the code in a ```python block."
)


def _script_from(reply: str) -> str:
    fenced = re.search(r"```(?:python)?\s*(.*?)```", reply, re.S)
    return (fenced.group(1) if fenced else reply).strip()


async def write_script(provider: LLMProvider, request_text: str, title: str, loaded: list[dict[str, Any]], model_id: str, effort: str | None) -> tuple[str, dict[str, Any]]:
    """Ask for a script, run it on the real rows, and feed any error back, up to three tries. Returns (script, result)."""
    schema = _schema_text([{"id": d["id"], "name": d["name"], "columns": [{"name": c} for c in d["columns"]], "rows": d["rows"][:4], "row_count": len(d["rows"])} for d in loaded])
    problem = ""
    last = "The AI did not return a script."
    for attempt in range(3):
        prompt = f"{SCRIPT_CONTRACT}\n\nDatasets:\n{schema}\n\nChart title: {title}\nWhat to compute: {request_text}"
        if problem:
            prompt += f"\n\nYour previous script failed: {problem}\nFix it and send the whole script again."
        try:
            reply = await asyncio.wait_for(_stream_reply(provider, prompt, model_id, effort), ATTEMPT_SECONDS)
        except asyncio.TimeoutError:
            last = "The AI took too long to answer."
            continue
        except ProviderError as exc:
            last = f"The AI was unavailable: {exc}"
            logger.warning("Dashboard script attempt failed: %s (%s)", exc, repr(exc.__cause__)[:300] if exc.__cause__ else "no cause")
            if exc.__cause__ is not None and attempt < 2:
                await asyncio.sleep(2 * (attempt + 1))
            continue
        script = _script_from(reply)[:MAX_SCRIPT + 1]
        try:
            return script, run_script(script, loaded)
        except ScriptError as exc:
            problem = last = str(exc)
    raise ScriptError(last)


async def fill_custom(provider: LLMProvider, widgets: list[dict[str, Any]], load, model_id: str, effort: str | None, notes: list[str]) -> list[dict[str, Any]]:
    """Give every custom widget that has no working script one, written for its request. `load(dataset_id)` returns full rows or None."""
    result: list[dict[str, Any]] = []
    for widget in widgets:
        if widget.get("type") != "custom" or widget.get("script"):
            result.append(widget)
            continue
        loaded = [item for item in (load(dataset_id) for dataset_id in widget.get("datasets") or [widget["dataset_id"]]) if item]
        if not loaded:
            notes.append(f"Removed “{widget['title']}”: its data could not be read.")
            continue
        try:
            script, _ = await write_script(provider, widget.get("request") or widget["title"], widget["title"], loaded, model_id, effort)
        except ScriptError as exc:
            notes.append(f"Could not build “{widget['title']}” with a script: {exc}")
            continue
        notes.append(f"“{widget['title']}” is not a preset chart, so the AI wrote a small Python script for it.")
        result.append({**widget, "script": script})
    return result
