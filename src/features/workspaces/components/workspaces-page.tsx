"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, MoreHorizontal, Pin, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { WorkspaceDto } from "@/lib/api";
import { CreateWorkspaceDialog } from "./create-workspace-dialog";

type Ownership = "all" | "owned" | "shared";
type Sort = "updated_desc" | "updated_asc" | "name_asc";

interface WorkspacePreview {
  id: string;
  name: string;
  owner: string;
  ownership: Exclude<Ownership, "all">;
  created: string;
  updated: string;
  updatedRank: number;
  pinned: boolean;
}

const workspacePreviews: WorkspacePreview[] = [
  { id: "revenue-intelligence", name: "Revenue Intelligence", owner: "You", ownership: "owned", created: "Nov 10, 2026", updated: "2h ago", updatedRank: 1, pinned: true },
  { id: "sales-research", name: "Sales Research", owner: "Alex", ownership: "shared", created: "Oct 29, 2026", updated: "3d ago", updatedRank: 3, pinned: true },
  { id: "customer-analytics", name: "Customer Analytics", owner: "You", ownership: "owned", created: "Nov 8, 2026", updated: "1d ago", updatedRank: 2, pinned: false },
  { id: "market-insights", name: "Market Insights", owner: "Sarah", ownership: "shared", created: "Oct 24, 2026", updated: "5d ago", updatedRank: 4, pinned: false },
  { id: "project-alpha", name: "Project Alpha", owner: "You", ownership: "owned", created: "Oct 20, 2026", updated: "6d ago", updatedRank: 5, pinned: false },
  { id: "research", name: "Research", owner: "You", ownership: "owned", created: "Oct 18, 2026", updated: "1w ago", updatedRank: 6, pinned: false },
];

const ownershipOptions: Array<{ value: Ownership; label: string }> = [
  { value: "all", label: "All" },
  { value: "owned", label: "Owned" },
  { value: "shared", label: "Shared" },
];

export function WorkspacesPage() {
  const [search, setSearch] = useState("");
  const [ownership, setOwnership] = useState<Ownership>("all");
  const [sort, setSort] = useState<Sort>("updated_desc");
  const [createdWorkspaces, setCreatedWorkspaces] = useState<WorkspacePreview[]>([]);

  const workspaces = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return [...createdWorkspaces, ...workspacePreviews]
      .filter((workspace) => ownership === "all" || workspace.ownership === ownership)
      .filter((workspace) => !query || workspace.name.toLocaleLowerCase().includes(query) || workspace.owner.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        if (left.pinned !== right.pinned) return left.pinned ? -1 : 1;
        if (sort === "name_asc") return left.name.localeCompare(right.name);
        return sort === "updated_asc" ? right.updatedRank - left.updatedRank : left.updatedRank - right.updatedRank;
      });
  }, [createdWorkspaces, ownership, search, sort]);

  function addCreatedWorkspace(workspace: WorkspaceDto) {
    const createdAt = new Date(workspace.created_at);
    setCreatedWorkspaces((current) => [{
      id: workspace.id,
      name: workspace.name,
      owner: "You",
      ownership: "owned",
      created: new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(createdAt),
      updated: "just now",
      updatedRank: 0,
      pinned: false,
    }, ...current]);
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

    {workspaces.length > 0 ? <div className="mt-6 overflow-x-auto rounded-md border">
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
                {workspace.pinned ? <Pin className="size-3.5 shrink-0 fill-foreground text-foreground" aria-label="Pinned" /> : <span className="size-3.5 shrink-0" aria-hidden="true" />}
                <span className="truncate">{workspace.name}</span>
              </Link>
            </td>
            <td className="truncate px-3 py-3 text-muted-foreground">{workspace.owner}</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{workspace.created}</td>
            <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{workspace.updated}</td>
            <td className="px-2 py-1"><button type="button" disabled title="Workspace actions are not connected yet" aria-label={`Actions for ${workspace.name}`} className="grid size-8 cursor-not-allowed place-items-center rounded-md text-muted-foreground opacity-70"><MoreHorizontal className="size-4" /></button></td>
          </tr>)}
        </tbody>
      </table>
    </div> : <div className="mt-6 rounded-md border border-dashed px-6 py-14 text-center">
      <p className="text-sm font-medium">No matching workspaces</p>
      <p className="mt-1 text-xs text-muted-foreground">Try adjusting your search or ownership filter.</p>
      <button type="button" onClick={() => { setSearch(""); setOwnership("all"); }} className="mt-4 text-xs font-medium text-slate hover:text-foreground">Clear filters</button>
    </div>}
  </section>;
}
