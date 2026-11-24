"use client";

import { useEffect, useState } from "react";

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
  /** Published and being viewed: data is re-read all the time. Otherwise the page shows a snapshot. */
  live: boolean;
  checkedAt: number;
  dataChangedAt: string | null;
  syncIssue: boolean;
}

/** The line in the status bar about the data: "data changed 2 min ago" when live, "data as of 8:12 PM" for a draft or preview. */
export function DataStatus({ live, checkedAt, dataChangedAt, syncIssue }: DataStatusProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const snapshot = checkedAt ? new Date(checkedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return (
    <>
      {live
        ? <span>· live{dataChangedAt ? ` · data changed ${ago(Date.parse(dataChangedAt), now)}` : ""}</span>
        : <span>· showing the data as of {snapshot ?? "now"}; it updates only when published</span>}
      {syncIssue ? <span role="status" className="text-amber-300">· Could not reach Google Drive. Showing the last saved data.</span> : null}
    </>
  );
}
