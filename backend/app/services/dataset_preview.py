"""Small, bounded dataset inspection helpers for browser previews."""
from __future__ import annotations

import csv
import io
from pathlib import Path
from typing import Any


MAX_PREVIEW_ROWS = 100
MAX_CELL_CHARS = 2_000


def inspect_dataset(name: str, content: bytes) -> dict[str, Any]:
    """Return only safe CSV metadata/sample rows; other table formats remain downloadable."""
    if Path(name).suffix.lower() != ".csv":
        return {"row_count": None, "column_count": None, "columns": [], "preview_rows": []}

    try:
        reader = csv.reader(io.StringIO(content.decode("utf-8-sig", errors="replace")))
        header = next(reader, [])
    except (csv.Error, UnicodeError):
        return {"row_count": None, "column_count": None, "columns": [], "preview_rows": []}

    columns = [str(column).strip() or f"column_{index + 1}" for index, column in enumerate(header)]
    rows: list[list[str]] = []
    row_count = 0
    try:
        for row in reader:
            row_count += 1
            if len(rows) < MAX_PREVIEW_ROWS:
                rows.append([(cell[:MAX_CELL_CHARS] + "…") if len(cell) > MAX_CELL_CHARS else cell for cell in row[:len(columns)]])
    except csv.Error:
        return {"row_count": None, "column_count": len(columns), "columns": [{"name": name, "data_type": "string"} for name in columns], "preview_rows": rows}

    return {
        "row_count": row_count,
        "column_count": len(columns),
        "columns": [{"name": name, "data_type": "string"} for name in columns],
        "preview_rows": rows,
    }
