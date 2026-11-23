"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, AreaChart, BarChart3, BarChartHorizontal, ChartColumn, ChartScatter, Database, Filter, Gauge, Hash, LayoutGrid, LineChart, LoaderCircle, PieChart, Radar, Redo2, Save, Sparkles, Table2, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { newWidget, suggestWidgets } from "../logic/aggregate";
import { useDashboardAi, useHydratedDatasets, useSaveDashboard, dashboardKeys } from "../use-dashboards";
import { packedSpans } from "../logic/layout";
import type { DashboardWidget, Filters, WidgetType } from "../types";
import { FilterBar, toggleFilter } from "./filter-bar";
import { AiNotes } from "./ai-notes";
import { AddDatasetMenu } from "./add-dataset-menu";
import { AskAiBar } from "./ask-ai-bar";
import { DriveBrowserDialog } from "@/features/connectors/components/drive-browser-dialog";

const WidgetCard = dynamic(() => import("./widget-card").then((m) => m.WidgetCard), { ssr: false });

const STARTERS = ["Overview with key numbers and a breakdown by category", "Trends over time with a table of the latest rows", "Compare the top categories with a pie chart"];
const CHANGES = ["Add a table of the top rows", "Make the charts wider", "Add a filter for the main category"];
const PALETTE: Array<{ type: WidgetType; label: string; icon: typeof Hash }> = [
  { type: "kpi", label: "KPI", icon: Hash }, { type: "gauge", label: "Gauge", icon: Gauge }, { type: "bar", label: "Bar", icon: BarChart3 },
  { type: "hbar", label: "Horizontal bar", icon: BarChartHorizontal }, { type: "line", label: "Line", icon: LineChart }, { type: "area", label: "Area", icon: AreaChart },
  { type: "pie", label: "Pie", icon: PieChart }, { type: "treemap", label: "Treemap", icon: LayoutGrid }, { type: "funnel", label: "Funnel", icon: Filter },
  { type: "radar", label: "Radar", icon: Radar }, { type: "histogram", label: "Histogram", icon: ChartColumn }, { type: "scatter", label: "Scatter", icon: ChartScatter },
  { type: "table", label: "Table", icon: Table2 },
];

interface Snapshot { widgets: DashboardWidget[]; slicers: string[] }
const iconButton = "grid size-8 place-items-center rounded-md border bg-surface text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";

/** Designer in the Zoho Analytics layout: data and chart palette on the left, a canvas with filters and a prompt on the right. */
export function DashboardBuilderPage() {
  const router = useRouter();
  const client = useQueryClient();
  const save = useSaveDashboard();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const hydrated = useHydratedDatasets(selected);
  const datasets = hydrated.datasets;
  const [state, setState] = useState<Snapshot>({ widgets: [], slicers: [] });
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [panel, setPanel] = useState<"data" | "charts">("data");
  const [targetId, setTargetId] = useState("");
  const [driveOpen, setDriveOpen] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const ai = useDashboardAi();

  const { widgets, slicers } = state;
  const commit = (next: Partial<Snapshot>) => { setPast((items) => [...items.slice(-30), state]); setFuture([]); setState({ ...state, ...next }); };
  const setWidgets = (next: DashboardWidget[]) => commit({ widgets: next });
  const undo = () => { const previous = past[past.length - 1]; if (!previous) return; setFuture([state, ...future]); setPast(past.slice(0, -1)); setState(previous); };
  const redo = () => { const next = future[0]; if (!next) return; setPast([...past, state]); setFuture(future.slice(1)); setState(next); };

  const chosen = datasets.filter((dataset) => selected.includes(dataset.id));
  const target = chosen.find((dataset) => dataset.id === targetId) ?? chosen[0];
  const spans = packedSpans(widgets);
  const canSave = name.trim().length > 0 && widgets.length > 0 && !save.isPending;
  const empty = widgets.length === 0;
  const aiError = ai.generate.error ?? ai.tune.error;

  function toggle(id: string) {
    if (selected.includes(id)) {
      setSelected(selected.filter((item) => item !== id));
      if (widgets.some((widget) => widget.dataset_id === id)) setWidgets(widgets.filter((widget) => widget.dataset_id !== id));
    } else setSelected([...selected, id]);
  }

  async function ask(text: string) {
    setNotes([]);
    if (empty) {
      const result = await ai.generate.mutateAsync({ prompt: text, datasets: (chosen.length ? chosen : datasets).slice(0, 8) });
      setSelected([...new Set(result.widgets.map((widget) => widget.dataset_id))]);
      commit({ widgets: result.widgets, slicers: result.slicers ?? [] });
      if (!name.trim() && result.name) setName(result.name);
      if (!description.trim() && result.description) setDescription(result.description);
      setNotes(result.notes);
      setSuggestions(result.suggestions ?? []);
      return;
    }
    const result = await ai.tune.mutateAsync({ instruction: text, widgets, slicers, name, datasets: chosen });
    commit({ widgets: result.widgets, slicers: result.slicers ?? slicers });
    if (result.name) setName(result.name);
    setNotes(result.notes.length ? result.notes : ["Done."]);
    setSuggestions(result.suggestions ?? []);
  }

  async function checkAndFix() {
    const result = await ai.review.mutateAsync({ widgets, datasets: chosen });
    setWidgets(result.widgets);
    setNotes(result.notes.length ? result.notes : ["No problems found."]);
  }

  async function submit() {
    const saved = await save.mutateAsync({ name, description, dataset_ids: [...new Set(widgets.map((widget) => widget.dataset_id))], widgets, slicers });
    router.push(`/dashboards/${saved.id}`);
  }

  const errorText = aiError ? (aiError instanceof Error ? aiError.message : "The AI could not do that.") : null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <Link href="/dashboards" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Dashboards</Link>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 basis-full flex-col sm:basis-0 sm:flex-1">
          <input aria-label="Dashboard name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Untitled dashboard" className="h-9 w-full max-w-md rounded-md border border-transparent bg-transparent px-1 text-xl font-semibold tracking-tight outline-none placeholder:text-muted-foreground hover:border-border focus:border-border-strong" />
          <input aria-label="Description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What it is for (optional)" className="h-7 w-full max-w-md rounded-md border border-transparent bg-transparent px-1 text-xs text-muted-foreground outline-none placeholder:text-muted-foreground hover:border-border focus:border-border-strong" />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Undo" title="Undo" onClick={undo} disabled={!past.length} className={iconButton}><Undo2 className="size-4" /></button>
          <button type="button" aria-label="Redo" title="Redo" onClick={redo} disabled={!future.length} className={iconButton}><Redo2 className="size-4" /></button>
          <Button type="button" onClick={submit} disabled={!canSave} title={canSave ? undefined : "Add a name and at least one chart"}><Save />Save dashboard</Button>
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="self-start rounded-xl border bg-surface/40 p-3 lg:sticky lg:top-4" aria-label="Designer panel">
          <div role="tablist" className="grid grid-cols-2 rounded-md border bg-surface p-0.5 text-xs">
            {(["data", "charts"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={panel === item} onClick={() => setPanel(item)} className={cn("h-7 rounded capitalize text-muted-foreground transition-colors hover:text-foreground", panel === item && "bg-raised text-foreground")}>{item}</button>
            ))}
          </div>

          {panel === "data" ? (
            <div className="mt-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{chosen.length} of {datasets.length} selected</p>
                <AddDatasetMenu onUploaded={() => void client.invalidateQueries({ queryKey: dashboardKeys.datasets })} onDrive={() => setDriveOpen(true)} />
              </div>
              {hydrated.loading ? <p className="py-6 text-center text-xs text-muted-foreground">Loading datasets…</p> : !datasets.length ? <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No datasets yet. Use Add dataset to upload a file or import from Google Drive.</p> : (
                <ul className="max-h-[22rem] space-y-1 overflow-auto pr-0.5" aria-label="Datasets">
                  {datasets.map((dataset) => {
                    const on = selected.includes(dataset.id);
                    return (
                      <li key={dataset.id}>
                        <label className={cn("flex cursor-pointer items-start gap-2 rounded-lg border px-2.5 py-2 transition-colors hover:border-border-strong", on && "border-sage/60 bg-sage/5")}>
                          <input type="checkbox" checked={on} onChange={() => toggle(dataset.id)} className="mt-0.5 accent-[var(--sage)]" />
                          <span className="min-w-0"><span className="flex items-center gap-1.5 text-xs font-medium"><Database className="size-3.5 shrink-0 text-sage" /><span className="truncate">{dataset.name}</span></span><span className="block text-[10px] text-muted-foreground">{dataset.columns.length} columns · {(dataset.row_count ?? dataset.rows.length).toLocaleString()} rows</span></span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {chosen.length ? <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => { setWidgets([...widgets, ...suggestWidgets(chosen)]); setPanel("charts"); }}><Sparkles />Suggest charts</Button> : null}
            </div>
          ) : (
            <div className="mt-3">
              {chosen.length ? (
                <>
                  {chosen.length > 1 ? <select aria-label="Dataset for new charts" value={target?.id ?? ""} onChange={(event) => setTargetId(event.target.value)} className="mb-2 h-8 w-full rounded-md border bg-surface px-2 text-xs">{chosen.map((dataset) => <option key={dataset.id} value={dataset.id}>{dataset.name}</option>)}</select> : <p className="mb-2 truncate text-[11px] text-muted-foreground">Adds from {target?.name}</p>}
                  <ul className="grid grid-cols-2 gap-1.5" aria-label="Chart types">
                    {PALETTE.map(({ type, label, icon: Icon }) => (
                      <li key={type}><button type="button" onClick={() => target && setWidgets([...widgets, newWidget(type, target)])} className="flex h-16 w-full flex-col items-center justify-center gap-1 rounded-lg border bg-surface px-1 text-center text-[11px] leading-tight text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground"><Icon className="size-4" />{label}</button></li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] text-muted-foreground">Click a chart type to add it, then change its columns on the card.</p>
                </>
              ) : <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">Select a dataset under Data first.</p>}
            </div>
          )}
        </aside>

        <div className="min-w-0">
          {empty ? (
            <div className="rounded-xl border border-dashed px-4 py-10 sm:px-10">
              <div className="mx-auto max-w-2xl">
                <p className="flex items-center justify-center gap-2 text-center text-lg font-semibold tracking-tight"><Wand2 className="size-5 text-sage" />What do you want to see?</p>
                <p className="mb-5 mt-1 text-center text-xs text-muted-foreground">Describe it and the AI builds the dashboard. Or pick data on the left and add charts yourself.</p>
                <AskAiBar
                  label="Describe the dashboard" rows={2}
                  placeholder="e.g. Revenue and units by region, a KPI row and a table of the latest orders"
                  busy={ai.generate.isPending} disabled={!ai.ready || !datasets.length}
                  error={errorText} suggestions={STARTERS} onSubmit={ask}
                />
                <p className="mt-2 text-center text-[11px] text-muted-foreground">{!datasets.length && !hydrated.loading ? "Add a dataset first (left panel), then describe what you want." : chosen.length ? `Using ${chosen.map((dataset) => dataset.name).join(", ")}.` : "No dataset picked: the AI will choose from your Library."}</p>
              </div>
            </div>
          ) : (
            <>
              <AskAiBar
                label="Ask AI to change this dashboard"
                placeholder="Ask for any change, e.g. make the bar a pie"
                busy={ai.tune.isPending} disabled={!ai.ready}
                error={errorText} suggestions={suggestions.length ? suggestions : CHANGES} onSubmit={ask}
              />
              <AiNotes notes={notes} title="What the AI did" />
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">{widgets.length} widget{widgets.length === 1 ? "" : "s"}{hydrated.loadingRows ? " · loading full rows…" : hydrated.truncated ? " · first 6,000 rows of large datasets" : ""}</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void checkAndFix().catch(() => undefined)} disabled={!ai.ready || ai.review.isPending}>{ai.review.isPending ? <LoaderCircle className="animate-spin" /> : <Wand2 />}{ai.review.isPending ? "Checking…" : "AI check & fix"}</Button>
              </div>
              {ai.review.isError ? <p role="alert" className="mt-2 text-xs text-red-300">The AI check failed. Try again.</p> : null}
              <div className="mt-3"><FilterBar datasets={chosen} slicers={slicers} onSlicersChange={(next) => commit({ slicers: next })} filters={filters} onFiltersChange={setFilters} /></div>
              <div className="grid grid-flow-dense gap-3 md:grid-cols-3">
                {widgets.map((widget) => (
                  <WidgetCard key={widget.id} widget={widget} span={spans[widget.id]} filters={filters} onSelect={(column, value) => setFilters(toggleFilter(filters, column, value))} dataset={chosen.find((dataset) => dataset.id === widget.dataset_id)} editable onChange={(next) => setWidgets(widgets.map((item) => (item.id === next.id ? next : item)))} onRemove={() => setWidgets(widgets.filter((item) => item.id !== widget.id))} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <DriveBrowserDialog open={driveOpen} onOpenChange={setDriveOpen} target={{ scopeType: "library", scopeId: "library", label: "your Library" }} onReauth={() => router.push("/connectors")} onImported={() => void hydrated.refetch()} />
    </section>
  );
}
