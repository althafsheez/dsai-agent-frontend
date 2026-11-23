"use client";

import Link from "next/link";
import { HardDrive, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarUsageStatsProps {
  compact?: boolean;
  className?: string;
}

export function SidebarUsageStats({ compact = false, className }: SidebarUsageStatsProps) {
  // Usage statistics aligned with DSAI Free preview quota limits
  const runsUsed = 19;
  const runsLimit = 50;
  const runPercentage = Math.round((runsUsed / runsLimit) * 100);
  const storageText = "40.4 KB / 100 MB";

  if (compact) {
    return (
      <Link
        href="/settings"
        title={`Usage: ${runsUsed}/${runsLimit} runs (${runPercentage}%), ${storageText}`}
        aria-label="View usage statistics"
        className={cn(
          "group relative mx-auto mb-2 flex size-8 items-center justify-center rounded-lg border border-sidebar-border/40 bg-surface/40 hover:border-border-strong hover:bg-surface transition-colors",
          className
        )}
      >
        <Zap className="size-3.5 text-slate group-hover:text-foreground transition-colors" />
        <span
          className="absolute -top-1 -right-1 size-2 rounded-full bg-slate"
          aria-hidden="true"
        />
      </Link>
    );
  }

  return (
    <div
      data-testid="sidebar-usage-stats"
      className={cn(
        "mx-3 mb-2 rounded-lg border border-sidebar-border/50 bg-surface/40 p-2.5 transition-colors hover:border-border-strong",
        className
      )}
    >
      <div className="flex items-center justify-between text-[11px]">
        <Link
          href="/settings"
          className="flex items-center gap-1.5 font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Zap className="size-3 text-slate" />
          <span>Usage Statistics</span>
        </Link>
        <span className="rounded bg-raised px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground border border-border/40">
          Free Tier
        </span>
      </div>

      <div className="mt-2 space-y-1">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>Monthly runs</span>
          <span className="font-medium text-foreground">
            {runsUsed} / {runsLimit}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-raised">
          <div
            className="h-full rounded-full bg-slate transition-all"
            style={{ width: `${runPercentage}%` }}
          />
        </div>
      </div>

      <div className="mt-2.5 flex items-center justify-between border-t border-sidebar-border/40 pt-1.5 text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1">
          <HardDrive className="size-2.5 text-muted-foreground" />
          <span>Storage</span>
        </div>
        <span className="font-mono text-[9px] text-foreground/80">{storageText}</span>
      </div>
    </div>
  );
}
