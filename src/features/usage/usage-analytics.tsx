"use client";

import { Cpu, HardDrive, Sparkles } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { dailyUsage, usageByModel, usageMeters, usagePercent, type UsageMeter } from "./usage-data";

const icons = { credits: Sparkles, disk: HardDrive, compute: Cpu } as const;

function MeterCard({ meter }: { meter: UsageMeter }) {
  const Icon = icons[meter.key];
  const percent = usagePercent(meter);
  return (
    <section className="rounded-xl border bg-surface/50 p-4" aria-label={meter.label}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="size-3.5 text-slate" />
        {meter.label}
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight">{meter.format(meter.used)}</p>
      <p className="mt-0.5 text-[11px] text-muted-foreground">of {meter.format(meter.limit)} · {percent}% used</p>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${meter.label} used`}>
        <span className={`block h-full rounded-full ${percent >= 90 ? "bg-red-400" : "bg-slate"}`} style={{ width: `${percent}%` }} />
      </div>
    </section>
  );
}

export function UsageAnalytics() {
  return (
    <div className="mt-7 space-y-5">
      <p className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
        Sample data. Usage metering is not connected to the backend yet, so these figures are illustrative.
      </p>
      <div className="grid gap-4 md:grid-cols-3">
        {usageMeters.map((meter) => <MeterCard key={meter.key} meter={meter} />)}
      </div>
      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">AI credits per day</h2>
        <p className="mt-1 text-[11px] text-muted-foreground">Last 7 days</p>
        <div className="mt-4 h-56" role="img" aria-label="Bar chart of AI credits used per day over the last 7 days">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dailyUsage} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <Tooltip cursor={{ fill: "var(--surface-raised)" }} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="credits" name="Credits" fill="var(--sage)" radius={[3, 3, 0, 0]} maxBarSize={32} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
      <section className="rounded-xl border bg-surface/50 p-5">
        <h2 className="text-base font-semibold tracking-tight">By model</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[360px] text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr><th className="pb-2 font-medium">Model</th><th className="pb-2 text-right font-medium">Requests</th><th className="pb-2 text-right font-medium">Credits</th></tr>
            </thead>
            <tbody className="divide-y">
              {usageByModel.map((row) => (
                <tr key={row.name}><td className="py-2.5">{row.name}</td><td className="py-2.5 text-right text-muted-foreground">{row.requests}</td><td className="py-2.5 text-right">{row.credits.toLocaleString("en-US")}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
