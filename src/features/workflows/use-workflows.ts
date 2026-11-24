"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { buildWorkflowScripts, cancelWorkflowRunRecord, deleteWorkflowRecord, getModels, getWorkflowRecord, getWorkflowRunRecord, listWorkflowRecords, listWorkflowRunRecords, planWorkflowWithAi, rephraseWorkflowPrompt, runWorkflowNow, saveWorkflowRecord, setWorkflowRecordState, testWorkflow } from "@/lib/api";
import type { WorkflowRecordDto, WorkflowRunRecordDto, WorkflowSaveBody, WorkflowStepDto } from "@/lib/api";

export const workflowKeys = { all: ["workflows"] as const, one: (id: string) => ["workflows", id] as const, runs: (workflowId?: string) => ["workflow-runs", workflowId ?? "all"] as const, run: (id?: string) => ["workflow-run", id] as const };

const live = (runs: WorkflowRunRecordDto[] | undefined) => (runs ?? []).some((run) => run.status === "running");

export const useWorkflows = () => useQuery({ queryKey: workflowKeys.all, queryFn: listWorkflowRecords, refetchInterval: 15_000 });
export const useWorkflow = (id: string) => useQuery({ queryKey: workflowKeys.one(id), queryFn: () => getWorkflowRecord(id), enabled: id !== "new" });
/** Polls every 2 s while something is running, every 20 s otherwise (a scheduled run can start at any time). */
export const useWorkflowRuns = (workflowId?: string) => useQuery({ queryKey: workflowKeys.runs(workflowId), queryFn: () => listWorkflowRunRecords(workflowId), refetchInterval: (query) => (live(query.state.data) ? 2000 : 20_000) });
export const useWorkflowRun = (id: string | undefined) => useQuery({ queryKey: workflowKeys.run(id), queryFn: () => getWorkflowRunRecord(id!), enabled: Boolean(id), refetchInterval: (query) => (query.state.data?.status === "running" ? 1000 : false) });

/** A clock that ticks each second while `active`, so "running for 12s" moves. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return now;
}

function useInvalidate() {
  const client = useQueryClient();
  return () => Promise.all([client.invalidateQueries({ queryKey: ["workflows"] }), client.invalidateQueries({ queryKey: ["workflow-runs"] }), client.invalidateQueries({ queryKey: ["workflow-run"] })]);
}

export const useRunNow = () => { const invalidate = useInvalidate(); return useMutation({ mutationFn: runWorkflowNow, onSuccess: invalidate }); };
export const useTestWorkflow = () => { const invalidate = useInvalidate(); return useMutation({ mutationFn: ({ id, steps }: { id: string; steps: WorkflowStepDto[] }) => testWorkflow(id, steps), onSuccess: invalidate }); };
export const useCancelRun = () => { const invalidate = useInvalidate(); return useMutation({ mutationFn: cancelWorkflowRunRecord, onSuccess: invalidate }); };
export const useSaveWorkflow = () => { const invalidate = useInvalidate(); return useMutation({ mutationFn: (body: WorkflowSaveBody) => saveWorkflowRecord(body), onSuccess: invalidate }); };
export const useSetWorkflowState = () => { const invalidate = useInvalidate(); return useMutation({ mutationFn: ({ id, state }: { id: string; state: WorkflowRecordDto["state"] }) => setWorkflowRecordState(id, state), onSuccess: invalidate }); };
export const useDeleteWorkflow = () => { const invalidate = useInvalidate(); return useMutation({ mutationFn: deleteWorkflowRecord, onSuccess: invalidate }); };

/** The three AI helpers, all on the server's default model. */
export function useWorkflowAi() {
  const models = useQuery({ queryKey: ["models"], queryFn: getModels });
  const modelId = models.data?.default_model_id ?? models.data?.models[0]?.id ?? "";
  const rephrase = useMutation({ mutationFn: (input: { prompt: string; datasetIds: string[] }) => rephraseWorkflowPrompt({ ...input, modelId }) });
  const plan = useMutation({ mutationFn: (input: { prompt: string; datasetIds: string[] }) => planWorkflowWithAi({ ...input, modelId }) });
  const build = useMutation({ mutationFn: (input: { steps: WorkflowStepDto[]; datasetIds: string[] }) => buildWorkflowScripts({ ...input, modelId }) });
  return { models: models.data?.models ?? [], ready: Boolean(modelId), rephrase, plan, build };
}
