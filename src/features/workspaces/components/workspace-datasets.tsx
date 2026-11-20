import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Database, Download, Plus, Search } from "lucide-react";
import type { DatasetResource } from "@/features/context-sidebar/types";
import { downloadResource, downloadWorkspaceDatasets } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

type Props = {
  workspaceId: string;
  workspaceName: string;
  datasets: DatasetResource[];
  onUpload: (file: File) => void;
  uploadFailed: boolean;
};

export function WorkspaceDatasets({ workspaceId, workspaceName, datasets, onUpload, uploadFailed }: Props) {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = datasets.find((dataset) => dataset.id === selectedId);
  const visible = datasets.filter((dataset) => dataset.name.toLowerCase().includes(search.toLowerCase()));
  const fileDownload = useMutation({
    mutationFn: (dataset: DatasetResource) => downloadResource(dataset.download_url, dataset.name),
  });
  const zipDownload = useMutation({
    mutationFn: () => downloadWorkspaceDatasets(workspaceId, workspaceName),
  });

  return (
    <section className="grid h-[520px] grid-rows-[3fr_2fr] overflow-hidden rounded-lg border md:grid-cols-[minmax(0,1fr)_minmax(220px,30%)] md:grid-rows-1 lg:grid-cols-[minmax(0,54fr)_minmax(0,46fr)]">
      <div className="flex min-h-0 min-w-0 flex-col border-b md:border-b-0 md:border-r">
        <div className="flex flex-wrap items-center gap-3 border-b p-4">
          <div className="mr-auto">
            <h3 className="text-xl font-semibold">Datasets</h3>
            <p className="mt-1 text-xs text-muted-foreground">Data shared by every chat in this workspace.</p>
          </div>
          <label className="relative">
            <span className="sr-only">Search datasets</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search datasets…" className="h-9 w-44 rounded-md border bg-background pl-9 pr-3 text-xs" />
          </label>
          <button type="button" disabled={!datasets.length || zipDownload.isPending} onClick={() => zipDownload.mutate()} className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs disabled:opacity-50">
            <Download className="size-4" />{zipDownload.isPending ? "Preparing ZIP…" : "Download all (.zip)"}
          </button>
          <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground focus-within:ring-2">
            <Plus className="size-4" />Add Dataset
            <input type="file" accept=".csv,.xlsx,.xls,.parquet" className="sr-only" onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.currentTarget.value = "";
            }} />
          </label>
        </div>
        <div className="min-h-0 flex-1 divide-y overflow-y-auto">
          {visible.map((dataset) => (
            <div key={dataset.id} className={cn("flex items-center pr-2", selectedId === dataset.id && "bg-raised")}>
              <button type="button" aria-pressed={selectedId === dataset.id} onClick={() => setSelectedId(dataset.id)} className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface">
                <Database className="size-4 shrink-0 text-sage" />
                <span className="min-w-0 flex-1 truncate font-medium">{dataset.name}</span>
                <span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{dataset.name.split(".").pop()?.toUpperCase()}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(dataset.size_bytes)}</span>
              </button>
              <button type="button" aria-label={`Download ${dataset.name}`} onClick={() => fileDownload.mutate(dataset)} className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground">
                <Download className="size-4" />
              </button>
            </div>
          ))}
          {!visible.length && <p className="p-6 text-center text-sm text-muted-foreground">{datasets.length ? "No matching datasets." : "No datasets yet."}</p>}
        </div>
        {uploadFailed && <p role="alert" className="border-t px-4 py-2 text-xs text-red-300">Could not upload this dataset.</p>}
        {(fileDownload.isError || zipDownload.isError) && <p role="alert" className="border-t px-4 py-2 text-xs text-red-300">Download failed. Please try again.</p>}
      </div>
      <aside aria-label="Dataset details" className="flex min-h-0 min-w-0 flex-col p-5">
        {selected ? <>
          <h3 className="truncate text-base font-semibold" title={selected.name}>{selected.name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{formatBytes(selected.size_bytes)} · {selected.row_count ?? "—"} rows</p>
          <h4 className="mt-5 border-t pt-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Schema</h4>
          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-y-auto">
            {selected.columns?.length ? selected.columns.map((column, index) => (
              <div key={`${column.name}-${index}`} className="flex justify-between gap-3 text-xs">
                <span className="truncate" title={column.name}>{column.name}</span>
                <span className="text-muted-foreground">{column.data_type}</span>
              </div>
            )) : <p className="text-xs text-muted-foreground">Schema is not available yet.</p>}
          </div>
          <button type="button" onClick={() => fileDownload.mutate(selected)} className="mt-4 self-start text-xs text-slate hover:underline">Download dataset</button>
        </> : <div className="m-auto text-center">
          <Database className="mx-auto size-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-medium">Select a dataset</p>
          <p className="mt-1 text-xs text-muted-foreground">Its metadata and schema will appear here.</p>
        </div>}
      </aside>
    </section>
  );
}
