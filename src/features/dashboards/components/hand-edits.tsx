"use client";

import { LoaderCircle, PencilLine, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  changes: string[];
  busy: boolean;
  disabled?: boolean;
  error?: string | null;
  onHandOver: () => void;
}

/** Edits made directly on the cards are not final until the AI has looked at them; this lists them and hands them over. */
export function HandEdits({ changes, busy, disabled, error, onHandOver }: Props) {
  if (!changes.length) return null;
  return (
    <div role="status" aria-label="Your edits" className="mb-3 rounded-lg border border-sky-400/30 bg-sky-400/5 p-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-1.5 font-medium"><PencilLine className="size-3.5 text-sky-300" />You made {changes.length} edit{changes.length === 1 ? "" : "s"} by hand</p>
        <Button type="button" size="sm" onClick={onHandOver} disabled={busy || disabled}>{busy ? <LoaderCircle className="animate-spin" /> : <Wand2 />}{busy ? "AI is checking…" : "Let the AI check my edits"}</Button>
      </div>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">{changes.slice(0, 6).map((change) => <li key={change}>{change}</li>)}{changes.length > 6 ? <li>and {changes.length - 6} more</li> : null}</ul>
      {error ? <p role="alert" className="mt-1.5 text-red-300">{error}</p> : null}
    </div>
  );
}
