"use client";

import { useState, type ReactNode } from "react";
import { Bell, CheckCircle2, CircleDashed, Clock, Code2, Database, Filter, Loader2, MinusCircle, MousePointerClick, Plus, Sparkles, XCircle } from "lucide-react";
import type { WorkflowStepDto, WorkflowStepKind, WorkflowStepStatus, WorkflowTriggerDto } from "@/lib/api";
import { cn } from "@/lib/utils";
import { describeSchedule, kindInfo, STEP_KINDS } from "../logic/steps";

const icons: Record<string, typeof Database> = { data: Database, script: Code2, ai: Sparkles, condition: Filter, notify: Bell };
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

/** The vertical line between two cards. With `onAdd` it carries a "+" that opens the step picker. */
export function Connector({ onAdd, label }: { onAdd?: (kind: WorkflowStepKind) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative flex flex-col items-center" aria-hidden={onAdd ? undefined : true}>
      <span className="h-4 w-px bg-border-strong" />
      {onAdd ? (
        <>
          <button type="button" aria-label={label ?? "Add a step here"} aria-expanded={open} onClick={() => setOpen(!open)} className="grid size-6 place-items-center rounded-full border bg-surface text-muted-foreground transition-colors hover:border-sky-300 hover:text-sky-300"><Plus className="size-3.5" /></button>
          <span className="h-4 w-px bg-border-strong" />
          {open ? (
            <ul role="menu" aria-label="Step types" className="absolute left-1/2 top-8 z-20 w-72 -translate-x-1/2 max-w-[calc(100vw-2rem)] rounded-xl border bg-raised p-1.5 shadow-xl">
              {STEP_KINDS.map((item) => (
                <li key={item.kind} role="none">
                  <button type="button" role="menuitem" onClick={() => { setOpen(false); onAdd(item.kind); }} className="flex w-full items-start gap-2.5 rounded-lg p-2 text-left hover:bg-surface">
                    <span className="mt-0.5 text-sky-300"><StepIcon kind={item.kind} /></span>
                    <span className="min-w-0"><span className="block text-xs font-medium">{item.label}</span><span className="block text-[11px] leading-snug text-muted-foreground">{item.hint}</span><span className="mt-0.5 block text-[10px] text-sky-300/80">{item.needs}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : <span className="h-4 w-px bg-border-strong" />}
    </div>
  );
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
