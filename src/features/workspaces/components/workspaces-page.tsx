"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Folder, Pin, PinOff, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteWorkspace, getWorkspaces, uploadResource, type WorkspaceDto } from "@/lib/api";
import { usePinnedItems } from "@/features/pinning";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";
import { WorkspaceRowMenu } from "./workspace-row-menu";

type Ownership = "all" | "owned" | "shared";
type Sort = "updated_desc" | "updated_asc" | "name_asc";

const ownershipOptions: Array<{ value: Ownership; label: string }> = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "shared", label: "Shared" },
];

export function WorkspacesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const { togglePin } = usePinnedItems();

  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });

  const workspaces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...(workspacesQuery.data?.items ?? [])]
      .filter(() => ownership !== "shared")
      .filter((workspace) => !query || workspace.name.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        if (sort === "name_asc") return left.name.localeCompare(right.name);
        return sort === "updated_asc" ? left.updated_at.localeCompare(right.updated_at) : right.updated_at.localeCompare(left.updated_at);
      });
  }, [ownership, search, sort, workspacesQuery.data?.items]);

  const uploadInitialFiles = useMutation({
    mutationFn: async ({ workspace, files }: { workspace: WorkspaceDto; files: File[] }) => {
      await Promise.all(
        files.map((file, index) =>
          uploadResource({
            file,
            scopeType: "workspace",
            scopeId: workspace.id,
            clientUploadId: `workspace-${workspace.id}-${index}-${file.name}-${file.lastModified}`,
          })
        )
      );
      return workspace;
    },
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: async (workspaceIds: string[]) => { await Promise.all(workspaceIds.map((id) => deleteWorkspace(id))); },
    onSuccess: async (_result, workspaceIds) => {
      setActiveMenuId(null);
      setSelectedIds((current) => new Set([...current].filter((id) => !workspaceIds.includes(id))));
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  async function addCreatedWorkspace(workspace: WorkspaceDto, files: File[]) {
    await uploadInitialFiles.mutateAsync({ workspace, files });
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    router.push(`/workspaces/${workspace.id}`);
  }

  const selectedWorkspaces = workspaces.filter((workspace) => selectedIds.has(workspace.id));
  const allSelected = workspaces.length > 0 && selectedWorkspaces.length === workspaces.length;

  function toggleSelected(workspaceId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(workspaceId)) next.delete(workspaceId);
      else next.add(workspaceId);
      return next;
    });
  }

  function pinSelected(pinned: boolean) {
    selectedWorkspaces.filter((workspace) => Boolean(workspace.pinned_at) !== pinned).forEach((workspace) => togglePin("workspace", workspace.id, pinned));
  }

  async function handleCopyLink(workspaceId: string) {
    if (typeof window !== "undefined") {
      await navigator.clipboard.writeText(`${window.location.origin}/workspaces/${workspaceId}`);
      setCopiedId(workspaceId);
      setTimeout(() => setCopiedId(null), 1500);
    }
  }

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <header className="mb-6 flex items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-semibold tracking-tight">Workspaces</h1>
            <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
              Workspace Scope
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Organize analyses, shared datasets, and persistent context
          </p>
        </div>
        <CreateWorkspaceDialog onCreated={addCreatedWorkspace} />
      </header>

      <div className="space-y-3">
        <label className="relative block">
          <span className="sr-only">Search workspaces</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search workspaces..."
            className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong"
          />
          {search && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => setSearch("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <div aria-label="Workspace ownership" className="inline-flex h-8 rounded-md border bg-surface p-0.5">
            {ownershipOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={ownership === option.value}
                onClick={() => setOwnership(option.value)}
                className={cn(
                  "rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground",
                  ownership === option.value && "bg-raised text-foreground font-medium"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="relative ml-auto">
            <span className="sr-only">Sort workspaces</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              className="h-8 appearance-none rounded-md border bg-surface py-0 pl-2.5 pr-8 text-xs text-muted-foreground outline-none hover:border-border-strong focus:border-border-strong"
            >
              <option value="updated_desc">Sort: Last updated</option>
              <option value="updated_asc">Sort: Oldest updated</option>
              <option value="name_asc">Sort: Name</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          </label>
        </div>
      </div>

      {workspacesQuery.isLoading ? (
        <div className="mt-6 rounded-md border px-6 py-14 text-center text-sm text-muted-foreground">
          Loading workspaces…
        </div>
      ) : workspacesQuery.isError ? (
        <div className="mt-6 rounded-md border border-red-400/30 px-6 py-14 text-center">
          <p className="text-sm font-medium">Could not load workspaces</p>
          <button
            type="button"
            onClick={() => workspacesQuery.refetch()}
            className="mt-3 text-xs text-slate hover:underline"
          >
            Try again
          </button>
        </div>
      ) : workspaces.length > 0 ? (
        <>
        {selectedWorkspaces.length > 0 && (
          <div role="toolbar" aria-label="Selected workspace actions" className="mt-6 flex min-h-10 items-center justify-between gap-3 rounded-md border bg-surface px-3 py-1.5">
            <span className="text-xs font-medium">{selectedWorkspaces.length} selected</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => pinSelected(true)} className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-raised hover:text-foreground"><Pin className="size-3.5" />Pin</button>
              <button type="button" onClick={() => pinSelected(false)} className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted-foreground hover:bg-raised hover:text-foreground"><PinOff className="size-3.5" />Unpin</button>
              <button type="button" disabled={deleteWorkspaceMutation.isPending} onClick={() => deleteWorkspaceMutation.mutate(selectedWorkspaces.map((workspace) => workspace.id))} className="flex h-7 items-center gap-1.5 rounded px-2 text-xs text-red-300 hover:bg-red-400/10"><Trash2 className="size-3.5" />Delete</button>
              <button type="button" aria-label="Clear selection" onClick={() => setSelectedIds(new Set())} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground"><X className="size-3.5" /></button>
            </div>
          </div>
        )}
        <div className={cn("overflow-x-auto rounded-md border", selectedWorkspaces.length > 0 ? "mt-2" : "mt-6")}>
          <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
            <thead className="bg-surface text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="w-10 px-3 py-2.5">
                  <input type="checkbox" aria-label="Select all workspaces" checked={allSelected} onChange={() => setSelectedIds(allSelected ? new Set() : new Set(workspaces.map((workspace) => workspace.id)))} className="size-3.5 accent-[var(--primary)]" />
                </th>
                <th className="w-[40%] px-1 py-2.5 font-medium">Workspace</th>
                <th className="w-[16%] px-3.5 py-2.5 font-medium">Author</th>
                <th className="w-[18%] px-3.5 py-2.5 font-medium">Created</th>
                <th className="w-[18%] px-3.5 py-2.5 font-medium">Last updated</th>
                <th className="w-12 px-2 text-right"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((workspace) => (
                <tr
                  key={workspace.id}
                  className={cn("group relative border-t text-xs transition-colors hover:bg-surface/60", selectedIds.has(workspace.id) && "bg-surface/60")}
                >
                  <td className="px-3 py-1">
                    <input type="checkbox" aria-label={`Select ${workspace.name}`} checked={selectedIds.has(workspace.id)} onChange={() => toggleSelected(workspace.id)} className="size-3.5 accent-[var(--primary)]" />
                  </td>
                  <td className="p-0 font-medium text-foreground">
                    <Link
                      href={`/workspaces/${workspace.id}`}
                      className="flex min-w-0 items-center gap-2.5 px-1 py-3 outline-none focus-visible:bg-raised"
                    >
                      <Folder className="size-4 shrink-0 text-slate" />
                      <div className="min-w-0">
                        <span className="flex min-w-0 items-center gap-1.5 font-medium group-hover:text-foreground">
                          <span className="truncate">{workspace.name}</span>
                          {workspace.pinned_at && <Pin aria-label="Pinned" className="size-3 shrink-0 fill-current text-muted-foreground" />}
                        </span>
                        {workspace.description && (
                          <span className="block truncate text-[11px] font-normal text-muted-foreground">
                            {workspace.description}
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="truncate px-3.5 py-3 text-muted-foreground">You</td>
                  <td className="whitespace-nowrap px-3.5 py-3 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
                      new Date(workspace.created_at)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3.5 py-3 text-muted-foreground">
                    {new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
                      new Date(workspace.updated_at)
                    )}
                  </td>
                  <td className="px-2 py-1 text-right">
                    <WorkspaceRowMenu
                      workspace={workspace}
                      open={activeMenuId === workspace.id}
                      onOpenChange={(open) => setActiveMenuId(open ? workspace.id : null)}
                      copied={copiedId === workspace.id}
                      onCopyLink={() => void handleCopyLink(workspace.id)}
                      onPinChange={(pinned) => togglePin("workspace", workspace.id, pinned)}
                      onDelete={() => deleteWorkspaceMutation.mutate([workspace.id])}
                      deleting={deleteWorkspaceMutation.isPending}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="mt-6 rounded-md border border-dashed px-6 py-14 text-center">
          <Folder className="mx-auto size-8 text-muted-foreground" strokeWidth={1.5} />
          <p className="mt-3 text-sm font-medium">{search ? "No matching workspaces" : "No workspaces yet"}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {search
              ? "Try adjusting your search or ownership filter."
              : "Create a workspace to collect its chats, datasets, and shared AI context."}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setOwnership("all");
            }}
            className="mt-4 text-xs font-medium text-slate hover:text-foreground"
          >
            Clear filters
          </button>
        </div>
      )}
    </section>
  );
}
