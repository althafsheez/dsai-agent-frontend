"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

const OPTIONS = [{ value: 0, label: "Off" }, { value: 1, label: "Every minute" }, { value: 5, label: "Every 5 min" }, { value: 15, label: "Every 15 min" }, { value: 60, label: "Every hour" }];

export function ago(then: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 10) return "just now";
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

interface DataStatusProps {
  checkedAt: number;
  dataChangedAt: string | null;
  refreshing: boolean;
  syncIssue: boolean;
  refreshMinutes: number;
  /** Undefined hides the picker (viewers see the schedule as text). */
  onRefreshMinutes?: (minutes: number) => void;
  onRefresh: () => void;
}

/** "Data checked 2 min ago", a Refresh button and the auto-refresh schedule. */
export function DataStatus({ checkedAt, dataChangedAt, refreshing, syncIssue, refreshMinutes, onRefreshMinutes, onRefresh }: DataStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-[11px] text-muted-foreground" role="group" aria-label="Data freshness">
      <button type="button" onClick={onRefresh} disabled={refreshing} className="inline-flex h-7 items-center gap-1.5 rounded-md border bg-surface px-2 text-xs text-foreground transition-colors hover:border-border-strong disabled:opacity-60">
        <RefreshCw className={cn("size-3.5", refreshing && "animate-spin")} />{refreshing ? "Refreshing…" : "Refresh data"}
      </button>
      <span>{checkedAt ? `Checked ${ago(checkedAt, now)}` : "Loading data…"}{dataChangedAt ? ` · data changed ${ago(Date.parse(dataChangedAt), now)}` : ""}</span>
      {syncIssue ? <span role="status" className="text-amber-300">Could not reach Google Drive. Showing the last saved data.</span> : null}
      <label className="ml-auto inline-flex items-center gap-1.5">
        Auto-refresh
        {onRefreshMinutes ? (
          <select aria-label="Auto-refresh" value={refreshMinutes} onChange={(event) => onRefreshMinutes(Number(event.target.value))} className="h-7 rounded-md border bg-surface px-1.5 text-[11px] text-foreground">
            {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        ) : <span className="text-foreground">{OPTIONS.find((option) => option.value === refreshMinutes)?.label ?? "Off"}</span>}
      </label>
    </div>
  );
}
