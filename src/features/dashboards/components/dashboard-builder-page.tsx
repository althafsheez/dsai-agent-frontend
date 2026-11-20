"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Save, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { suggestWidgets } from "../logic/aggregate";
import { useDashboardDatasets, useSaveDashboard } from "../use-dashboards";
import type { DashboardWidget } from "../types";
import { AddWidget } from "./add-widget";
import { DatasetPicker } from "./dataset-picker";
import { WidgetCard } from "./widget-card";

const field = "h-9 w-full rounded-md border bg-surface px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong";

export function DashboardBuilderPage() {
  const router = useRouter();
  const datasetsQuery = useDashboardDatasets();
  const save = useSaveDashboard();
  const datasets = datasetsQuery.data ?? [];
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [widgets, setWidgets] = useState<DashboardWidget[]>([]);

  function toggle(id: string) {
    const dataset = datasets.find((item) => item.id === id);
    if (!dataset) return;
    if (selected.includes(id)) {
      setSelected(selected.filter((item) => item !== id));
      setWidgets(widgets.filter((widget) => widget.dataset_id !== id));
      return;
    }
    setSelected([...selected, id]);
    setWidgets([...widgets, ...suggestWidgets([dataset])]);
  }

  const chosen = datasets.filter((dataset) => selected.includes(dataset.id));
  const canSave = name.trim().length > 0 && widgets.length > 0 && !save.isPending;

  async function submit() {
    const saved = await save.mutateAsync({ name, description, dataset_ids: selected, widgets });
    router.push(`/dashboards/${saved.id}`);
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <Link href="/dashboards" className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Dashboards</Link>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Create dashboard</h1>
          <p className="mt-1 text-xs text-muted-foreground">Pick datasets and get live charts you can adjust before saving.</p>
        </div>
        <Button type="button" onClick={submit} disabled={!canSave} title={canSave ? undefined : "Add a name and at least one dataset"}><Save />Save dashboard</Button>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block min-w-0 text-xs text-muted-foreground">Name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Revenue overview" className={`${field} mt-1`} /></label>
        <label className="block min-w-0 text-xs text-muted-foreground">Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="What it is for" className={`${field} mt-1`} /></label>
      </div>

      <h2 className="mb-2 mt-6 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Datasets</h2>
      <DatasetPicker datasets={datasets} selected={selected} onToggle={toggle} loading={datasetsQuery.isLoading} />

      <h2 className="mb-2 mt-6 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Preview {widgets.length ? <span className="inline-flex items-center gap-1 normal-case tracking-normal"><Sparkles className="size-3" />Starter charts from your data (charts use the dataset’s first preview rows; row counts are the full file)</span> : null}</h2>
      {widgets.length ? (
        <div className="grid grid-flow-dense gap-3 md:grid-cols-3">
          {widgets.map((widget) => (
            <WidgetCard key={widget.id} widget={widget} dataset={chosen.find((dataset) => dataset.id === widget.dataset_id)} editable onChange={(next) => setWidgets(widgets.map((item) => (item.id === next.id ? next : item)))} onRemove={() => setWidgets(widgets.filter((item) => item.id !== widget.id))} />
          ))}
        </div>
      ) : <p className="rounded-lg border border-dashed px-6 py-10 text-center text-xs text-muted-foreground">Select a dataset above to see charts here.</p>}
      {chosen.length ? <div className="mt-3"><AddWidget datasets={chosen} onAdd={(widget) => setWidgets([...widgets, widget])} /></div> : null}
    </section>
  );
}
