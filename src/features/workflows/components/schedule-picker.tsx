"use client";

import type { WorkflowTriggerDto } from "@/lib/api";
import { FREQUENCIES, frequencyOf, makeTrigger, WEEKDAYS } from "../logic/steps";

const field = "h-9 rounded-md border bg-background px-2.5 text-xs outline-none focus:border-border-strong";

export function SchedulePicker({ trigger, onChange }: { trigger: WorkflowTriggerDto; onChange: (next: WorkflowTriggerDto) => void }) {
  const frequency = frequencyOf(trigger);
  const config = trigger.config ?? {};
  const set = (patch: Record<string, string>) => onChange({ ...trigger, kind: "schedule", config: { ...config, ...patch } });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="How often" value={frequency} onChange={(event) => onChange(makeTrigger(event.target.value, trigger))} className={field}>
        {FREQUENCIES.filter((item) => item.value !== "manual").map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
      {frequency === "weekly" ? <select aria-label="Day of the week" value={config.day ?? "Monday"} onChange={(event) => set({ day: event.target.value })} className={field}>{WEEKDAYS.map((day) => <option key={day}>{day}</option>)}</select> : null}
      {frequency === "monthly" ? <label className="flex items-center gap-1.5 text-xs text-muted-foreground">on day<input aria-label="Day of the month" type="number" min={1} max={28} value={String(config.day_of_month ?? "1")} onChange={(event) => set({ day_of_month: event.target.value })} className={`${field} w-16`} /></label> : null}
      {frequency === "daily" || frequency === "weekly" || frequency === "monthly" ? <label className="flex items-center gap-1.5 text-xs text-muted-foreground">at<input aria-label="Time of day" type="time" value={config.time ?? "09:00"} onChange={(event) => set({ time: event.target.value })} className={field} /></label> : null}
    </div>
  );
}
