from __future__ import annotations

import json
import re
from typing import Any

from agentic.runtime.contracts import ChatTurn, LLMProvider, ProviderError

WIDGET_TYPES = {"kpi", "bar", "line", "area", "pie", "table"}
AGGREGATES = {"sum", "avg", "count"}
MAX_WIDGETS = 12

SPEC = (
    'Widget JSON: {"type":"kpi|bar|line|area|pie|table","title":str,"dataset_id":str,"x":column|null,'
    '"y":column|null,"agg":"sum|avg|count","span":1|2|3}. '
    "x is the category column (bar/line/area/pie); y is the numeric column to aggregate (omit for count); "
    "kpi and table need no x. Use only dataset ids and column names that appear in the schema."
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
        agg = str(item.get("agg", "sum")).lower()
        if agg not in AGGREGATES:
            agg = "sum"
        y = schema.column(dataset_id, item.get("y"))
        x = schema.column(dataset_id, item.get("x"))
        if wtype not in ("kpi", "table"):
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
            span = {"kpi": 1, "table": 3}.get(wtype, 2)
        widget_id = str(item.get("id") or "")
        if not widget_id or widget_id in used_ids:
            widget_id = f"w-ai-{index}-{len(cleaned)}"
        used_ids.add(widget_id)
        cleaned.append({"id": widget_id, "type": wtype, "title": label, "dataset_id": dataset_id, "x": x, "y": y, "agg": agg, "span": span})
    return cleaned, notes


def _schema_text(datasets: list[dict[str, Any]]) -> str:
    lines = []
    for dataset in datasets:
        columns = ", ".join(f"{column['name']} ({column.get('data_type', 'string')})" for column in dataset.get("columns", []))
        sample = json.dumps(dataset.get("rows", [])[:4])[:700]
        lines.append(f"- id={dataset['id']} name={dataset['name']} rows={dataset.get('row_count')}\n  columns: {columns}\n  sample rows: {sample}")
    return "\n".join(lines)


def _extract_json(text: str) -> Any:
    fenced = re.search(r"```(?:json)?\s*(.*?)```", text, re.S)
    candidate = fenced.group(1) if fenced else text
    start, end = candidate.find("{"), candidate.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("no JSON object in the reply")
    return json.loads(candidate[start:end + 1])


async def _ask(provider: LLMProvider, prompt: str, model_id: str, effort: str | None) -> Any:
    """Up to 3 attempts: Gemini intermittently fails calls that succeed when repeated."""
    last: Exception | None = None
    for _ in range(3):
        reply = ""
        try:
            async for chunk in provider.stream_text([ChatTurn(role="user", content=prompt)], model_id, effort):
                reply += chunk
            return _extract_json(reply)
        except (ProviderError, ValueError) as exc:
            last = exc
    assert last is not None
    raise last


async def generate(provider: LLMProvider, prompt: str, datasets: list[dict[str, Any]], model_id: str, effort: str | None) -> dict[str, Any]:
    request = (
        "You design BI dashboards (like Power BI). Reply with ONLY a JSON object: "
        '{"name": str, "description": str, "widgets": [widget, ...]}. '
        f"Build 5 to 9 widgets: KPIs first, then charts that answer the request, then a table if useful. {SPEC}\n\n"
        f"Datasets:\n{_schema_text(datasets)}\n\nUser request: {prompt}"
    )
    try:
        data = await _ask(provider, request, model_id, effort)
    except (ProviderError, ValueError) as exc:
        return {"ok": False, "error": f"The AI could not build a dashboard: {exc}", "widgets": [], "notes": []}
    widgets, notes = sanitize_widgets(data.get("widgets"), datasets)
    if not widgets:
        return {"ok": False, "error": "The AI did not produce any drawable widgets. Try rephrasing the request.", "widgets": [], "notes": notes}
    return {"ok": True, "name": str(data.get("name") or "")[:80], "description": str(data.get("description") or "")[:300], "widgets": widgets, "notes": notes}


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
