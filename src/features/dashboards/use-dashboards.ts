"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { generateDashboardWithAi, getDatasetRows, getLibrary, getModels, reviewDashboardWithAi } from "@/lib/api";
import type { DashboardAiResult } from "@/lib/api";
import { deleteDashboard, getDashboard, listDashboards, saveDashboard } from "./data/dashboard-store";
import type { DashboardWidget, DatasetLite } from "./types";

export const dashboardKeys = { all: ["dashboards"] as const, one: (id: string) => ["dashboards", id] as const, datasets: ["dashboard-datasets"] as const };

export const useDashboards = () => useQuery({ queryKey: dashboardKeys.all, queryFn: listDashboards });
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
export function useDeleteDashboard() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: deleteDashboard, onSuccess: invalidate });
}

const brief = (dataset: DatasetLite) => ({ id: dataset.id, name: dataset.name, columns: dataset.columns, rows: dataset.rows.slice(0, 20), row_count: dataset.row_count });
const toWidget = (widget: DashboardAiResult["widgets"][number]): DashboardWidget => ({ ...widget, x: widget.x ?? undefined, y: widget.y ?? undefined });

export interface AiOutcome { name?: string; description?: string; widgets: DashboardWidget[]; notes: string[]; ai?: boolean }

/** Prompt-to-dashboard and AI check & fix, using the server's default model. */
export function useDashboardAi() {
  const models = useQuery({ queryKey: ["models"], queryFn: getModels });
  const modelId = models.data?.default_model_id ?? models.data?.models[0]?.id ?? "";
  const generate = useMutation({
    mutationFn: async (input: { prompt: string; datasets: DatasetLite[] }): Promise<AiOutcome> => {
      const result = await generateDashboardWithAi({ prompt: input.prompt, datasets: input.datasets.map(brief), modelId });
      return { name: result.name, description: result.description, widgets: result.widgets.map(toWidget), notes: result.notes };
    },
  });
  const review = useMutation({
    mutationFn: async (input: { widgets: DashboardWidget[]; datasets: DatasetLite[] }): Promise<AiOutcome> => {
      const result = await reviewDashboardWithAi({ widgets: input.widgets as DashboardAiResult["widgets"], datasets: input.datasets.map(brief), modelId });
      return { widgets: result.widgets.map(toWidget), notes: result.notes, ai: result.ai };
    },
  });
  return { ready: Boolean(modelId), generate, review };
}

/** Library datasets, with up to 6,000 real rows loaded for the datasets a dashboard actually uses. */
export function useHydratedDatasets(usedIds: string[]) {
  const base = useDashboardDatasets();
  const rowQueries = useQueries({
    queries: usedIds.map((id) => ({ queryKey: ["dashboard-rows", id], queryFn: () => getDatasetRows(id), staleTime: 5 * 60_000, retry: false })),
  });
  const datasets = (base.data ?? []).map((dataset): DatasetLite => {
    const loaded = rowQueries[usedIds.indexOf(dataset.id)]?.data;
    return loaded ? { ...dataset, rows: loaded.rows, row_count: loaded.total_rows } : dataset;
  });
  return {
    datasets,
    loading: base.isLoading,
    loadingRows: rowQueries.some((query) => query.isFetching),
    truncated: rowQueries.some((query) => query.data?.truncated),
    refetch: base.refetch,
  };
}
