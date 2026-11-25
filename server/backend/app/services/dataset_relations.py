"""How several datasets in one dashboard relate, and where they disagree about the same quantity.

Two files can describe the same thing (revenue per order, headcount per department) and give different numbers. Nothing here
silently picks one: this finds the overlap, measures the disagreement, and reports it so the user can decide, and the AI is told
that decision.
"""
from __future__ import annotations

from itertools import combinations
from typing import Any

MAX_EXAMPLES = 3
CATEGORY_LIMIT = 40


def _num(value: Any) -> float | None:
    try:
        number = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def _values(dataset: dict[str, Any], name: str) -> list[Any]:
    index = dataset["columns"].index(name)
    return [row[index] if index < len(row) else None for row in dataset["rows"]]


def _is_numeric(dataset: dict[str, Any], name: str) -> bool:
    cells = [cell for cell in _values(dataset, name) if cell not in (None, "")]
    return bool(cells) and all(_num(cell) is not None for cell in cells)


def _unique_ratio(dataset: dict[str, Any], name: str) -> float:
    cells = [str(cell) for cell in _values(dataset, name) if cell not in (None, "")]
    return len(set(cells)) / len(cells) if cells else 0.0


def _shared(a: dict[str, Any], b: dict[str, Any]) -> list[tuple[str, str]]:
    by_name = {column.lower().strip(): column for column in b["columns"]}
    return [(column, by_name[column.lower().strip()]) for column in a["columns"] if column.lower().strip() in by_name]


def _differs(left: float, right: float) -> bool:
    return abs(left - right) > max(abs(left), abs(right)) * 0.005 + 1e-9


def compare_pair(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    shared = _shared(a, b)
    report: dict[str, Any] = {"a": a["name"], "b": b["name"], "shared_columns": [left for left, _ in shared], "key": None, "matched_rows": 0, "conflicts": [], "summary": ""}
    if not shared:
        report["summary"] = f"{a['name']} and {b['name']} share no column names, so they cannot be combined or compared automatically. Charts will use one file each."
        return report
    # A key column is shared and nearly unique in both files (an id, an email, an order number).
    keys = [(left, right) for left, right in shared if _unique_ratio(a, left) >= 0.95 and _unique_ratio(b, right) >= 0.95 and not _is_numeric(a, left) or (left.lower().endswith("id") and _unique_ratio(a, left) >= 0.95 and _unique_ratio(b, right) >= 0.95)]
    measures = [(left, right) for left, right in shared if _is_numeric(a, left) and _is_numeric(b, right) and (left, right) not in keys]
    if keys:
        key_a, key_b = keys[0]
        report["key"] = key_a
        index_b = {str(cell): row for cell, row in zip(_values(b, key_b), b["rows"]) if cell not in (None, "")}
        pairs = [(str(cell), row_a, index_b[str(cell)]) for cell, row_a in zip(_values(a, key_a), a["rows"]) if str(cell) in index_b]
        report["matched_rows"] = len(pairs)
        for left, right in measures:
            ia, ib = a["columns"].index(left), b["columns"].index(right)
            differing, examples, compared = 0, [], 0
            for key, row_a, row_b in pairs:
                va, vb = _num(row_a[ia]) if ia < len(row_a) else None, _num(row_b[ib]) if ib < len(row_b) else None
                if va is None or vb is None:
                    continue
                compared += 1
                if _differs(va, vb):
                    differing += 1
                    if len(examples) < MAX_EXAMPLES:
                        examples.append({"key": key, "a": va, "b": vb})
            if differing:
                report["conflicts"].append({"column": left, "by": key_a, "differing": differing, "of": compared, "examples": examples})
    else:
        categories = [(left, right) for left, right in shared if not _is_numeric(a, left) and len(set(_values(a, left))) <= CATEGORY_LIMIT and len(set(_values(b, right))) <= CATEGORY_LIMIT]
        if categories and measures:
            cat_a, cat_b = categories[0]
            for left, right in measures:
                totals_a: dict[str, float] = {}
                totals_b: dict[str, float] = {}
                for source, name, cat, totals in ((a, left, cat_a, totals_a), (b, right, cat_b, totals_b)):
                    ic, im = source["columns"].index(cat), source["columns"].index(name)
                    for row in source["rows"]:
                        value = _num(row[im]) if im < len(row) else None
                        if value is not None and ic < len(row):
                            totals[str(row[ic])] = totals.get(str(row[ic]), 0.0) + value
                common = totals_a.keys() & totals_b.keys()
                differing = [{"key": key, "a": round(totals_a[key], 2), "b": round(totals_b[key], 2)} for key in sorted(common) if _differs(totals_a[key], totals_b[key])]
                if differing:
                    report["conflicts"].append({"column": left, "by": cat_a, "differing": len(differing), "of": len(common), "examples": differing[:MAX_EXAMPLES], "totals": True})
    if report["conflicts"]:
        worst = report["conflicts"][0]
        how = f"for the same {report['key']}" if report["key"] else f"in the total per {worst['by']}"
        report["summary"] = f"{a['name']} and {b['name']} give different values for {', '.join(c['column'] for c in report['conflicts'])} {how} ({worst['differing']} of {worst['of']} differ for {worst['column']})."
    elif report["key"]:
        report["summary"] = f"{a['name']} and {b['name']} match on {report['key']} ({report['matched_rows']} rows) and agree on every shared number."
    else:
        report["summary"] = f"{a['name']} and {b['name']} share the columns {', '.join(report['shared_columns'][:6])} but have no unique key; the shared numbers agree in total."
    return report


def analyze(datasets: list[dict[str, Any]]) -> dict[str, Any]:
    """`datasets`: [{"id", "name", "columns": [names], "rows": [[...]]}]."""
    pairs = [compare_pair(a, b) for a, b in combinations(datasets, 2)]
    return {"datasets": [{"id": d["id"], "name": d["name"], "rows": len(d["rows"])} for d in datasets], "pairs": pairs, "conflict": any(p["conflicts"] for p in pairs)}
