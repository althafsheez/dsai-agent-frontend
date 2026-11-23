"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, LayoutDashboard, LoaderCircle, Merge, Pencil, PencilRuler, Save, Share2, Trash2, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboard, useDashboardAi, useDatasetRelations, useDeleteDashboard, useHydratedDatasets, useSaveDashboard } from "../use-dashboards";
import { useReorder } from "../use-reorder";
import { defaultPolicy, describeChanges, editsInstruction, policyContext } from "../logic/manual";
import type { ConflictPolicy, TileSpec } from "../logic/manual";
import { packedSpans } from "../logic/layout";
import { FilterBar, toggleFilter } from "./filter-bar";
import { roleOf, usedDatasetIds } from "../types";
import type { Dashboard, DashboardWidget, Filters } from "../types";
import { AiNotes } from "./ai-notes";
import { AskAiBar } from "./ask-ai-bar";
import { DataStatus } from "./data-status";
import { DatasetRelationsPanel } from "./dataset-relations";
import { HandEdits } from "./hand-edits";
import { ManualComposer } from "./manual-composer";
import { Section } from "./section";
import { ShareDialog } from "./share-dialog";

const WidgetCard = dynamic(() => import("./widget-card").then((m) => m.WidgetCard), { ssr: false });

type Mode = "view" | "edit";
const CHANGES = ["Add a table of the top rows", "Make the charts wider", "Add a filter for the main category"];
const messageOf = (error: unknown) => (error ? (error instanceof Error ? error.message : "The AI could not do that.") : null);
const ROLE_LABEL = { owner: "Owner", editor: "Can edit", viewer: "View only" } as const;

export function DashboardViewPage({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const dashboardQuery = useDashboard(dashboardId);
  const save = useSaveDashboard();
  const remove = useDeleteDashboard();
  const dashboard = dashboardQuery.data;
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<DashboardWidget[]>([]);
  const usedIds = usedDatasetIds([...(dashboard?.widgets ?? []), ...draft]);
  const hydrated = useHydratedDatasets(usedIds, dashboard?.refresh_minutes ?? 0);
  const datasets = hydrated.datasets;
  const [name, setName] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [slicers, setSlicers] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [baseline, setBaseline] = useState<DashboardWidget[]>([]);
  const [policy, setPolicy] = useState<ConflictPolicy>(defaultPolicy);
  const ai = useDashboardAi();

  useEffect(() => {
    if (dashboard && mode === "view") { setDraft(dashboard.widgets); setBaseline(dashboard.widgets); setName(dashboard.name); setSlicers(dashboard.slicers ?? []); }
  }, [dashboard, mode]);

  const reorder = useReorder(draft, setDraft);
  const usedDatasets = datasets.filter((dataset) => usedIds.includes(dataset.id));
  const relations = useDatasetRelations(usedDatasets.map((dataset) => dataset.id));
  const activePolicy: ConflictPolicy = policy.kind === "prefer" && !usedDatasets.some((dataset) => dataset.id === policy.datasetId) ? defaultPolicy : policy;
  const context = policyContext(activePolicy, usedDatasets, relations.data);

  if (dashboardQuery.isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading dashboard…</p>;
  if (!dashboard) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Dashboard not found</h1>
        <p className="mt-1 text-xs text-muted-foreground">It may have been deleted, or it has not been shared with you.</p>
        <Button asChild variant="outline" className="mt-5"><Link href="/dashboards"><ArrowLeft />Back to dashboards</Link></Button>
      </section>
    );
  }

  const role = roleOf(dashboard);
  const isOwner = role === "owner";
  const canEdit = role !== "viewer";
  const editing = mode === "edit" && canEdit;
  const widgets = editing ? draft : dashboard.widgets;
  const shownSlicers = editing ? slicers : dashboard.slicers ?? [];
  const dirty = editing && (name !== dashboard.name || JSON.stringify(draft) !== JSON.stringify(dashboard.widgets) || JSON.stringify(slicers) !== JSON.stringify(dashboard.slicers ?? []));
  const spans = packedSpans(widgets);
  const changes = editing ? describeChanges(baseline, draft) : [];
  const datasetFor = (widget: DashboardWidget) => datasets.find((dataset) => dataset.id === widget.dataset_id);
  const writeFields = (overrides: Partial<Pick<Dashboard, "status" | "pinned" | "refresh_minutes">> & { widgets?: DashboardWidget[]; name?: string; slicers?: string[]; shares?: Array<{ user_id: string; role: "viewer" | "editor" }> }) => ({
    id: dashboard.id, name: overrides.name ?? dashboard.name, description: dashboard.description,
    dataset_ids: usedDatasetIds(overrides.widgets ?? dashboard.widgets),
    widgets: overrides.widgets ?? dashboard.widgets, slicers: overrides.slicers ?? dashboard.slicers, status: overrides.status, pinned: overrides.pinned,
    refresh_minutes: overrides.refresh_minutes, shares: overrides.shares,
  });

  async function checkAndFix() {
    const used = datasets.filter((dataset) => usedDatasetIds(draft).includes(dataset.id));
    const result = await ai.review.mutateAsync({ widgets: draft, datasets: used });
    setDraft(result.widgets);
    setBaseline(result.widgets);
    setNotes(result.notes.length ? result.notes : ["No problems found."]);
  }

  /** Any change in plain words; it lands in the draft so it can be saved or discarded. */
  async function ask(text: string) {
    const current = editing ? draft : dashboard!.widgets;
    const currentSlicers = editing ? slicers : dashboard!.slicers ?? [];
    const currentName = editing ? name : dashboard!.name;
    if (!editing) { setDraft(current); setBaseline(current); setName(currentName); setSlicers(currentSlicers); setMode("edit"); }
    const used = datasets.filter((dataset) => usedDatasetIds(current).includes(dataset.id));
    setNotes([]);
    const result = await ai.tune.mutateAsync({ instruction: text, widgets: current, slicers: currentSlicers, name: currentName, datasets: (used.length ? used : datasets).slice(0, 8), context });
    setDraft(result.widgets);
    setBaseline(result.widgets);
    setSlicers(result.slicers ?? currentSlicers);
    if (result.name) setName(result.name);
    setNotes(result.notes.length ? result.notes : ["Done."]);
    setSuggestions(result.suggestions ?? []);
  }

  /** A tile from the manual composer: presets go through the AI like a prompt; anything else is a script the AI writes. */
  async function buildTile(spec: TileSpec, instruction: string) {
    if (spec.type !== "custom") { await ask(instruction); return; }
    setNotes([]);
    const widget = await ai.custom.mutateAsync({ request: spec.notes.trim(), title: spec.title.trim(), datasetIds: spec.datasetIds });
    setDraft([...draft, widget]);
    setBaseline([...draft, widget]);
    setNotes([`The AI wrote and ran a Python script for “${widget.title}”. Open “Built by an AI-written Python script” on the tile to read it.`]);
  }

  async function saveEdits() {
    await save.mutateAsync(writeFields({ widgets: draft, name, slicers }));
    setNotes([]);
    setMode("view");
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/dashboards" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Dashboards</Link>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {editing ? <input aria-label="Dashboard name" value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full max-w-md rounded-md border bg-surface px-2.5 text-lg font-semibold outline-none focus:border-border-strong" /> : <h1 className="truncate text-xl font-semibold tracking-tight">{dashboard.name}</h1>}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", dashboard.status === "published" ? "border-emerald-400/30 text-emerald-300" : "")}>{dashboard.status === "published" ? "Published to team" : "Restricted"}</span>
            <span className="rounded border px-1.5 py-0.5 text-[10px]">{ROLE_LABEL[role]}</span>
            {dashboard.sources?.length ? <span className="rounded border px-1.5 py-0.5 text-[10px]" title={dashboard.sources.map((source) => source.name).join(", ")}>Google Drive{dashboard.refresh_minutes ? ` · the server re-syncs every ${dashboard.refresh_minutes} min` : " · re-syncs when opened"}</span> : null}
            <span>{dashboard.owner}</span><span aria-hidden="true">·</span><span>{widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
            {editing ? <span className="text-sky-300">Editing{dirty ? " · unsaved changes" : ""}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button type="button" variant="outline" onClick={() => void checkAndFix().catch(() => undefined)} disabled={!ai.ready || !draft.length || ai.review.isPending}>{ai.review.isPending ? <LoaderCircle className="animate-spin" /> : <Wand2 />}{ai.review.isPending ? "Checking…" : "AI check & fix"}</Button>
              <Button type="button" variant="outline" onClick={() => { setNotes([]); setMode("view"); }}><Undo2 />Discard</Button>
              <Button type="button" onClick={saveEdits} disabled={!dirty || !name.trim() || save.isPending}><Save />Save changes</Button>
            </>
          ) : (
            <>
              {isOwner ? <Button type="button" variant="outline" onClick={() => setShareOpen(true)}><Share2 />Share</Button> : null}
              {canEdit ? <Button type="button" onClick={() => setMode("edit")}><Pencil />Edit</Button> : null}
            </>
          )}
        </div>
      </header>
      {isOwner ? (
        <ShareDialog
          open={shareOpen} onOpenChange={setShareOpen} status={dashboard.status} shares={dashboard.shares ?? []} saving={save.isPending}
          onChange={(next) => save.mutate(writeFields({ status: next.status, shares: next.shares }))}
        />
      ) : null}

      <div className="space-y-4">
        {canEdit ? (
          <Section title="Ask the AI" hint="Describe any change in plain words" tone="ai" icon={<Wand2 className="size-4" />}>
            <AskAiBar
              label="Ask AI to change this dashboard"
              placeholder="Ask for any change, e.g. add a pie of revenue by region, or show the top 3 regions as a share of revenue"
              busy={ai.tune.isPending}
              disabled={!ai.ready || !datasets.length}
              error={messageOf(ai.tune.error)}
              suggestions={suggestions.length ? suggestions : CHANGES}
              onSubmit={ask}
            />
            <AiNotes notes={notes} title="What the AI did" />
            {ai.review.isError ? <p role="alert" className="mt-2 text-xs text-red-300">The AI check failed. Try again.</p> : null}
          </Section>
        ) : null}

        {editing ? (
          <Section title="Add a tile yourself" hint="Pick a type, see what it needs. The AI builds it from your answers." tone="manual" icon={<PencilRuler className="size-4" />} collapsible defaultOpen>
            <ManualComposer datasets={usedDatasets.length ? usedDatasets : datasets} busy={ai.custom.isPending || ai.tune.isPending} error={messageOf(ai.custom.error)} onBuild={buildTile} />
          </Section>
        ) : null}

        {usedDatasets.length > 1 && canEdit ? (
          <Section title="Datasets together" hint="Where the files overlap or disagree" tone="data" icon={<Merge className="size-4" />}>
            <DatasetRelationsPanel datasets={usedDatasets} relations={relations.data} loading={relations.isFetching && !relations.data} failed={relations.isError} policy={activePolicy} onPolicy={setPolicy} />
          </Section>
        ) : null}

        <Section title="Dashboard" hint={`${widgets.length} widget${widgets.length === 1 ? "" : "s"}${editing ? " · drag to rearrange" : ""}`} tone="canvas" icon={<LayoutDashboard className="size-4" />}>
          {widgets.length ? (
            <DataStatus
              checkedAt={hydrated.checkedAt} dataChangedAt={hydrated.dataChangedAt} refreshing={hydrated.refreshing} syncIssue={hydrated.syncIssue}
              refreshMinutes={dashboard.refresh_minutes ?? 0} onRefresh={() => void hydrated.refresh()}
              onRefreshMinutes={canEdit ? (minutes) => save.mutate(writeFields({ refresh_minutes: minutes })) : undefined}
            />
          ) : null}
          {editing ? <div className="mt-3"><HandEdits changes={changes} busy={ai.tune.isPending} disabled={!ai.ready} error={messageOf(ai.tune.error)} onHandOver={() => void ask(editsInstruction(changes)).catch(() => undefined)} /></div> : null}
          {widgets.length ? <div className="mt-3"><FilterBar datasets={datasets.filter((dataset) => widgets.some((widget) => usedDatasetIds([widget]).includes(dataset.id)))} slicers={shownSlicers} onSlicersChange={setSlicers} filters={filters} onFiltersChange={setFilters} readOnlySlicers={!editing} /></div> : null}
          {hydrated.loadingRows ? <p className="mb-2 text-[11px] text-muted-foreground">Loading full dataset rows…</p> : hydrated.truncated ? <p className="mb-2 text-[11px] text-muted-foreground">Charts use the first 6,000 rows of large datasets.</p> : null}
          {widgets.length ? (
            <div className="grid grid-flow-dense gap-3 md:grid-cols-3">
              {widgets.map((widget) => (
                <WidgetCard key={widget.id} widget={widget} span={spans[widget.id]} filters={filters} onSelect={(column, value) => setFilters(toggleFilter(filters, column, value))} dataset={datasetFor(widget)} editable={editing} reorder={editing ? reorder(widget.id) : undefined} onChange={(next) => setDraft(draft.map((item) => (item.id === next.id ? next : item)))} onRemove={() => setDraft(draft.filter((item) => item.id !== widget.id))} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed px-6 py-14 text-center">
              <Eye className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
              <p className="mt-3 text-sm font-medium">This dashboard has no widgets yet</p>
              <p className="mt-1 text-xs text-muted-foreground">{canEdit ? "Describe what you want in the box above, or choose Edit and add a tile." : "The owner has not added any widgets."}</p>
            </div>
          )}
        </Section>
      </div>

      {isOwner && !editing ? (
        <div className="mt-10 border-t pt-4">
          <button type="button" onClick={() => { if (window.confirm(`Delete “${dashboard.name}”? This cannot be undone.`)) remove.mutate(dashboard.id, { onSuccess: () => router.push("/dashboards") }); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-300"><Trash2 className="size-3.5" />Delete dashboard</button>
        </div>
      ) : null}
    </section>
  );
}
