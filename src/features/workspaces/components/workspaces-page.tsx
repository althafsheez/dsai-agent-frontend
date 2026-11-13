"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, MoreHorizontal, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getWorkspaces, uploadResource, type WorkspaceDto } from "@/lib/api";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

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
      await Promise.all(files.map((file, index) => uploadResource({ file, scopeType: "workspace", scopeId: workspace.id, clientUploadId: `workspace-${workspace.id}-${index}-${file.name}-${file.lastModified}` })));
      return workspace;
    },
  });

  async function addCreatedWorkspace(workspace: WorkspaceDto, files: File[]) {
    await uploadInitialFiles.mutateAsync({ workspace, files });
    await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    router.push(`/workspaces/${workspace.id}`);
  }

  return <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
    <header className="mb-6 flex items-start justify-between gap-5">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-xl font-semibold tracking-tight">Workspaces</h1>
          <span className="rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground">Preview</span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Organize and manage your workspaces</p>
      </div>
      <CreateWorkspaceDialog onCreated={addCreatedWorkspace} />
    </header>

    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Search workspaces</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search workspaces..." className="h-10 w-full rounded-md border bg-surface pl-9 pr-9 text-sm outline-none placeholder:text-muted-foreground focus:border-border-strong" />
        {search && <button type="button" aria-label="Clear search" onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"><X className="size-3.5" /></button>}
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <div aria-label="Workspace ownership" className="inline-flex h-8 rounded-md border bg-surface p-0.5">
          {ownershipOptions.map((option) => <button key={option.value} type="button" aria-pressed={ownership === option.value} onClick={() => setOwnership(option.value)} className={cn("rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground", ownership === option.value && "bg-raised text-foreground")}>{option.label}</button>)}
        </div>
        <label className="relative ml-auto">
          <span className="sr-only">Sort workspaces</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} className="h-8 appearance-none rounded-md border bg-surface py-0 pl-2.5 pr-8 text-xs text-muted-foreground outline-none hover:border-border-strong focus:border-border-strong">
            <option value="updated_desc">Sort: Last updated</option>
            <option value="updated_asc">Sort: Oldest updated</option>
            <option value="name_asc">Sort: Name</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        </label>
      </div>
    </div>

    {workspacesQuery.isLoading ? <div className="mt-6 rounded-md border px-6 py-14 text-center text-sm text-muted-foreground">Loading workspaces…</div> : workspacesQuery.isError ? <div className="mt-6 rounded-md border border-red-400/30 px-6 py-14 text-center"><p className="text-sm font-medium">Could not load workspaces</p><button type="button" onClick={() => workspacesQuery.refetch()} className="mt-3 text-xs text-slate">Try again</button></div> : workspaces.length > 0 ? <div className="mt-6 overflow-x-auto rounded-md border">
      <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
        <thead className="bg-surface text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
          <tr>
            <th className="w-[40%] px-3 py-2 font-medium">Workspace</th>
            <th className="w-[18%] px-3 py-2 font-medium">Owner</th>
            <th className="w-[20%] px-3 py-2 font-medium">Created</th>
            <th className="w-[17%] px-3 py-2 font-medium">Last updated</th>
            <th className="w-10 px-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {workspaces.map((workspace) => <tr key={workspace.id} className="group border-t text-xs transition-colors hover:bg-surface">
            <td className="p-0 font-medium text-foreground">
              <Link href={`/workspaces/${workspace.id}`} className="flex min-w-0 items-center gap-2.5 px-3 py-3 outline-none focus-visible:bg-raised">
                <span className="truncate">{workspace.name}</span>
              </Link>
            </td>
            <td className="truncate px-3 py-3 text-muted-foreground">You</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(workspace.created_at))}</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(workspace.updated_at))}</td>
            <td className="px-2 py-1"><span aria-label={`Actions for ${workspace.name}`} className="grid size-8 place-items-center rounded-md text-muted-foreground"><MoreHorizontal className="size-4" /></span></td>
          </tr>)}
        </tbody>
      </table>
    </div> : <div className="mt-6 rounded-md border border-dashed px-6 py-14 text-center">
      <p className="text-sm font-medium">{search ? "No matching workspaces" : "No workspaces yet"}</p>
      <p className="mt-1 text-xs text-muted-foreground">{search ? "Try adjusting your search or ownership filter." : "Create a workspace to collect its chats, datasets, and shared AI context."}</p>
      <button type="button" onClick={() => { setSearch(""); setOwnership("all"); }} className="mt-4 text-xs font-medium text-slate hover:text-foreground">Clear filters</button>
    </div>}
  </section>;
}
