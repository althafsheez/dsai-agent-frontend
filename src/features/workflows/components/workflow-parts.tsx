"use client";

import Link from "next/link";
import { BarChart3, Bell, Calendar, CheckCircle2, CircleDashed, Database, FileText, GitBranch, Hand, LoaderCircle, Sparkles, SquareDashed, XCircle, Zap, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDuration, formatWhen } from "../logic/run-view";
import type { RunStatus, RunView, StepKind, StepStatus, TriggerKind, Workflow, WorkflowState } from "../types";

export const stepIcon: Record<StepKind | "trigger", LucideIcon> = { trigger: Zap, query: Database, analyze: Sparkles, chart: BarChart3, report: FileText, notify: Bell, condition: GitBranch, custom: SquareDashed };
export const triggerIcon: Record<TriggerKind, LucideIcon> = { manual: Hand, schedule: Calendar, event: Zap };

const statusStyle: Record<RunStatus | StepStatus, { label: string; className: string; icon: LucideIcon }> = {
  running: { label: "Running", className: "text-sky-300", icon: LoaderCircle },
  success: { label: "Success", className: "text-sage", icon: CheckCircle2 },
  failed: { label: "Failed", className: "text-red-300", icon: XCircle },
  cancelled: { label: "Cancelled", className: "text-muted-foreground", icon: CircleDashed },
  pending: { label: "Pending", className: "text-muted-foreground", icon: CircleDashed },
  skipped: { label: "Skipped", className: "text-muted-foreground", icon: CircleDashed },
};

export function StatusBadge({ status }: { status: RunStatus | StepStatus }) {
  const { label, className, icon: Icon } = statusStyle[status];
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}><Icon className={cn("size-3.5", status === "running" && "animate-spin")} />{label}</span>;
}

const stateStyle: Record<WorkflowState, string> = { active: "bg-sage/15 text-sage", inactive: "bg-raised text-muted-foreground", draft: "border text-muted-foreground" };
export function StateBadge({ state }: { state: WorkflowState }) {
  return <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium capitalize", stateStyle[state])}>{state}</span>;
}

/** Linear flow: trigger, then each step in order. Optional per-step status colours a run. */
export function WorkflowDiagram({ workflow, statuses, orientation = "horizontal" }: { workflow: Pick<Workflow, "trigger" | "steps">; statuses?: Record<string, StepStatus>; orientation?: "horizontal" | "vertical" }) {
  const nodes = [{ id: "trigger", kind: "trigger" as const, title: workflow.trigger.kind === "manual" ? "Manual start" : workflow.trigger.label }, ...workflow.steps.map((step) => ({ id: step.id, kind: step.kind, title: step.title }))];
  return (
    <ol aria-label="Workflow steps" className={cn("flex gap-0", orientation === "vertical" ? "flex-col items-stretch" : "items-stretch overflow-x-auto pb-2")}>
      {nodes.map((node, index) => {
        const Icon = stepIcon[node.kind];
        const status = statuses?.[node.id];
        return (
          <li key={node.id} className={cn("flex items-center", orientation === "vertical" ? "flex-col" : "shrink-0")}>
            <div className={cn("flex min-w-[132px] max-w-[180px] flex-col gap-1.5 rounded-lg border bg-surface p-3", orientation === "vertical" && "w-full max-w-none flex-row items-center gap-3", status === "success" && "border-sage/50", status === "failed" && "border-red-400/60", status === "running" && "border-sky-300/60")}>
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-raised text-slate"><Icon className="size-3.5" /></span>
              <span className="min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">{index === 0 ? "Trigger" : `Step ${index}`}</span>
                <span className="block break-words text-xs font-medium leading-4">{node.title}</span>
              </span>
              {status ? <span className="ml-auto"><StatusBadge status={status} /></span> : null}
            </div>
            {index < nodes.length - 1 ? <span aria-hidden="true" className={cn("bg-border-strong", orientation === "vertical" ? "h-4 w-px" : "h-px w-6")} /> : null}
          </li>
        );
      })}
    </ol>
  );
}

export function RunsTable({ views, showWorkflow = true, empty = "No runs yet." }: { views: RunView[]; showWorkflow?: boolean; empty?: string }) {
  if (!views.length) return <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[560px] text-left text-xs">
        <thead className="border-b bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>{showWorkflow ? <th className="px-3 py-2 font-medium">Workflow</th> : null}<th className="px-3 py-2 font-medium">Started</th><th className="px-3 py-2 font-medium">Trigger</th><th className="px-3 py-2 font-medium">Duration</th><th className="px-3 py-2 font-medium">Status</th></tr>
        </thead>
        <tbody className="divide-y">
          {views.map((view) => (
            <tr key={view.run.id} className="hover:bg-surface/60">
              {showWorkflow ? <td className="px-3 py-2.5 font-medium">{view.run.workflow_name}</td> : null}
              <td className="px-3 py-2.5">
                <Link href={`/workflows/${view.run.workflow_id}/runs/${view.run.id}`} className="text-foreground underline-offset-2 hover:underline" aria-label={`Open run from ${new Date(view.run.started_at).toLocaleString()}`}>{formatWhen(view.run.started_at)}</Link>
              </td>
              <td className="px-3 py-2.5 capitalize text-muted-foreground">{view.run.trigger}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{formatDuration(view.elapsed_ms)}</td>
              <td className="px-3 py-2.5"><StatusBadge status={view.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
