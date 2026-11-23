"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
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
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
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
type Filter = "all" | "favorites" | LibraryResource["library_category"];

const FILTERS: Array<{ id: Filter; label: string; icon: typeof Layers3 }> = [
  { id: "all", label: "All", icon: Layers3 },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "dataset", label: "Datasets", icon: Database },
  { id: "report", label: "Reports", icon: FileText },
  { id: "visual", label: "Visuals", icon: BarChart3 },
  { id: "code", label: "Code", icon: Code2 },
];

const FAVORITES_STORAGE_KEY = "dsai:library:favorites";

function getStoredFavorites(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveStoredFavorites(favs: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(favs)));
  } catch {
    // Ignore storage quota/permission issues
  }
}

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
  if ((isImage || isPdf) && imageUrl) return <img src={imageUrl} alt="" className="size-full object-cover object-top" />;
  if (item.resource_type === "dataset") {
    const columns = item.columns?.slice(0, 3) ?? [];
    const rowCount = compact ? 2 : 4;
    const gridStyle = { gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` };
    return (
      <div className={`flex size-full flex-col items-start overflow-hidden text-foreground/80 ${compact ? "justify-center p-1.5" : "p-3"}`}>
        {!compact && <div className="mb-2 flex items-center gap-1.5 text-[9px] uppercase text-sage"><Database className="size-3.5" /> Dataset</div>}
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
  const [favorites, setFavorites] = useState<Set<string>>(() => getStoredFavorites());

  function toggleFavorite(id: string) {
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveStoredFavorites(next);
      return next;
    });
  }

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
      const isFav = favorites.has(item.id) || Boolean((item as { saved?: boolean }).saved);
      const matchesFilter =
        filter === "all"
          ? true
          : filter === "favorites"
          ? isFav
          : item.library_category === filter;
      return matchesSearch && matchesFilter;
    });
  }, [favorites, filter, libraryQuery.data?.items, query]);

  return (
    <>
      <section className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8 lg:py-9">
        <header className="mb-6 flex items-start justify-between gap-5">
          <div className="flex items-start gap-3.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl border bg-raised text-slate">
              <Layers3 className="size-6" strokeWidth={1.5} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Library</h1>
              <p className="mt-1 text-sm text-muted-foreground">Files saved from your analyses.</p>
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
                onClick={() => { setFilter(id); setOpenFolderId(null); }}
                className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition-colors ${
                  filter === id
                    ? "bg-raised text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon
                  className={cn(
                    "size-3.5",
                    id === "favorites" && favorites.size > 0 && "text-amber-400 fill-amber-400"
                  )}
                />
                {label}
                {id === "favorites" && favorites.size > 0 && (
                  <span className="ml-1 rounded-full bg-amber-400/10 px-1.5 py-0.2 text-[10px] font-semibold text-amber-400 border border-amber-400/20">
                    {favorites.size}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="flex min-w-0 items-center gap-2">
            <OwnershipFilter value={ownership} onChange={setOwnership} />
            <label className="relative block min-w-0 w-full sm:w-72">
              <span className="sr-only">Search library</span>
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search library..."
                className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-xs outline-none placeholder:text-muted-foreground focus:border-border-strong"
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
          <div
            className={`mt-6 grid gap-4 ${
              view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"
            }`}
          >
            {items.map((item) => {
              const isFav = favorites.has(item.id) || Boolean((item as { saved?: boolean }).saved);
              return (
                <article
                  key={item.id}
                  className={`group min-w-0 overflow-hidden rounded-xl border bg-surface/50 transition-colors hover:border-border-strong hover:bg-surface ${
                    view === "list" ? "flex min-h-20 items-stretch" : ""
                  }`}
                >
                  <div
                    className={`relative block shrink-0 overflow-hidden bg-raised text-left ${
                      view === "list" ? "h-20 w-28" : "aspect-[5/4] w-full"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setPreview(item)}
                      aria-label={`Preview ${item.name}`}
                      className="size-full"
                    >
                      <LibraryThumbnail item={item} />
                    </button>
                    {view === "grid" && (
                      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-7 text-[10px] font-medium uppercase tracking-[0.12em] text-white/80">
                        {categoryLabel(item.library_category)}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleFavorite(item.id);
                      }}
                      aria-label={isFav ? `Unfavorite ${item.name}` : `Favorite ${item.name}`}
                      aria-pressed={isFav}
                      className={cn(
                        "absolute top-2 right-2 z-10 grid size-7 place-items-center rounded-md border backdrop-blur-sm transition-all",
                        isFav
                          ? "bg-black/70 border-amber-400/40 text-amber-400 opacity-100"
                          : "bg-black/40 border-white/10 text-white/70 opacity-0 group-hover:opacity-100 hover:text-white hover:bg-black/60"
                      )}
                    >
                      <Star className={cn("size-3.5", isFav && "fill-amber-400")} />
                    </button>
                  </div>
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
                        onClick={() => toggleFavorite(item.id)}
                        aria-label={isFav ? `Unfavorite ${item.name}` : `Favorite ${item.name}`}
                        aria-pressed={isFav}
                        className={cn(
                          "grid size-7 place-items-center rounded-md bg-raised transition-colors",
                          isFav
                            ? "text-amber-400 hover:text-amber-300"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <Star className={cn("size-3.5", isFav && "fill-amber-400")} />
                      </button>
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
              );
            })}
          </div>
        ) : (
          <div className="mt-8 rounded-xl border border-dashed px-6 py-16 text-center">
            {filter === "favorites" ? (
              <Star className="mx-auto size-7 text-amber-400/60" strokeWidth={1.5} />
            ) : (
              <Bookmark className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
            )}
            <p className="mt-3 text-sm font-medium">
              {filter === "favorites"
                ? "No favorite files yet"
                : query
                ? "No matching files"
                : "Your Library is empty"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {filter === "favorites"
                ? "Star any file or artifact in your Library to quickly find it here."
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
