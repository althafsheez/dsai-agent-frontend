"use client";

import Link from "next/link";
import type { WorkflowRunRecordDto } from "@/lib/api";
import { formatDuration, formatWhen, runDuration, stepProgress } from "../logic/format";
import { useNow } from "../use-workflows";
import { StatusBadge } from "./flow-parts";

/** Every run, newest first: when, how it started, how long, how it ended. A row opens the run's step-by-step log. */
export function HistoryTable({ runs, showName = true, empty }: { runs: WorkflowRunRecordDto[]; showName?: boolean; empty: string }) {
  const now = useNow(runs.some((run) => run.status === "running"));
  if (!runs.length) return <p className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] text-left text-xs">
        <thead className="border-b bg-surface/60 text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>{showName ? <th className="px-3 py-2 font-medium">Workflow</th> : null}<th className="px-3 py-2 font-medium">Started</th><th className="px-3 py-2 font-medium">How</th><th className="px-3 py-2 font-medium">Took</th><th className="px-3 py-2 font-medium">Result</th></tr>
        </thead>
        <tbody className="divide-y">
          {runs.map((run) => {
            const progress = stepProgress(run);
            return (
              <tr key={run.id} className="hover:bg-surface/60">
                {showName ? <td className="max-w-[220px] truncate px-3 py-2.5 font-medium">{run.workflow_name}</td> : null}
                <td className="whitespace-nowrap px-3 py-2.5"><Link href={`/workflows/${run.workflow_id}/runs/${run.id}`} className="hover:underline">{formatWhen(run.started_at)}</Link></td>
                <td className="px-3 py-2.5 capitalize text-muted-foreground">{run.trigger === "schedule" ? "Schedule" : "By hand"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDuration(runDuration(run, now))}</td>
                <td className="px-3 py-2.5"><span className="flex flex-wrap items-center gap-2"><StatusBadge status={run.status} />{run.status === "running" ? <span className="text-[11px] text-muted-foreground">step {Math.min(progress.done + 1, progress.total)} of {progress.total}</span> : null}{run.status === "failed" && run.error ? <span className="max-w-[260px] truncate text-[11px] text-rose-300" title={run.error}>{run.error}</span> : null}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
