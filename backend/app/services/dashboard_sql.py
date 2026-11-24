"""Read-only SQL over the datasets a dashboard uses.

Each dataset becomes one table in a throw-away in-memory SQLite database (named after the file, e.g. `orders.csv` -> `orders`),
columns keep their original names, and columns whose values are all numbers are stored as numbers so SUM/AVG/ORDER BY behave.
Only SELECT can run: an authorizer refuses everything else, a progress handler stops long queries and rows are capped.
Nothing here touches the application database.
"""
from __future__ import annotations

import re
from datetime import datetime
import sqlite3
import time
from typing import Any

MAX_SQL = 4000
MAX_ROWS = 500
TIMEOUT_SECONDS = 4.0
_ALLOWED_ACTIONS = {sqlite3.SQLITE_SELECT, sqlite3.SQLITE_READ, sqlite3.SQLITE_FUNCTION, sqlite3.SQLITE_RECURSIVE}


class SqlError(Exception):
    """The query was refused or failed; the message is safe to show to the user."""


def table_names(datasets: list[dict[str, Any]]) -> dict[str, str]:
    """Dataset id -> table name, unique and SQL-friendly."""
    used: set[str] = set()
    names: dict[str, str] = {}
    for dataset in datasets:
        stem = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", str(dataset.get("name", "")))
        base = re.sub(r"[^0-9A-Za-z_]+", "_", stem).strip("_").lower() or "dataset"
        if base[0].isdigit():
            base = f"t_{base}"
        name, count = base, 2
        while name in used:
            name, count = f"{base}_{count}", count + 1
        used.add(name)
        names[str(dataset["id"])] = name
    return names


def describe(datasets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    names = table_names(datasets)
    return [{"dataset_id": str(item["id"]), "dataset": item.get("name", ""), "table": names[str(item["id"])], "columns": [str(column) for column in item["columns"]]} for item in datasets]


def _number(value: Any) -> float | None:
    try:
        number = float(str(value).replace(",", "").strip())
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


_DATE_FORMATS = ("%Y-%m-%d", "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y/%m/%d", "%m/%d/%Y", "%d/%m/%Y", "%d-%m-%Y", "%m-%d-%Y", "%b %d %Y", "%d %b %Y", "%b %d, %Y")


def _as_dates(values: list[Any]) -> list[str | None] | None:
    """The column as ISO dates when every filled value is a date in one format (so SQLite and DAX date functions work)."""
    filled = [str(value).strip() for value in values if value not in (None, "")]
    if not filled or not any(mark in filled[0] for mark in "-/ "):
        return None
    for fmt in _DATE_FORMATS:
        try:
            parsed = [datetime.strptime(value, fmt) for value in filled]
        except ValueError:
            continue
        timed = "%H" in fmt
        out = iter(item.strftime("%Y-%m-%d %H:%M:%S" if timed else "%Y-%m-%d") for item in parsed)
        return [None if value in (None, "") else next(out) for value in values]
    return None


def _load(connection: sqlite3.Connection, datasets: list[dict[str, Any]]) -> None:
    names = table_names(datasets)
    for dataset in datasets:
        columns = [str(column) for column in dataset["columns"]]
        rows = [list(row)[: len(columns)] + [None] * (len(columns) - len(row)) for row in dataset["rows"]]
        numeric = [bool(rows) and all(row[index] in (None, "") or _number(row[index]) is not None for row in rows) and any(row[index] not in (None, "") for row in rows) for index in range(len(columns))]
        table = names[str(dataset["id"])]
        connection.execute(f"CREATE TABLE {_quote(table)} ({', '.join(_quote(column) + (' REAL' if numeric[index] else ' TEXT') for index, column in enumerate(columns))})")
        prepared = [[(None if cell in (None, "") else _number(cell) if numeric[index] else str(cell)) for index, cell in enumerate(row)] for row in rows]
        for index in range(len(columns)):
            dates = None if numeric[index] else _as_dates([row[index] for row in rows])
            if dates:
                for row, value in zip(prepared, dates):
                    row[index] = value
        connection.executemany(f"INSERT INTO {_quote(table)} VALUES ({', '.join('?' for _ in columns)})", prepared)


def run_sql(sql: str, datasets: list[dict[str, Any]], limit: int = MAX_ROWS, max_sql: int = MAX_SQL) -> dict[str, Any]:
    statement = sql.strip().rstrip(";").strip()
    if not statement:
        raise SqlError("The query is empty.")
    if len(statement) > max_sql:
        raise SqlError(f"The query is longer than {max_sql} characters.")
    if not re.match(r"(?is)^(select|with)\b", statement):
        raise SqlError("Only SELECT queries are allowed.")
    connection = sqlite3.connect(":memory:")
    try:
        _load(connection, datasets)
        connection.set_authorizer(lambda action, *_: sqlite3.SQLITE_OK if action in _ALLOWED_ACTIONS else sqlite3.SQLITE_DENY)
        deadline = time.monotonic() + TIMEOUT_SECONDS
        connection.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 10_000)
        try:
            cursor = connection.execute(statement)
            fetched = cursor.fetchmany(limit + 1)
        except sqlite3.Error as exc:
            message = str(exc)
            if "interrupted" in message:
                message = "The query took too long."
            elif "not authorized" in message:
                message = "Only SELECT queries are allowed."
            raise SqlError(message) from exc
        columns = [column[0] for column in cursor.description or []]
        rows = [[round(cell, 4) if isinstance(cell, float) else cell for cell in row] for row in fetched[:limit]]
        return {"columns": columns, "rows": rows, "truncated": len(fetched) > limit, "tables": describe(datasets)}
    finally:
        connection.close()
