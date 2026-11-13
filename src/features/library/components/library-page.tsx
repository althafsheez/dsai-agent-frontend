"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BarChart3, Code2, Database, Download, Eye, FileImage, FileText, Grid2X2, Layers3, List, Search, Trash2, X } from "lucide-react";
import { FilePreviewSidebar, type ContextFile } from "@/features/context-sidebar";
import { formatBytes } from "@/features/context-sidebar/resource-utils";
import { downloadResource, getLibrary, getResourcePreview, removeResourceFromLibrary, type LibraryResource } from "@/lib/api";

function ResourceIcon({ item }: { item: LibraryResource }) {
  if (item.resource_type === "dataset") return <Database className="size-5" />;
  if ("kind" in item && (item.kind === "image" || item.kind === "chart")) return <FileImage className="size-5" />;
  return <FileText className="size-5" />;
}

type LibraryView = "grid" | "list";
type Filter = "all" | LibraryResource["library_category"];

const FILTERS: Array<{ id: Filter; label: string; icon: typeof Layers3 }> = [
  { id: "all", label: "All", icon: Layers3 },
  { id: "dataset", label: "Datasets", icon: Database },
  { id: "report", label: "Reports", icon: FileText },
  { id: "visual", label: "Visuals", icon: BarChart3 },
  { id: "code", label: "Code", icon: Code2 },
];

function categoryLabel(category: LibraryResource["library_category"]) {
  return category === "dataset" ? "Dataset" : category === "visual" ? "Visual" : category === "report" ? "Report" : category === "code" ? "Code" : "File";
}

function LibraryThumbnail({ item }: { item: LibraryResource }) {
  const isImage = item.resource_type === "artifact" && "kind" in item && (item.kind === "image" || item.kind === "chart");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage || !item.preview_url) return;
    let active = true;
    let objectUrl: string | null = null;
    void getResourcePreview(item.preview_url).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }).catch(() => setImageUrl(null));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [isImage, item.preview_url]);

  if (isImage && imageUrl) return <img src={imageUrl} alt="" className="size-full object-cover" />;
  if (item.resource_type === "dataset") {
    const columns = item.columns?.slice(0, 3) ?? [];
    const rows = item.preview_rows?.slice(0, 4) ?? [];
    return <div className="size-full overflow-hidden bg-[linear-gradient(145deg,oklch(0.23_0.025_155),oklch(0.16_0.01_260))] p-3 text-[9px] text-foreground/75"><div className="mb-2 flex items-center gap-1.5 text-sage"><Database className="size-3.5"/><span className="font-medium">DATASET</span></div>{columns.length ? <div className="overflow-hidden rounded border border-white/10"><div className="grid grid-cols-3 bg-black/20 text-[8px] font-medium text-foreground/80">{columns.map((column, index) => <span key={`${column.name}-${index}`} className="truncate border-r border-white/10 px-1 py-1 last:border-r-0">{column.name}</span>)}</div>{rows.map((row, rowIndex) => <div key={rowIndex} className="grid grid-cols-3 border-t border-white/10">{columns.map((column, columnIndex) => <span key={`${column.name}-${columnIndex}`} className="truncate border-r border-white/10 px-1 py-1 last:border-r-0">{row[columnIndex] == null ? "—" : String(row[columnIndex])}</span>)}</div>)}</div> : <div className="grid h-[calc(100%-1.25rem)] place-items-center"><Database className="size-9 text-sage/70"/></div>}</div>;
  }
  return <div className="grid size-full place-items-center bg-[linear-gradient(145deg,oklch(0.2_0.015_260),oklch(0.14_0.005_260))] text-muted-foreground"><div className="grid size-14 place-items-center rounded-xl border bg-background/60"><ResourceIcon item={item} /></div></div>;
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<LibraryView>("grid");
  const [preview, setPreview] = useState<ContextFile | null>(null);
  const libraryQuery = useQuery({ queryKey: ["library"], queryFn: getLibrary });
  const removeMutation = useMutation({
    mutationFn: removeResourceFromLibrary,
    onSuccess: async (_, resourceId) => {
      if (preview?.id === resourceId) setPreview(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["library"] }),
        queryClient.invalidateQueries({ queryKey: ["datasets"] }),
        queryClient.invalidateQueries({ queryKey: ["artifacts"] }),
      ]);
    },
  });
  const items = useMemo(() => {
    const search = query.trim().toLowerCase();
    return (libraryQuery.data?.items ?? []).filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search);
      return matchesSearch && (filter === "all" || item.library_category === filter);
    });
  }, [filter, libraryQuery.data?.items, query]);

  return <>
    <section className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <header className="flex items-center gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-xl border bg-raised"><Layers3 className="size-6" strokeWidth={1.5} /></div>
        <div><h1 className="text-2xl font-semibold tracking-tight">Library</h1><p className="mt-1 text-sm text-muted-foreground">Files saved from your analyses.</p></div>
      </header>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div role="tablist" aria-label="Library file type" className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-surface p-1">
          {FILTERS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={filter === id} onClick={() => setFilter(id)} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${filter === id ? "bg-raised text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}><Icon className="size-3.5" />{label}</button>)}
        </div>
        <div className="flex items-center gap-2">
          <label className="relative block w-full sm:w-72"><span className="sr-only">Search library</span><Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search library..." className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none focus:border-border-strong" />{query && <button type="button" aria-label="Clear search" onClick={() => setQuery("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}</label>
          <div className="flex rounded-md border bg-surface p-0.5" aria-label="Library layout">
            <button type="button" aria-label="Grid view" aria-pressed={view === "grid"} onClick={() => setView("grid")} className={`grid size-9 place-items-center rounded ${view === "grid" ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"}`}><Grid2X2 className="size-4" /></button>
            <button type="button" aria-label="List view" aria-pressed={view === "list"} onClick={() => setView("list")} className={`grid size-9 place-items-center rounded ${view === "list" ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"}`}><List className="size-4" /></button>
          </div>
        </div>
      </div>

      {libraryQuery.isLoading ? <div aria-label="Loading library" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{[0, 1, 2, 3, 4, 5].map((key) => <div key={key} className="aspect-square animate-pulse rounded-xl border bg-surface" />)}</div> : items.length ? <div className={`mt-6 grid gap-4 ${view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "sm:grid-cols-2"}`}>{items.map((item) => <article key={item.id} className={`group min-w-0 overflow-hidden rounded-xl border bg-surface/55 transition-colors hover:border-border-strong hover:bg-surface ${view === "list" ? "flex min-h-20 items-stretch" : ""}`}>
        <button type="button" onClick={() => setPreview(item)} aria-label={`Preview ${item.name}`} className={`relative block shrink-0 overflow-hidden bg-raised text-left ${view === "list" ? "h-20 w-28" : "aspect-square w-full"}`}><LibraryThumbnail item={item} />{view === "grid" && <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-8 text-[10px] font-medium uppercase tracking-[0.12em] text-white/75">{categoryLabel(item.library_category)}</span>}</button>
        <div className="flex min-w-0 flex-1 items-center gap-2 p-3"><button type="button" onClick={() => setPreview(item)} className="min-w-0 flex-1 text-left"><h2 className="truncate text-sm font-medium">{item.name}</h2><p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground"><span className="font-medium text-foreground/80">{categoryLabel(item.library_category)}</span><span aria-hidden="true">·</span>{formatBytes(item.size_bytes)}</p></button><div className="flex shrink-0 gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100"><button type="button" onClick={() => setPreview(item)} aria-label={`Preview ${item.name}`} className="grid size-8 place-items-center rounded-md bg-raised text-muted-foreground hover:text-foreground"><Eye className="size-3.5" /></button><button type="button" onClick={() => void downloadResource(item.download_url, item.name)} aria-label={`Download ${item.name}`} className="grid size-8 place-items-center rounded-md bg-raised text-muted-foreground hover:text-foreground"><Download className="size-3.5" /></button><button type="button" disabled={removeMutation.isPending} onClick={() => removeMutation.mutate(item.id)} aria-label={`Remove ${item.name} from Library`} className="grid size-8 place-items-center rounded-md bg-raised text-muted-foreground hover:text-red-300"><Trash2 className="size-3.5" /></button></div></div>
      </article>)}</div> : <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center"><Layers3 className="mx-auto size-6 text-muted-foreground" /><p className="mt-3 text-sm font-medium">{query ? "No matching files" : "Your Library is empty"}</p><p className="mt-1 text-xs text-muted-foreground">Use Add to Library on any dataset or artifact.</p></div>}
      {libraryQuery.isError && <p role="alert" className="mt-4 text-xs text-red-300">Library files could not be loaded.</p>}
    </section>
    {preview && <div className="fixed inset-0 z-50 bg-black/25" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><div className="absolute inset-y-0 right-0 w-full shadow-2xl sm:w-[40vw]"><FilePreviewSidebar file={preview} onBack={() => setPreview(null)} onClose={() => setPreview(null)} /></div></div>}
  </>;
}
