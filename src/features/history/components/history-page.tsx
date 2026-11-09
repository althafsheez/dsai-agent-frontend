"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { historyMockAdapter } from "../data/history-mock-adapter";
import { filterHistory } from "../logic/filter-history";
import type { HistoryFilters, HistoryOwnership, HistoryRecord, HistorySort, HistoryStatus, HistoryTime } from "../types";
import { HistoryTable } from "./history-table";
import { HistoryToolbar } from "./history-toolbar";

const historyKey = ["mock", "history"] as const;
const optionKey = ["mock", "history", "options"] as const;

function readFilters(params: URLSearchParams): HistoryFilters {
  const ownership = params.get("ownership");
  const status = params.get("status");
  const time = params.get("time");
  const sort = params.get("sort");
  return {
    ownership: ownership === "all" ? "all" : "owned" satisfies HistoryOwnership,
    status: status === "archived" ? "archived" : "active" satisfies HistoryStatus,
    search: params.get("q") ?? "",
    time: (["day", "week", "month", "quarter"] as string[]).includes(time ?? "") ? time as HistoryTime : "any",
    authorId: params.get("author") ?? "all",
    workspaceId: params.get("workspace") ?? "all",
    sort: (["updated_asc", "name_asc"] as string[]).includes(sort ?? "") ? sort as HistorySort : "updated_desc",
  };
}

export function HistoryPage() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const filters = useMemo(() => readFilters(new URLSearchParams(params.toString())), [params]);
  const historyQuery = useQuery({ queryKey: historyKey, queryFn: () => historyMockAdapter.list() });
  const optionsQuery = useQuery({ queryKey: optionKey, queryFn: () => historyMockAdapter.options() });
  const records = useMemo(() => filterHistory(historyQuery.data ?? [], filters), [filters, historyQuery.data]);

  const mutation = useMutation({
    mutationFn: async (operation: () => Promise<void>) => operation(),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: historyKey }),
        queryClient.invalidateQueries({ queryKey: optionKey }),
      ]);
    },
  });

  function updateFilters(patch: Partial<HistoryFilters>) {
    const next = { ...filters, ...patch };
    const search = new URLSearchParams();
    if (next.ownership !== "owned") search.set("ownership", next.ownership);
    if (next.status !== "active") search.set("status", next.status);
    if (next.search) search.set("q", next.search);
    if (next.time !== "any") search.set("time", next.time);
    if (next.authorId !== "all") search.set("author", next.authorId);
    if (next.workspaceId !== "all") search.set("workspace", next.workspaceId);
    if (next.sort !== "updated_desc") search.set("sort", next.sort);
    const query = search.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  const hasFilters = filters.search !== "" || filters.ownership !== "owned" || filters.status !== "active" || filters.time !== "any" || filters.authorId !== "all" || filters.workspaceId !== "all" || filters.sort !== "updated_desc";
  const mutate = (operation: () => Promise<void>) => mutation.mutateAsync(operation);

  return <section className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
    <header className="mb-6">
      <h1 className="text-xl font-semibold tracking-tight">History</h1>
      <p className="mt-1 text-xs text-muted-foreground">View and manage your chats and workspaces</p>
    </header>
    <HistoryToolbar filters={filters} options={optionsQuery.data ?? { authors: [], workspaces: [] }} onChange={updateFilters} />
    <HistoryTable
      records={records}
      loading={historyQuery.isLoading}
      hasFilters={hasFilters}
      onClearFilters={() => updateFilters({ ownership: "owned", status: "active", search: "", time: "any", authorId: "all", workspaceId: "all", sort: "updated_desc" })}
      onRename={(record: HistoryRecord, name) => mutate(() => historyMockAdapter.rename(record.id, record.kind, name))}
      onArchive={(record: HistoryRecord, archived) => mutate(() => historyMockAdapter.setArchived(record.id, record.kind, archived))}
      onDelete={(record: HistoryRecord) => mutate(() => historyMockAdapter.softDelete(record.id, record.kind))}
    />
  </section>;
}

