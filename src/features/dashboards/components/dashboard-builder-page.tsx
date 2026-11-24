"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Database, FileSpreadsheet, LoaderCircle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DriveBrowserDialog } from "@/features/connectors/components/drive-browser-dialog";
import { cn } from "@/lib/utils";
import { defaultPolicy, policyContext } from "../logic/manual";
import { dashboardKeys, useDashboardAi, useDatasetRelations, useHydratedDatasets, useSaveDashboard } from "../use-dashboards";
import { usedDatasetIds } from "../types";
import { AddDatasetMenu } from "./add-dataset-menu";

/**
 * New dashboard, in the same three steps as a new workspace: a name, where the data files come from, and what the AI should build.
 * Creating it writes a draft and opens it in the editor.
 */
export function DashboardBuilderPage() {
  const router = useRouter();
  const client = useQueryClient();
  const save = useSaveDashboard();
  const ai = useDashboardAi();
  const [name, setName] = useState("");
  const [overview, setOverview] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [driveOpen, setDriveOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hydrated = useHydratedDatasets(selected);
  const datasets = hydrated.datasets;
  const chosen = datasets.filter((dataset) => selected.includes(dataset.id));
  const relations = useDatasetRelations(chosen.map((dataset) => dataset.id));
  const busy = ai.generate.isPending || save.isPending;
  const canCreate = Boolean(name.trim() && overview.trim() && chosen.length && ai.ready && !busy);

  const toggle = (id: string) => setSelected((items) => (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]));
  const refreshDatasets = () => void client.invalidateQueries({ queryKey: dashboardKeys.datasets });

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreate) return;
    setError(null);
    try {
      const result = await ai.generate.mutateAsync({ prompt: overview.trim(), datasets: chosen.slice(0, 8), context: policyContext(defaultPolicy, chosen, relations.data) });
      const saved = await save.mutateAsync({ name: name.trim(), description: overview.trim(), dataset_ids: usedDatasetIds(result.widgets), widgets: result.widgets, slicers: result.slicers ?? [] });
      router.push(`/dashboards/${saved.id}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create this dashboard. Try again.");
    }
  }

  return (
    <section className="mx-auto w-full max-w-[600px] px-4 py-8 sm:px-6">
      <Link href="/dashboards" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"><ArrowLeft className="size-3.5" />Dashboards</Link>
      <form onSubmit={submit} className="rounded-xl border bg-popover">
        <div className="border-b px-6 py-5 sm:px-7">
          <h1 className="text-xl font-semibold tracking-tight">Create Dashboard</h1>
        </div>

        <div className="space-y-5 px-6 py-5 sm:px-7">
          <label className="block text-xs font-medium">
            Dashboard name <span className="text-red-300">*</span>
            <input autoFocus value={name} onChange={(event) => setName(event.target.value)} maxLength={160} placeholder="e.g. Revenue by region" className="mt-2 h-10 w-full rounded-md border bg-surface px-3 text-sm font-normal outline-none placeholder:text-muted-foreground focus:border-border-strong" />
          </label>

          <section aria-labelledby="dashboard-datasets" className="rounded-xl border bg-background/25 p-3.5">
            <div className="mb-3 flex items-center gap-2.5">
              <Database className="size-5" strokeWidth={1.5} />
              <h2 id="dashboard-datasets" className="text-sm font-medium">Data files <span className="text-red-300">*</span></h2>
              <span className="text-[10px] text-muted-foreground">{chosen.length} selected</span>
              <span className="ml-auto"><AddDatasetMenu onUploaded={refreshDatasets} onDrive={() => setDriveOpen(true)} /></span>
            </div>
            {hydrated.loading ? <p className="py-5 text-center text-xs text-muted-foreground">Loading datasets…</p> : !datasets.length ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">No data files yet. Use Add dataset to upload a file or import from Google Drive.</p>
            ) : (
              <ul className="max-h-60 space-y-1 overflow-auto pr-0.5" aria-label="Datasets">
                {datasets.map((dataset) => {
                  const on = selected.includes(dataset.id);
                  return (
                    <li key={dataset.id}>
                      <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-lg border bg-surface px-2.5 py-2 transition-colors hover:border-border-strong", on && "border-sage/60 bg-sage/5")}>
                        <input type="checkbox" checked={on} onChange={() => toggle(dataset.id)} className="accent-[var(--sage)]" />
                        <FileSpreadsheet className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate text-xs">{dataset.name}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">{dataset.columns.length} columns · {(dataset.row_count ?? dataset.rows.length).toLocaleString()} rows</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
            {chosen.length > 1 ? <p className="mt-2 text-[11px] text-muted-foreground">Several files are combined. Where they disagree you decide what to trust once the dashboard is open.</p> : null}
          </section>

          <section aria-labelledby="dashboard-overview" className="rounded-xl border bg-background/25 p-3.5">
            <div className="mb-2.5 flex items-center gap-2.5"><Sparkles className="size-5" strokeWidth={1.5} /><h2 id="dashboard-overview" className="text-sm font-medium">AI Overview <span className="text-red-300">*</span></h2></div>
            <label className="sr-only" htmlFor="dashboard-ai-overview">AI Overview</label>
            <textarea id="dashboard-ai-overview" value={overview} onChange={(event) => setOverview(event.target.value)} maxLength={2000} rows={3} placeholder="What should it show? e.g. revenue and units by region, a KPI row and a table of the latest orders" className="w-full resize-y rounded-md border bg-surface px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong" />
          </section>

          {error ? <p role="alert" className="text-xs text-red-300">{error}</p> : null}
        </div>

        <div className="flex items-center justify-end gap-2 border-t px-6 py-4 sm:px-7">
          <Button asChild type="button" variant="outline"><Link href="/dashboards">Cancel</Link></Button>
          <Button type="submit" disabled={!canCreate}>{busy ? <><LoaderCircle className="animate-spin" />Building…</> : "Create Dashboard"}</Button>
        </div>
      </form>
      <DriveBrowserDialog open={driveOpen} onOpenChange={setDriveOpen} target={{ scopeType: "library", scopeId: "library", label: "your Library" }} onReauth={() => router.push("/extensions")} onImported={() => void hydrated.refetch()} />
    </section>
  );
}
