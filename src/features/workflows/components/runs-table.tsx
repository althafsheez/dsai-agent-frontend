"use client";

import Link from "next/link";
import type { WorkflowRunRecordDto } from "@/lib/api";
import { formatDuration, formatWhen, runDuration, stepProgress } from "../logic/format";
import { useNow } from "../use-workflows";
import { StatusBadge } from "./flow-parts";

export function RunsTable({ runs, labelledBy, workflowNames }: {
  runs: WorkflowRunRecordDto[];
  labelledBy: string;
  workflowNames?: ReadonlyMap<string, string>;
}) {
  const now = useNow(runs.some((run) => run.status === "running"));
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table aria-labelledby={labelledBy} className="w-full text-left text-xs">
        <thead className="border-b bg-surface text-[10px] uppercase tracking-wider text-muted-foreground">
          <tr>
            {workflowNames && <th scope="col" className="px-3 py-2 font-medium">Workflow</th>}
            <th scope="col" className="px-3 py-2 font-medium">Started</th>
            <th scope="col" className="px-3 py-2 font-medium">Trigger</th>
            <th scope="col" className="px-3 py-2 font-medium">Duration</th>
            <th scope="col" className="px-3 py-2 font-medium">Result</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {runs.map((run) => {
            const progress = stepProgress(run);
            const href = `/workflows/${run.workflow_id}/runs/${run.id}`;
            const started = formatWhen(run.started_at);
            return (
              <tr key={run.id} className="hover:bg-surface focus-within:bg-surface">
                {workflowNames && (
                  <th scope="row" className="w-[36%] min-w-36 max-w-64 px-3 py-2.5 font-medium">
                    <Link href={href} className="block break-words rounded-sm hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring">
                      {workflowNames.get(run.workflow_id) ?? run.workflow_name}
                      <span className="sr-only">, {started}</span>
                    </Link>
                  </th>
                )}
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                  {workflowNames ? started : <Link href={href} className="font-medium text-sky-300 hover:underline">{started}</Link>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{run.trigger === "test" ? "Test" : run.trigger === "schedule" ? "Schedule" : "By hand"}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDuration(runDuration(run, now))}</td>
                <td className="px-3 py-2.5"><span className="flex flex-wrap items-center gap-2"><StatusBadge status={run.status} />{run.status === "running" ? <span className="text-[11px] text-muted-foreground">step {Math.min(progress.done + 1, progress.total)} of {progress.total}</span> : null}{run.status === "failed" && run.error ? <span className="max-w-28 truncate text-[11px] text-rose-300 sm:max-w-[260px]" title={run.error}>{run.error}</span> : null}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
