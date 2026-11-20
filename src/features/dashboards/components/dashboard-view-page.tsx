"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, Eye, Globe, Pencil, Save, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDashboard, useDashboardDatasets, useDeleteDashboard, useSaveDashboard } from "../use-dashboards";
import type { Dashboard, DashboardWidget } from "../types";
import { AddWidget } from "./add-widget";
import { WidgetCard } from "./widget-card";

type Mode = "view" | "edit";

export function DashboardViewPage({ dashboardId }: { dashboardId: string }) {
  const router = useRouter();
  const dashboardQuery = useDashboard(dashboardId);
  const datasetsQuery = useDashboardDatasets();
  const save = useSaveDashboard();
  const remove = useDeleteDashboard();
  const dashboard = dashboardQuery.data;
  const datasets = datasetsQuery.data ?? [];
  const [mode, setMode] = useState<Mode>("view");
  const [draft, setDraft] = useState<DashboardWidget[]>([]);
  const [name, setName] = useState("");

  useEffect(() => {
    if (dashboard && mode === "view") { setDraft(dashboard.widgets); setName(dashboard.name); }
  }, [dashboard, mode]);

  if (dashboardQuery.isLoading) return <p className="p-8 text-sm text-muted-foreground">Loading dashboard…</p>;
  if (!dashboard) {
    return (
      <section className="mx-auto w-full max-w-3xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">Dashboard not found</h1>
        <Button asChild variant="outline" className="mt-5"><Link href="/dashboards"><ArrowLeft />Back to dashboards</Link></Button>
      </section>
    );
  }

  const editing = mode === "edit";
  const widgets = editing ? draft : dashboard.widgets;
  const dirty = editing && (name !== dashboard.name || JSON.stringify(draft) !== JSON.stringify(dashboard.widgets));
  const datasetFor = (widget: DashboardWidget) => datasets.find((dataset) => dataset.id === widget.dataset_id);
  const writeFields = (overrides: Partial<Pick<Dashboard, "status" | "pinned">> & { widgets?: DashboardWidget[]; name?: string }) => ({
    id: dashboard.id, name: overrides.name ?? dashboard.name, description: dashboard.description,
    dataset_ids: [...new Set((overrides.widgets ?? dashboard.widgets).map((widget) => widget.dataset_id))],
    widgets: overrides.widgets ?? dashboard.widgets, status: overrides.status, pinned: overrides.pinned,
  });

  async function saveEdits() {
    await save.mutateAsync(writeFields({ widgets: draft, name }));
    setMode("view");
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/dashboards" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Dashboards</Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {editing ? <input aria-label="Dashboard name" value={name} onChange={(event) => setName(event.target.value)} className="h-9 w-full max-w-md rounded-md border bg-surface px-2.5 text-lg font-semibold outline-none focus:border-border-strong" /> : <h1 className="truncate text-xl font-semibold tracking-tight">{dashboard.name}</h1>}
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
            <span className={cn("rounded border px-1.5 py-0.5 text-[10px]", dashboard.status === "published" ? "border-emerald-400/30 text-emerald-300" : "")}>{dashboard.status === "published" ? "Published" : "Draft"}</span>
            <span>{dashboard.owner}</span><span aria-hidden="true">·</span><span>{widgets.length} widget{widgets.length === 1 ? "" : "s"}</span>
            {editing ? <span className="text-sky-300">Editing{dirty ? " · unsaved changes" : ""}</span> : null}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <Button type="button" variant="outline" onClick={() => setMode("view")}><Undo2 />Discard</Button>
              <Button type="button" onClick={saveEdits} disabled={!dirty || !name.trim() || save.isPending}><Save />Save changes</Button>
            </>
          ) : (
            <>
              {dashboard.ownership === "owned" ? <Button type="button" variant="outline" onClick={() => save.mutate(writeFields({ status: dashboard.status === "published" ? "draft" : "published" }))} disabled={save.isPending}><Globe />{dashboard.status === "published" ? "Unpublish" : "Publish"}</Button> : null}
              {dashboard.ownership === "owned" ? <Button type="button" onClick={() => setMode("edit")}><Pencil />Edit</Button> : null}
            </>
          )}
        </div>
      </header>

      {widgets.length ? (
        <div className="grid grid-flow-dense gap-3 md:grid-cols-3">
          {widgets.map((widget) => (
            <WidgetCard key={widget.id} widget={widget} dataset={datasetFor(widget)} editable={editing} onChange={(next) => setDraft(draft.map((item) => (item.id === next.id ? next : item)))} onRemove={() => setDraft(draft.filter((item) => item.id !== widget.id))} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed px-6 py-14 text-center">
          <Eye className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">This dashboard has no widgets yet</p>
          <p className="mt-1 text-xs text-muted-foreground">{dashboard.ownership === "owned" ? "Choose Edit, then add a KPI, chart or table from a Library dataset." : "The owner has not added any widgets."}</p>
        </div>
      )}

      {editing ? <div className="mt-3"><AddWidget datasets={datasets} onAdd={(widget) => setDraft([...draft, widget])} /></div> : null}

      {dashboard.ownership === "owned" && !editing ? (
        <div className="mt-10 border-t pt-4">
          <button type="button" onClick={() => { if (window.confirm(`Delete “${dashboard.name}”? This cannot be undone.`)) remove.mutate(dashboard.id, { onSuccess: () => router.push("/dashboards") }); }} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-red-300"><Trash2 className="size-3.5" />Delete dashboard</button>
        </div>
      ) : null}
    </section>
  );
}
