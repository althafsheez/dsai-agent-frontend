from __future__ import annotations

from app.services.dashboard_preview import build_preview

DATA = {"d": {"columns": ["month", "rev"], "rows": [["Jan", "100"], ["Feb", "120"], ["Mar", "90"]], "total_rows": 3}}


def widget(kind: str) -> dict:
    return {"id": "w", "type": kind, "title": "Revenue", "dataset_id": "d", "x": "month", "y": "rev", "agg": "sum", "span": 1}


def test_trend_chart_gives_the_change_of_the_latest_point() -> None:
    delta = build_preview([widget("line")], DATA)["delta"]
    assert delta == {"text": "-25.0%", "positive": False, "label": "Revenue"}


def test_no_trend_chart_means_no_delta() -> None:
    assert build_preview([widget("bar")], DATA)["delta"] is None
