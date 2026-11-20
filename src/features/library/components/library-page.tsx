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
import { SyntaxHighlightedCode } from "@/features/chat/components/syntax-highlighted-code";
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

const categoryStyle = {
  dataset: { icon: Database, color: "text-sage", tint: "from-emerald-300/[0.085]" },
  code: { icon: Code2, color: "text-violet-400", tint: "from-violet-300/[0.12]" },
  report: { icon: FileText, color: "text-yellow-400", tint: "from-yellow-300/[0.095]" },
  visual: { icon: FileImage, color: "text-blue-400", tint: "from-blue-300/[0.16]" },
  other: { icon: FileText, color: "text-muted-foreground", tint: "from-white/[0.045]" },
} satisfies Record<LibraryResource["library_category"], { icon: typeof Database; color: string; tint: string }>;

function ResourceIcon({ item }: { item: LibraryResource }) {
  const { icon: Icon, color } = categoryStyle[item.library_category];
  return <Icon className={`size-5 ${color}`} />;
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
type Ownership = "all" | "mine" | "shared";

const OWNERSHIP: Array<{ id: Ownership; label: string }> = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "shared", label: "Shared with me" },
];

type Filter = "all" | "folders" | LibraryResource["library_category"];

const FILTERS: Array<{ id: Filter; label: string; icon: typeof Layers3 }> = [
  { id: "all", label: "All", icon: Layers3 },
  { id: "folders", label: "Folders", icon: Folder },
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

function LibraryThumbnail({ item, compact }: { item: LibraryResource; compact: boolean }) {
  const isImage = item.resource_type === "artifact" && (item.kind === "image" || item.kind === "chart");
  const isPdf = item.mime_type === "application/pdf";
  const isCode = item.library_category === "code";
  const previewUrl = isPdf && item.preview_url ? `${item.preview_url}?thumbnail=true` : item.preview_url;
  const { data: blob } = useQuery({
    queryKey: ["library-thumbnail", previewUrl],
    queryFn: () => getResourcePreview(previewUrl!),
    enabled: Boolean(previewUrl && (isPdf || isImage)),
    staleTime: 60_000,
    retry: false,
  });
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [codePreview, setCodePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setImageUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setImageUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [blob]);

  useEffect(() => {
    if (!isCode || !item.preview_url) return;
    let active = true;
    setCodePreview(null);
    void getResourcePreviewText(item.preview_url)
      .then((text) => {
        if (active) setCodePreview(text.slice(0, 2000).split("\n").slice(0, 9).join("\n"));
      })
      .catch(() => {
        if (active) setCodePreview(null);
      });
    return () => {
      active = false;
    };
  }, [isCode, item.preview_url]);

  // eslint-disable-next-line @next/next/no-img-element
  if ((isImage || isPdf) && imageUrl) return <img src={imageUrl} alt="" className="size-full object-contain p-2" />;
  if (item.resource_type === "dataset") {
    const columns = item.columns?.slice(0, 3) ?? [];
    const rowCount = compact ? 2 : 4;
    const gridStyle = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };
    return (
      <div className={`flex size-full items-center overflow-hidden text-foreground/80 ${compact ? "p-1.5" : "p-3"}`}>
        {columns.length ? (
          <div className="w-full overflow-hidden rounded-md border border-white/10 bg-background/60">
            <div style={gridStyle} className={`grid bg-white/[0.035] font-medium ${compact ? "text-[8px]" : "text-[10px]"}`}>
              {columns.map((column, index) => (
                <span
                  key={`${column.name}-${index}`}
                  className="truncate px-2 py-1"
                >
                  {column.name}
                </span>
              ))}
            </div>
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <div key={rowIndex} style={gridStyle} className={`grid border-t border-white/[0.06] ${compact ? "text-[8px]" : "text-[10px]"}`}>
                {columns.map((column, columnIndex) => (
                  <span
                    key={`${column.name}-${columnIndex}`}
                    className="truncate px-2 py-1"
                  >
                    {item.preview_rows?.[rowIndex] ? String(item.preview_rows[rowIndex][columnIndex] ?? "—") : "\u00a0"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid min-h-20 w-full place-items-center">
            <Database className="size-9 text-sage/70" />
          </div>
        )}
      </div>
    );
  }
  if (isCode && codePreview) {
    return (
      <div className="size-full overflow-hidden p-3 font-mono text-[10px] leading-5 text-slate">
        <div className="mb-2 flex items-center gap-1.5 font-sans text-[9px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
          <Code2 className={`size-3.5 ${categoryStyle.code.color}`} />
          Code preview
        </div>
        <pre className="whitespace-pre-wrap break-words">
          <SyntaxHighlightedCode code={codePreview} language={item.name.split(".").pop() || "text"} />
        </pre>
      </div>
    );
  }
  return (
    <div className="grid size-full place-items-center text-muted-foreground">
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
  const [ownership, setOwnership] = useState<Ownership>("all");
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
    // The Library only holds the signed-in user's own saves; nothing is shared into it yet.
    if (ownership === "shared") return [];
    return (libraryQuery.data?.items ?? []).filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search);
      return matchesSearch && (filter === "all" || filter === "folders" || item.library_category === filter);
    });
  }, [filter, libraryQuery.data?.items, ownership, query]);

  function renderItems(list: LibraryResource[]) {
    return (
      <div
        className={`grid gap-4 ${
          view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 lg:grid-cols-2"
        }`}
      >
        {list.map((item) => (
          <article
            key={item.id}
            className={`group relative min-w-0 overflow-hidden rounded-xl border bg-background transition-colors hover:border-border-strong ${
              view === "list" ? "flex min-h-20 items-stretch" : "flex flex-col"
            }`}
          >
            <button
              type="button"
              onClick={() => setPreview(item)}
              aria-label={`Preview ${item.name}`}
              className={`relative block shrink-0 overflow-hidden bg-gradient-to-br ${categoryStyle[item.library_category].tint} to-transparent text-left ${
                view === "list" ? "h-20 w-28 self-center" : "aspect-[5/4] w-full border-b border-white/[0.06]"
              }`}
            >
              <LibraryThumbnail item={item} compact={view === "list"} />
            </button>
            <div className={`relative min-w-0 shrink-0 p-3 ${view === "list" ? "flex-1" : ""}`}>
              <button
                type="button"
                onClick={() => setPreview(item)}
                className={`w-full text-left ${view === "grid" ? "grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1" : "block"}`}
              >
                <h2 title={item.name} className="col-span-full truncate text-sm font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere]">
                  {item.name}
                </h2>
                <p className={`flex items-center gap-2 text-xs text-muted-foreground ${view === "list" ? "mt-1" : ""}`}>
                  <span aria-hidden="true" className="[&>svg]:size-3.5"><ResourceIcon item={item} /></span>
                  <span>
                    {categoryLabel(item.library_category)}
                  </span>
                  <span aria-hidden="true">·</span>
                  {formatBytes(item.size_bytes)}
                </p>
                <p className={`inline-flex min-w-0 items-center gap-1.5 text-[11px] font-medium leading-none text-muted-foreground ${view === "list" ? "mt-2 max-w-[calc(100%-5.75rem)] py-1" : "justify-self-end max-w-full"}`}>
                  <BarChart3 aria-hidden="true" className="size-3 shrink-0" />
                  <span className="truncate">From {item.workspace_name ?? (item.workspace_id ? "workspace" : "standalone chat")}</span>
                </p>
              </button>
              <div className={`absolute right-3 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 ${view === "grid" ? "bottom-full mb-2" : "bottom-3.5"}`}>
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
    if (filter !== "folders" || query.trim()) return { folders: [] as LibraryFolder[], looseItems: items };
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
  }, [filter, items, query]);
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

        <div aria-label="Library ownership" className="mb-3 inline-flex h-8 rounded-md border bg-surface p-0.5">
          {OWNERSHIP.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={ownership === option.id}
              onClick={() => setOwnership(option.id)}
              className={`rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground ${ownership === option.id ? "bg-raised text-foreground" : ""}`}
            >{option.label}</button>
          ))}
        </div>

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
                onClick={() => { setFilter(id); setOpenFolderId(null); }}
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
              <div key={key} className="aspect-[20/21] animate-pulse rounded-xl border bg-surface" />
            ))}
          </div>
        ) : items.length ? (
          openFolder ? (
            <div className="mt-6 animate-pop-in">
              <nav aria-label="Library folder" className="mb-4 flex items-center gap-1.5 text-xs">
                <button type="button" onClick={() => setOpenFolderId(null)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-raised hover:text-foreground">
                  <ChevronLeft className="size-3.5" />Folders
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
              {ownership === "shared" ? "Nothing shared with you yet" : query ? "No matching files" : "Your Library is empty"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ownership === "shared"
                ? "Files other people share with you will appear here."
                : "Save or star datasets and artifacts from any chat to access them across all analyses."}
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
