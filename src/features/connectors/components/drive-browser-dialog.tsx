"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, ChevronRight, FileText, Folder, LoaderCircle, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { addResourceToLibrary, ApiError, getWorkspaces, importDriveFiles, listDriveFiles } from "@/lib/api";
import type { DriveFileDto, DriveImportResult } from "@/lib/api";
import { formatBytes } from "@/features/context-sidebar/resource-utils";

interface Crumb { id: string | null; name: string }
const ROOT: Crumb = { id: null, name: "My Drive" };

function errorText(error: unknown): string {
  return error instanceof ApiError ? error.message : "Something went wrong. Try again.";
}

export interface DriveImportTarget { scopeType: "chat" | "workspace" | "library"; scopeId: string; label: string }

export function DriveBrowserDialog({ open, onOpenChange, onReauth, target: fixedTarget, onImported, onPick }: { open: boolean; onOpenChange: (open: boolean) => void; onReauth: () => void; target?: DriveImportTarget; onImported?: (result: DriveImportResult) => void; onPick?: (files: DriveFileDto[]) => void }) {
  const queryClient = useQueryClient();
  const [trail, setTrail] = useState<Crumb[]>([ROOT]);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [workspaceId, setWorkspaceId] = useState("");
  const folderId = trail[trail.length - 1].id;
  const seen = useRef(new Map<string, DriveFileDto>());

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!open) { setTrail([ROOT]); setSearch(""); setQuery(""); setSelected([]); importFiles.reset(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces, enabled: open });
  const files = useInfiniteQuery({
    queryKey: ["drive-files", folderId, query],
    queryFn: ({ pageParam }) => listDriveFiles({ folderId, query, pageToken: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_page_token,
    enabled: open,
  });
  const items = files.data?.pages.flatMap((page) => page.items) ?? [];

  useEffect(() => {
    if (files.error instanceof ApiError && files.error.code === "connector_reauth_required") {
      queryClient.invalidateQueries({ queryKey: ["connectors"] });
      onOpenChange(false);
      onReauth();
    }
  }, [files.error, onOpenChange, onReauth, queryClient]);

  const targets = (workspaces.data?.items ?? []).filter((workspace) => !workspace.archived_at);
  const target = workspaceId || targets[0]?.id || "";
  const scope = fixedTarget ?? { scopeType: "workspace" as const, scopeId: target, label: "" };
  const importFiles = useMutation({
    mutationFn: async (toLibrary: boolean) => {
      const result = await importDriveFiles({ fileIds: selected, scopeType: scope.scopeType, scopeId: scope.scopeId });
      if (toLibrary) await Promise.allSettled(result.imported.map((item) => addResourceToLibrary(item.resource.id)));
      return result;
    },
    onSuccess: (result) => {
      setSelected(result.failed.map((item) => item.file_id));
      for (const key of ["datasets", "artifacts", "workspaces", "workspace", "library", "dashboards", "dashboard-datasets"]) queryClient.invalidateQueries({ queryKey: [key] });
      onImported?.(result);
    },
  });

  function toggle(file: DriveFileDto) {
    seen.current.set(file.id, file);
    setSelected((current) => current.includes(file.id) ? current.filter((id) => id !== file.id) : current.length < 10 ? [...current, file.id] : current);
  }
  function openFolder(file: DriveFileDto) {
    setSearch(""); setQuery(""); setSelected([]); importFiles.reset();
    setTrail((current) => [...current, { id: file.id, name: file.name }]);
  }
  const result = importFiles.data;
  const canImport = selected.length > 0 && (Boolean(onPick) || Boolean(scope.scopeId)) && !importFiles.isPending;
  const picked = selected.flatMap((id) => seen.current.get(id) ?? []);
  const failedById = new Map((result?.failed ?? []).map((item) => [item.file_id, item.message]));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-xl flex-col gap-3 p-5">
        <DialogTitle className="text-sm font-semibold">Import from Google Drive</DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">Pick up to 10 files. Google Sheets arrive as Excel files, Docs and Slides as PDF.</DialogDescription>

        <label className="relative block">
          <span className="sr-only">Search Drive</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search all of Drive…" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-xs outline-none focus:border-border-strong" />
        </label>

        {query ? <p className="text-[11px] text-muted-foreground">Results for “{query}”</p> : (
          <nav aria-label="Drive folders" className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
            {trail.map((crumb, index) => (
              <span key={`${crumb.id}-${index}`} className="inline-flex items-center gap-1">
                {index > 0 ? <ChevronRight className="size-3" /> : null}
                <button type="button" disabled={index === trail.length - 1} onClick={() => { setTrail(trail.slice(0, index + 1)); setSelected([]); }} className="hover:text-foreground disabled:text-foreground">{crumb.name}</button>
              </span>
            ))}
          </nav>
        )}

        <div className="min-h-[220px] flex-1 overflow-y-auto rounded-md border" role="list" aria-label="Drive files">
          {files.isPending ? <p className="flex items-center gap-2 p-4 text-xs text-muted-foreground"><LoaderCircle className="size-3.5 animate-spin" />Loading…</p> : null}
          {files.isError ? <p role="alert" className="p-4 text-xs text-red-300">{errorText(files.error)}{files.error instanceof ApiError && files.error.code === "connector_not_connected" ? <> <Link href="/extensions" className="underline">Open Extensions</Link></> : null}</p> : null}
          {files.isSuccess && !items.length ? <p className="p-4 text-xs text-muted-foreground">{query ? "No files match that search." : "This folder is empty."}</p> : null}
          {items.map((file) => {
            const failure = failedById.get(file.id);
            return (
              <div key={file.id} role="listitem" className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                {file.is_folder ? <Folder className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                {file.is_folder ? (
                  <button type="button" onClick={() => openFolder(file)} className="min-w-0 flex-1 truncate text-left text-xs hover:underline">{file.name}</button>
                ) : (
                  <label className={`flex min-w-0 flex-1 items-center gap-3 ${file.importable ? "cursor-pointer" : "opacity-50"}`}>
                    <input type="checkbox" disabled={!file.importable} checked={selected.includes(file.id)} onChange={() => toggle(file)} aria-label={`Select ${file.name}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{file.name}</span>
                      {failure ? <span className="block truncate text-[10px] text-red-300">{failure}</span> : !file.importable ? <span className="block text-[10px] text-muted-foreground">Not supported or over 25 MB</span> : null}
                    </span>
                    {file.size_bytes != null ? <span className="shrink-0 text-[10px] text-muted-foreground">{formatBytes(file.size_bytes)}</span> : null}
                  </label>
                )}
              </div>
            );
          })}
          {files.hasNextPage ? <button type="button" onClick={() => void files.fetchNextPage()} disabled={files.isFetchingNextPage} className="w-full p-3 text-xs text-muted-foreground hover:text-foreground">{files.isFetchingNextPage ? "Loading…" : "Load more"}</button> : null}
        </div>

        {result ? (
          <p role="status" className="text-xs text-muted-foreground">
            Imported {result.imported.length} {result.imported.length === 1 ? "file" : "files"}{result.failed.length ? `, ${result.failed.length} could not be imported` : ""}.
          </p>
        ) : null}
        {importFiles.isError ? <p role="alert" className="text-xs text-red-300">{errorText(importFiles.error)}</p> : null}

        {onPick ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Imported when you send the message.</p>
            <button type="button" disabled={!canImport} onClick={() => { onPick(picked); onOpenChange(false); }} className="h-8 rounded-md bg-foreground px-3 text-xs text-background hover:opacity-90 disabled:opacity-40">Add{selected.length ? ` ${selected.length}` : ""}</button>
          </div>
        ) : (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {fixedTarget ? (
            <p className="text-xs text-muted-foreground">Adds to {fixedTarget.label}</p>
          ) : (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              Add to workspace
              <select value={target} onChange={(event) => setWorkspaceId(event.target.value)} disabled={!targets.length} className="h-8 max-w-[10rem] rounded-md border bg-background px-2 text-xs text-foreground">
                {targets.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}
              </select>
            </label>
          )}
          <div className="flex items-center gap-2">
            {fixedTarget?.scopeType === "library" ? null : (
              <button type="button" disabled={!canImport} onClick={() => importFiles.mutate(true)} className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-xs hover:bg-raised disabled:opacity-40">
                <Bookmark className="size-3.5" />Save to Library
              </button>
            )}
            <button type="button" disabled={!canImport} onClick={() => importFiles.mutate(false)} className="h-8 rounded-md bg-foreground px-3 text-xs text-background hover:opacity-90 disabled:opacity-40">
              {importFiles.isPending ? "Importing…" : `Import${selected.length ? ` ${selected.length}` : ""}`}
            </button>
          </div>
        </div>
        )}
        {!onPick && !fixedTarget && workspaces.isSuccess && !targets.length ? <p className="text-[11px] text-muted-foreground">Create a workspace first; imported files are added to one.</p> : null}
      </DialogContent>
    </Dialog>
  );
}
