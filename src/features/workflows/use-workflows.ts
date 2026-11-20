"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cancelRun, deleteWorkflow, getRun, getWorkflow, listRuns, listWorkflows, saveWorkflow, setWorkflowState, startRun } from "./data/workflow-store";
import { viewRun } from "./logic/run-view";
import type { RunView, WorkflowRun } from "./types";

export const workflowKeys = { all: ["workflows"] as const, one: (id: string) => ["workflows", id] as const, runs: (workflowId?: string) => ["workflow-runs", workflowId ?? "all"] as const, run: (id: string) => ["workflow-run", id] as const };

export const useWorkflows = () => useQuery({ queryKey: workflowKeys.all, queryFn: listWorkflows });
export const useWorkflow = (id: string) => useQuery({ queryKey: workflowKeys.one(id), queryFn: () => getWorkflow(id) });
export const useWorkflowRuns = (workflowId?: string) => useQuery({ queryKey: workflowKeys.runs(workflowId), queryFn: () => listRuns(workflowId) });
export const useWorkflowRun = (id: string) => useQuery({ queryKey: workflowKeys.run(id), queryFn: () => getRun(id) });

/** Ticks once a second while any run is still going, so statuses and durations move. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return active ? now : Date.now();
}

export function useRunViews(runs: WorkflowRun[] | undefined): RunView[] {
  const sample = (runs ?? []).map((run) => viewRun(run));
  const live = sample.some((item) => item.status === "running");
  const now = useNow(live);
  return (runs ?? []).map((run) => viewRun(run, now));
}

function useInvalidate() {
  const client = useQueryClient();
  return () => Promise.all([
    client.invalidateQueries({ queryKey: ["workflows"] }),
    client.invalidateQueries({ queryKey: ["workflow-runs"] }),
    client.invalidateQueries({ queryKey: ["workflow-run"] }),
  ]);
}

export function useStartRun() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (workflowId: string) => startRun(workflowId), onSuccess: invalidate });
}
export function useCancelRun() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: cancelRun, onSuccess: invalidate });
}
export function useSaveWorkflow() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: saveWorkflow, onSuccess: invalidate });
}
export function useSetWorkflowState() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: ({ id, state }: { id: string; state: "active" | "inactive" | "draft" }) => setWorkflowState(id, state), onSuccess: invalidate });
}
export function useDeleteWorkflow() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: deleteWorkflow, onSuccess: invalidate });
}
