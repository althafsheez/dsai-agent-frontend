"use client";

import { useState } from "react";
import { BarChart3, Expand, X } from "lucide-react";
import { Bar, CartesianGrid, Legend, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MessageBlock } from "../types";

type ChartData = Extract<MessageBlock, { type: "chart" }>;

function Chart({ data, xKey, series }: Pick<ChartData, "data" | "xKey" | "series">) {
  return <ResponsiveContainer width="100%" height="100%"><ComposedChart data={data} margin={{ top: 12, right: 12, bottom: 0, left: -14 }}>
    <CartesianGrid stroke="var(--border)" vertical={false} />
    <XAxis dataKey={xKey} axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
    <YAxis axisLine={false} tickLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
    <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border-strong)", borderRadius: 8, fontSize: 12 }} />
    <Legend wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }} />
    {series.map((item, index) => index === 0 ? <Bar key={item.key} dataKey={item.key} name={item.label} fill={item.color} radius={[3, 3, 0, 0]} maxBarSize={28} /> : <Line key={item.key} dataKey={item.key} name={item.label} stroke={item.color} strokeWidth={2} dot={false} />)}
  </ComposedChart></ResponsiveContainer>;
}

export function ChartBlock({ title, description, data, xKey, series }: Omit<ChartData, "type">) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <figure className="my-4 rounded-lg border bg-surface p-4">
      <figcaption className="mb-4 flex items-start gap-3"><span className="grid size-8 place-items-center rounded-md bg-raised text-sage"><BarChart3 className="size-4" /></span><span><span className="block text-xs font-medium">{title}</span><span className="mt-1 block text-[11px] text-muted-foreground">{description}</span></span><button onClick={() => setExpanded(true)} className="ml-auto rounded p-2 text-muted-foreground hover:bg-raised hover:text-foreground" aria-label={`Expand ${title}`}><Expand className="size-4" /></button></figcaption>
      <div className="h-64" role="img" aria-label={`${title}. ${description}`}><Chart data={data} xKey={xKey} series={series} /></div>
    </figure>
    {expanded && <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-[80] flex flex-col bg-background/95 p-5 backdrop-blur-sm sm:p-10">
      <div className="mx-auto flex w-full max-w-6xl items-start"><div><h2 className="text-base font-medium">{title}</h2><p className="mt-1 text-xs text-muted-foreground">{description}</p></div><button autoFocus onClick={() => setExpanded(false)} className="ml-auto rounded p-2 text-muted-foreground hover:bg-raised hover:text-foreground" aria-label="Close expanded chart"><X /></button></div>
      <div className="mx-auto mt-8 h-[70vh] w-full max-w-6xl rounded-xl border bg-surface p-5"><Chart data={data} xKey={xKey} series={series} /></div>
    </div>}
  </>;
}
