"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSqlTables } from "@/lib/api";
import { generatedSql } from "../logic/sql";
import { ArrowLeft, BookOpen, Check, Database, Download, Info, Eye, LayoutDashboard, LoaderCircle, Merge, Pencil, Radio, Save, Share2, Trash2, Undo2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DriveBrowserDialog } from "@/features/connectors/components/drive-browser-dialog";
import { cn } from "@/lib/utils";
import { dashboardKeys, useDashboard, useDashboardAi, useDatasetRelations, useDeleteDashboard, useHydratedDatasets, useSaveDashboard } from "../use-dashboards";
import { defaultPolicy, describeChanges, editsInstruction, policyContext } from "../logic/manual";
import type { ConflictPolicy } from "../logic/manual";
import { resolveLayouts, settle } from "../logic/grid";
import type { Layouts } from "../logic/grid";
import { roleOf, usedDatasetIds } from "../types";
import type { Dashboard, DashboardMeasure, DashboardWidget, DatasetLite, Filters } from "../types";
import { MeasuresContext } from "../measures-context";
import { MeasuresPanel } from "./measures-panel";
import { categoryColumns, numberLikeColumns, numericColumns } from "../logic/aggregate";
import { AiNotes } from "./ai-notes";
import { AskAiBar } from "./ask-ai-bar";
import { DataStatus } from "./data-status";
import { DatasetRelationsPanel } from "./dataset-relations";
import { DatasetsPanel, WidgetInfo } from "./datasets-panel";
import { GridCanvas } from "./grid-canvas";
import { HandEdits } from "./hand-edits";
import { Section } from "./section";
import { WidgetEditor } from "./widget-editor";
import { downloadJson, fileSafe } from "@/lib/download";
import { ShareDialog } from "./share-dialog";

import { QuickEdit } from "./quick-edit";

const WidgetCard = dynamic(() => import("./widget-card").then((m) => m.WidgetCard), { ssr: false });

/** edit: canvas with the datasets / widget editor / Ask AI panel. preview: the finished look, not live. view: the clean published dashboard. */
type Mode = "edit" | "preview" | "view";
const messageOf = (error: unknown) => (error ? (error instanceof Error ? error.message : "The AI could not do that.") : null);
/** Published dashboards are live: they re-read their data every minute. There is no schedule to pick. */
const LIVE_MINUTES = 1;

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
  const [unlocked, setUnlocked] = useState(false);
  /** Preview reloads the data once when opened and then holds that moment; only a published dashboard keeps updating. */
  const [previewAt, setPreviewAt] = useState<Date | null>(null);
  /** An AI answer waiting for the user: previewed on the canvas, applied only on Accept. */
  const [pending, setPending] = useState<{ widgets: DashboardWidget[]; slicers?: string[]; name?: string; notes: string[] } | null>(null);
  /** The user's edits to the code of tiles the AI added or changed, by widget id. */
  const [pendingCode, setPendingCode] = useState<Record<string, string>>({});
  const [quickId, setQuickId] = useState<string | null>(null);
  /** The tile whose details (data, tables, query) are shown while not editing. */
  const [infoId, setInfoId] = useState<string | null>(null);
  /** Which view the right panel shows. */
  const [side, setSide] = useState<"datasets" | "library" | "info" | "edit">("datasets");
  const [fill, setFill] = useState<{ text: string; n: number }>();
  const [panelWidth, setPanelWidth] = usePanelWidth();
  const [name, setName] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [slicers, setSlicers] = useState<string[]>([]);
  const [measures, setMeasures] = useState<DashboardMeasure[]>([]);
  const filters: Filters = {};
  const [shareOpen, setShareOpen] = useState(false);
  const [driveOpen, setDriveOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
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
  const hydrated = useHydratedDatasets(attached, live ? LIVE_MINUTES : 0);
  const datasets = hydrated.datasets;
  const sqlTables = useQuery({ queryKey: ["sql-tables", attached], queryFn: () => getSqlTables(attached), enabled: chosenMode !== "view" && attached.length > 0, staleTime: 60_000, retry: false });
  const dirty = Boolean(dashboard) && (name !== dashboard?.name || JSON.stringify(draft) !== JSON.stringify(dashboard?.widgets) || JSON.stringify(slicers) !== JSON.stringify(dashboard?.slicers ?? []) || JSON.stringify([...attachedIds].sort()) !== JSON.stringify([...(dashboard?.dataset_ids ?? [])].sort()) || JSON.stringify(measures) !== JSON.stringify(dashboard?.measures ?? []));

  useEffect(() => {
    if (!dashboard) return;
    const key = `${dashboard.id}:${dashboard.updated_at}`;
    if (key === syncedKey || (syncedKey.startsWith(`${dashboard.id}:`) && dirty)) return;
    setSyncedKey(key); setDraft(dashboard.widgets); setBaseline(dashboard.widgets); setName(dashboard.name); setSlicers(dashboard.slicers ?? []); setAttachedIds(dashboard.dataset_ids ?? []); setMeasures(dashboard.measures ?? []);
  }, [dashboard, syncedKey, dirty]);

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
  const layouts = resolveLayouts(widgets);
  const setLayouts = (next: Layouts) => setDraft(draft.map((item) => (next[item.id] ? { ...item, layout: next[item.id] } : item)));
  const tools = editing && unlocked;
  const changes = editing ? describeChanges(baseline, draft) : [];
  const usage = Object.fromEntries(attached.map((id) => [id, draft.filter((widget) => usedDatasetIds([widget]).includes(id)).length]));
  const openWidget = editing ? draft.find((widget) => widget.id === openId) : undefined;
  const infoWidget = widgets.find((widget) => widget.id === infoId);
  const datasetFor = (widget: DashboardWidget) => datasets.find((dataset) => dataset.id === widget.dataset_id);
  const writeFields = (overrides: Partial<Pick<Dashboard, "status" | "pinned" | "refresh_minutes">> & { widgets?: DashboardWidget[]; name?: string; slicers?: string[]; datasetIds?: string[]; shares?: Array<{ user_id: string; role: "viewer" | "editor" }> }) => ({
    id: dashboard.id, name: overrides.name ?? dashboard.name, description: dashboard.description,
    dataset_ids: [...new Set([...usedDatasetIds(overrides.widgets ?? dashboard.widgets), ...(overrides.datasetIds ?? dashboard.dataset_ids ?? [])])],
    widgets: overrides.widgets ?? dashboard.widgets, slicers: overrides.slicers ?? dashboard.slicers, status: overrides.status, pinned: overrides.pinned,
    refresh_minutes: overrides.refresh_minutes, shares: overrides.shares,
  });
  const change = (next: DashboardWidget) => setDraft(draft.map((item) => (item.id === next.id ? next : item)));
  const attach = (ids: string[]) => setAttachedIds((items) => [...new Set([...items, ...ids])]);
  /** In the published view there is no Save button, so an added dataset is saved straight away. */
  const addDatasets = (ids: string[]) => {
    if (!ids.length) return;
    if (mode !== "view") { attach(ids); return; }
    const next = [...new Set([...(dashboard.dataset_ids ?? []), ...ids])];
    setAttachedIds(next);
    void save.mutateAsync(writeFields({ datasetIds: next }));
  };

  /** After an upload or import: whatever is new in the Library is attached to this dashboard. */
  async function attachNew() {
    const before = new Set(datasets.map((dataset) => dataset.id));
    await client.invalidateQueries({ queryKey: dashboardKeys.datasets });
    const result = await hydrated.refetch();
    addDatasets((result.data ?? []).filter((dataset) => !before.has(dataset.id)).map((dataset) => dataset.id));
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
  }

  /** Any change in plain words comes back as a suggestion: previewed on the dashboard, with each touched tile's code editable. */
  async function suggest(text: string) {
    setNotes([]);
    if (mode !== "edit") setMode("edit");
    const result = await ai.tune.mutateAsync({ instruction: text, widgets: draft, slicers, name, datasets: (attachedDatasets.length ? attachedDatasets : datasets).slice(0, 8), context });
    setPending({ widgets: result.widgets, slicers: result.slicers, name: result.name, notes: result.notes });
    setPendingCode({});
    setOpenId(null);
  }

  const meaning = (widget: DashboardWidget | undefined) => widget && JSON.stringify([widget.title, widget.type, widget.dataset_id, widget.x ?? null, widget.y ?? null, widget.agg ?? null, widget.sql ?? null, widget.script ?? null]);
  const touched = pending ? pending.widgets.filter((widget) => meaning(widget) !== meaning(draft.find((item) => item.id === widget.id))) : [];
  const removedCount = pending ? draft.filter((item) => !pending.widgets.some((widget) => widget.id === item.id)).length : 0;
  const codeOf = (widget: DashboardWidget) => {
    if (widget.script !== undefined) return { language: "Python" as const, code: widget.script };
    if (widget.sql !== undefined) return { language: "SQL" as const, code: widget.sql };
    const table = sqlTables.data?.find((entry) => entry.dataset_id === widget.dataset_id)?.table;
    return { language: "SQL" as const, code: table ? generatedSql(widget, table) : "" };
  };
  /** The suggestion with the user's code edits folded in: an edited visual query becomes a SQL tile. */
  const withCode = (widget: DashboardWidget): DashboardWidget => {
    const edited = pendingCode[widget.id];
    if (edited === undefined || edited === codeOf(widget).code) return widget;
    return widget.script !== undefined ? { ...widget, script: edited } : { ...widget, sql: edited };
  };
  const suggested = pending ? pending.widgets.map(withCode) : null;

  function acceptSuggestion() {
    if (!pending || !suggested) return;
    setDraft(suggested);
    setBaseline(suggested);
    if (pending.slicers) setSlicers(pending.slicers);
    if (pending.name) setName(pending.name);
    setNotes(pending.notes.length ? pending.notes : ["Done."]);
    setPending(null);
  }

  /** A tile showing a DAX measure: a number, or a bar chart when grouped by a column. */
  function addMeasureTile(tile: { title: string; dax: string; datasetId: string; x?: string; grain?: DashboardWidget["grain"] }) {
    if (mode !== "edit") setMode("edit");
    const widget: DashboardWidget = { id: `w-dax-${Date.now().toString(36)}`, type: tile.grain ? "line" : tile.x ? "bar" : "kpi", title: tile.title, grain: tile.grain, dataset_id: tile.datasetId, x: tile.x, agg: "sum", span: tile.x ? 2 : 1, dax: tile.dax };
    setDraft((items) => [...items, widget]);
  }

  /** Opens a widget's editor (code included) from anywhere, e.g. the dataset panel. */
  const editWidget = (id: string) => { if (mode !== "edit") setMode("edit"); setUnlocked(true); setSide("edit"); setOpenId(id); };
  /** The header Edit/Done toggle: Edit unlocks the tiles; Done locks them again (and, when published, saves and goes back to the live view). */
  const startEditing = () => { if (mode !== "edit") setMode("edit"); setUnlocked(true); };
  const finishEditing = () => {
    setUnlocked(false); setOpenId(null); setQuickId(null);
    if (published) void (dirty ? saveEdits() : Promise.resolve()).then(() => setMode("view"));
  };

  async function saveEdits() {
    await save.mutateAsync({ ...writeFields({ widgets: draft, name, slicers, datasetIds: attachedIds }), measures });
    setNotes([]);
  }

  async function publish() {
    await save.mutateAsync({ ...writeFields({ widgets: draft, name, slicers, datasetIds: attachedIds, status: "published", refresh_minutes: LIVE_MINUTES }), measures });
    setPublishOpen(false);
    setOpenId(null);
    setMode("view");
  }

  function discard() {
    setDraft(dashboard!.widgets); setBaseline(dashboard!.widgets); setName(dashboard!.name); setSlicers(dashboard!.slicers ?? []); setAttachedIds(dashboard!.dataset_ids ?? []); setMeasures(dashboard!.measures ?? []);
    setNotes([]); setOpenId(null);
    if (published) setMode("view");
  }

  const canvas = (
    <Section title="Dashboard" hint={mode === "view" ? undefined : `${widgets.length} widget${widgets.length === 1 ? "" : "s"}${tools ? " · drag the grip to move, the corner to resize" : editing ? " · press Edit to change tiles" : ""}`} tone="canvas" icon={<LayoutDashboard className="size-4" />}
      actions={editing && draft.length ? <Button type="button" variant="outline" size="sm" onClick={() => void checkAndFix().catch(() => undefined)} disabled={!ai.ready || ai.review.isPending}>{ai.review.isPending ? <LoaderCircle className="animate-spin" /> : <Wand2 />}{ai.review.isPending ? "Checking…" : "AI check & fix"}</Button> : undefined}>
      {editing ? <HandEdits changes={changes} busy={ai.tune.isPending} disabled={!ai.ready} error={messageOf(ai.tune.error)} onHandOver={() => void ask(editsInstruction(changes)).catch(() => undefined)} /> : null}
      {hydrated.loadingRows ? <p className="mb-2 text-[11px] text-muted-foreground">Loading full dataset rows…</p> : hydrated.truncated ? <p className="mb-2 text-[11px] text-muted-foreground">Charts use the first 6,000 rows of large datasets.</p> : null}
      {widgets.length ? (
        <div className={cn(editing && "mt-3")}>
          <GridCanvas
            widgets={suggested ?? widgets} layouts={suggested ? resolveLayouts(suggested) : layouts} unlocked={tools && !suggested} onLayouts={setLayouts}
            render={(widget, handle) => (
              <div className="relative h-full">
                <WidgetCard widget={widget} filters={filters} onSelect={() => undefined} dataset={datasetFor(widget)} editable={tools} handle={handle} onChange={change} onRemove={() => { setDraft(draft.filter((item) => item.id !== widget.id)); if (openId === widget.id) setOpenId(null); }} onOpen={tools ? () => { setOpenId(widget.id); setSide("edit"); } : panel ? () => { setInfoId(widget.id); setSide("info"); } : undefined} onQuickEdit={tools ? () => setQuickId(widget.id) : undefined} active={tools && openId === widget.id} />
                {tools && quickId === widget.id && layouts[widget.id] ? (
                  <QuickEdit
                    widget={widget} dataset={datasetFor(widget)} layout={layouts[widget.id]}
                    onLayout={(next) => setLayouts(settle({ ...layouts, [widget.id]: next }, widget.id))}
                    onChange={change}
                    onMore={() => { setQuickId(null); setOpenId(widget.id); }}
                    onClose={() => setQuickId(null)}
                  />
                ) : null}
              </div>
            )}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <Eye className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">This dashboard has no widgets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">{canEdit ? "Ask the AI in the panel on the right to build something, or press Edit to add a tile yourself." : "The owner has not added any widgets."}</p>
        </div>
      )}
    </Section>
  );

  const panel = editing || mode === "view";
  return (
    <MeasuresContext.Provider value={{ measures, datasetIds: attachedIds }}>
    <div className="flex flex-col xl:min-h-0 xl:flex-1 xl:flex-row">
      <section className="min-w-0 xl:flex-1 xl:overflow-y-auto">
        <div className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <Link href="/dashboards" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Dashboards</Link>
          <div className="ml-auto flex items-center gap-2">
            {mode === "preview" && previewAt ? <span className="text-[11px] text-muted-foreground">Snapshot of the data at {previewAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span> : null}
            {editing ? <Button type="button" variant="outline" onClick={() => { setOpenId(null); setPreviewAt(new Date()); void hydrated.refetch(); setMode("preview"); }} disabled={!draft.length}><Eye />Preview</Button> : null}
            {mode === "preview" ? <Button type="button" variant="outline" onClick={() => setMode("edit")}><Pencil />Back to editing</Button> : null}
            {mode !== "view" && isOwner && !published ? <Button type="button" onClick={() => setPublishOpen(true)} disabled={!draft.length || !name.trim()}><Radio />Publish</Button> : null}
          </div>
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      {live ? (
        <div role="status" aria-label="Dashboard status" className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">
          <Radio className="size-3.5" />
          <span className="font-medium">Published</span>
          <DataStatus live checkedAt={hydrated.checkedAt} dataChangedAt={hydrated.dataChangedAt} syncIssue={hydrated.syncIssue} />
        </div>
      ) : null}
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {editing ? <input aria-label="Dashboard name" value={name} onChange={(event) => setName(event.target.value)} style={{ width: `${Math.min(Math.max(name.length, 10) + 3, 60)}ch` }} className="h-9 max-w-full rounded-md border bg-surface px-2.5 text-lg font-semibold outline-none focus:border-border-strong" /> : <h1 className="truncate text-xl font-semibold tracking-tight">{mode === "preview" ? name : dashboard.name}</h1>}
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
              {canEdit ? <Button type="button" variant="outline" aria-pressed={false} onClick={startEditing}><Pencil />Edit</Button> : null}
            </>
          ) : mode === "preview" ? null : (
            <>
              {dirty ? <Button type="button" variant="outline" onClick={discard}><Undo2 />Discard</Button> : null}
              {unlocked || published
                ? <Button type="button" aria-pressed onClick={finishEditing} disabled={save.isPending}><Check />Done</Button>
                : <Button type="button" variant="outline" aria-pressed={false} onClick={startEditing}><Pencil />Edit</Button>}
              {!published ? <Button type="button" variant="outline" onClick={() => void saveEdits()} disabled={!dirty || !name.trim() || save.isPending}><Save />Save draft</Button> : null}
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
      <Dialog open={publishOpen} onOpenChange={setPublishOpen}>
        <DialogContent className="max-w-md p-5">
          <DialogTitle className="text-sm font-semibold">Publish “{name || dashboard.name}”</DialogTitle>
          <DialogDescription className="mt-1 text-xs text-muted-foreground">Publishing makes the dashboard live: it keeps its data up to date and the team can open it. Drafts and previews never refresh.</DialogDescription>
          {save.isError ? <p role="alert" className="mt-2 text-xs text-red-300">Could not publish. Try again.</p> : null}
          <div className="mt-5 flex justify-end gap-2">
            <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
            <Button type="button" onClick={() => void publish().catch(() => undefined)} disabled={save.isPending}>{save.isPending ? <LoaderCircle className="animate-spin" /> : <Radio />}Publish dashboard</Button>
          </div>
        </DialogContent>
      </Dialog>


          <div className="min-w-0 space-y-4">
            {editing && attachedDatasets.length > 1 ? (
              <Section title="Datasets together" hint="Where the files overlap or disagree" tone="data" icon={<Merge className="size-4" />}>
                <DatasetRelationsPanel datasets={attachedDatasets} relations={relations.data} loading={relations.isFetching && !relations.data} failed={relations.isError} policy={activePolicy} onPolicy={setPolicy} />
              </Section>
            ) : null}
            {canvas}
            {editing && isOwner ? (
              <div className="border-t pt-4">
                <button type="button" onClick={() => { if (window.confirm(`Delete “${dashboard.name}”? This cannot be undone.`)) remove.mutate(dashboard.id, { onSuccess: () => router.push("/dashboards") }); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-300"><Trash2 className="size-3.5" />Delete dashboard</button>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {panel ? (
        <aside aria-label="Dashboard tools" style={{ "--panel-w": `${panelWidth}px` } as CSSProperties} className="relative flex w-full shrink-0 flex-col border-t bg-sidebar text-sidebar-foreground xl:h-full xl:w-[var(--panel-w)] xl:border-l xl:border-t-0">
          <PanelResizer width={panelWidth} onWidth={setPanelWidth} />
          <div role="tablist" aria-label="Side panel" className="flex shrink-0 gap-0.5 border-b p-2">
            {([["datasets", "Datasets", Database], ...(canEdit ? [["library", "Library", BookOpen]] : []), ["info", "Info", Info], ...(canEdit ? [["edit", "Edit", Pencil]] : [])] as Array<["datasets" | "library" | "info" | "edit", string, typeof Pencil]>).map(([value, label, Icon]) => (
              <button key={value} type="button" role="tab" aria-selected={side === value} onClick={() => setSide(value)}
                className={cn("flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs transition-colors", side === value ? "bg-raised font-medium text-foreground" : "text-muted-foreground hover:bg-raised/50 hover:text-foreground")}>
                <Icon className="size-3.5" />{label}
              </button>
            ))}
          </div>
          {canEdit && side === "edit" ? (
            <>
              <div className="flex min-h-0 flex-1 flex-col xl:overflow-y-auto">
                {openWidget ? (
                  <WidgetEditor widget={openWidget} layout={layouts[openWidget.id]} onLayout={(next) => setLayouts(settle({ ...layouts, [openWidget.id]: next }, openWidget.id))} datasets={attachedDatasets.length ? attachedDatasets : datasets} onChange={change} onRemove={() => { setDraft(draft.filter((item) => item.id !== openWidget.id)); setOpenId(null); }} onClose={() => setOpenId(null)} />
                ) : (
                  <>
                    {pending ? (
                      <div aria-label="AI suggestion" className="space-y-3 p-3">
                        <p className="text-xs font-medium">The AI suggests · it is shown on the dashboard. Edit the code if needed, then accept.</p>
                        {pending.notes.length ? <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">{pending.notes.map((note, index) => <li key={index}>{note}</li>)}</ul> : null}
                        {removedCount ? <p className="text-[11px] text-amber-300">Removes {removedCount} tile{removedCount === 1 ? "" : "s"}.</p> : null}
                        {touched.map((widget) => {
                          const { language, code } = codeOf(widget);
                          return (
                            <div key={widget.id} className="space-y-1">
                              <p className="flex items-center gap-2 text-[11px]"><span className="min-w-0 flex-1 truncate font-medium">{widget.title}</span><span className="rounded border px-1 text-[9px] uppercase text-muted-foreground">{language}</span></p>
                              <textarea aria-label={`Code for ${widget.title}`} value={pendingCode[widget.id] ?? code} onChange={(event) => setPendingCode({ ...pendingCode, [widget.id]: event.target.value })} spellCheck={false} rows={Math.min(10, Math.max(3, (pendingCode[widget.id] ?? code).split("\n").length + 1))} className="w-full resize-y rounded-md border bg-background/60 p-2 font-mono text-[11px] leading-relaxed outline-none focus:border-border-strong" />
                            </div>
                          );
                        })}
                        <div className="flex gap-2">
                          <Button type="button" size="sm" onClick={acceptSuggestion}>Accept</Button>
                          <Button type="button" size="sm" variant="outline" onClick={() => setPending(null)}>Discard</Button>
                        </div>
                      </div>
                    ) : (
                      <ul aria-label="Starting prompts" className="flex flex-1 flex-col justify-center gap-1.5 p-3">
                        {tilePrompts(attachedDatasets[0] ?? datasets[0]).slice(0, 3).map((prompt) => (
                          <li key={prompt}><button type="button" onClick={() => setFill({ text: prompt, n: Date.now() })} className="w-full rounded-lg border bg-surface/60 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">{prompt}</button></li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </div>
              <div className="shrink-0 border-t p-3">
                {notes.length ? <div className="mb-2 max-h-48 overflow-y-auto"><AiNotes notes={notes} title="What the AI did" /></div> : null}
                <AskAiBar
                  compact
                  fill={fill}
                  rows={2}
                  label="Ask AI to change this dashboard"
                  placeholder="Edit using AI…"
                  busy={ai.tune.isPending}
                  disabled={!ai.ready || !datasets.length || Boolean(pending)}
                  error={messageOf(ai.tune.error)}
                  suggestions={[]}
                  onSubmit={suggest}
                />
                {ai.review.isError ? <p role="alert" className="mt-2 text-xs text-red-300">The AI check failed. Try again.</p> : null}
              </div>
            </>
          ) : (
            <div className="min-h-0 flex-1 xl:overflow-y-auto">
              {side === "info" ? (
                <>
                  {infoWidget
                    ? <WidgetInfo widget={infoWidget} datasets={datasets} onClose={() => setInfoId(null)} onEdit={canEdit ? () => editWidget(infoWidget.id) : undefined} />
                    : <p className="border-b px-4 py-6 text-center text-xs text-muted-foreground">Click a tile to see the data, tables and query behind it.</p>}
                  <MeasuresPanel
                    measures={measures} datasets={attachedDatasets.length ? attachedDatasets : datasets.slice(0, 1)} filters={filters}
                    onChange={canEdit ? (next) => { if (mode !== "edit") setMode("edit"); setMeasures(next); } : undefined}
                    onAddTile={canEdit ? addMeasureTile : undefined}
                    ai={{ ready: ai.ready, busy: ai.measure.isPending, error: messageOf(ai.measure.error) ?? undefined, write: (request) => ai.measure.mutateAsync({ request, datasetIds: attachedIds.length ? attachedIds : datasets.slice(0, 1).map((dataset) => dataset.id), measures }) }}
                  />
                </>
              ) : mode === "view" ? (
                <DatasetsPanel view={side === "library" ? "library" : "datasets"} onShowLibrary={() => setSide("library")} readOnly canAdd={canEdit} widgets={draft} onEditWidget={canEdit ? editWidget : undefined} attached={attachedDatasets} library={datasets} usage={usage} onAttach={(id) => addDatasets([id])} onDetach={() => undefined} onUploaded={() => void attachNew()} onDrive={() => setDriveOpen(true)} />
              ) : (
                <DatasetsPanel
                  view={side === "library" ? "library" : "datasets"} onShowLibrary={() => setSide("library")}
                  widgets={draft} onEditWidget={editWidget}
                  attached={attachedDatasets} library={datasets} usage={usage}
                  onAttach={(id) => attach([id])} onDetach={(id) => setAttachedIds((items) => items.filter((item) => item !== id))}
                  onUploaded={() => void attachNew()} onDrive={() => setDriveOpen(true)}
                />
              )}
            </div>
          )}
        </aside>
      ) : null}
      <DriveBrowserDialog open={driveOpen} onOpenChange={setDriveOpen} target={{ scopeType: "library", scopeId: "library", label: "your Library" }} onReauth={() => router.push("/extensions")} onImported={() => void attachNew()} />
    </div>
    </MeasuresContext.Provider>
  );
}

const PANEL_MIN = 280;
const PANEL_MAX = 720;
const PANEL_KEY = "dashboard-panel-width";

/** The side panel's width, remembered in this browser. */
function usePanelWidth(): [number, (width: number) => void] {
  const [width, setWidth] = useState(() => {
    try { const saved = Number(window.localStorage.getItem(PANEL_KEY)); return saved >= PANEL_MIN && saved <= PANEL_MAX ? saved : 340; } catch { return 340; }
  });
  const set = (next: number) => {
    const clamped = Math.round(Math.min(PANEL_MAX, Math.max(PANEL_MIN, next)));
    setWidth(clamped);
    try { window.localStorage.setItem(PANEL_KEY, String(clamped)); } catch { /* not stored */ }
  };
  return [width, set];
}

/** Drag the panel's left edge to make it wider or narrower; arrow keys work too. Wide screens only. */
function PanelResizer({ width, onWidth }: { width: number; onWidth: (width: number) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <div
      role="separator" aria-orientation="vertical" aria-label="Resize side panel" aria-valuenow={width} aria-valuemin={PANEL_MIN} aria-valuemax={PANEL_MAX} tabIndex={0}
      onPointerDown={(event) => { event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId); start.current = { x: event.clientX, width }; }}
      onPointerMove={(event) => { if (start.current) onWidth(start.current.width + start.current.x - event.clientX); }}
      onPointerUp={() => { start.current = null; }} onPointerCancel={() => { start.current = null; }}
      onKeyDown={(event) => { if (event.key === "ArrowLeft") onWidth(width + 20); if (event.key === "ArrowRight") onWidth(width - 20); }}
      className="absolute inset-y-0 -left-1 z-10 hidden w-2 cursor-col-resize touch-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:-translate-x-1/2 after:bg-transparent hover:after:bg-sage/60 focus-visible:outline-none focus-visible:after:bg-sage xl:block"
    />
  );
}

/** Ready-made tile requests written with the dataset's real columns, one per kind of chart. */
function tilePrompts(dataset: DatasetLite | undefined): string[] {
  if (!dataset) return [];
  const numbers = [...new Set([...numericColumns(dataset), ...numberLikeColumns(dataset)])];
  const categories = categoryColumns(dataset);
  const [num, num2] = numbers;
  const cat = categories[0];
  const prompts = [
    num ? `Total ${num} as a number` : "Number of rows as a number",
    num && cat ? `Average ${num} by ${cat} as a bar chart` : null,
    cat ? `Share of rows by ${cat} as a pie chart` : null,
    num && categories[1] ? `${num} by ${categories[1]} as a line chart` : null,
    num ? `Distribution of ${num} as a histogram` : null,
    num && num2 ? `${num} vs ${num2} as a scatter plot` : null,
    num ? `Average ${num} as a gauge` : null,
    num ? `Top 10 rows by ${num} as a table` : null,
  ];
  return prompts.filter((prompt): prompt is string => Boolean(prompt));
}
