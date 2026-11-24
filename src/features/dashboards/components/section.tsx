"use client";

import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const TONES = {
  ai: "border-t-sage",
  manual: "border-t-sky-400",
  data: "border-t-amber-300",
  canvas: "border-t-border-strong",
} as const;

interface SectionProps {
  title: string;
  hint?: string;
  icon: React.ReactNode;
  tone: keyof typeof TONES;
  /** Shown at the right of the header (counts, buttons). */
  actions?: React.ReactNode;
  /** Sections that can be folded away start open unless this is false. */
  collapsible?: boolean;
  defaultOpen?: boolean;
  /** Inside a side panel: no card, just a divider. */
  flat?: boolean;
  children: React.ReactNode;
}

/** One clearly separate area of the designer: a header band with its own accent, then the content. */
export function Section({ title, hint, icon, tone, actions, collapsible, defaultOpen = true, flat = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  return (
    <section aria-label={title} className={flat ? "border-b" : cn("overflow-hidden rounded-xl border border-t-2 bg-surface/30", TONES[tone])}>
      <header className={cn("flex flex-wrap items-center gap-2", flat ? "px-4 py-2.5" : "border-b bg-surface/60 px-3.5 py-2")}>
        <span className="text-muted-foreground" aria-hidden="true">{icon}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-semibold uppercase tracking-[0.08em]">{title}</h2>
          {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
        </div>
        {actions}
        {collapsible ? (
          <button type="button" aria-expanded={open} aria-controls={bodyId} aria-label={`${open ? "Hide" : "Show"} ${title}`} onClick={() => setOpen(!open)} className="grid size-7 place-items-center rounded text-muted-foreground hover:bg-raised hover:text-foreground">
            <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
          </button>
        ) : null}
      </header>
      <div id={bodyId} hidden={!open} className={flat ? "px-4 pb-3" : "p-3.5"}>{children}</div>
    </section>
  );
}
