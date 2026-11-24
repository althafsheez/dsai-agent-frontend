"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { analyzeDatasets, buildCustomChartWithAi, generateDashboardWithAi, getDatasetRows, getLibrary, getModels, listDashboardPeople, reviewDashboardWithAi, syncDatasetFromDrive, tuneDashboardWithAi, writeMeasureWithAi } from "@/lib/api";
import type { DashboardAiResult } from "@/lib/api";
import { deleteDashboard, duplicateDashboard, getDashboard, listDashboards, pinDashboard, saveDashboard } from "./data/dashboard-store";
import type { DashboardMeasure, DashboardWidget, DatasetLite } from "./types";

export const dashboardKeys = { all: ["dashboards"] as const, one: (id: string) => ["dashboards", id] as const, datasets: ["dashboard-datasets"] as const };

export const useDashboards = () => useQuery({ queryKey: dashboardKeys.all, queryFn: listDashboards, refetchInterval: 30_000 });
export const usePeople = (enabled = true) => useQuery({ queryKey: ["dashboard-people"], queryFn: listDashboardPeople, staleTime: 60_000, enabled });
export const useDashboard = (id: string) => useQuery({ queryKey: dashboardKeys.one(id), queryFn: () => getDashboard(id) });

/** Library datasets with the columns and preview rows the API already returns; charts are drawn from those rows. */
export function useDashboardDatasets() {
  return useQuery({
    queryKey: dashboardKeys.datasets,
    queryFn: async (): Promise<DatasetLite[]> => {
      const { items } = await getLibrary();
      return items.flatMap((item) => item.resource_type === "dataset" && item.columns?.length && item.preview_rows?.length
        ? [{ id: item.id, name: item.name, columns: item.columns, rows: item.preview_rows, row_count: item.row_count }] : []);
    },
  });
}

function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: dashboardKeys.all });
}
export function useSaveDashboard() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: saveDashboard, onSuccess: invalidate });
}
export function usePinDashboard() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (input: { id: string; pinned: boolean }) => pinDashboard(input.id, input.pinned), onSuccess: invalidate });
}
export function useDuplicateDashboard() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: duplicateDashboard, onSuccess: invalidate });
}
export function useDeleteDashboard() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: deleteDashboard, onSuccess: invalidate });
}

const brief = (dataset: DatasetLite) => ({ id: dataset.id, name: dataset.name, columns: dataset.columns, rows: dataset.rows.slice(0, 20), row_count: dataset.row_count });
const toWidget = (widget: DashboardAiResult["widgets"][number]): DashboardWidget => ({ ...widget, type: widget.type as DashboardWidget["type"], x: widget.x ?? undefined, y: widget.y ?? undefined });

export interface AiOutcome { name?: string; description?: string; widgets: DashboardWidget[]; notes: string[]; ai?: boolean; slicers?: string[]; suggestions?: string[] }

/** Prompt-to-dashboard and AI check & fix, using the server's default model. */
export function useDashboardAi() {
  const models = useQuery({ queryKey: ["models"], queryFn: getModels });
  const modelId = models.data?.default_model_id ?? models.data?.models[0]?.id ?? "";
  const generate = useMutation({
    mutationFn: async (input: { prompt: string; datasets: DatasetLite[]; context?: string }): Promise<AiOutcome> => {
      const result = await generateDashboardWithAi({ prompt: input.prompt, datasets: input.datasets.map(brief), modelId, context: input.context });
      return { name: result.name, description: result.description, widgets: result.widgets.map(toWidget), notes: result.notes, slicers: result.slicers, suggestions: result.suggestions };
    },
  });
  const tune = useMutation({
    mutationFn: async (input: { instruction: string; widgets: DashboardWidget[]; slicers: string[]; name: string; datasets: DatasetLite[]; context?: string }): Promise<AiOutcome> => {
      const result = await tuneDashboardWithAi({ instruction: input.instruction, widgets: input.widgets as DashboardAiResult["widgets"], slicers: input.slicers, name: input.name, datasets: input.datasets.map(brief), modelId, context: input.context });
      return { name: result.name, widgets: result.widgets.map(toWidget), notes: result.notes, slicers: result.slicers, suggestions: result.suggestions };
    },
  });
  const review = useMutation({
    mutationFn: async (input: { widgets: DashboardWidget[]; datasets: DatasetLite[] }): Promise<AiOutcome> => {
      const result = await reviewDashboardWithAi({ widgets: input.widgets as DashboardAiResult["widgets"], datasets: input.datasets.map(brief), modelId });
      return { widgets: result.widgets.map(toWidget), notes: result.notes, ai: result.ai };
    },
  });
  const custom = useMutation({
    mutationFn: async (input: { request: string; title?: string; datasetIds: string[] }): Promise<DashboardWidget> => {
      const { widget } = await buildCustomChartWithAi({ ...input, modelId });
      return toWidget(widget);
    },
  });
  const measure = useMutation({
    mutationFn: (input: { request: string; datasetIds: string[]; measures: DashboardMeasure[] }) => writeMeasureWithAi({ ...input, modelId }),
  });
  return { ready: Boolean(modelId), generate, tune, review, custom, measure };
}

/** How the chosen datasets overlap and where they disagree. Only asked for when two or more are chosen. */
export function useDatasetRelations(ids: string[]) {
  const key = [...ids].sort();
  return useQuery({ queryKey: ["dashboard-relations", key], queryFn: () => analyzeDatasets(key), enabled: key.length >= 2, staleTime: 60_000, retry: false });
}

/**
 * Datasets a dashboard uses, with up to 6,000 real rows each. A dataset owned by a teammate (a shared dashboard) is built from its rows alone.
 * `refreshMinutes` re-reads the data on a timer while the page is open; `refresh()` does it now (and re-syncs Google Drive files first).
 */
export function useHydratedDatasets(usedIds: string[], refreshMinutes = 0) {
  const base = useDashboardDatasets();
  const rowQueries = useQueries({
    queries: usedIds.map((id) => ({ queryKey: ["dashboard-rows", id], queryFn: () => getDatasetRows(id), staleTime: 5 * 60_000, retry: false })),
  });
  const [refreshing, setRefreshing] = useState(false);
  const [syncIssue, setSyncIssue] = useState(false);

  const library = (base.data ?? []).map((dataset): DatasetLite => {
    const loaded = rowQueries[usedIds.indexOf(dataset.id)]?.data;
    return loaded ? { ...dataset, rows: loaded.rows, row_count: loaded.total_rows } : dataset;
  });
  const known = new Set(library.map((dataset) => dataset.id));
  const shared = usedIds.flatMap((id, index): DatasetLite[] => {
    const loaded = rowQueries[index]?.data;
    return loaded && !known.has(id) ? [{ id, name: loaded.name, columns: loaded.columns, rows: loaded.rows, row_count: loaded.total_rows }] : [];
  });

  async function refresh() {
    setRefreshing(true);
    try {
      const syncable = usedIds.filter((_, index) => rowQueries[index]?.data?.syncable);
      const results = await Promise.allSettled(syncable.map((id) => syncDatasetFromDrive(id)));
      setSyncIssue(results.some((result) => result.status === "rejected"));
      await Promise.all([base.refetch(), ...rowQueries.map((query) => query.refetch())]);
    } finally {
      setRefreshing(false);
    }
  }
  const latest = useRef(refresh);
  useEffect(() => { latest.current = refresh; });
  useEffect(() => {
    if (!refreshMinutes) return;
    const timer = window.setInterval(() => { if (!document.hidden) void latest.current(); }, refreshMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [refreshMinutes]);

  const stamps = [...rowQueries.map((query) => query.dataUpdatedAt), base.dataUpdatedAt].filter(Boolean);
  const sourceTimes = rowQueries.flatMap((query) => (query.data?.refreshed_at ? [query.data.refreshed_at] : [])).sort();
  return {
    datasets: [...library, ...shared],
    loading: base.isLoading,
    loadingRows: rowQueries.some((query) => query.isFetching),
    truncated: rowQueries.some((query) => query.data?.truncated),
    refetch: base.refetch,
    refresh,
    refreshing,
    syncIssue,
    /** When this page last read the data (ms), and when the newest data itself changed (ISO). */
    checkedAt: stamps.length ? Math.max(...stamps) : 0,
    dataChangedAt: sourceTimes.length ? sourceTimes[sourceTimes.length - 1] : null,
  };
}
