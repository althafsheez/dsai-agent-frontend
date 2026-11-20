"use client";

import { useState } from "react";
import { BarChart3, Hash, LineChart, PieChart, Plus, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { newWidget } from "../logic/aggregate";
import type { DashboardWidget, DatasetLite, WidgetType } from "../types";

const TYPES: Array<{ value: WidgetType; label: string; icon: typeof Hash }> = [
  { value: "kpi", label: "KPI", icon: Hash }, { value: "bar", label: "Bar", icon: BarChart3 }, { value: "line", label: "Line", icon: LineChart }, { value: "pie", label: "Pie", icon: PieChart }, { value: "table", label: "Table", icon: Table2 },
];

export function AddWidget({ datasets, onAdd }: { datasets: DatasetLite[]; onAdd: (widget: DashboardWidget) => void }) {
  const [type, setType] = useState<WidgetType>("bar");
  const [datasetId, setDatasetId] = useState("");
  const dataset = datasets.find((item) => item.id === datasetId) ?? datasets[0];
  if (!dataset) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed p-3" role="group" aria-label="Add widget">
      <span className="text-xs text-muted-foreground">Add widget</span>
      <div className="inline-flex rounded-md border bg-surface p-0.5">
        {TYPES.map(({ value, label, icon: Icon }) => (
          <button key={value} type="button" aria-pressed={type === value} onClick={() => setType(value)} className={`inline-flex h-7 items-center gap-1 rounded px-2 text-[11px] text-muted-foreground hover:text-foreground ${type === value ? "bg-raised text-foreground" : ""}`}><Icon className="size-3" />{label}</button>
        ))}
      </div>
      <select aria-label="Widget dataset" value={dataset.id} onChange={(event) => setDatasetId(event.target.value)} className="h-8 max-w-[180px] rounded-md border bg-surface px-2 text-xs">{datasets.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
      <Button type="button" size="sm" variant="outline" onClick={() => onAdd(newWidget(type, dataset))}><Plus />Add</Button>
    </div>
  );
}
