"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getLibrary } from "@/lib/api";
import { deleteDashboard, getDashboard, listDashboards, saveDashboard } from "./data/dashboard-store";
import type { DatasetLite } from "./types";

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
