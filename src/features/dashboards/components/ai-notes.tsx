"use client";

import { Sparkles } from "lucide-react";

export function AiNotes({ notes, title }: { notes: string[]; title: string }) {
  if (!notes.length) return null;
  return (
    <div role="status" className="mt-3 rounded-lg border border-sage/30 bg-sage/5 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium"><Sparkles className="size-3.5 text-sage" />{title}</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-muted-foreground">{notes.map((note, index) => <li key={index}>{note}</li>)}</ul>
    </div>
  );
}
