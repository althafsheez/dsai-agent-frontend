"use client";

import type { ReactNode } from "react";
import { Bell, CheckCircle2, CircleDashed, Clock, Code2, Database, Filter, Loader2, MinusCircle, MousePointerClick, Sparkles, UserCheck, XCircle } from "lucide-react";
import type { WorkflowStepDto, WorkflowStepStatus, WorkflowTriggerDto } from "@/lib/api";
import { cn } from "@/lib/utils";
import { describeSchedule, kindInfo } from "../logic/steps";

const icons: Record<string, typeof Database> = { data: Database, script: Code2, ai: Sparkles, condition: Filter, notify: Bell, human: UserCheck };
export const StepIcon = ({ kind, className }: { kind: string; className?: string }) => { const Icon = icons[kind] ?? Sparkles; return <Icon className={className ?? "size-4"} strokeWidth={1.6} />; };

const statusLook: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  pending: { label: "Waiting", tone: "text-muted-foreground", icon: CircleDashed },
  running: { label: "Running", tone: "text-sky-300", icon: Loader2 },
  success: { label: "Done", tone: "text-emerald-400", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "text-rose-400", icon: XCircle },
  skipped: { label: "Skipped", tone: "text-muted-foreground", icon: MinusCircle },
  cancelled: { label: "Cancelled", tone: "text-amber-300", icon: MinusCircle },
};

export function StatusBadge({ status }: { status: WorkflowStepStatus | "running" | "success" | "failed" | "cancelled" }) {
  const look = statusLook[status] ?? statusLook.pending;
  const Icon = look.icon;
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium", look.tone)}><Icon className={cn("size-3", status === "running" && "animate-spin")} />{look.label}</span>;
}

export function TriggerCard({ trigger, children }: { trigger: WorkflowTriggerDto; children?: ReactNode }) {
  const scheduled = trigger.kind === "schedule";
  const Icon = scheduled ? Clock : MousePointerClick;
  return (
    <div className="rounded-xl border border-sky-300/30 bg-sky-300/5 p-3.5">
      <div className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-sky-300/30 bg-sky-300/10 text-sky-300"><Icon className="size-4" strokeWidth={1.6} /></span>
        <div className="min-w-0"><p className="text-[10px] font-medium uppercase tracking-[0.12em] text-sky-300">Starts</p><p className="truncate text-sm font-medium">{describeSchedule(trigger)}</p></div>
      </div>
      {children}
    </div>
  );
}

export function Connector() {
  return <div aria-hidden className="mx-auto h-8 w-px bg-border-strong" />;
}

export function StepCard({ index, step, status, actions, children, tone }: { index: number; step: Pick<WorkflowStepDto, "kind" | "title" | "detail">; status?: WorkflowStepStatus; actions?: ReactNode; children?: ReactNode; tone?: "active" }) {
  return (
    <section aria-label={`Step ${index + 1}: ${step.title}`} className={cn("rounded-xl border bg-surface/60 p-3.5", status === "running" && "border-sky-300/50", status === "failed" && "border-rose-400/50", tone === "active" && "border-sky-300/50")}>
      <header className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border bg-raised text-slate"><StepIcon kind={step.kind} /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Step {index + 1} · {kindInfo(step.kind).label}</p>
          <p className="truncate text-sm font-medium">{step.title || kindInfo(step.kind).label}</p>
          {step.detail ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{step.detail}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">{status ? <StatusBadge status={status} /> : null}{actions}</div>
      </header>
      {children}
    </section>
  );
}
