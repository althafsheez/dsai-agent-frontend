"use client";

import Link from "next/link";
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarUsageStatsProps {
  compact?: boolean;
  className?: string;
}

const stats = [
  { label: "AI Credits", value: "3,250 / 5,000", percent: 65, barClass: "bg-sage" },
  { label: "Disk Space", value: "0 MB / 100 MB", percent: 0, barClass: "bg-slate" },
  { label: "Compute Time", value: "42h / 100h", percent: 42, barClass: "bg-[oklch(0.76_0.07_50)]" },
];

const OVERALL_PERCENT = 65;

export function SidebarUsageStats({ compact = false, className }: SidebarUsageStatsProps) {
  if (compact) {
    return (
      <Link
        href="/settings"
        title={`Usage: ${OVERALL_PERCENT}% used`}
        aria-label="View usage statistics"
        className={cn(
          "group relative mx-auto mb-2 flex size-8 items-center justify-center rounded-lg border border-sidebar-border/40 bg-surface/40 hover:border-border-strong hover:bg-surface transition-colors",
          className
        )}
      >
        <Zap className="size-3.5 text-slate group-hover:text-foreground transition-colors" />
      </Link>
    );
  }

  return (
    <div data-testid="sidebar-usage-stats" className={cn("px-3 pb-3", className)}>
      <section aria-label="Usage stats" className="rounded-lg border border-sidebar-border/60 p-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Usage Stats</h2>
          <span className="text-[11px] text-muted-foreground">{OVERALL_PERCENT}% used</span>
        </div>
        <div className="mt-3 space-y-3">
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">{stat.label}</span>
                <span className="text-muted-foreground">{stat.value}</span>
              </div>
              {stat.percent > 0 && (
                <div
                  role="progressbar"
                  aria-label={stat.label}
                  aria-valuenow={stat.percent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  className="mt-1.5 h-1 w-full"
                >
                  <div className={cn("h-full rounded-full", stat.barClass)} style={{ width: `${stat.percent}%` }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
      <p className="mt-3 px-0.5 text-xs leading-snug text-muted-foreground">
        AI can make mistakes. Always verify important results.
      </p>
    </div>
  );
}
