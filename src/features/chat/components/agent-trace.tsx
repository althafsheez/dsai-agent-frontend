"use client";

import { useState } from "react";
import { Check, ChevronDown, Circle, LoaderCircle, X } from "lucide-react";
import type { TraceStep } from "../types";
import { cn } from "@/lib/utils";

export function AgentTrace({ steps }: { steps: TraceStep[] }) {
  const [open, setOpen] = useState(true);
  const running = steps.some((step) => step.status === "running" || step.status === "pending");
  return <div className="my-4 rounded-lg border bg-surface">
    <button onClick={() => setOpen((value) => !value)} aria-expanded={open} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-xs font-medium hover:bg-raised/50">
      <ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform", !open && "-rotate-90")} />
      Agent execution
      {running && <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground"><LoaderCircle className="size-3 animate-spin" />Running</span>}
    </button>
    {open && <ol className="space-y-0.5 border-t px-3 py-2" aria-label="Execution progress">{steps.map((step) => {
      const StatusIcon = step.status === "completed" ? Check : step.status === "failed" ? X : step.status === "running" ? LoaderCircle : Circle;
      return <li key={step.id} className="flex items-start gap-2.5 rounded px-1 py-2 text-xs">
        <StatusIcon className={cn("mt-0.5 size-3.5 shrink-0", step.status === "completed" && "text-sage", step.status === "failed" && "text-red-400", step.status === "running" && "animate-spin text-slate", step.status === "pending" && "text-muted-foreground")} />
        <span><span className="block">{step.label}</span>{step.detail && <span className="mt-0.5 block text-[11px] text-muted-foreground">{step.detail}</span>}</span>
      </li>;
    })}</ol>}
  </div>;
}
