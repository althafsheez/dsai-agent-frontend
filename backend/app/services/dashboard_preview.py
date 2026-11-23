from __future__ import annotations

from typing import Any

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


def build_preview(widgets: list[dict[str, Any]], data: dict[str, dict[str, Any]]) -> dict[str, Any]:
    """What a dashboard card on the listing page shows: up to three KPIs and up to two small charts of different kinds.

    `data` maps dataset id to {"columns": [names], "rows": [[...]], "total_rows": n}.
    """
    kpis: list[dict[str, str]] = []
    charts: list[dict[str, Any]] = []
    for widget in widgets:
        source = data.get(widget.get("dataset_id", ""))
        if source is None:
            continue
        columns, rows = source["columns"], source["rows"]
        y, agg = _index(columns, widget.get("y")), widget.get("agg", "sum")
        title = str(widget.get("title", ""))
        if widget.get("type") == "kpi" and len(kpis) < 3:
            if agg == "count" or y < 0:
                value = float(source.get("total_rows") or len(rows))
            else:
                value = _reduce([n for row in rows if y < len(row) and (n := _number(row[y])) is not None], agg)
            kpis.append({"label": title[:40], "value": _compact(value)})
        elif widget.get("type") in ("bar", "line", "area", "pie") and len(charts) < 2:
            kind = "donut" if widget["type"] == "pie" else widget["type"]
            x = _index(columns, widget.get("x"))
            if x < 0 or any(chart["kind"] == kind for chart in charts):
                continue
            groups: dict[str, list[float]] = {}
            for row in rows:
                if x >= len(row):
                    continue
                if agg == "count" or y < 0:
                    groups.setdefault(str(row[x]), []).append(1.0)
                elif y < len(row) and (n := _number(row[y])) is not None:
                    groups.setdefault(str(row[x]), []).append(n)
            points = [(name, _reduce(values, agg)) for name, values in groups.items()]
            if kind in ("bar", "donut"):
                points.sort(key=lambda item: -item[1])
            points = points[: 5 if kind == "donut" else MAX_POINTS]
            if len(points) >= 2:
                charts.append({"kind": kind, "title": title[:40], "series": [round(value, 2) for _, value in points], "labels": [name[:24] for name, _ in points]})
    return {"kpis": kpis or [{"label": "Widgets", "value": str(len(widgets))}], "charts": charts}
