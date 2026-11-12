import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Clock3, MoreHorizontal, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export type WorkflowState = "active" | "inactive" | "draft";

export interface WorkflowPreview {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  source: { label: string; shortLabel: string; tone: string };
  destination: { label: string; shortLabel: string; tone: string };
  schedule: string;
  trigger: "schedule" | "event";
  state: WorkflowState;
  lastRun: string;
  updatedRank: number;
}

function AppNode({ app }: { app: WorkflowPreview["source"] }) {
  return <div className="grid size-10 shrink-0 place-items-center rounded-lg border bg-raised shadow-sm" title={app.label} aria-label={app.label}>
    <span className={cn("grid size-7 place-items-center rounded-md text-[9px] font-bold tracking-tight text-white", app.tone)}>{app.shortLabel}</span>
  </div>;
}

export function WorkflowCard({ workflow, list = false }: { workflow: WorkflowPreview; list?: boolean }) {
  const Icon = workflow.icon;
  const isActive = workflow.state === "active";

  return <article className={cn("group relative rounded-lg border bg-surface/80 p-3 transition-colors hover:border-border-strong hover:bg-surface", list && "sm:grid sm:grid-cols-[minmax(240px,1.4fr)_minmax(210px,1fr)_minmax(190px,.8fr)] sm:items-center sm:gap-5")}>
    <div className="flex min-w-0 items-start gap-3 pr-8 sm:pr-0">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg border bg-raised text-slate"><Icon className="size-[18px]" strokeWidth={1.6} /></div>
      <div className="min-w-0">
        <h2 className="truncate text-sm font-semibold tracking-tight">{workflow.name}</h2>
        <p className="mt-0.5 line-clamp-1 text-[11px] leading-4 text-muted-foreground">{workflow.description}</p>
      </div>
    </div>

    <button type="button" disabled aria-label={`Actions for ${workflow.name}`} title="Workflow actions are not connected in this preview" className="absolute right-3 top-3 grid size-7 place-items-center rounded-md border bg-raised text-muted-foreground disabled:cursor-not-allowed disabled:opacity-70"><MoreHorizontal className="size-4" /></button>

    <div className={cn("mt-3 flex items-center gap-2 pl-12", list && "sm:mt-0 sm:pl-0")} aria-label={`${workflow.source.label} through Atelier AI to ${workflow.destination.label}`}>
      <AppNode app={workflow.source} />
      <span aria-hidden="true" className="h-px w-4 bg-border-strong" />
      <span className="grid size-10 shrink-0 place-items-center rounded-lg border bg-raised text-slate"><Zap className="size-[18px]" /></span>
      <span aria-hidden="true" className="h-px w-4 bg-border-strong" />
      <AppNode app={workflow.destination} />
    </div>

    <div className={cn("mt-3", list && "sm:mt-0")}>
      <div className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-raised px-2 py-1 text-[10px] text-foreground/90">
        {workflow.trigger === "schedule" ? <Clock3 className="size-3 text-muted-foreground" /> : <Zap className="size-3 text-muted-foreground" />}
        <span className="truncate">{workflow.schedule}</span>
      </div>
      <div className="mt-3 flex items-center gap-3 border-t pt-2.5 text-[10px]">
        {workflow.state === "draft" ? <span className="text-muted-foreground">Draft</span> : isActive ? <span className="inline-flex items-center gap-1.5 font-medium text-sage"><CheckCircle2 className="size-3.5" />Completed</span> : <span className="inline-flex items-center gap-1.5 text-muted-foreground"><Clock3 className="size-3.5" />Inactive</span>}
        <span className="text-muted-foreground">{workflow.lastRun}</span>
        <span role="switch" aria-checked={isActive} aria-label={`${workflow.name} is ${isActive ? "active" : "inactive"}`} title="State changes are unavailable in this preview" className={cn("ml-auto flex h-5 w-9 cursor-not-allowed items-center rounded-full border p-0.5", isActive ? "justify-end border-sage/40 bg-sage" : "justify-start bg-raised")}>
          <span className="size-3.5 rounded-full bg-white shadow" />
        </span>
      </div>
    </div>
  </article>;
}
