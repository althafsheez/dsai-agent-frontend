"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Code2,
  Database,
  Download,
  Eye,
  FileImage,
  FileText,
  Folder,
  Grid2X2,
  Layers3,
  List,
  Search,
  Share2,
  Trash2,
  X,
} from "lucide-react";
import { FilePreviewSidebar, type ContextFile } from "@/features/context-sidebar";
import { ShareWorkspaceDialog } from "@/features/workspaces/components/share-workspace-dialog";
import { formatBytes } from "@/features/context-sidebar/resource-utils";
import {
  downloadResource,
  getLibrary,
  getResourcePreview,
  getResourcePreviewText,
  removeResourceFromLibrary,
  type LibraryResource,
} from "@/lib/api";

function ResourceIcon({ item }: { item: LibraryResource }) {
  if (item.resource_type === "dataset") return <Database className="size-5 text-sage" />;
  if ("kind" in item && (item.kind === "image" || item.kind === "chart"))
    return <FileImage className="size-5 text-sky-400" />;
  if (item.library_category === "code") return <Code2 className="size-5 text-violet-400" />;
  return <FileText className="size-5 text-amber-400" />;
}

type LibraryView = "grid" | "list";
type LibraryFolder = { id: string; name: string; items: LibraryResource[] };

// Workspaces with more saved items than this get their own folder; smaller ones stay inline to avoid one-file folders.
const FOLDER_MIN_ITEMS = 4;

function folderSummary(items: LibraryResource[]) {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(categoryLabel(item.library_category), (counts.get(categoryLabel(item.library_category)) ?? 0) + 1);
  return [...counts].map(([label, count]) => `${count} ${label.toLowerCase()}${count === 1 ? "" : "s"}`).join(" · ");
}
type Filter = "all" | LibraryResource["library_category"];

const FILTERS: Array<{ id: Filter; label: string; icon: typeof Layers3 }> = [
  { id: "all", label: "All", icon: Layers3 },
  { id: "dataset", label: "Datasets", icon: Database },
  { id: "report", label: "Reports", icon: FileText },
  { id: "visual", label: "Visuals", icon: BarChart3 },
  { id: "code", label: "Code", icon: Code2 },
];

function categoryLabel(category: LibraryResource["library_category"]) {
  return category === "dataset"
    ? "Dataset"
    : category === "visual"
      ? "Visual"
      : category === "report"
        ? "Report"
        : category === "code"
          ? "Code"
          : "File";
}

function LibraryThumbnail({ item }: { item: LibraryResource }) {
  const isImage = item.resource_type === "artifact" && "kind" in item && (item.kind === "image" || item.kind === "chart");
  const isCode = item.library_category === "code";
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [codePreview, setCodePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!isImage || !item.preview_url) return;
    let active = true;
    let objectUrl: string | null = null;
    void getResourcePreview(item.preview_url)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImageUrl(objectUrl);
      })
      .catch(() => setImageUrl(null));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [isImage, item.preview_url]);

  useEffect(() => {
    if (!isCode || !item.preview_url) return;
    let active = true;
    setCodePreview(null);
    void getResourcePreviewText(item.preview_url)
      .then((text) => {
        if (active) setCodePreview(text.split("\n").slice(0, 9).join("\n"));
      })
      .catch(() => {
        if (active) setCodePreview(null);
      });
    return () => {
      active = false;
    };
  }, [isCode, item.preview_url]);

  // eslint-disable-next-line @next/next/no-img-element
  if (isImage && imageUrl) return <img src={imageUrl} alt="" className="size-full object-cover" />;
  if (item.resource_type === "dataset") {
    const columns = item.columns?.slice(0, 3) ?? [];
    const rows = item.preview_rows?.slice(0, 4) ?? [];
    return (
      <div className="size-full overflow-hidden bg-[linear-gradient(145deg,oklch(0.23_0.025_155),oklch(0.16_0.01_260))] p-3 text-[9px] text-foreground/75">
        <div className="mb-2 flex items-center gap-1.5 text-sage">
          <Database className="size-3.5" />
          <span className="font-medium tracking-wide">DATASET</span>
        </div>
        {columns.length ? (
          <div className="overflow-hidden rounded border border-white/10">
            <div className="grid grid-cols-3 bg-black/20 text-[8px] font-medium text-foreground/80">
              {columns.map((column, index) => (
                <span
                  key={`${column.name}-${index}`}
                  className="truncate border-r border-white/10 px-1 py-1 last:border-r-0"
                >
                  {column.name}
                </span>
              ))}
            </div>
            {rows.map((row, rowIndex) => (
              <div key={rowIndex} className="grid grid-cols-3 border-t border-white/10">
                {columns.map((column, columnIndex) => (
                  <span
                    key={`${column.name}-${columnIndex}`}
                    className="truncate border-r border-white/10 px-1 py-1 last:border-r-0"
                  >
                    {row[columnIndex] == null ? "—" : String(row[columnIndex])}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-[calc(100%-1.25rem)] place-items-center">
            <Database className="size-9 text-sage/70" />
          </div>
        )}
      </div>
    );
  }
  if (isCode && codePreview) {
    return (
      <div className="size-full overflow-hidden bg-[linear-gradient(145deg,oklch(0.18_0.015_260),oklch(0.12_0.005_260))] p-3 font-mono text-[10px] leading-5 text-slate">
        <div className="mb-2 flex items-center gap-1.5 font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-violet-300">
          <Code2 className="size-3.5" />
          Code preview
        </div>
        <pre className="whitespace-pre-wrap break-words text-foreground/75">{codePreview}</pre>
      </div>
    );
  }
  return (
    <div className="grid size-full place-items-center bg-[linear-gradient(145deg,oklch(0.2_0.015_260),oklch(0.14_0.005_260))] text-muted-foreground">
      <div className="grid size-14 place-items-center rounded-xl border bg-background/60">
        <ResourceIcon item={item} />
      </div>
    </div>
  );
}

export function LibraryPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [view, setView] = useState<LibraryView>("grid");
  const [preview, setPreview] = useState<ContextFile | null>(null);
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [sharingFolder, setSharingFolder] = useState<LibraryFolder | null>(null);

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

  function renderItems(list: LibraryResource[]) {
    return (
      <div
        className={`grid gap-4 ${
          view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"
        }`}
      >
        {list.map((item) => (
          <article
            key={item.id}
            className={`group min-w-0 overflow-hidden rounded-xl border bg-surface/50 transition-colors hover:border-border-strong hover:bg-surface ${
              view === "list" ? "flex min-h-20 items-stretch" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => setPreview(item)}
              aria-label={`Preview ${item.name}`}
              className={`relative block shrink-0 overflow-hidden bg-raised text-left ${
                view === "list" ? "h-20 w-28" : "aspect-[5/4] w-full"
              }`}
            >
              <LibraryThumbnail item={item} />
              {view === "grid" && (
                <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-7 text-[10px] font-medium uppercase tracking-[0.12em] text-white/80">
                  {categoryLabel(item.library_category)}
                </span>
              )}
            </button>
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3">
              <button
                type="button"
                onClick={() => setPreview(item)}
                className="min-w-0 flex-1 text-left"
              >
                <h2 className="truncate text-xs font-medium text-foreground group-hover:text-foreground">
                  {item.name}
                </h2>
                <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground/75">
                    {categoryLabel(item.library_category)}
                  </span>
                  <span aria-hidden="true">·</span>
                  {formatBytes(item.size_bytes)}
                </p>
              </button>
              <div className="flex shrink-0 items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <button
                  type="button"
                  onClick={() => setPreview(item)}
                  aria-label={`Preview ${item.name}`}
                  className="grid size-7 place-items-center rounded-md bg-raised text-muted-foreground hover:text-foreground"
                >
                  <Eye className="size-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => void downloadResource(item.download_url, item.name)}
                  aria-label={`Download ${item.name}`}
                  className="grid size-7 place-items-center rounded-md bg-raised text-muted-foreground hover:text-foreground"
                >
                  <Download className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={removeMutation.isPending}
                  onClick={() => removeMutation.mutate(item.id)}
                  aria-label={`Remove ${item.name} from Library`}
                  className="grid size-7 place-items-center rounded-md bg-raised text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    );
  }

  // Search shows flat results across folders so a match is never hidden inside one.
  const { folders, looseItems } = useMemo(() => {
    if (query.trim()) return { folders: [] as LibraryFolder[], looseItems: items };
    const byWorkspace = new Map<string, LibraryFolder>();
    for (const item of items) {
      if (!item.workspace_id) continue;
      const folder = byWorkspace.get(item.workspace_id) ?? { id: item.workspace_id, name: item.workspace_name ?? "Workspace", items: [] };
      folder.items.push(item);
      byWorkspace.set(item.workspace_id, folder);
    }
    const grouped = [...byWorkspace.values()].filter((folder) => folder.items.length >= FOLDER_MIN_ITEMS);
    const groupedIds = new Set(grouped.map((folder) => folder.id));
    return {
      folders: grouped.sort((a, b) => a.name.localeCompare(b.name)),
      looseItems: items.filter((item) => !item.workspace_id || !groupedIds.has(item.workspace_id)),
    };
  }, [items, query]);
  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;

  return (
    <>
      <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <header className="mb-6 flex items-start justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate">
              <Bookmark className="size-5" strokeWidth={1.5} />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-xl font-semibold tracking-tight">Library</h1>
                <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  Saved Assets
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Datasets, charts, and reports saved across your analyses
              </p>
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            role="tablist"
            aria-label="Library file type"
            className="flex w-fit max-w-full overflow-x-auto rounded-lg border bg-surface p-1"
          >
            {FILTERS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                  filter === id
                    ? "bg-raised text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="size-3.5" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="relative block w-full sm:w-72">
              <span className="sr-only">Search library</span>
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search library..."
                className="h-9 w-full rounded-md border bg-surface pl-9 pr-9 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong"
              />
              {query && (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => setQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </label>

            <div className="flex rounded-md border bg-surface p-0.5" aria-label="Library layout">
              <button
                type="button"
                aria-label="Grid view"
                aria-pressed={view === "grid"}
                onClick={() => setView("grid")}
                className={`grid size-8 place-items-center rounded ${
                  view === "grid" ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Grid2X2 className="size-3.5" />
              </button>
              <button
                type="button"
                aria-label="List view"
                aria-pressed={view === "list"}
                onClick={() => setView("list")}
                className={`grid size-8 place-items-center rounded ${
                  view === "list" ? "bg-raised text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <List className="size-3.5" />
              </button>
            </div>
          </div>
        </div>

        {libraryQuery.isLoading ? (
          <div
            aria-label="Loading library"
            className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {[0, 1, 2, 3, 4, 5].map((key) => (
              <div key={key} className="aspect-[5/4] animate-pulse rounded-xl border bg-surface" />
            ))}
          </div>
        ) : items.length ? (
          openFolder ? (
            <div className="mt-6 animate-pop-in">
              <nav aria-label="Library folder" className="mb-4 flex items-center gap-1.5 text-xs">
                <button type="button" onClick={() => setOpenFolderId(null)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-raised hover:text-foreground">
                  <ChevronLeft className="size-3.5" />Library
                </button>
                <span className="text-muted-foreground/60">/</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><Folder className="size-3.5 text-sage" />{openFolder.name}</span>
                <span className="text-muted-foreground">· {openFolder.items.length} items</span>
                <button type="button" onClick={() => setSharingFolder(openFolder)} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground">
                  <Share2 className="size-3.5" />Share folder
                </button>
              </nav>
              {renderItems(openFolder.items)}
            </div>
          ) : (
            <>
              {folders.length ? (
                <div className="mt-6">
                  <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace folders</h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {folders.map((folder) => (
                      <div key={folder.id} className="group relative">
                      <button
                        type="button"
                        onClick={() => setOpenFolderId(folder.id)}
                        aria-label={`Open ${folder.name} folder`}
                        className="flex w-full items-center gap-3 rounded-xl border bg-surface/50 p-3 pr-12 text-left transition-[border-color,background-color,transform] duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:bg-surface"
                      >
                        <span className="relative grid size-11 shrink-0 place-items-center rounded-lg border bg-raised text-sage transition-colors group-hover:text-foreground">
                          <Folder className="size-5" strokeWidth={1.6} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-medium text-foreground">{folder.name}</span>
                          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{folderSummary(folder.items)}</span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSharingFolder(folder)}
                        aria-label={`Share ${folder.name} folder`}
                        title="Share folder"
                        className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground opacity-100 transition-opacity hover:bg-raised hover:text-foreground sm:opacity-0 sm:focus-visible:opacity-100 sm:group-hover:opacity-100"
                      >
                        <Share2 className="size-3.5" />
                      </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {looseItems.length ? (
                <div className="mt-6">
                  {folders.length ? <h2 className="mb-3 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Files</h2> : null}
                  {renderItems(looseItems)}
                </div>
              ) : null}
            </>
          )
        ) : (
          <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center">
            <Bookmark className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
            <p className="mt-3 text-sm font-medium">
              {query ? "No matching files" : "Your Library is empty"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Save or star datasets and artifacts from any chat to access them across all analyses.
            </p>
          </div>
        )}
        {libraryQuery.isError && (
          <p role="alert" className="mt-4 text-xs text-red-300">
            Library files could not be loaded.
          </p>
        )}
      </section>
      {sharingFolder ? (
        <ShareWorkspaceDialog
          open
          onOpenChange={(open) => { if (!open) setSharingFolder(null); }}
          workspaceId={sharingFolder.id}
          workspaceName={sharingFolder.name}
          subject="folder"
        />
      ) : null}
      {preview && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreview(null);
          }}
        >
          <div className="absolute inset-y-0 right-0 w-full shadow-2xl sm:w-[40vw]">
            <FilePreviewSidebar
              file={preview}
              onBack={() => setPreview(null)}
              onClose={() => setPreview(null)}
            />
          </div>
        </div>
      )}
    </>
  );
}
