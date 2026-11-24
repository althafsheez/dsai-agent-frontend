import pytest

from app.services.dax import DaxError, compile_query, run_dax, split_definition

SALES = {
    "id": "d1",
    "name": "sales.csv",
    "columns": ["Region", "Product", "Amount", "Qty", "Customer"],
    "rows": [
        ["East", "A", "100", "1", "c1"],
        ["East", "B", "50", "2", "c2"],
        ["West", "A", "200", "1", "c1"],
        ["West", "B", "", "3", "c3"],
        ["North", "A", "30", "5", "c4"],
    ],
}
TARGETS = {"id": "d2", "name": "targets.csv", "columns": ["Region", "Target"], "rows": [["East", "120"], ["West", "250"]]}
DATA = [SALES]
MEASURES = {
    "Total Sales": "SUM(Sales[Amount])",
    "Orders": "COUNTROWS(Sales)",
    "Share": "DIVIDE([Total Sales], CALCULATE([Total Sales], ALL(Sales)))",
}


def value(expression: str, **kwargs):
    return run_dax(expression, DATA, MEASURES, **kwargs)["rows"][0][0]


def grouped(expression: str, column: str = "Region", **kwargs) -> dict:
    result = run_dax(expression, DATA, MEASURES, group_by=("d1", column), **kwargs)
    return {row[0]: row[1] for row in result["rows"]}


def test_basic_aggregations():
    assert value("SUM(Sales[Amount])") == 380
    assert value("AVERAGE(Sales[Amount])") == 95
    assert value("MIN(Sales[Amount]) + MAX(Sales[Amount])") == 230
    assert value("COUNTROWS(Sales)") == 5
    assert value("COUNT(Sales[Amount])") == 4
    assert value("DISTINCTCOUNT(Sales[Customer])") == 4
    assert value("COUNTBLANK(Sales[Amount])") == 1
    assert value("MEDIAN(Sales[Amount])") == 75


def test_measures_and_grouping():
    assert grouped("[Total Sales]") == {"West": 200, "East": 150, "North": 30}
    assert grouped("[Orders]") == {"East": 2, "West": 2, "North": 1}
    share = grouped("[Share]")
    assert round(share["East"], 4) == round(150 / 380, 4)


def test_calculate_replaces_and_removes_filters():
    assert value('CALCULATE([Total Sales], Sales[Region] = "East")') == 150
    # A filter on the grouped column replaces the group's own filter, like Power BI.
    assert grouped('CALCULATE([Total Sales], Sales[Region] = "East")') == {"East": 150, "West": 150, "North": 150}
    assert grouped('CALCULATE([Total Sales], Sales[Product] = "A")') == {"West": 200, "East": 100, "North": 30}
    assert grouped("CALCULATE([Total Sales], ALL(Sales))") == {"East": 380, "West": 380, "North": 380}
    assert grouped("CALCULATE([Total Sales], ALLEXCEPT(Sales, Sales[Region]))") == {"West": 200, "East": 150, "North": 30}
    assert value('CALCULATE([Total Sales], Sales[Region] IN {"East", "North"})') == 180
    assert value('CALCULATE([Total Sales], KEEPFILTERS(Sales[Qty] >= 2))') == 80


def test_filter_and_iterators():
    assert value("COUNTROWS(FILTER(Sales, Sales[Amount] > 60))") == 2
    assert value("SUMX(Sales, Sales[Amount] * Sales[Qty])") == 100 + 100 + 200 + 150
    assert value("AVERAGEX(FILTER(Sales, Sales[Product] = \"A\"), Sales[Qty])") == pytest.approx(7 / 3, rel=1e-3)
    assert value("COUNTROWS(VALUES(Sales[Region]))") == 3
    assert value("CALCULATE([Total Sales], FILTER(ALL(Sales), Sales[Qty] = 1))") == 300


def test_context_transition_in_filter():
    # Customers whose own sales are over 120: c1 (300). The measure inside FILTER sees one row at a time.
    assert value("COUNTROWS(FILTER(VALUES(Sales[Customer]), [Total Sales] > 120))") == 1
    assert value("CALCULATE([Orders], FILTER(VALUES(Sales[Customer]), [Total Sales] > 120))") == 2
    assert value("SUMX(FILTER(Sales, [Total Sales] >= 100), Sales[Amount])") == 300


def test_slicer_filters_and_selected_value():
    assert value("[Total Sales]", filters={"Region": ["East", "West"]}) == 350
    assert grouped('SELECTEDVALUE(Sales[Region], "many")') == {"East": "East", "North": "North", "West": "West"}
    assert value('SELECTEDVALUE(Sales[Region], "many")') == "many"


def test_scalars_vars_and_logic():
    assert value("VAR t = [Total Sales] VAR n = [Orders] RETURN t / n") == 76
    assert value('IF([Total Sales] > 300, "High", "Low")') == "High"
    assert value('SWITCH(TRUE(), [Orders] > 10, "lots", [Orders] > 3, "some", "few")') == "some"
    assert value("DIVIDE(1, 0, -1)") == -1
    assert value("ROUND(10 / 3, 2)") == 3.33
    assert value('"Total: " & [Orders]') == "Total: 5"
    assert value("2 ^ 3 + ABS(-1)") == 9


def test_two_tables_are_separate():
    result = run_dax("SUM(Targets[Target]) - SUM(Sales[Amount])", [SALES, TARGETS], {})
    assert result["rows"][0][0] == -10


def test_friendly_errors():
    with pytest.raises(DaxError, match="needs to be summarised"):
        compile_query("Sales[Amount]", DATA)
    with pytest.raises(DaxError, match="no table called"):
        compile_query("SUM(Orders[Amount])", DATA)
    with pytest.raises(DaxError, match="no measure or column"):
        compile_query("[Nope]", DATA)
    with pytest.raises(DaxError, match="refers to itself"):
        compile_query("[Loop]", DATA, {"Loop": "[Loop] + 1"})
    with pytest.raises(DaxError, match="not supported yet"):
        compile_query("RANKX(Sales, [Total Sales])", DATA, MEASURES)
    with pytest.raises(DaxError, match="Expected"):
        compile_query("SUM(Sales[Amount]", DATA)


def test_split_definition():
    assert split_definition("Total Sales = SUM(Sales[Amount])") == ("Total Sales", "SUM(Sales[Amount])")
    assert split_definition("[Margin %] := DIVIDE(1, 2)") == ("Margin %", "DIVIDE(1, 2)")
    assert split_definition("SUM(Sales[Amount])") == (None, "SUM(Sales[Amount])")


OWNER = {"X-Demo-User-Id": "user-you"}


async def test_dax_route_runs_grouped_measures_and_saves_them_on_a_dashboard(client) -> None:
    upload = await client.post("/api/resources/upload", headers=OWNER, files={"file": ("orders.csv", b"region,rev\nN,10\nS,30\nN,5\n", "text/csv")}, data={"scope_type": "library", "scope_id": "x", "client_upload_id": "up-dax"})
    dataset_id = upload.json()["resource"]["id"]
    measures = [{"name": "Revenue", "expression": "SUM(orders[rev])"}, {"name": "Share", "expression": "DIVIDE([Revenue], CALCULATE([Revenue], ALL(orders)))", "format": "percent"}]

    ran = await client.post("/api/dashboards/dax/run", headers=OWNER, json={"expression": "[Revenue]", "dataset_ids": [dataset_id], "measures": measures, "group_dataset_id": dataset_id, "group_column": "region", "order": "name"})
    assert ran.status_code == 200 and ran.json()["rows"] == [["N", 15.0], ["S", 30.0]]
    share = await client.post("/api/dashboards/dax/run", headers=OWNER, json={"expression": "[Share]", "dataset_ids": [dataset_id], "measures": measures, "filters": {"region": ["S"]}})
    assert share.json()["rows"] == [[0.6667]]  # ALL ignores the slicer too, like Power BI
    selected = await client.post("/api/dashboards/dax/run", headers=OWNER, json={"expression": "DIVIDE([Revenue], CALCULATE([Revenue], ALLSELECTED(orders)))", "dataset_ids": [dataset_id], "measures": measures, "filters": {"region": ["S"]}})
    assert selected.json()["rows"] == [[1.0]]  # ALLSELECTED keeps the slicer

    bad = await client.post("/api/dashboards/dax/run", headers=OWNER, json={"expression": "SUM(orders[nope])", "dataset_ids": [dataset_id]})
    assert bad.status_code == 422 and "no column" in bad.json()["error"]["message"]

    saved = await client.put("/api/dashboards", headers=OWNER, json={"name": "DAX", "dataset_ids": [dataset_id], "widgets": [], "measures": measures})
    assert saved.status_code == 200 and saved.json()["measures"][1] == {"name": "Share", "expression": measures[1]["expression"], "format": "percent"}
    duplicate = await client.put("/api/dashboards", headers=OWNER, json={"name": "DAX", "widgets": [], "measures": [measures[0], measures[0]]})
    assert duplicate.status_code == 422
