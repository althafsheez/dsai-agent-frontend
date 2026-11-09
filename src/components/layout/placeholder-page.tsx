import Link from "next/link";
import { ArrowLeft, Layers } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PlaceholderPage({ title, description, next }: { title: string; description: string; next: string }) {
  return <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col px-6 py-10 sm:px-10">
    <h1 className="text-2xl font-medium tracking-tight">{title}</h1>
    <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{description}</p>
    <div className="flex flex-1 flex-col items-center justify-center py-20 text-center">
      <div className="mb-5 grid size-11 place-items-center rounded-lg border bg-surface"><Layers className="size-5 text-muted-foreground" strokeWidth={1.5} /></div>
      <h2 className="text-sm font-medium">A place for what comes next</h2>
      <p className="mt-2 max-w-sm text-xs leading-relaxed text-muted-foreground">{next}</p>
      <span className="mt-4 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">Planned · Not connected yet</span>
      <Button asChild variant="outline" className="mt-7"><Link href="/"><ArrowLeft />Back to New Analysis</Link></Button>
    </div>
  </section>;
}

