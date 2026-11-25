"""Read-only SQL over dashboard datasets."""
from __future__ import annotations

import pytest
from httpx import AsyncClient

from app.services.dashboard_sql import SqlError, describe, run_sql, table_names

DS = [
    {"id": "d1", "name": "Sales Data.csv", "columns": ["region", "rev"], "rows": [["N", "10"], ["S", "30"], ["N", "5"]]},
    {"id": "d2", "name": "2024 targets.xlsx", "columns": ["region", "target"], "rows": [["N", "20"], ["S", "25"]]},
]


def test_tables_are_named_after_the_files() -> None:
    assert table_names(DS) == {"d1": "sales_data", "d2": "t_2024_targets"}
    assert describe(DS)[0]["columns"] == ["region", "rev"]


def test_numbers_are_numeric_so_aggregates_work() -> None:
    result = run_sql('SELECT region, SUM(rev) AS total FROM sales_data GROUP BY region ORDER BY total DESC', DS)
    assert result["columns"] == ["region", "total"]
    assert result["rows"] == [["S", 30.0], ["N", 15.0]]


def test_datasets_can_be_joined() -> None:
    result = run_sql("SELECT s.region, SUM(s.rev) - t.target FROM sales_data s JOIN t_2024_targets t ON t.region = s.region GROUP BY s.region ORDER BY 1", DS)
    assert result["rows"] == [["N", -5.0], ["S", 5.0]]


def test_rows_are_capped() -> None:
    result = run_sql("SELECT * FROM sales_data", DS, limit=2)
    assert len(result["rows"]) == 2 and result["truncated"] is True


@pytest.mark.parametrize("sql", [
    "", "DROP TABLE sales_data", "DELETE FROM sales_data", "INSERT INTO sales_data VALUES ('x', 1)", "UPDATE sales_data SET rev = 1",
    "ATTACH DATABASE '/tmp/x.db' AS x", "PRAGMA table_info(sales_data)", "SELECT 1; DROP TABLE sales_data", "WITH x AS (SELECT 1) DELETE FROM sales_data",
    "SELECT * FROM missing_table", "SELECT load_extension('x')",
])
def test_anything_but_a_select_is_refused(sql: str) -> None:
    with pytest.raises(SqlError):
        run_sql(sql, DS)


def test_runaway_query_is_stopped(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.dashboard_sql.TIMEOUT_SECONDS", 0.2)
    with pytest.raises(SqlError, match="too long"):
        run_sql("WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c) SELECT COUNT(*) FROM c", DS)


OWNER = {"X-Demo-User-Id": "user-you"}


async def _upload(client: AsyncClient, content: bytes, name: str) -> str:
    response = await client.post("/api/resources/upload", headers=OWNER, files={"file": (name, content, "text/csv")}, data={"scope_type": "library", "scope_id": "x", "client_upload_id": f"up-{name}"})
    return response.json()["resource"]["id"]


async def test_sql_routes_list_tables_run_queries_and_respect_access(client: AsyncClient) -> None:
    dataset_id = await _upload(client, b"region,rev\nN,10\nS,30\nN,5\n", "orders.csv")
    tables = await client.post("/api/dashboards/sql/tables", headers=OWNER, json={"sql": "", "dataset_ids": [dataset_id]})
    assert tables.json()["tables"] == [{"dataset_id": dataset_id, "dataset": "orders.csv", "table": "orders", "columns": ["region", "rev"]}]

    ran = await client.post("/api/dashboards/sql/run", headers=OWNER, json={"sql": "SELECT region, SUM(rev) AS total FROM orders GROUP BY region ORDER BY region", "dataset_ids": [dataset_id]})
    assert ran.status_code == 200 and ran.json()["rows"] == [["N", 15.0], ["S", 30.0]]

    refused = await client.post("/api/dashboards/sql/run", headers=OWNER, json={"sql": "DROP TABLE orders", "dataset_ids": [dataset_id]})
    assert refused.status_code == 422 and refused.json()["error"]["code"] == "dashboard_sql_failed"

    other = await client.post("/api/dashboards/sql/run", headers={"X-Demo-User-Id": "user-shared"}, json={"sql": "SELECT 1", "dataset_ids": [dataset_id]})
    assert other.status_code == 404
