"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Database, FileText, Layers3, MessageSquare, Plus, Search, Workflow, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createWorkspaceWorkflow,
  createWorkspaceContextFile,
  deleteWorkspaceContextFile,
  getWorkspace,
  getWorkspaceChats,
  getWorkspaceContextFiles,
  getWorkspaceDatasets,
  getWorkspaceWorkflows,
  updateWorkspaceContextFile,
  uploadResource,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type { DatasetResource } from "@/features/context-sidebar/types";
import { WorkspaceAccessDialogs } from "./workspace-access-dialogs";

type Tab = "chats" | "datasets" | "workflows" | "context";

const tabs: Array<{ id: Tab; label: string; icon: typeof MessageSquare }> = [
  { id: "chats", label: "Chats", icon: MessageSquare },
  { id: "datasets", label: "Datasets", icon: Database },
  { id: "workflows", label: "Workflows", icon: Workflow },
  { id: "context", label: "Context", icon: FileText },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function WorkspaceDetailPage({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("chats");
  const [chatSearch, setChatSearch] = useState("");
  const [datasetSearch, setDatasetSearch] = useState("");
  const [selectedDataset, setSelectedDataset] = useState<DatasetResource | null>(null);
  const [selectedContextId, setSelectedContextId] = useState<string | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [workflowName, setWorkflowName] = useState("");
  const [creatingWorkflow, setCreatingWorkflow] = useState(false);
  const workspace = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => getWorkspace(workspaceId) });
  const chats = useQuery({ queryKey: ["workspace", workspaceId, "chats"], queryFn: () => getWorkspaceChats(workspaceId) });
  const datasets = useQuery({ queryKey: ["workspace", workspaceId, "datasets"], queryFn: () => getWorkspaceDatasets(workspaceId) });
  const contextFiles = useQuery({ queryKey: ["workspace", workspaceId, "context-files"], queryFn: () => getWorkspaceContextFiles(workspaceId) });
  const workflows = useQuery({ queryKey: ["workspace", workspaceId, "workflows"], queryFn: () => getWorkspaceWorkflows(workspaceId) });

  const uploadDatasetMutation = useMutation({
    mutationFn: (file: File) => uploadResource({ file, scopeType: "workspace", scopeId: workspaceId, clientUploadId: crypto.randomUUID() }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "datasets"] }),
  });
  const saveContextMutation = useMutation({
    mutationFn: async () => {
      if (selectedContextId) return updateWorkspaceContextFile(workspaceId, selectedContextId, { content: contextDraft });
      return createWorkspaceContextFile(workspaceId, { name: "notes.md", content: contextDraft });
    },
    onSuccess: async (file) => { setSelectedContextId(file.id); await queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "context-files"] }); },
  });
  const deleteContextMutation = useMutation({
    mutationFn: (fileId: string) => deleteWorkspaceContextFile(workspaceId, fileId),
    onSuccess: async () => { setSelectedContextId(null); setContextDraft(""); await queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "context-files"] }); },
  });
  const createWorkflowMutation = useMutation({
    mutationFn: () => createWorkspaceWorkflow(workspaceId, { name: workflowName.trim() }),
    onSuccess: async () => { setWorkflowName(""); setCreatingWorkflow(false); await queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "workflows"] }); },
  });

  const visibleChats = useMemo(() => (chats.data?.items ?? []).filter((chat) => chat.title.toLowerCase().includes(chatSearch.toLowerCase())), [chats.data?.items, chatSearch]);
  const visibleDatasets = useMemo(() => (datasets.data?.items ?? []).filter((dataset) => dataset.name.toLowerCase().includes(datasetSearch.toLowerCase())), [datasetSearch, datasets.data?.items]);
  const selectedContext = contextFiles.data?.items.find((file) => file.id === selectedContextId) ?? null;

  if (workspace.isLoading) return <section className="p-8 text-sm text-muted-foreground">Loading workspace…</section>;
  if (workspace.isError || !workspace.data) return <section className="p-8"><p className="text-sm font-medium">Workspace could not be found.</p><Link href="/workspaces" className="mt-3 inline-block text-xs text-slate">Back to workspaces</Link></section>;
  const item = workspace.data;

  return <section className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:px-8">
    <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-xs text-muted-foreground"><Link href="/workspaces" className="hover:text-foreground">Workspaces</Link><ChevronRight className="size-3" /><span className="truncate text-foreground">{item.name}</span></nav>
    <header className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3"><div className="grid size-12 shrink-0 place-items-center rounded-xl border bg-raised text-slate"><Layers3 className="size-6" /></div><div className="min-w-0"><h1 className="truncate text-2xl font-semibold tracking-tight">{item.name}</h1><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{item.description || "No workspace description yet."}</p></div></div>
      <WorkspaceAccessDialogs workspaceName={item.name} workspaceId={workspaceId} />
    </header>
    <h2 className="mt-5 text-xl font-semibold">Overview</h2>
    <div role="tablist" aria-label="Workspace sections" className="mt-2 flex overflow-x-auto border-y">
      {tabs.map(({ id, label, icon: Icon }) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn("flex h-14 shrink-0 items-center gap-2 border-b-2 px-5 text-sm text-muted-foreground", tab === id ? "border-foreground text-foreground" : "border-transparent hover:text-foreground")}><Icon className="size-4" />{label}<span className="rounded-full bg-raised px-1.5 py-0.5 text-[10px] text-foreground">{id === "chats" ? chats.data?.items.length ?? 0 : id === "datasets" ? datasets.data?.items.length ?? 0 : id === "context" ? contextFiles.data?.items.length ?? 0 : 0}</span></button>)}
    </div>
    <div className="pt-5">
      {tab === "chats" && <section>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center"><div><h3 className="text-xl font-semibold">Chats</h3><p className="mt-1 text-xs text-muted-foreground">Analyses that belong to this workspace.</p></div><div className="flex flex-1 gap-2 sm:ml-auto sm:max-w-lg"><label className="relative flex-1"><span className="sr-only">Search chats</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={chatSearch} onChange={(event) => setChatSearch(event.target.value)} placeholder="Search chats…" className="h-9 w-full rounded-md border bg-surface pl-9 pr-3 text-xs outline-none"/></label><Button asChild><a href={`/workspaces/${workspaceId}/chat/new`}><Plus/>New Chat</a></Button></div></div>
        {chats.isLoading ? <p className="py-12 text-center text-sm text-muted-foreground">Loading chats…</p> : visibleChats.length ? <div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface text-[10px] uppercase tracking-wider text-muted-foreground"><tr><th className="px-4 py-3">Name</th><th>Author</th><th>Created</th><th>Last updated</th><th/></tr></thead><tbody>{visibleChats.map((chat) => <tr key={chat.id} className="border-t hover:bg-surface"><td className="px-4 py-3 font-medium"><Link href={`/chat/${chat.id}`} className="hover:underline">{chat.title}</Link></td><td className="text-muted-foreground">You</td><td className="text-muted-foreground">{formatDate(chat.created_at)}</td><td className="text-muted-foreground">{formatDate(chat.updated_at)}</td><td><Link href={`/chat/${chat.id}`} className="text-xs text-slate">Open</Link></td></tr>)}</tbody></table></div> : <div className="rounded-lg border border-dashed px-6 py-14 text-center"><p className="text-sm font-medium">No chats yet</p><p className="mt-1 text-xs text-muted-foreground">Start the first analysis for this workspace.</p></div>}
      </section>}
      {tab === "datasets" && <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]"><div className="rounded-lg border"><div className="flex flex-wrap items-center gap-3 border-b p-4"><div className="mr-auto"><h3 className="text-xl font-semibold">Datasets</h3><p className="mt-1 text-xs text-muted-foreground">Data shared by every chat in this workspace.</p></div><label className="relative"><span className="sr-only">Search datasets</span><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"/><input value={datasetSearch} onChange={(event) => setDatasetSearch(event.target.value)} placeholder="Search datasets…" className="h-9 w-48 rounded-md border bg-background pl-9 pr-3 text-xs outline-none"/></label><label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"><Plus className="size-4"/>Add Dataset<input type="file" accept=".csv,.tsv,.xlsx,.xls,.parquet" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) uploadDatasetMutation.mutate(file); event.currentTarget.value = ""; }}/></label></div>{visibleDatasets.length ? <div className="divide-y">{visibleDatasets.map((dataset) => <button key={dataset.id} type="button" onClick={() => setSelectedDataset(dataset)} className={cn("flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-surface", selectedDataset?.id === dataset.id && "bg-raised")}><Database className="size-4 text-sage"/><span className="min-w-0 flex-1 truncate font-medium">{dataset.name}</span><span className="rounded border px-1.5 py-0.5 text-[10px] text-muted-foreground">{dataset.name.split(".").pop()?.toUpperCase()}</span><span className="w-16 text-right text-xs text-muted-foreground">{formatBytes(dataset.size_bytes)}</span></button>)}</div> : <div className="px-6 py-14 text-center"><p className="text-sm font-medium">No datasets yet</p><p className="mt-1 text-xs text-muted-foreground">Upload a structured file to share it with this workspace.</p></div>}{uploadDatasetMutation.isError && <p className="border-t px-4 py-2 text-xs text-red-300">Could not upload this dataset.</p>}</div><aside className="rounded-lg border p-5">{selectedDataset ? <><h3 className="truncate text-base font-semibold">{selectedDataset.name}</h3><p className="mt-1 text-xs text-muted-foreground">{formatBytes(selectedDataset.size_bytes)} · {selectedDataset.row_count ?? "—"} rows</p><div className="mt-5 border-t pt-4"><h4 className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Schema</h4>{selectedDataset.columns?.length ? <div className="mt-2 space-y-2">{selectedDataset.columns.map((column, index) => <div key={`${column.name}-${index}`} className="flex justify-between gap-3 text-xs"><span className="truncate">{column.name}</span><span className="text-muted-foreground">{column.data_type}</span></div>)}</div> : <p className="mt-2 text-xs text-muted-foreground">Schema is not available yet.</p>}</div><a className="mt-5 inline-flex text-xs text-slate hover:underline" href={selectedDataset.download_url}>Download dataset</a></> : <div className="grid min-h-52 place-items-center text-center"><div><Database className="mx-auto size-6 text-muted-foreground"/><p className="mt-3 text-sm font-medium">Select a dataset</p><p className="mt-1 text-xs text-muted-foreground">Its metadata and schema will appear here.</p></div></div>}</aside></section>}
      {tab === "workflows" && <section><div className="mb-4 flex items-center justify-between"><div><h3 className="text-xl font-semibold">Workflows</h3><p className="mt-1 text-xs text-muted-foreground">Automation owned by this workspace.</p></div><Button type="button" onClick={() => setCreatingWorkflow(true)}><Plus/>Create Workflow</Button></div>{creatingWorkflow && <form onSubmit={(event) => { event.preventDefault(); if (workflowName.trim()) createWorkflowMutation.mutate(); }} className="mb-4 flex gap-2 rounded-lg border bg-surface p-3"><input autoFocus value={workflowName} onChange={(event) => setWorkflowName(event.target.value)} placeholder="Workflow name" className="h-9 min-w-0 flex-1 rounded border bg-background px-3 text-sm outline-none"/><Button type="submit" disabled={!workflowName.trim() || createWorkflowMutation.isPending}>{createWorkflowMutation.isPending ? "Creating…" : "Create"}</Button><Button type="button" variant="ghost" onClick={() => setCreatingWorkflow(false)}>Cancel</Button></form>}{workflows.data?.items.length ? <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{workflows.data.items.map((workflow) => <article key={workflow.id} className="rounded-lg border bg-surface p-4"><div className="flex items-start gap-3"><div className="grid size-9 place-items-center rounded border bg-raised"><Workflow className="size-4"/></div><div className="min-w-0"><h4 className="truncate text-sm font-medium">{workflow.name}</h4><p className="mt-1 text-xs text-muted-foreground">{workflow.description || "No description"}</p></div></div><div className="mt-4 flex items-center justify-between border-t pt-3 text-xs"><span className="capitalize text-muted-foreground">{workflow.status}</span><span className="text-muted-foreground">Updated {formatDate(workflow.updated_at)}</span></div></article>)}</div> : <div className="rounded-lg border border-dashed px-6 py-16 text-center"><Workflow className="mx-auto size-7 text-muted-foreground"/><p className="mt-3 text-sm font-medium">No workflows in this workspace</p><p className="mt-1 text-xs text-muted-foreground">Create a workflow to keep this workspace’s recurring work together.</p></div>}</section>}
      {tab === "context" && <section className="grid min-h-[520px] overflow-hidden rounded-lg border md:grid-cols-[280px_minmax(0,1fr)]"><aside className="border-b p-3 md:border-b-0 md:border-r"><div className="mb-3 flex items-center justify-between"><p className="text-xs font-medium">Context files</p><Button size="icon" variant="ghost" type="button" aria-label="New context file" onClick={() => { setSelectedContextId(null); setContextDraft(""); }}><Plus/></Button></div><div className="space-y-1">{(contextFiles.data?.items ?? []).map((file) => <button key={file.id} type="button" onClick={() => { setSelectedContextId(file.id); setContextDraft(file.content); }} className={cn("flex w-full items-center gap-2 rounded px-2 py-2 text-left text-xs", selectedContextId === file.id ? "bg-raised text-foreground" : "text-muted-foreground hover:bg-surface")}><FileText className="size-3.5"/><span className="truncate">{file.name}</span></button>)}</div></aside><div className="flex min-w-0 flex-col"><div className="flex h-12 items-center justify-between border-b px-4"><input value={selectedContext?.name ?? (selectedContextId ? "" : "notes.md")} onChange={(event) => { if (selectedContext) updateWorkspaceContextFile(workspaceId, selectedContext.id, { name: event.target.value }).then(() => queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId, "context-files"] })); }} disabled={!selectedContext} className="min-w-0 bg-transparent text-sm font-medium outline-none disabled:text-foreground"/><div className="flex gap-2">{selectedContext && <Button size="sm" variant="ghost" type="button" onClick={() => deleteContextMutation.mutate(selectedContext.id)}><X/>Delete</Button>}<Button size="sm" type="button" onClick={() => saveContextMutation.mutate()} disabled={saveContextMutation.isPending}>{saveContextMutation.isPending ? "Saving…" : "Save"}</Button></div></div><textarea value={contextDraft} onChange={(event) => setContextDraft(event.target.value)} placeholder="# Workspace instructions\n\nAdd durable instructions for future analyses…" className="min-h-[440px] flex-1 resize-none bg-background p-5 font-mono text-sm leading-6 outline-none"/>{saveContextMutation.isError && <p className="border-t px-4 py-2 text-xs text-red-300">Could not save this context file.</p>}</div></section>}
    </div>
  </section>;
}
