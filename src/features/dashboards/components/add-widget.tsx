"use client";

import { useState } from "react";
import { AreaChart, BarChart3, BarChartHorizontal, ChartColumn, ChartScatter, Filter, Gauge, Hash, LayoutGrid, LineChart, PieChart, Plus, Radar, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newWidget } from "../logic/aggregate";
import type { DashboardWidget, DatasetLite, WidgetType } from "../types";

type Entry = { value: WidgetType; label: string; hint: string; icon: typeof Hash };
// Grouped by the question each chart answers, the way Superset and Metabase present their chart pickers.
const GALLERY: Array<{ group: string; items: Entry[] }> = [
  { group: "Numbers", items: [
    { value: "kpi", label: "KPI", hint: "One big number", icon: Hash },
    { value: "gauge", label: "Gauge", hint: "Average vs the highest value", icon: Gauge },
  ] },
  { group: "Compare", items: [
    { value: "bar", label: "Bar", hint: "Values by category", icon: BarChart3 },
    { value: "hbar", label: "Horizontal bar", hint: "Ranking, long labels", icon: BarChartHorizontal },
    { value: "radar", label: "Radar", hint: "Profile across categories", icon: Radar },
  ] },
  { group: "Trend", items: [
    { value: "line", label: "Line", hint: "Change over a sequence", icon: LineChart },
    { value: "area", label: "Area", hint: "Trend with volume", icon: AreaChart },
  ] },
  { group: "Parts of a whole", items: [
    { value: "pie", label: "Pie", hint: "Share of the total", icon: PieChart },
    { value: "treemap", label: "Treemap", hint: "Many parts at once", icon: LayoutGrid },
    { value: "funnel", label: "Funnel", hint: "Largest to smallest", icon: Filter },
  ] },
  { group: "Spread and links", items: [
    { value: "histogram", label: "Histogram", hint: "How values are spread", icon: ChartColumn },
    { value: "scatter", label: "Scatter", hint: "Two numbers, one dot per row", icon: ChartScatter },
  ] },
  { group: "Detail", items: [{ value: "table", label: "Table", hint: "The raw rows", icon: Table2 }] },
];

export function AddWidget({ datasets, onAdd }: { datasets: DatasetLite[]; onAdd: (widget: DashboardWidget) => void }) {
  const [type, setType] = useState<WidgetType>("bar");
  const [datasetId, setDatasetId] = useState("");
  const dataset = datasets.find((item) => item.id === datasetId) ?? datasets[0];
  if (!dataset) return null;
  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3" role="group" aria-label="Add widget">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium">Add a chart</span>
        <select aria-label="Widget dataset" value={dataset.id} onChange={(event) => setDatasetId(event.target.value)} className="h-8 max-w-[200px] rounded-md border bg-surface px-2 text-xs">{datasets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => onAdd(newWidget(type, dataset))}><Plus />Add {GALLERY.flatMap((entry) => entry.items).find((item) => item.value === type)?.label}</Button>
      </div>
      <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {GALLERY.map(({ group, items }) => (
          <div key={group}>
            <p className="mb-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{group}</p>
            <div className="flex flex-wrap gap-1">
              {items.map(({ value, label, hint, icon: Icon }) => (
                <button key={value} type="button" aria-pressed={type === value} title={hint} onClick={() => setType(value)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2 text-[11px] text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground ${type === value ? "border-border-strong bg-raised text-foreground" : ""}`}>
                  <Icon className="size-3.5" />{label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
