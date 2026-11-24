import Link from "next/link";
import { Clock, MousePointerClick, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowRecordDto, WorkflowRunRecordDto } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatWhen } from "../logic/format";
import { executionIssues, kindInfo } from "../logic/steps";
import { StatusBadge, StepIcon } from "./flow-parts";

const lifecycle = {
  active: { label: "Active", color: "text-sage" },
  inactive: { label: "Paused", color: "text-muted-foreground" },
  draft: { label: "Draft", color: "text-muted-foreground" },
} satisfies Record<WorkflowRecordDto["state"], { label: string; color: string }>;

function WorkflowPreview({ workflow }: { workflow: WorkflowRecordDto }) {
  const scheduled = workflow.trigger.kind === "schedule";
  const hasTrigger = scheduled || workflow.trigger.config?.show_on_canvas !== false;
  const TriggerIcon = scheduled ? Clock : MousePointerClick;
  const preview = [
    ...(hasTrigger ? [{ key: "trigger", label: scheduled ? "Schedule" : "Manual", icon: <TriggerIcon className="size-4" strokeWidth={1.6} /> }] : []),
    ...workflow.steps.slice(0, hasTrigger ? 2 : 3).map((step) => ({
      key: `step-${step.id}`, label: step.title.trim() || kindInfo(step.kind).label, icon: <StepIcon kind={step.kind} />,
    })),
  ];
  const remaining = workflow.steps.length + Number(hasTrigger) - preview.length;

  if (!preview.length) return <div className="flex items-center gap-2 text-xs text-muted-foreground"><Workflow className="size-4" />No steps yet</div>;

  return (
    <ol aria-label="Workflow preview" className="flex w-full max-w-[18rem] items-start justify-center">
      {preview.map(({ key, label, icon }, index) => (
        <li key={key} className="relative min-w-0 flex-1 text-center" title={label}>
          {index > 0 && <span aria-hidden="true" className="absolute right-1/2 top-[18px] h-px w-full bg-border-strong" />}
          <span className="relative z-10 mx-auto grid size-9 place-items-center rounded-lg border bg-surface text-slate">{icon}</span>
          <span className="mt-1.5 block truncate px-0.5 text-[10px] text-muted-foreground">{label}</span>
        </li>
      ))}
      {remaining > 0 && (
        <li aria-label={`${remaining} more ${remaining === 1 ? "step" : "steps"}`} className="relative min-w-0 flex-1 text-center">
          <span aria-hidden="true" className="absolute right-1/2 top-[18px] h-px w-full bg-border-strong" />
          <span className="relative mx-auto grid size-9 place-items-center rounded-lg border border-dashed bg-surface text-[11px] font-medium text-muted-foreground">+{remaining}</span>
        </li>
      )}
    </ol>
  );
}

export function WorkflowCard({ workflow, lastRun, runsLoaded, statePending, onToggleState }: {
  workflow: WorkflowRecordDto;
  lastRun?: WorkflowRunRecordDto;
  runsLoaded: boolean;
  statePending: boolean;
  onToggleState: () => void;
}) {
  const scheduled = workflow.trigger.kind === "schedule";
  const active = workflow.state === "active";
  const state = lifecycle[workflow.state];
  const activationIssue = active ? undefined : executionIssues(workflow.name, workflow.steps)[0];
  const action = active ? "Pause" : "Activate";
  const scheduleTitle = active && workflow.next_run_at ? `Next run ${formatWhen(workflow.next_run_at)}` : undefined;

  return (
    <li className="group flex min-w-0 flex-col overflow-hidden rounded-lg border bg-surface/40 transition-colors hover:border-border-strong hover:bg-surface/70">
      <Link href={`/workflows/${workflow.id}`} aria-label={workflow.name} className="block flex-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring">
        <div className="relative flex h-32 items-center justify-center border-b bg-background/60 px-3 pt-4">
          <span className={cn("absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md border bg-surface px-1.5 py-0.5 text-[10px] font-medium", state.color)}>
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />{state.label}
          </span>
          <WorkflowPreview workflow={workflow} />
        </div>
        <div className="px-4 pb-2.5 pt-3">
          <h2 title={workflow.name} className="truncate text-sm font-semibold">{workflow.name}</h2>
          <p title={scheduleTitle} className="mt-1 truncate text-xs text-muted-foreground">{scheduled ? `Scheduled · ${workflow.schedule}` : "Manual trigger"}</p>
        </div>
      </Link>
      <div className="flex min-h-10 items-center justify-between gap-2 border-t px-4 py-1.5">
        <div className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          {lastRun ? (
            <Link href={`/workflows/${workflow.id}/runs/${lastRun.id}`} className="flex items-center gap-2 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
              Last run <StatusBadge status={lastRun.status} />
            </Link>
          ) : workflow.last_run_at ? <span className="truncate">Last run {formatWhen(workflow.last_run_at)}</span> : runsLoaded ? "Never run" : null}
        </div>
        <Button type="button" variant="outline" size="sm" aria-label={`${action} ${workflow.name}`} title={activationIssue} disabled={statePending || Boolean(activationIssue)} onClick={onToggleState} className="h-7 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
          {action}
        </Button>
      </div>
    </li>
  );
}
