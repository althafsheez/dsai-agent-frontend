"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, Copy, ExternalLink, Folder, MoreHorizontal, Search, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { deleteWorkspace, getWorkspaces, uploadResource, type WorkspaceDto } from "@/lib/api";
import { useAuth } from "@/features/auth";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

export type Ownership = "all" | "owned" | "shared" | "contributed";
type Sort = "updated_desc" | "updated_asc" | "name_asc";

const ownershipOptions: Array<{ value: Ownership; label: string }> = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "shared", label: "Shared" },
  { value: "contributed", label: "Contributed" },
];

export function getWorkspaceAccess(workspace: WorkspaceDto, currentUserId: string): {
  isOwned: boolean;
  isContributed: boolean;
  isShared: boolean;
  roleLabel: string;
} {
  const isCreator = workspace.created_by === currentUserId;
  const isOwnerRole = workspace.role === "owner" || workspace.role === "admin";
  const isOwned = isCreator || isOwnerRole;

  const isContributed = !isOwned && (
    workspace.role === "contributor" ||
    workspace.role === "editor" ||
    workspace.permission === "edit"
  );

  const isShared = !isOwned && !isContributed && (
    workspace.role === "viewer" ||
    workspace.permission === "view" ||
    (!isOwned && !isContributed)
  );

  let roleLabel = "Owner";
  if (isContributed) roleLabel = "Contributor";
  else if (isShared) roleLabel = "Viewer";

  return { isOwned, isContributed, isShared, roleLabel };
}

export function WorkspacesPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const currentUserId = user?.id ?? "user-you";
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const workspacesQuery = useQuery({ queryKey: ["workspaces"], queryFn: getWorkspaces });

  const workspaces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...(workspacesQuery.data?.items ?? [])]
      .filter((workspace) => {
        if (ownership === "all") return true;
        const access = getWorkspaceAccess(workspace, currentUserId);
        if (ownership === "owned") return access.isOwned;
        if (ownership === "shared") return access.isShared;
        if (ownership === "contributed") return access.isContributed;
        return true;
      })
      .filter((workspace) => !query || workspace.name.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        if (sort === "name_asc") return left.name.localeCompare(right.name);
        return sort === "updated_asc" ? left.updated_at.localeCompare(right.updated_at) : right.updated_at.localeCompare(left.updated_at);
      });
  }, [currentUserId, ownership, search, sort, workspacesQuery.data?.items]);

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
    mutationFn: (workspaceId: string) => deleteWorkspace(workspaceId),
    onSuccess: async () => {
      setActiveMenuId(null);
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
  });

  async function addCreatedWorkspace(workspace: WorkspaceDto, files: File[]) {
    await uploadInitialFiles.mutateAsync({ workspace, files });
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    router.push(`/workspaces/${workspace.id}`);
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
        <div className="mt-6 overflow-x-auto rounded-md border">
          <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
            <thead className="bg-surface text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
              <tr>
                <th className="w-[42%] px-3.5 py-2.5 font-medium">Workspace</th>
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
                  className="group relative border-t text-xs transition-colors hover:bg-surface/60"
                >
                  <td className="p-0 font-medium text-foreground">
                    <Link
                      href={`/workspaces/${workspace.id}`}
                      className="flex min-w-0 items-center gap-2.5 px-3.5 py-3 outline-none focus-visible:bg-raised"
                    >
                      <Folder className="size-4 shrink-0 text-slate" />
                      <div className="min-w-0">
                        <span className="block truncate font-medium group-hover:text-foreground">
                          {workspace.name}
                        </span>
                        {workspace.description && (
                          <span className="block truncate text-[11px] font-normal text-muted-foreground">
                            {workspace.description}
                          </span>
                        )}
                      </div>
                    </Link>
                  </td>
                  <td className="truncate px-3.5 py-3 text-muted-foreground">
                    {(() => {
                      const access = getWorkspaceAccess(workspace, currentUserId);
                      const isSelf = workspace.created_by === currentUserId || workspace.created_by === "user-you";
                      return (
                        <div className="flex items-center gap-1.5">
                          <span className="truncate">{isSelf ? "You" : workspace.created_by}</span>
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[9px] font-medium border leading-none tracking-wide uppercase",
                              access.isOwned
                                ? "bg-raised text-foreground border-border"
                                : access.isContributed
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/20"
                                : "bg-blue-500/10 text-blue-300 border-blue-500/20"
                            )}
                          >
                            {access.roleLabel}
                          </span>
                        </div>
                      );
                    })()}
                  </td>
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
                  <td className="relative px-2 py-1 text-right">
                    <button
                      type="button"
                      aria-label={`Actions for ${workspace.name}`}
                      onClick={() => setActiveMenuId(activeMenuId === workspace.id ? null : workspace.id)}
                      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-raised hover:text-foreground"
                    >
                      <MoreHorizontal className="size-4" />
                    </button>

                    {activeMenuId === workspace.id && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setActiveMenuId(null)}
                        />
                        <div className="absolute right-2 top-10 z-50 min-w-36 rounded-md border bg-popover p-1 shadow-lg text-left text-xs">
                          <Link
                            href={`/workspaces/${workspace.id}`}
                            onClick={() => setActiveMenuId(null)}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                          >
                            <ExternalLink className="size-3.5" />
                            Open
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleCopyLink(workspace.id)}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-muted-foreground hover:bg-surface hover:text-foreground"
                          >
                            {copiedId === workspace.id ? <Check className="size-3.5 text-green-400" /> : <Copy className="size-3.5" />}
                            {copiedId === workspace.id ? "Copied!" : "Copy link"}
                          </button>
                          <div className="my-1 border-t" />
                          <button
                            type="button"
                            disabled={deleteWorkspaceMutation.isPending}
                            onClick={() => deleteWorkspaceMutation.mutate(workspace.id)}
                            className="flex w-full items-center gap-2 rounded px-2.5 py-1.5 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="size-3.5" />
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
