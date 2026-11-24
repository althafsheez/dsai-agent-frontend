"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Clock, MousePointerClick, Search, Webhook } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { WorkflowTriggerDto } from "@/lib/api";
import { SchedulePicker } from "./schedule-picker";

export type TriggerType = WorkflowTriggerDto["kind"] | "webhook";

const triggerTypes = [
  { kind: "manual", title: "Manual", description: "Start the workflow on demand.", icon: MousePointerClick },
  { kind: "schedule", title: "Schedule", description: "Run automatically at a recurring time.", icon: Clock },
  { kind: "webhook", title: "Webhook", description: "Start from an incoming HTTP request.", icon: Webhook },
] as const;

export function TriggerChooser({ onSelect, onBack, disabled }: {
  onSelect: (kind: TriggerType) => void;
  onBack: () => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const entries = triggerTypes.filter(({ title, description }) =>
    `${title} ${description}`.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft /> Back</Button>
      <h2 ref={heading} tabIndex={-1} className="text-sm font-semibold focus:outline-none">Choose a trigger</h2>
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <input aria-label="Search triggers" type="search" value={search} onChange={(event) => setSearch(event.target.value)}
          placeholder="Search triggers…" className="h-9 w-full rounded-md border bg-background pl-8 pr-2 text-xs" />
      </label>
      <ul className="divide-y rounded-lg border bg-background/40">
        {entries.map(({ kind, title, description, icon: Icon }) => (
          <li key={kind}>
            <button type="button" disabled={disabled} onClick={() => onSelect(kind)}
              className="flex w-full items-center gap-3 rounded-md p-3 text-left hover:bg-raised focus-visible:bg-raised disabled:opacity-50">
              <span className="grid size-8 shrink-0 place-items-center rounded-md border bg-raised text-slate"><Icon className="size-4" /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium">{title}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
                {kind === "webhook" && <span className="mt-1 block text-[11px] text-muted-foreground">Coming soon</span>}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
          </li>
        ))}
      </ul>
      {!entries.length && <p role="status" className="text-xs text-muted-foreground">No matching triggers.</p>}
    </div>
  );
}

export function TriggerConfiguration({ trigger, webhook, onChange, onBack, disabled }: {
  trigger: WorkflowTriggerDto;
  webhook: boolean;
  onChange: (trigger: WorkflowTriggerDto) => void;
  onBack: () => void;
  disabled: boolean;
}) {
  const kind = webhook ? "webhook" : trigger.kind;
  const type = triggerTypes.find((entry) => entry.kind === kind)!;
  const Icon = type.icon;

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2"><ArrowLeft /> Trigger types</Button>
      <header className="flex items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-md border bg-raised text-slate"><Icon className="size-4" /></span>
        <div>
          <h2 className="text-sm font-semibold">{type.title} trigger</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{type.description}</p>
        </div>
      </header>
      {kind === "manual" && <p className="text-xs text-muted-foreground">Use Run now from the saved workflow to start it.</p>}
      {kind === "schedule" && (
        <fieldset disabled={disabled} className="space-y-2">
          <SchedulePicker trigger={trigger} onChange={onChange} />
          <p className="text-xs text-muted-foreground">Schedule times use the server time zone.</p>
        </fieldset>
      )}
      {kind === "webhook" && (
        <div className="space-y-3 rounded-md border bg-background p-3 text-xs">
          <p className="text-muted-foreground">Webhook execution is coming soon. URL, HTTP method and authentication settings will appear here once it’s supported.</p>
        </div>
      )}
    </div>
  );
}
