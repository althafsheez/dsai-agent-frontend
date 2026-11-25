"use client";

import { ChevronDown, Trash2 } from "lucide-react";
import type { ScheduleRule, WorkflowTriggerDto } from "@/lib/api";
import { WEEKDAYS } from "../logic/steps";

const field = "h-9 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus:border-border-strong";
const units = ["seconds", "minutes", "hours", "days", "weeks", "months"] as const;
const limits: Record<ScheduleRule["unit"], number> = { seconds: 59, minutes: 59, hours: 23, days: 31, weeks: 52, months: 12 };
const title = (value: string) => value[0].toUpperCase() + value.slice(1);

function initialRule(trigger: WorkflowTriggerDto): ScheduleRule {
  const config = trigger.config ?? {};
  const unit = ({ hourly: "hours", daily: "days", weekly: "weeks", monthly: "months" } as const)[config.frequency as "hourly" | "daily" | "weekly" | "monthly"] ?? "days";
  const [hour, minute] = (config.time ?? "09:00").split(":").map(Number);
  return { unit, interval: 1, hour: hour || 0, minute: unit === "hours" ? 0 : minute || 0, weekdays: [config.day ?? "Monday"], day_of_month: Number(config.day_of_month ?? 1) };
}

export function SchedulePicker({ trigger, onChange }: { trigger: WorkflowTriggerDto; onChange: (next: WorkflowTriggerDto) => void }) {
  const rules = trigger.config?.rules ?? [initialRule(trigger)];
  const save = (next: ScheduleRule[]) => onChange({ ...trigger, kind: "schedule", config: { ...trigger.config, rules: next } });
  const update = (index: number, patch: Partial<ScheduleRule>) => save(rules.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
  return <div className="space-y-3">
    <h3 className="text-xs font-medium">Schedule</h3>
    {rules.map((rule, index) => <div key={index} className="space-y-3">
      {rules.length > 1 && <div className="flex items-center justify-between text-xs font-medium"><span>Trigger Rule {index + 1}</span><button type="button" aria-label={`Delete trigger interval ${index + 1}`} onClick={() => save(rules.filter((_, i) => i !== index))}><Trash2 className="size-4" /></button></div>}
      <label className="block space-y-1.5 text-xs"><span>Trigger Interval</span><span className="relative block"><select className={`${field} appearance-none pr-9 transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-slate/30`} value={rule.unit} onChange={(event) => update(index, { unit: event.target.value as ScheduleRule["unit"], interval: 1 })}>{units.map((unit) => <option key={unit} value={unit}>{title(unit)}</option>)}</select><ChevronDown aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /></span></label>
      <label className="block space-y-1 text-xs"><span>{title(rule.unit)} Between Triggers</span><input className={field} type="number" min={1} max={limits[rule.unit]} value={rule.interval} onChange={(event) => update(index, { interval: Number(event.target.value) })} /><span className="block text-muted-foreground">Must be in range 1–{limits[rule.unit]}</span></label>
      {rule.unit === "weeks" && <fieldset><legend className="mb-1 text-xs">Trigger on Weekdays</legend><div className="flex flex-wrap gap-2">{WEEKDAYS.map((day) => <label key={day} className="flex items-center gap-1 text-xs"><input type="checkbox" checked={rule.weekdays.includes(day)} onChange={(event) => update(index, { weekdays: event.target.checked ? [...rule.weekdays, day] : rule.weekdays.filter((value) => value !== day) })} />{day.slice(0, 3)}</label>)}</div>{!rule.weekdays.length && <p className="mt-1 text-xs text-destructive">Select at least one weekday.</p>}</fieldset>}
      {rule.unit === "months" && <label className="block space-y-1 text-xs"><span>Trigger at Day of Month</span><input aria-label="Trigger at Day of Month" className={field} type="number" min={1} max={31} value={rule.day_of_month} onChange={(event) => update(index, { day_of_month: Number(event.target.value) })} /><span className="block text-muted-foreground">If a month doesn’t have this day, the rule won’t trigger.</span></label>}
      {["days", "weeks", "months"].includes(rule.unit) && <label className="block space-y-1 text-xs"><span>Trigger at Hour</span><select className={field} value={rule.hour} onChange={(event) => update(index, { hour: Number(event.target.value) })}>{Array.from({ length: 24 }, (_, hour) => <option key={hour} value={hour}>{hour === 0 ? "Midnight" : `${hour.toString().padStart(2, "0")}:00`}</option>)}</select></label>}
      {["hours", "days", "weeks", "months"].includes(rule.unit) && <label className="block space-y-1 text-xs"><span>Trigger at Minute</span><input className={field} type="number" min={0} max={59} value={rule.minute} onChange={(event) => update(index, { minute: Number(event.target.value) })} /></label>}
    </div>)}
  </div>;
}
