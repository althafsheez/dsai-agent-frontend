import { ChartNoAxesCombined } from "lucide-react";
export function Brand() {
  return <div className="flex items-center gap-2.5">
    <div className="grid size-7 shrink-0 place-items-center rounded-md border border-border-strong bg-raised">
      <ChartNoAxesCombined className="size-4 text-foreground" strokeWidth={1.7} aria-hidden="true" />
    </div>
    <span className="text-sm font-semibold tracking-[0.08em]">DSAI</span>
  </div>;
}

