"""Small, bounded dataset inspection helpers for browser previews."""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any


MAX_PREVIEW_ROWS = 100
MAX_CELL_CHARS = 2_000


def _xlsx_rows(content: bytes):
    """Yield rows of the first sheet as lists of strings. Raises ValueError when the file cannot be read."""
    try:
        from openpyxl import load_workbook

        book = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
        sheet = book.worksheets[0]
        for row in sheet.iter_rows(values_only=True):
            yield ["" if cell is None else str(cell) for cell in row]
    except Exception as exc:  # openpyxl raises many types for malformed files
        raise ValueError("Unreadable spreadsheet") from exc


def _row_source(name: str, content: bytes):
    suffix = Path(name).suffix.lower()
    if suffix == ".csv":
        return csv.reader(io.StringIO(content.decode("utf-8-sig", errors="replace")))
    if suffix == ".xlsx":
        return _xlsx_rows(content)
    return None


def inspect_dataset(name: str, content: bytes) -> dict[str, Any]:
    """Return only safe CSV/XLSX metadata and sample rows; other table formats remain downloadable."""
    reader = _row_source(name, content)
    if reader is None:
        return {"row_count": None, "column_count": None, "columns": [], "preview_rows": []}

    try:
        header = next(reader, [])
    except (csv.Error, UnicodeError, ValueError):
        return {"row_count": None, "column_count": None, "columns": [], "preview_rows": []}

    columns = [str(column).strip() or f"column_{index + 1}" for index, column in enumerate(header)]
    rows: list[list[str]] = []
    row_count = 0
    try:
        for row in reader:
            row_count += 1
            if len(rows) < MAX_PREVIEW_ROWS:
                rows.append([(cell[:MAX_CELL_CHARS] + "…") if len(cell) > MAX_CELL_CHARS else cell for cell in row[:len(columns)]])
    except (csv.Error, ValueError):
        return {"row_count": None, "column_count": len(columns), "columns": [{"name": name, "data_type": "string"} for name in columns], "preview_rows": rows}

    return {
        "row_count": row_count,
        "column_count": len(columns),
        "columns": [{"name": name, "data_type": "string"} for name in columns],
        "preview_rows": rows,
    }


MAX_DASHBOARD_ROWS = 6_000


def read_csv_rows(name: str, content: bytes, limit: int = MAX_DASHBOARD_ROWS) -> dict[str, Any] | None:
    """Rows for dashboard charts, bounded to `limit`. CSV and XLSX; returns None for other formats."""
    reader = _row_source(name, content)
    if reader is None:
        return None
    try:
        header = next(reader, [])
        columns = [str(column).strip() or f"column_{index + 1}" for index, column in enumerate(header)]
        rows: list[list[str]] = []
        total = 0
        for row in reader:
            total += 1
            if len(rows) < limit:
                rows.append([(cell[:MAX_CELL_CHARS] + "…") if len(cell) > MAX_CELL_CHARS else cell for cell in row[:len(columns)]])
    except (csv.Error, UnicodeError, ValueError):
        return None
    return {"columns": [{"name": column, "data_type": "string"} for column in columns], "rows": rows, "total_rows": total, "truncated": total > len(rows)}
