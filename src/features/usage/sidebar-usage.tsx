"use client";

import Link from "next/link";
import { usageMeters, usagePercent } from "./usage-data";

/** Compact usage summary pinned above the account row. Sample figures until a usage API exists. */
export function SidebarUsage({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/settings?view=usage"
      onClick={onNavigate}
      aria-label="Usage analytics (sample data)"
      className="mx-3 mb-3 block rounded-lg border border-sidebar-border/60 bg-surface/40 p-2.5 transition-colors hover:border-border-strong"
    >
      <p className="mb-2 flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
        Usage <span className="normal-case tracking-normal">Sample</span>
      </p>
      <ul className="space-y-2">
        {usageMeters.map((meter) => {
          const percent = usagePercent(meter);
          return (
            <li key={meter.key}>
              <div className="flex items-baseline justify-between gap-2 text-[11px]">
                <span className="text-muted-foreground">{meter.label}</span>
                <span className="text-foreground/80">{meter.format(meter.used)}</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-raised">
                <span className={`block h-full rounded-full ${percent >= 90 ? "bg-red-400" : "bg-slate"}`} style={{ width: `${percent}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </Link>
  );
}
