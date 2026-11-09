"use client";

import { useRef, useState } from "react";
import { ArrowUp, ChartNoAxesCombined, ChevronDown, FileText, Folder, Mic, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";

const suggestions = [
  { icon: ChartNoAxesCombined, label: "Explore trends", prompt: "Help me explore trends in my data." },
  { icon: Search, label: "Find what changed", prompt: "What changed in my data, and what might explain it?" },
  { icon: FileText, label: "Create a report", prompt: "Create a concise report with the key findings from my data." },
];

export function WelcomeComposer() {
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  return <div className="w-full">
    <div className="overflow-hidden rounded-xl border border-border-strong bg-surface focus-within:border-ring">
      <label htmlFor="analysis-question" className="sr-only">Analysis question</label>
      <textarea ref={inputRef} id="analysis-question" value={draft} onChange={(event) => setDraft(event.target.value)} rows={3}
        placeholder="Ask anything about your data…"
        className="block min-h-28 w-full resize-y bg-transparent px-5 py-5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
        aria-describedby="composer-status" />
      <div className="flex flex-wrap items-center gap-1 px-3 pb-3">
        <Button variant="ghost" size="icon" disabled aria-label="Add files (available in the next phase)"><Plus /></Button>
        <Button variant="ghost" size="icon" disabled aria-label="Select workspace (available in the next phase)"><Folder /></Button>
        <span className="mx-1 h-4 w-px bg-border" />
        <Button variant="ghost" size="sm" disabled aria-label="Model selection requires backend connection">Model<ChevronDown className="!size-3" /></Button>
        <Button variant="ghost" size="sm" disabled aria-label="Reasoning effort requires model metadata">Effort<ChevronDown className="!size-3" /></Button>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" disabled aria-label="Voice input unavailable"><Mic /></Button>
          <Button size="icon" disabled aria-label="Send analysis (agent not connected)"><ArrowUp /></Button>
        </div>
      </div>
    </div>
    <p id="composer-status" className="mt-3 text-center text-[11px] leading-relaxed text-muted-foreground">Preview your question. File uploads and agent execution will be connected in the next phases.</p>
    <div className="mt-7 flex flex-wrap justify-center gap-2">
      {suggestions.map(({ icon: Icon, label, prompt }) => <button key={label} onClick={() => { setDraft(prompt); inputRef.current?.focus(); }}
        className="flex items-center gap-2 rounded-md border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-border-strong hover:bg-surface hover:text-foreground">
        <Icon className="size-3.5" strokeWidth={1.5} />{label}
      </button>)}
    </div>
  </div>;
}

