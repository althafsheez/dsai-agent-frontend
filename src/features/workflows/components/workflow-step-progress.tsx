"use client";

import { LoaderCircle } from "lucide-react";
import type { WorkflowStepResultDto } from "@/lib/api";
import { formatDuration } from "../logic/format";
import { useNow } from "../use-workflows";

export function WorkflowStepProgress({ step }: { step: WorkflowStepResultDto }) {
  const active = step.status === "running";
  const now = useNow(active);
  if (!active) return null;

  return (
    <div role="status" className="flex min-w-0 items-center gap-2 rounded-md border bg-raised px-2.5 py-2 text-xs">
      <LoaderCircle aria-hidden className="size-3.5 shrink-0 text-slate motion-safe:animate-spin" />
      <span className="min-w-0 flex-1 break-words">{step.progress ?? "Starting the step…"}</span>
      {step.started_at && <span className="shrink-0 tabular-nums text-muted-foreground" aria-hidden>
        {formatDuration(now - Date.parse(step.started_at))}
      </span>}
    </div>
  );
}
