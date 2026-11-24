"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BarChart3,
  HardDrive,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
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
  Link2,
  List,
  Paperclip,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRouter } from "next/navigation";
import { DriveBrowserDialog } from "@/features/connectors/components/drive-browser-dialog";
import { SyntaxHighlightedCode } from "@/features/chat/components/syntax-highlighted-code";
import { FilePreviewSidebar, type ContextFile } from "@/features/context-sidebar";
import { ShareWorkspaceDialog } from "@/features/workspaces/components/share-workspace-dialog";
import { formatBytes } from "@/features/context-sidebar/resource-utils";
import {
  downloadLibraryDatasets,
  downloadResource,
  getLibrary,
  getResourcePreview,
  getResourcePreviewText,
  removeResourceFromLibrary,
  uploadResource,
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

function sourceLabel(item: LibraryResource): string {
  if (item.uploaded_in_library && !item.workspace_id) return "Uploaded in Library";
  return `From ${item.workspace_name ?? (item.workspace_id ? "workspace" : "standalone chat")}`;
}

type LibraryView = "grid" | "list";
type LibraryFolder = { id: string; name: string; items: LibraryResource[] };

const folderCategoryColors: Record<LibraryResource["library_category"], string> = {
  dataset: "bg-blue-400", visual: "bg-emerald-400", report: "bg-amber-400", code: "bg-violet-400", other: "bg-slate-400",
};
type Ownership = "all" | "mine" | "shared";

const OWNERSHIP: Array<{ id: Ownership; label: string }> = [
  { id: "all", label: "All" },
  { id: "mine", label: "Mine" },
  { id: "shared", label: "Shared with me" },
];

function OwnershipFilter({ value, onChange }: { value: Ownership; onChange: (value: Ownership) => void }) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} className="relative shrink-0">
      <button ref={trigger} type="button" aria-label={`Library ownership: ${OWNERSHIP.find((option) => option.id === value)?.label}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((previous) => !previous)} className="inline-flex h-10 items-center gap-2 rounded-md border bg-surface px-3 text-xs font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {OWNERSHIP.find((option) => option.id === value)?.label}
        <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="dialog" aria-label="Library ownership" className="absolute left-0 top-full z-30 mt-1.5 w-44 rounded-lg border bg-[var(--surface-raised)] p-1 shadow-xl">
          {OWNERSHIP.map((option) => (
            <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => { onChange(option.id); setOpen(false); trigger.current?.focus(); }} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs transition-colors hover:bg-surface hover:text-foreground focus-visible:bg-surface focus-visible:outline-none ${value === option.id ? "bg-surface text-foreground" : "text-muted-foreground"}`}>
              {option.label}
              {value === option.id && <Check aria-hidden="true" className="size-3.5 text-sage" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

type Filter = "all" | "favorites" | "folders" | LibraryResource["library_category"];

const FILTERS: Array<{ id: Filter; label: string; icon: typeof Layers3 }> = [
  { id: "all", label: "All", icon: Layers3 },
  { id: "favorites", label: "Favorites", icon: Star },
  { id: "folders", label: "Folders", icon: Folder },
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
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  const [sharingFolder, setSharingFolder] = useState<LibraryFolder | null>(null);
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
  const [driveOpen, setDriveOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const localFileRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useMutation({
    mutationFn: async (files: File[]) => {
      for (const file of files) await uploadResource({ file, scopeType: "library", scopeId: "library", clientUploadId: crypto.randomUUID() });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["library"] }); },
  });
  const router = useRouter();

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

  const zipMutation = useMutation({ mutationFn: downloadLibraryDatasets });
  const hasDatasets = (libraryQuery.data?.items ?? []).some((item) => item.library_category === "dataset");

  const items = useMemo(() => {
    const search = query.trim().toLowerCase();
    // The Library only holds the signed-in user's own saves; nothing is shared into it yet.
    if (ownership === "shared") return [];
    return (libraryQuery.data?.items ?? []).filter((item) => {
      const matchesSearch = !search || item.name.toLowerCase().includes(search);
      const matchesFilter =
        filter === "all" || filter === "folders"
          ? true
          : filter === "favorites"
            ? favorites.has(item.id)
            : item.library_category === filter;
      return matchesSearch && matchesFilter;
    });
  }, [favorites, filter, libraryQuery.data?.items, ownership, query]);

  function renderItems(list: LibraryResource[]) {
    return (
      <div
        className={`grid gap-4 ${
          view === "grid" ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1 lg:grid-cols-2"
        }`}
      >
        {list.map((item) => {
          const isFav = favorites.has(item.id);
          return (
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
            {isFav && (
              <span aria-hidden="true" className="pointer-events-none absolute left-2 top-2 z-10 grid size-6 place-items-center rounded-md border border-amber-400/40 bg-black/70 text-amber-400">
                <Star className="size-3 fill-amber-400" />
              </span>
            )}
            {view === "grid" && <div className="pointer-events-none absolute inset-x-0 bottom-[64px] h-16 bg-gradient-to-t from-background/95 to-transparent" />}
            {view === "grid" && <span className={`pointer-events-none absolute bottom-[78px] left-3 text-[10px] font-medium uppercase tracking-[0.12em] ${categoryStyle[item.library_category].color}`}>{categoryLabel(item.library_category)}</span>}
            <div className={`relative min-w-0 shrink-0 p-3 ${view === "list" ? "flex-1" : ""}`}>
              <button
                type="button"
                onClick={() => setPreview(item)}
                className="block w-full text-left"
              >
                <h2 title={item.name} className="col-span-full truncate text-sm font-semibold leading-snug tracking-tight text-foreground [overflow-wrap:anywhere]">
                  {item.name}
                </h2>
                <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                  <span className={`shrink-0 ${categoryStyle[item.library_category].color}`}>
                    {categoryLabel(item.library_category)}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="shrink-0">{formatBytes(item.size_bytes)}</span>
                  <span aria-hidden="true">·</span>
                  <span className="flex min-w-0 items-center gap-1" title={sourceLabel(item)}>
                    <Folder aria-hidden="true" className="size-3 shrink-0" />
                    <span className="truncate">{sourceLabel(item)}</span>
                  </span>
                </p>
              </button>
              <div className={`absolute right-3 flex items-center gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:focus-within:opacity-100 ${view === "grid" ? "bottom-full mb-2" : "bottom-3.5"}`}>
                <button
                  type="button"
                  onClick={() => toggleFavorite(item.id)}
                  aria-label={isFav ? `Unfavorite ${item.name}` : `Favorite ${item.name}`}
                  aria-pressed={isFav}
                  className={cn(
                    "grid size-7 place-items-center rounded-md bg-raised transition-colors",
                    isFav ? "text-amber-400 hover:text-amber-300" : "text-muted-foreground hover:text-foreground"
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
    return {
      folders: [...byWorkspace.values()].sort((a, b) => a.name.localeCompare(b.name)),
      looseItems: items.filter((item) => !item.workspace_id),
    };
  }, [filter, items, query]);
  const openFolder = folders.find((folder) => folder.id === openFolderId) ?? null;

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
          <div className="flex shrink-0 items-center gap-2">
          <div className="relative shrink-0" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setAddMenuOpen(false); }}>
            <button type="button" aria-haspopup="menu" aria-expanded={addMenuOpen} disabled={uploadMutation.isPending} onClick={() => setAddMenuOpen((open) => !open)} className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60">
              <Plus className="size-3.5" />{uploadMutation.isPending ? "Uploading…" : "Add dataset"}
            </button>
            <input
              ref={localFileRef}
              type="file"
              multiple
              accept=".csv,.tsv,.xlsx,.xls,.parquet"
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose dataset files"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                if (files.length) uploadMutation.mutate(files);
                event.currentTarget.value = "";
              }}
            />
            {addMenuOpen ? (
              <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-72 animate-pop-in overflow-hidden rounded-xl border border-border-strong bg-sidebar p-1.5 shadow-2xl">
                <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); localFileRef.current?.click(); }} className="flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-raised">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#b8cef0] text-[#172033]"><Paperclip className="size-4" /></span>
                  <span className="min-w-0"><span className="block text-xs font-semibold">Local storage</span><span className="block text-[10px] text-muted-foreground">Upload from your device</span></span>
                </button>
                <button type="button" role="menuitem" aria-expanded={connectorsOpen} onClick={() => setConnectorsOpen((open) => !open)} className="mt-0.5 flex w-full items-center gap-3 rounded-lg p-2 text-left hover:bg-raised">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-[#c2d9b8] text-[#172e18]"><Link2 className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-xs font-semibold">Connectors</span><span className="block text-[10px] text-muted-foreground">Google Drive and other data sources</span></span>
                  <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", connectorsOpen && "rotate-90")} />
                </button>
                {connectorsOpen ? (
                  <button type="button" role="menuitem" onClick={() => { setAddMenuOpen(false); setDriveOpen(true); }} className="mt-0.5 flex w-full items-center gap-3 rounded-lg py-2 pl-9 pr-2 text-left hover:bg-raised">
                    <HardDrive className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1"><span className="block text-xs font-medium">Google Drive</span><span className="block truncate text-[10px] text-muted-foreground">Import files from your Google Drive</span></span>
                    <span className="shrink-0 rounded-full border border-emerald-400/40 bg-emerald-400/10 px-2 py-0.5 text-[9px] uppercase tracking-wide text-emerald-300">Import</span>
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            disabled={!hasDatasets || zipMutation.isPending}
            onClick={() => zipMutation.mutate(undefined)}
            title={hasDatasets ? "Download every saved dataset as a ZIP" : "No saved datasets to download"}
            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border bg-surface px-3 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Download className="size-3.5" />{zipMutation.isPending ? "Preparing ZIP…" : "Download all datasets"}
          </button>
          </div>
        </header>
        <DriveBrowserDialog open={driveOpen} onOpenChange={setDriveOpen} onReauth={() => router.push("/connectors")} target={{ scopeType: "library", scopeId: "library", label: "your Library" }} />
        {zipMutation.isError ? <p role="alert" className="-mt-3 mb-4 text-xs text-red-300">Download failed. Please try again.</p> : null}

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
                  className={cn("size-3.5", id === "favorites" && favorites.size > 0 && "fill-amber-400 text-amber-400")}
                />
                {label}
                {id === "favorites" && favorites.size > 0 && (
                  <span className="ml-1 rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 text-[10px] font-semibold text-amber-400">
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
          openFolder ? (
            <div className="mt-6 animate-pop-in">
              <nav aria-label="Library folder" className="mb-4 flex items-center gap-1.5 text-xs">
                <button type="button" onClick={() => setOpenFolderId(null)} className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-muted-foreground hover:bg-raised hover:text-foreground">
                  <ChevronLeft className="size-3.5" />Folders
                </button>
                <span className="text-muted-foreground/60">/</span>
                <span className="inline-flex items-center gap-1.5 font-medium text-foreground"><Folder className="size-3.5 text-sage" />{openFolder.name}</span>
                <span className="text-muted-foreground">· {openFolder.items.length} items</span>
                {openFolder.items.some((item) => item.library_category === "dataset") ? (
                  <button type="button" disabled={zipMutation.isPending} onClick={() => zipMutation.mutate({ id: openFolder.id, name: openFolder.name })} className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:opacity-50">
                    <Download className="size-3.5" />{zipMutation.isPending ? "Preparing ZIP…" : "Download datasets"}
                  </button>
                ) : null}
                <button type="button" onClick={() => setSharingFolder(openFolder)} className={`${openFolder.items.some((item) => item.library_category === "dataset") ? "" : "ml-auto "}inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground`}>
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
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {folders.map((folder) => {
                      const counts = Object.entries(folderCategoryColors).map(([category, color]) => ({
                        category: category as LibraryResource["library_category"],
                        color,
                        count: folder.items.filter((item) => item.library_category === category).length,
                      })).filter(({ count }) => count > 0);
                      return (
                      <div key={folder.id} className="group relative pt-3">
                      <button
                        type="button"
                        onClick={() => setOpenFolderId(folder.id)}
                        aria-label={`Open ${folder.name} folder`}
                        className="relative flex min-h-48 w-full flex-col items-start rounded-xl rounded-tl-none border border-border-strong bg-surface px-4 pb-4 pt-5 text-left transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <span aria-hidden="true" className="absolute -top-3 left-[-1px] h-3 w-16 rounded-t-xl border border-b-0 border-border-strong bg-surface transition-colors group-hover:bg-raised" />
                        <span className="block max-w-full truncate pr-8 text-sm font-semibold text-foreground">{folder.name}</span>
                        <span className="mt-1 text-[11px] text-muted-foreground">{folder.items.length} {folder.items.length === 1 ? "file" : "files"}</span>
                        <span aria-hidden="true" className="mt-4 flex h-1 w-full gap-0.5 overflow-hidden rounded-full">
                          {counts.map(({ category, color, count }) => <span key={category} className={color} style={{ flex: count }} />)}
                        </span>
                        <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                          {counts.map(({ category, count }) => <span key={category}>{count} {categoryLabel(category).toLowerCase()}{count === 1 ? "" : "s"}</span>)}
                        </span>
                        <span className="mt-auto flex w-full items-center justify-between gap-2 pt-5 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1.5"><Database aria-hidden="true" className="size-3.5" />{formatBytes(folder.items.reduce((total, item) => total + item.size_bytes, 0))}</span>
                          <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg border bg-raised transition-colors group-hover:text-foreground"><ArrowRight className="size-4" /></span>
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSharingFolder(folder)}
                        aria-label={`Share ${folder.name} folder`}
                        title="Share folder"
                        className="absolute right-2 top-5 grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Share2 className="size-3.5" />
                      </button>
                      </div>
                    ); })}
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
            {filter === "favorites" && ownership !== "shared" ? (
              <Star className="mx-auto size-7 text-amber-400/60" strokeWidth={1.5} />
            ) : (
              <Bookmark className="mx-auto size-7 text-muted-foreground" strokeWidth={1.5} />
            )}
            <p className="mt-3 text-sm font-medium">
              {ownership === "shared"
                ? "Nothing shared with you yet"
                : filter === "favorites"
                  ? "No favorite files yet"
                  : query
                    ? "No matching files"
                    : "Your Library is empty"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {ownership === "shared"
                ? "Files other people share with you will appear here."
                : filter === "favorites"
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
