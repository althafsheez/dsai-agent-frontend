"""CSV and XLSX previews feed the dataset cards and the dashboard charts."""
from __future__ import annotations

import io

from openpyxl import Workbook

from app.services.dataset_preview import inspect_dataset, read_csv_rows


def _xlsx(rows: list[list]) -> bytes:
    book = Workbook()
    sheet = book.active
    for row in rows:
        sheet.append(row)
    buffer = io.BytesIO()
    book.save(buffer)
    return buffer.getvalue()


def test_xlsx_preview_has_columns_rows_and_count() -> None:
    content = _xlsx([["region", "units"], ["North", 4], ["South", None], ["East", 7]])
    info = inspect_dataset("sales.xlsx", content)
    assert [column["name"] for column in info["columns"]] == ["region", "units"]
    assert info["row_count"] == 3
    assert info["preview_rows"][0] == ["North", "4"]
    assert info["preview_rows"][1] == ["South", ""]


def test_xlsx_rows_for_dashboards_are_bounded() -> None:
    content = _xlsx([["id"], *[[index] for index in range(50)]])
    data = read_csv_rows("big.xlsx", content, limit=10)
    assert data is not None
    assert len(data["rows"]) == 10 and data["total_rows"] == 50 and data["truncated"] is True


def test_unreadable_xlsx_does_not_crash() -> None:
    info = inspect_dataset("broken.xlsx", b"not a spreadsheet")
    assert info["columns"] == [] and info["row_count"] is None
    assert read_csv_rows("broken.xlsx", b"not a spreadsheet") is None


def test_other_formats_are_not_previewed() -> None:
    assert inspect_dataset("data.parquet", b"x")["columns"] == []
    assert read_csv_rows("data.parquet", b"x") is None


def test_csv_still_works() -> None:
    info = inspect_dataset("a.csv", b"a,b\n1,2\n3,4\n")
    assert info["row_count"] == 2 and info["columns"][0]["name"] == "a"
