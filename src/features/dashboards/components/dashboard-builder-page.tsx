"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Database, LayoutDashboard, LoaderCircle, Merge, PencilRuler, Redo2, Save, Sparkles, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeChanges, defaultPolicy, editsInstruction, policyContext } from "../logic/manual";
import type { ConflictPolicy, TileSpec } from "../logic/manual";
import { useDashboardAi, useDatasetRelations, useHydratedDatasets, useSaveDashboard, dashboardKeys } from "../use-dashboards";
import { useReorder } from "../use-reorder";
import { packedSpans } from "../logic/layout";
import { usedDatasetIds } from "../types";
import type { DashboardWidget, Filters } from "../types";
import { FilterBar, toggleFilter } from "./filter-bar";
import { AiNotes } from "./ai-notes";
import { AddDatasetMenu } from "./add-dataset-menu";
import { AskAiBar } from "./ask-ai-bar";
import { DatasetRelationsPanel } from "./dataset-relations";
import { HandEdits } from "./hand-edits";
import { ManualComposer } from "./manual-composer";
import { Section } from "./section";
import { DriveBrowserDialog } from "@/features/connectors/components/drive-browser-dialog";

const WidgetCard = dynamic(() => import("./widget-card").then((m) => m.WidgetCard), { ssr: false });

const STARTERS = ["Overview with key numbers and a breakdown by category", "Trends over time with a table of the latest rows", "Compare the top categories with a pie chart"];
const CHANGES = ["Add a table of the top rows", "Make the charts wider", "Add a filter for the main category"];

interface Snapshot { widgets: DashboardWidget[]; slicers: string[] }
const iconButton = "grid size-8 place-items-center rounded-md border bg-surface text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40";
const messageOf = (error: unknown) => (error ? (error instanceof Error ? error.message : "The AI could not do that.") : null);

/**
 * Designer in the Zoho Analytics layout: data on the left; on the right a prompt box, a manual tile composer, the dataset
 * comparison and the canvas, each in its own section. Typing a prompt and filling the composer both end in the AI building the tile.
 */
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
  const [baseline, setBaseline] = useState<DashboardWidget[]>([]);
  const [past, setPast] = useState<Snapshot[]>([]);
  const [future, setFuture] = useState<Snapshot[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [driveOpen, setDriveOpen] = useState(false);
  const [notes, setNotes] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [policy, setPolicy] = useState<ConflictPolicy>(defaultPolicy);
  const ai = useDashboardAi();

  const { widgets, slicers } = state;
  const commit = (next: Partial<Snapshot>) => { setPast((items) => [...items.slice(-30), state]); setFuture([]); setState({ ...state, ...next }); };
  const setWidgets = (next: DashboardWidget[]) => commit({ widgets: next });
  const undo = () => { const previous = past[past.length - 1]; if (!previous) return; setFuture([state, ...future]); setPast(past.slice(0, -1)); setState(previous); };
  const redo = () => { const next = future[0]; if (!next) return; setPast([...past, state]); setFuture(future.slice(1)); setState(next); };

  const chosen = datasets.filter((dataset) => selected.includes(dataset.id));
  const relations = useDatasetRelations(chosen.map((dataset) => dataset.id));
  const activePolicy: ConflictPolicy = policy.kind === "prefer" && !chosen.some((dataset) => dataset.id === policy.datasetId) ? defaultPolicy : policy;
  const context = policyContext(activePolicy, chosen, relations.data);
  const spans = packedSpans(widgets);
  const reorder = useReorder(widgets, setWidgets);
  const changes = describeChanges(baseline, widgets);
  const canSave = name.trim().length > 0 && widgets.length > 0 && !save.isPending;
  const empty = widgets.length === 0;
  const aiError = messageOf(ai.generate.error ?? ai.tune.error);

  function toggle(id: string) {
    if (selected.includes(id)) {
      setSelected(selected.filter((item) => item !== id));
      if (widgets.some((widget) => widget.dataset_id === id)) setWidgets(widgets.filter((widget) => widget.dataset_id !== id));
    } else setSelected([...selected, id]);
  }

  /** Everything the AI changes lands here, and what it returns becomes the new baseline for "your edits". */
  function applyAi(next: DashboardWidget[], nextSlicers: string[]) {
    commit({ widgets: next, slicers: nextSlicers });
    setBaseline(next);
  }

  async function ask(text: string) {
    setNotes([]);
    if (empty) {
      const result = await ai.generate.mutateAsync({ prompt: text, datasets: (chosen.length ? chosen : datasets).slice(0, 8), context });
      setSelected([...new Set([...selected, ...usedDatasetIds(result.widgets)])]);
      applyAi(result.widgets, result.slicers ?? []);
      if (!name.trim() && result.name) setName(result.name);
      if (!description.trim() && result.description) setDescription(result.description);
      setNotes(result.notes);
      setSuggestions(result.suggestions ?? []);
      return;
    }
    const result = await ai.tune.mutateAsync({ instruction: text, widgets, slicers, name, datasets: chosen, context });
    applyAi(result.widgets, result.slicers ?? slicers);
    if (result.name) setName(result.name);
    setNotes(result.notes.length ? result.notes : ["Done."]);
    setSuggestions(result.suggestions ?? []);
  }

  /** A tile from the manual composer: presets go through the AI like a prompt; anything else is a script the AI writes. */
  async function buildTile(spec: TileSpec, instruction: string) {
    if (spec.type === "custom") {
      setNotes([]);
      const widget = await ai.custom.mutateAsync({ request: spec.notes.trim(), title: spec.title.trim(), datasetIds: spec.datasetIds });
      applyAi([...widgets, widget], slicers);
      setNotes([`The AI wrote and ran a Python script for “${widget.title}”. Open “Built by an AI-written Python script” on the tile to read it.`]);
      return;
    }
    await ask(empty ? `${instruction} Build a dashboard with only this one tile; the user will add more themselves.` : instruction);
  }

  async function handOverEdits() {
    await ask(editsInstruction(changes));
  }

  async function checkAndFix() {
    const result = await ai.review.mutateAsync({ widgets, datasets: chosen });
    applyAi(result.widgets, slicers);
    setNotes(result.notes.length ? result.notes : ["No problems found."]);
  }

  async function submit() {
    const saved = await save.mutateAsync({ name, description, dataset_ids: usedDatasetIds(widgets), widgets, slicers });
    router.push(`/dashboards/${saved.id}`);
  }

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
        <aside className="self-start lg:sticky lg:top-4">
          <Section title="Data" hint={`${chosen.length} of ${datasets.length} selected`} tone="data" icon={<Database className="size-4" />}
            actions={<AddDatasetMenu onUploaded={() => void client.invalidateQueries({ queryKey: dashboardKeys.datasets })} onDrive={() => setDriveOpen(true)} />}>
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
            <p className="mt-2 text-[11px] text-muted-foreground">Tick one dataset, or several to combine them. When two files disagree you decide what the AI does.</p>
            {chosen.length && empty ? <Button type="button" variant="outline" size="sm" className="mt-3 w-full" disabled={!ai.ready || ai.generate.isPending} onClick={() => void ask("Build a good starting dashboard for these datasets: key numbers first, then varied charts").catch(() => undefined)}><Sparkles />Let the AI suggest a dashboard</Button> : null}
          </Section>
        </aside>

        <div className="min-w-0 space-y-4">
          <Section title="Ask the AI" hint="Describe what you want in plain words" tone="ai" icon={<Wand2 className="size-4" />}>
            {empty ? (
              <>
                <p className="mb-3 text-sm font-medium tracking-tight">What do you want to see?</p>
                <AskAiBar
                  label="Describe the dashboard" rows={2}
                  placeholder="e.g. Revenue and units by region, a KPI row and a table of the latest orders"
                  busy={ai.generate.isPending} disabled={!ai.ready || !datasets.length}
                  error={aiError} suggestions={STARTERS} onSubmit={ask}
                />
                <p className="mt-2 text-[11px] text-muted-foreground">{!datasets.length && !hydrated.loading ? "Add a dataset first (left panel), then describe what you want." : chosen.length ? `Using ${chosen.map((dataset) => dataset.name).join(", ")}.` : "No dataset picked: the AI will choose from your Library."}</p>
              </>
            ) : (
              <>
                <AskAiBar
                  label="Ask AI to change this dashboard"
                  placeholder="Ask for any change, e.g. make the bar a pie, or show the top 3 regions as a share of revenue"
                  busy={ai.tune.isPending} disabled={!ai.ready}
                  error={aiError} suggestions={suggestions.length ? suggestions : CHANGES} onSubmit={ask}
                />
                <AiNotes notes={notes} title="What the AI did" />
              </>
            )}
            {empty ? <AiNotes notes={notes} title="What the AI did" /> : null}
          </Section>

          <Section title="Add a tile yourself" hint="Pick a type, see what it needs. The AI builds it from your answers." tone="manual" icon={<PencilRuler className="size-4" />} collapsible defaultOpen>
            <ManualComposer datasets={chosen} busy={ai.custom.isPending || ai.generate.isPending || ai.tune.isPending} error={messageOf(ai.custom.error)} onBuild={buildTile} />
          </Section>

          {chosen.length > 1 ? (
            <Section title="Datasets together" hint="Where your files overlap or disagree" tone="data" icon={<Merge className="size-4" />}>
              <DatasetRelationsPanel datasets={chosen} relations={relations.data} loading={relations.isFetching && !relations.data} failed={relations.isError} policy={activePolicy} onPolicy={setPolicy} />
            </Section>
          ) : null}

          <Section title="Dashboard" hint={empty ? "Your tiles appear here" : `${widgets.length} tile${widgets.length === 1 ? "" : "s"}${hydrated.loadingRows ? " · loading full rows…" : hydrated.truncated ? " · first 6,000 rows of large datasets" : ""} · drag to rearrange`} tone="canvas" icon={<LayoutDashboard className="size-4" />}
            actions={!empty ? <Button type="button" variant="outline" size="sm" onClick={() => void checkAndFix().catch(() => undefined)} disabled={!ai.ready || ai.review.isPending}>{ai.review.isPending ? <LoaderCircle className="animate-spin" /> : <Wand2 />}{ai.review.isPending ? "Checking…" : "AI check & fix"}</Button> : undefined}>
            {empty ? <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">Nothing here yet. Describe a dashboard above, or add a tile yourself.</p> : (
              <>
                {ai.review.isError ? <p role="alert" className="mb-2 text-xs text-red-300">The AI check failed. Try again.</p> : null}
                <HandEdits changes={changes} busy={ai.tune.isPending} disabled={!ai.ready} error={aiError} onHandOver={() => void handOverEdits().catch(() => undefined)} />
                <FilterBar datasets={chosen} slicers={slicers} onSlicersChange={(next) => commit({ slicers: next })} filters={filters} onFiltersChange={setFilters} />
                <div className="grid grid-flow-dense gap-3 md:grid-cols-3">
                  {widgets.map((widget) => (
                    <WidgetCard key={widget.id} widget={widget} span={spans[widget.id]} filters={filters} onSelect={(column, value) => setFilters(toggleFilter(filters, column, value))} dataset={chosen.find((dataset) => dataset.id === widget.dataset_id)} editable reorder={reorder(widget.id)} onChange={(next) => setWidgets(widgets.map((item) => (item.id === next.id ? next : item)))} onRemove={() => setWidgets(widgets.filter((item) => item.id !== widget.id))} />
                  ))}
                </div>
              </>
            )}
          </Section>
        </div>
      </div>
      <DriveBrowserDialog open={driveOpen} onOpenChange={setDriveOpen} target={{ scopeType: "library", scopeId: "library", label: "your Library" }} onReauth={() => router.push("/connectors")} onImported={() => void hydrated.refetch()} />
    </section>
  );
}
