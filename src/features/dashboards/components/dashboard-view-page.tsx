"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Eye, LayoutDashboard, LoaderCircle, Merge, Pencil, PencilRuler, Radio, Save, Share2, Trash2, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DriveBrowserDialog } from "@/features/connectors/components/drive-browser-dialog";
import { cn } from "@/lib/utils";
import { dashboardKeys, useDashboard, useDashboardAi, useDatasetRelations, useDeleteDashboard, useHydratedDatasets, useSaveDashboard } from "../use-dashboards";
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
import { DatasetsPanel } from "./datasets-panel";
import { HandEdits } from "./hand-edits";
import { ManualComposer } from "./manual-composer";
import { Section } from "./section";
import { WidgetEditor } from "./widget-editor";
import { downloadJson, fileSafe } from "@/lib/download";
import { ShareDialog } from "./share-dialog";

const WidgetCard = dynamic(() => import("./widget-card").then((m) => m.WidgetCard), { ssr: false });

/** edit: canvas with the datasets / widget editor / Ask AI panel. preview: the finished look, not live. view: the clean published dashboard. */
type Mode = "edit" | "preview" | "view";
const CHANGES = ["Add a table of the top rows", "Make the charts wider", "Add a filter for the main category"];
const messageOf = (error: unknown) => (error ? (error instanceof Error ? error.message : "The AI could not do that.") : null);
const SCHEDULES = [{ value: 5, label: "Every 5 minutes" }, { value: 15, label: "Every 15 minutes" }, { value: 60, label: "Every hour" }];

export function DashboardViewPage({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const dashboardQuery = useDashboard(dashboardId);
  const save = useSaveDashboard();
  const remove = useDeleteDashboard();
  const dashboard = dashboardQuery.data;
  const [chosenMode, setMode] = useState<Mode | null>(null);
  const [draft, setDraft] = useState<DashboardWidget[]>([]);
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [syncedKey, setSyncedKey] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [slicers, setSlicers] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({});
  const [shareOpen, setShareOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [schedule, setSchedule] = useState(15);
  const [baseline, setBaseline] = useState<DashboardWidget[]>([]);
  const [policy, setPolicy] = useState<ConflictPolicy>(defaultPolicy);
  const ai = useDashboardAi();

  const role = dashboard ? roleOf(dashboard) : "viewer";
  const isOwner = role === "owner";
  const canEdit = role !== "viewer";
  const published = dashboard?.status === "published";
  const mode: Mode = !canEdit ? "view" : chosenMode ?? (published ? "view" : "edit");
  const editing = mode === "edit";
  const live = Boolean(published) && mode === "view";

  const usedIds = usedDatasetIds([...(dashboard?.widgets ?? []), ...draft]);
  const attached = [...new Set([...attachedIds, ...usedIds])];
  const hydrated = useHydratedDatasets(attached, live ? dashboard?.refresh_minutes ?? 0 : 0);
  const datasets = hydrated.datasets;
  const dirty = Boolean(dashboard) && (name !== dashboard?.name || JSON.stringify(draft) !== JSON.stringify(dashboard?.widgets) || JSON.stringify(slicers) !== JSON.stringify(dashboard?.slicers ?? []) || JSON.stringify([...attachedIds].sort()) !== JSON.stringify([...(dashboard?.dataset_ids ?? [])].sort()));

  useEffect(() => {
    if (!dashboard) return;
    const key = `${dashboard.id}:${dashboard.updated_at}`;
    if (key === syncedKey || (syncedKey.startsWith(`${dashboard.id}:`) && dirty)) return;
    setSyncedKey(key); setDraft(dashboard.widgets); setBaseline(dashboard.widgets); setName(dashboard.name); setSlicers(dashboard.slicers ?? []); setAttachedIds(dashboard.dataset_ids ?? []);
  }, [dashboard, syncedKey, dirty]);

  const reorder = useReorder(draft, setDraft);
  const attachedDatasets = datasets.filter((dataset) => attached.includes(dataset.id));
  const relations = useDatasetRelations(attachedDatasets.map((dataset) => dataset.id));
  const activePolicy: ConflictPolicy = policy.kind === "prefer" && !attachedDatasets.some((dataset) => dataset.id === policy.datasetId) ? defaultPolicy : policy;
  const context = policyContext(activePolicy, attachedDatasets, relations.data);

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

  const widgets = editing || mode === "preview" ? draft : dashboard.widgets;
  const shownSlicers = editing || mode === "preview" ? slicers : dashboard.slicers ?? [];
  const spans = packedSpans(widgets);
  const changes = editing ? describeChanges(baseline, draft) : [];
  const usage = Object.fromEntries(attached.map((id) => [id, draft.filter((widget) => usedDatasetIds([widget]).includes(id)).length]));
  const openWidget = editing ? draft.find((widget) => widget.id === openId) : undefined;
  const datasetFor = (widget: DashboardWidget) => datasets.find((dataset) => dataset.id === widget.dataset_id);
  const writeFields = (overrides: Partial<Pick<Dashboard, "status" | "pinned" | "refresh_minutes">> & { widgets?: DashboardWidget[]; name?: string; slicers?: string[]; datasetIds?: string[]; shares?: Array<{ user_id: string; role: "viewer" | "editor" }> }) => ({
    id: dashboard.id, name: overrides.name ?? dashboard.name, description: dashboard.description,
    dataset_ids: [...new Set([...usedDatasetIds(overrides.widgets ?? dashboard.widgets), ...(overrides.datasetIds ?? dashboard.dataset_ids ?? [])])],
    widgets: overrides.widgets ?? dashboard.widgets, slicers: overrides.slicers ?? dashboard.slicers, status: overrides.status, pinned: overrides.pinned,
    refresh_minutes: overrides.refresh_minutes, shares: overrides.shares,
  });
  const change = (next: DashboardWidget) => setDraft(draft.map((item) => (item.id === next.id ? next : item)));
  const attach = (ids: string[]) => setAttachedIds((items) => [...new Set([...items, ...ids])]);

  /** After an upload or import: whatever is new in the Library is attached to this dashboard. */
  async function attachNew() {
    const before = new Set(datasets.map((dataset) => dataset.id));
    await client.invalidateQueries({ queryKey: dashboardKeys.datasets });
    const result = await hydrated.refetch();
    attach((result.data ?? []).filter((dataset) => !before.has(dataset.id)).map((dataset) => dataset.id));
  }

  async function checkAndFix() {
    const used = datasets.filter((dataset) => usedDatasetIds(draft).includes(dataset.id));
    const result = await ai.review.mutateAsync({ widgets: draft, datasets: used });
    setDraft(result.widgets);
    setBaseline(result.widgets);
    setNotes(result.notes.length ? result.notes : ["No problems found."]);
  }

  /** Any change in plain words; it lands in the draft so it can be saved or discarded. */
  async function ask(text: string) {
    setNotes([]);
    const result = await ai.tune.mutateAsync({ instruction: text, widgets: draft, slicers, name, datasets: (attachedDatasets.length ? attachedDatasets : datasets).slice(0, 8), context });
    setDraft(result.widgets);
    setBaseline(result.widgets);
    setSlicers(result.slicers ?? slicers);
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
    setNotes([`The AI wrote and ran a Python script for “${widget.title}”. Open the tile’s Edit to read or change it.`]);
  }

  async function saveEdits() {
    await save.mutateAsync(writeFields({ widgets: draft, name, slicers, datasetIds: attachedIds }));
    setNotes([]);
  }

  async function publish() {
    await save.mutateAsync(writeFields({ widgets: draft, name, slicers, datasetIds: attachedIds, status: "published", refresh_minutes: schedule }));
    setPublishOpen(false);
    setOpenId(null);
    setMode("view");
  }

  function discard() {
    setDraft(dashboard!.widgets); setBaseline(dashboard!.widgets); setName(dashboard!.name); setSlicers(dashboard!.slicers ?? []); setAttachedIds(dashboard!.dataset_ids ?? []);
    setNotes([]); setOpenId(null);
    if (published) setMode("view");
  }

  const canvas = (
    <Section title="Dashboard" hint={mode === "view" ? undefined : `${widgets.length} widget${widgets.length === 1 ? "" : "s"}${editing ? " · drag to rearrange" : ""}`} tone="canvas" icon={<LayoutDashboard className="size-4" />}
      actions={editing && draft.length ? <Button type="button" variant="outline" size="sm" onClick={() => void checkAndFix().catch(() => undefined)} disabled={!ai.ready || ai.review.isPending}>{ai.review.isPending ? <LoaderCircle className="animate-spin" /> : <Wand2 />}{ai.review.isPending ? "Checking…" : "AI check & fix"}</Button> : undefined}>
      {live && widgets.length ? (
        <DataStatus
          checkedAt={hydrated.checkedAt} dataChangedAt={hydrated.dataChangedAt} refreshing={hydrated.refreshing} syncIssue={hydrated.syncIssue}
          refreshMinutes={dashboard.refresh_minutes ?? 0} onRefresh={() => void hydrated.refresh()}
        />
      ) : null}
      {editing ? <HandEdits changes={changes} busy={ai.tune.isPending} disabled={!ai.ready} error={messageOf(ai.tune.error)} onHandOver={() => void ask(editsInstruction(changes)).catch(() => undefined)} /> : null}
      {widgets.length ? <div className="mt-3"><FilterBar datasets={datasets.filter((dataset) => widgets.some((widget) => usedDatasetIds([widget]).includes(dataset.id)))} slicers={shownSlicers} onSlicersChange={setSlicers} filters={filters} onFiltersChange={setFilters} readOnlySlicers={!editing} /></div> : null}
      {hydrated.loadingRows ? <p className="mb-2 text-[11px] text-muted-foreground">Loading full dataset rows…</p> : hydrated.truncated ? <p className="mb-2 text-[11px] text-muted-foreground">Charts use the first 6,000 rows of large datasets.</p> : null}
      {widgets.length ? (
        <div className={cn("grid grid-flow-dense gap-3 md:grid-cols-3", editing && "mt-3")}>
          {widgets.map((widget) => (
            <WidgetCard key={widget.id} widget={widget} span={spans[widget.id]} filters={filters} onSelect={(column, value) => setFilters(toggleFilter(filters, column, value))} dataset={datasetFor(widget)} editable={editing} reorder={editing ? reorder(widget.id) : undefined} onChange={change} onRemove={() => { setDraft(draft.filter((item) => item.id !== widget.id)); if (openId === widget.id) setOpenId(null); }} onOpen={editing ? () => setOpenId(widget.id) : undefined} active={editing && openId === widget.id} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <Eye className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">This dashboard has no widgets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">{canEdit ? "Ask the AI in the panel on the right to build something, or add a tile yourself." : "The owner has not added any widgets."}</p>
        </div>
      )}
    </Section>
  );

  return (
    <section className={cn("mx-auto w-full px-4 py-6 sm:px-6 lg:px-8", editing ? "max-w-[96rem]" : "max-w-6xl")}>
      <Link href="/dashboards" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Dashboards</Link>
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? <input aria-label="Dashboard name" value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full max-w-md rounded-md border bg-surface px-2.5 text-lg font-semibold outline-none focus:border-border-strong" /> : <h1 className="truncate text-xl font-semibold tracking-tight">{mode === "preview" ? name : dashboard.name}</h1>}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
            {published ? <span className="inline-flex items-center gap-1 rounded border border-emerald-400/30 px-1.5 py-0.5 text-[10px] text-emerald-300"><Radio className="size-3" />Published · live</span> : <span className="rounded border px-1.5 py-0.5 text-[10px]">Draft</span>}
            {!isOwner ? <span className="rounded border px-1.5 py-0.5 text-[10px]">{role === "editor" ? "Can edit" : "View only"}</span> : null}
            <span>{dashboard.owner}</span>
            {editing && dirty ? <span className="text-sky-300">· unsaved changes</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {mode === "view" ? (
            <>
              <Button type="button" variant="outline" onClick={() => downloadJson(fileSafe(dashboard.name), { name: dashboard.name, description: dashboard.description, slicers: dashboard.slicers, widgets: dashboard.widgets })}><Download />Export</Button>
              {isOwner ? <Button type="button" variant="outline" onClick={() => setShareOpen(true)}><Share2 />Share</Button> : null}
              {canEdit ? <Button type="button" onClick={() => setMode("edit")}><Pencil />Edit</Button> : null}
            </>
          ) : mode === "preview" ? (
            <>
              <Button type="button" variant="outline" onClick={() => setMode("edit")}><Pencil />Back to editing</Button>
              {isOwner && !published ? <Button type="button" onClick={() => setPublishOpen(true)} disabled={!draft.length || !name.trim()}><Radio />Publish</Button> : null}
            </>
          ) : (
            <>
              {dirty ? <Button type="button" variant="outline" onClick={discard}><Undo2 />Discard</Button> : null}
              <Button type="button" variant="outline" onClick={() => { setOpenId(null); setMode("preview"); }} disabled={!draft.length}><Eye />Preview</Button>
              <Button type="button" variant="outline" onClick={() => void saveEdits()} disabled={!dirty || !name.trim() || save.isPending}><Save />Save changes</Button>
              {isOwner && !published ? <Button type="button" onClick={() => setPublishOpen(true)} disabled={!draft.length || !name.trim()}><Radio />Publish</Button> : null}
              {published ? <Button type="button" onClick={() => { void (dirty ? saveEdits() : Promise.resolve()).then(() => setMode("view")); }} disabled={save.isPending}>Done</Button> : null}
            </>
          )}
        </div>
      </header>

      {mode === "preview" ? (
        <p role="status" className="mb-4 rounded-lg border border-sky-400/30 bg-sky-400/5 px-3 py-2 text-xs text-sky-200">Preview: this is how the dashboard will look. It shows the data as last saved and does not refresh. {published ? "" : "Publish it to keep it up to date on a schedule."}</p>
      ) : null}
      {mode === "view" && !published && canEdit ? <p role="status" className="mb-4 rounded-lg border px-3 py-2 text-xs text-muted-foreground">This is a draft. It does not refresh until you publish it.</p> : null}

      {isOwner ? (
        <ShareDialog
          open={shareOpen} onOpenChange={setShareOpen} status={dashboard.status} shares={dashboard.shares ?? []} saving={save.isPending}
          onChange={(next) => save.mutate(writeFields({ status: next.status, shares: next.shares }))}
        />
      ) : null}
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-md p-5">
          <DialogTitle className="text-sm font-semibold">Publish “{name || dashboard.name}”</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">A published dashboard is live: it re-reads its data on a schedule and the team can open it. Drafts and previews never refresh.</DialogDescription>
          <label className="mt-4 block text-xs font-medium">Update the data
            <select aria-label="Update schedule" value={schedule} onChange={(event) => setSchedule(Number(event.target.value))} className="mt-1.5 h-9 w-full rounded-md border bg-surface px-2 text-sm font-normal">
              {SCHEDULES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          {save.isError ? <p role="alert" className="mt-2 text-xs text-red-300">Could not publish. Try again.</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="button" onClick={() => void publish().catch(() => undefined)} disabled={save.isPending}>{save.isPending ? <LoaderCircle className="animate-spin" /> : <Radio />}Publish dashboard</Button>
          </div>
        </DialogContent>
      </Dialog>

      {editing ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_23rem]">
          <div className="min-w-0 space-y-4">
            {attachedDatasets.length > 1 ? (
              <Section title="Datasets together" hint="Where the files overlap or disagree" tone="data" icon={<Merge className="size-4" />}>
                <DatasetRelationsPanel datasets={attachedDatasets} relations={relations.data} loading={relations.isFetching && !relations.data} failed={relations.isError} policy={activePolicy} onPolicy={setPolicy} />
              </Section>
            ) : null}
            {canvas}
            {isOwner ? (
              <div className="border-t pt-4">
                <button type="button" onClick={() => { if (window.confirm(`Delete “${dashboard.name}”? This cannot be undone.`)) remove.mutate(dashboard.id, { onSuccess: () => router.push("/dashboards") }); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-300"><Trash2 className="size-3.5" />Delete dashboard</button>
              </div>
            ) : null}
          </div>
          <aside aria-label="Dashboard tools" className="space-y-3 self-start lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1">
            <DatasetsPanel
              attached={attachedDatasets} library={datasets} usage={usage}
              onAttach={(id) => attach([id])} onDetach={(id) => setAttachedIds((items) => items.filter((item) => item !== id))}
              onUploaded={() => void attachNew()} onDrive={() => setDriveOpen(true)}
            />
            {openWidget ? <WidgetEditor widget={openWidget} datasets={attachedDatasets.length ? attachedDatasets : datasets} onChange={change} onRemove={() => { setDraft(draft.filter((item) => item.id !== openWidget.id)); setOpenId(null); }} onClose={() => setOpenId(null)} /> : null}
            <Section title="Add a tile yourself" hint="Pick a type; the AI builds it" tone="manual" icon={<PencilRuler className="size-4" />} collapsible defaultOpen={false}>
              <ManualComposer datasets={attachedDatasets.length ? attachedDatasets : datasets} busy={ai.custom.isPending || ai.tune.isPending} error={messageOf(ai.custom.error)} onBuild={buildTile} />
            </Section>
            <Section title="Ask the AI" hint="Describe any change in plain words" tone="ai" icon={<Wand2 className="size-4" />}>
              <AskAiBar
                label="Ask AI to change this dashboard"
                placeholder="e.g. add a pie of revenue by region, or show the top 3 regions as a share of revenue"
                busy={ai.tune.isPending}
                disabled={!ai.ready || !datasets.length}
                error={messageOf(ai.tune.error)}
                suggestions={suggestions.length ? suggestions : CHANGES}
                onSubmit={ask}
              />
              <AiNotes notes={notes} title="What the AI did" />
              {ai.review.isError ? <p role="alert" className="mt-2 text-xs text-red-300">The AI check failed. Try again.</p> : null}
            </Section>
          </aside>
        </div>
      ) : canvas}

      <DriveBrowserDialog open={driveOpen} onOpenChange={setDriveOpen} target={{ scopeType: "library", scopeId: "library", label: "your Library" }} onReauth={() => router.push("/extensions")} onImported={() => void attachNew()} />
    </section>
  );
}
