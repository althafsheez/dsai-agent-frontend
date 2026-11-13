import type { ChatRecord } from "./types";

const revenueData = [
  { month: "Jan", actual: 42, forecast: 40 },
  { month: "Feb", actual: 48, forecast: 44 },
  { month: "Mar", actual: 46, forecast: 48 },
  { month: "Apr", actual: 58, forecast: 51 },
  { month: "May", actual: 64, forecast: 57 },
  { month: "Jun", actual: 71, forecast: 63 },
];

export function createMockChat(chatId: string): ChatRecord {
  const workspace = chatId === "standalone" ? null : { id: "ws-growth", name: "Growth planning" };
  return {
    id: chatId,
    title: "Revenue growth analysis",
    workspace,
    messages: [
      {
        id: "question-1",
        role: "user",
        content: "Which regions are driving revenue growth, and are we ahead of forecast?",
        createdAt: "2026-11-09T09:30:00.000Z",
        attachments: [{ id: "att-1", name: "regional_revenue.csv", kind: "CSV", size: "184 KB" }],
      },
      {
        id: "answer-1",
        role: "assistant",
        createdAt: "2026-11-09T09:30:12.000Z",
        status: "completed",
        trace: [
          { id: "trace-1", runId: "demo-run-1", messageId: "answer-1", label: "Inspecting regional_revenue.csv", detail: "18,240 rows · 8 columns", status: "completed" },
          { id: "trace-2", runId: "demo-run-1", messageId: "answer-1", label: "Running revenue comparison", detail: "Python · 1.8s", status: "completed" },
        ],
        blocks: [
          { type: "markdown", content: "## Revenue is 12.7% ahead of forecast\n\nNorth America and APAC account for **78% of the year-to-date increase**. Growth accelerated in April, while EMEA remained broadly flat." },
          { type: "chart", title: "Actual revenue vs forecast", description: "Monthly revenue in millions of dollars", data: revenueData, xKey: "month", series: [{ key: "actual", label: "Actual", color: "var(--sage)" }, { key: "forecast", label: "Forecast", color: "var(--slate)" }] },
          { type: "table", caption: "Regional contribution to year-to-date growth", columns: ["Region", "Revenue", "YoY growth", "Contribution"], rows: [["North America", "$18.4M", "16.2%", "48%"], ["APAC", "$11.6M", "21.8%", "30%"], ["EMEA", "$7.9M", "2.1%", "12%"], ["LATAM", "$4.1M", "8.4%", "10%"]] },
          { type: "markdown", content: "The main risk is concentration: **North America provides nearly half of incremental revenue**. I would monitor pipeline conversion in APAC and investigate the EMEA plateau." },
          { type: "file", id: "file-1", name: "regional_growth_summary.csv", kind: "Dataset", size: "12 KB", description: "Generated summary · 4 rows" },
        ],
      },
      {
        id: "question-2",
        role: "user",
        content: "Show me the calculation used for year-over-year growth.",
        createdAt: "2026-11-09T09:34:00.000Z",
      },
      {
        id: "answer-2",
        role: "assistant",
        createdAt: "2026-11-09T09:34:05.000Z",
        status: "completed",
        blocks: [
          { type: "markdown", content: "I grouped revenue by region and year, then compared the current period with the matching prior-year period. Null revenue values are excluded before aggregation." },
          { type: "code", language: "sql", filename: "regional_growth.sql", code: "WITH yearly_revenue AS (\n  SELECT region, EXTRACT(YEAR FROM order_date) AS year,\n         SUM(revenue) AS revenue\n  FROM orders\n  WHERE revenue IS NOT NULL\n  GROUP BY region, EXTRACT(YEAR FROM order_date)\n)\nSELECT region,\n       (current.revenue - prior.revenue) / prior.revenue * 100 AS yoy_growth\nFROM yearly_revenue current\nJOIN yearly_revenue prior\n  ON current.region = prior.region AND current.year = prior.year + 1;" },
        ],
      },
    ],
  };
}

export const mockResponseText = "The latest period reinforces the earlier pattern. North America remains the largest absolute contributor, while APAC has the strongest percentage growth. I would validate whether the APAC increase is broad-based across customers before changing the forecast.";
