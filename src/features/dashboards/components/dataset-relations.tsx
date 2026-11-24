"use client";

import { AlertTriangle, CheckCircle2, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "../logic/aggregate";
import type { ConflictPolicy } from "../logic/manual";
import type { DatasetLite } from "../types";
import type { DatasetRelations } from "@/lib/api";

interface Props {
  datasets: DatasetLite[];
  relations: DatasetRelations | undefined;
  loading: boolean;
  failed: boolean;
  policy: ConflictPolicy;
  onPolicy: (policy: ConflictPolicy) => void;
}

/** With two or more datasets: how they overlap, where they disagree, and how the dashboard should treat a disagreement. */
export function DatasetRelationsPanel({ datasets, relations, loading, failed, policy, onPolicy }: Props) {
  if (datasets.length < 2) return null;
  if (loading) return <p role="status" className="text-xs text-muted-foreground">Comparing {datasets.length} datasets…</p>;
  if (failed || !relations) return <p className="text-xs text-muted-foreground">The datasets could not be compared. Each chart will read one file.</p>;
  const choice = policy.kind === "prefer" ? `prefer:${policy.datasetId}` : policy.kind;
  const options = [
    { value: "separate", label: "Keep the files separate", hint: "Every chart reads one file and says which. Nothing is added across files." },
    { value: "compare", label: "Show both side by side", hint: "One chart per file for the disputed numbers, so the gap is visible." },
    ...datasets.map((dataset) => ({ value: `prefer:${dataset.id}`, label: `Trust ${dataset.name}`, hint: "Use it for the disputed numbers and ignore the other file for them." })),
  ];
  return (
    <div aria-label="How the datasets relate" className="space-y-2.5">
      <ul className="space-y-1.5">
        {relations.pairs.map((pair) => (
          <li key={`${pair.a}|${pair.b}`} className={cn("rounded-lg border p-2.5 text-xs", pair.conflicts.length ? "border-amber-300/40 bg-amber-300/5" : "border-emerald-400/25")}>
            <p className="flex items-start gap-1.5">{pair.conflicts.length ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-300" /> : pair.key ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-300" /> : <Link2 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />}<span>{pair.summary}</span></p>
            {pair.conflicts.map((conflict) => (
              <p key={conflict.column} className="mt-1 pl-5 text-[11px] text-muted-foreground">
                {conflict.column}: {conflict.examples.map((example) => `${example.key} is ${formatNumber(example.a)} in ${pair.a} but ${formatNumber(example.b)} in ${pair.b}`).join("; ")}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {relations.conflict ? (
        <label className="block text-[11px] text-muted-foreground">When the files disagree, the AI should
          <select aria-label="When the files disagree" value={choice} onChange={(event) => { const value = event.target.value; onPolicy(value.startsWith("prefer:") ? { kind: "prefer", datasetId: value.slice(7) } : value === "compare" ? { kind: "compare" } : { kind: "separate" }); }} className="mt-1 h-8 w-full rounded-md border bg-surface px-2 text-xs text-foreground">
            {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <span className="mt-1 block">{options.find((option) => option.value === choice)?.hint}</span>
        </label>
      ) : null}
    </div>
  );
}
