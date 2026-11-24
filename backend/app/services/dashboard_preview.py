from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import FileObject, Resource
from .dashboard_script import ScriptError, run_script
from .dataset_preview import read_csv_rows

log = logging.getLogger(__name__)

MAX_POINTS = 12


def _number(value: Any) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _reduce(values: list[float], agg: str) -> float:
    if agg == "count":
        return float(len(values))
    total = sum(values)
    return total / len(values) if agg == "avg" and values else total


def _compact(value: float) -> str:
    for limit, suffix in ((1e9, "B"), (1e6, "M")):
        if abs(value) >= limit:
            return f"{value / limit:.1f}".rstrip("0").rstrip(".") + suffix
    return f"{value:,.0f}" if abs(value) >= 1000 else f"{round(value, 2):g}"


def _index(columns: list[str], name: Any) -> int:
    return columns.index(name) if isinstance(name, str) and name in columns else -1


GROUPED = ("bar", "hbar", "line", "area", "pie", "radar", "funnel", "treemap")
ORDERED = ("line", "area")  # keep the row order; every other grouped chart ranks largest first
LIMITS = {"pie": 6, "radar": 8, "funnel": 6, "treemap": 10}
TILES = 6
BINS = 10


def _numbers(rows: list[list[Any]], index: int) -> list[float]:
    return [n for row in rows if index < len(row) and (n := _number(row[index])) is not None]


def _grouped(widget: dict[str, Any], columns: list[str], rows: list[list[Any]]) -> tuple[list[str], list[float]]:
    x, y, agg = _index(columns, widget.get("x")), _index(columns, widget.get("y")), widget.get("agg", "sum")
    if x < 0:
        return [], []
    groups: dict[str, list[float]] = {}
    for row in rows:
        if x >= len(row):
            continue
        if agg == "count" or y < 0:
            groups.setdefault(str(row[x]), []).append(1.0)
        elif y < len(row) and (n := _number(row[y])) is not None:
            groups.setdefault(str(row[x]), []).append(n)
    points = [(name, _reduce(values, agg)) for name, values in groups.items()]
    if widget["type"] not in ORDERED:
        points.sort(key=lambda item: -item[1])
    points = points[: LIMITS.get(widget["type"], MAX_POINTS)]
    return [name[:24] for name, _ in points], [round(value, 2) for _, value in points]


def _tile(widget: dict[str, Any], source: dict[str, Any]) -> dict[str, Any] | None:
    columns, rows, kind = source["columns"], source["rows"], widget.get("type")
    y, agg = _index(columns, widget.get("y")), widget.get("agg", "sum")
    tile: dict[str, Any] = {"type": kind, "title": str(widget.get("title", ""))[:48], "span": widget.get("span") if widget.get("span") in (1, 2, 3) else 1}
    if kind == "kpi":
        value = float(source.get("total_rows") or len(rows)) if agg == "count" or y < 0 else _reduce(_numbers(rows, y), agg)
        return {**tile, "value": _compact(value)}
    if kind == "gauge":
        values = _numbers(rows, y)
        if not values:
            return None
        value, top = _reduce(values, "avg"), max(values)
        return {**tile, "value": _compact(value), "max": _compact(top), "ratio": round(min(max(value / top, 0), 1), 3) if top > 0 else 0}
    if kind in GROUPED:
        labels, series = _grouped(widget, columns, rows)
        return {**tile, "labels": labels, "series": series} if len(series) >= 2 else None
    if kind == "histogram":
        values = _numbers(rows, _index(columns, widget.get("x")))
        if len(values) < 2 or min(values) == max(values):
            return None
        low, high = min(values), max(values)
        width = (high - low) / BINS
        counts = [0] * BINS
        for value in values:
            counts[min(int((value - low) / width), BINS - 1)] += 1
        return {**tile, "series": [float(count) for count in counts], "labels": [f"{_compact(low + i * width)}–{_compact(low + (i + 1) * width)}" for i in range(BINS)]}
    if kind == "scatter":
        x, y = _index(columns, widget.get("x")), _index(columns, widget.get("y"))
        pairs = [(a, b) for row in rows if x < len(row) and y < len(row) and (a := _number(row[x])) is not None and (b := _number(row[y])) is not None]
        step = max(len(pairs) // 80, 1)
        return {**tile, "points": [[round(a, 2), round(b, 2)] for a, b in pairs[::step]]} if len(pairs) >= 2 else None
    if kind == "table":
        return {**tile, "columns": columns[:4], "rows": [[str(cell)[:14] for cell in row[:4]] for row in rows[:3]]}
    return None


def _custom_tile(widget: dict[str, Any], data: dict[str, dict[str, Any]], tile: dict[str, Any]) -> dict[str, Any] | None:
    ids = [i for i in (widget.get("datasets") or [widget.get("dataset_id")]) if i in data]
    if not ids or not widget.get("script"):
        return None
    try:
        out = run_script(widget["script"], [{"id": i, "name": data[i].get("name", i), "columns": data[i]["columns"], "rows": data[i]["rows"]} for i in ids])
    except ScriptError:
        log.warning("Custom chart script failed while building a preview")
        return None
    kind = out["kind"]
    tile = {**tile, "type": kind, "title": tile["title"] or out.get("title", "")}
    if kind in ("kpi", "gauge"):
        top = out.get("max") or 0
        return {**tile, "value": _compact(out["value"]), **({"max": _compact(top), "ratio": round(min(max(out["value"] / top, 0), 1), 3) if top > 0 else 0} if kind == "gauge" else {})}
    if kind == "scatter":
        return {**tile, "points": out["points"][:80]}
    if kind == "table":
        return {**tile, "columns": out["columns"][:4], "rows": [row[:4] for row in out["rows"][:3]]}
    return {**tile, "labels": out["labels"][:10], "series": out["series"][:10]}


def build_preview(widgets: list[dict[str, Any]], data: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """The listing card: the dashboard's first widgets as small tiles, in the same order, types and widths as the dashboard itself.

    `data` maps dataset id to {"columns": [names], "rows": [[...]], "total_rows": n}.
    """
    tiles = []
    for widget in widgets:
        source = data.get(widget.get("dataset_id", ""))
        if widget.get("type") == "custom":
            tile = _custom_tile(widget, data, {"title": str(widget.get("title", ""))[:48], "span": widget.get("span") if widget.get("span") in (1, 2, 3) else 2})
        else:
            tile = _tile(widget, source) if source is not None else None
        if tile is not None:
            tiles.append(tile)
        if len(tiles) == TILES:
            break
    return {"tiles": tiles, "total": len(widgets)}


def compute_preview(db: Session, storage: Any, widgets: list[dict[str, Any]]) -> dict[str, Any]:
    """Reads the datasets the widgets use (the dashboard grants that access) and summarises them for the listing card."""
    data: dict[str, dict[str, Any]] = {}
    wanted = {widget.get("dataset_id") for widget in widgets} | {i for widget in widgets for i in (widget.get("datasets") or [])}
    for dataset_id in {i for i in wanted if isinstance(i, str)}:
        row = db.execute(select(Resource, FileObject).join(FileObject, FileObject.id == Resource.file_object_id).where(Resource.id == dataset_id)).one_or_none()
        if row is None:
            continue
        try:
            rows = read_csv_rows(row[0].name, storage.read_bytes(row[1].relative_storage_path))
        except OSError:
            log.warning("Could not read dataset %s for a dashboard preview", dataset_id)
            continue
        if rows is not None:
            data[dataset_id] = {"name": row[0].name, "columns": [column["name"] for column in rows["columns"]], "rows": rows["rows"], "total_rows": rows["total_rows"]}
    return build_preview(widgets, data)
