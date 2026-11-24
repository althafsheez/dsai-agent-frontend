"use client";

import { useRef, useState } from "react";
import { ArrowRight, Clock, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { WorkflowStepKind } from "@/lib/api";
import { cn } from "@/lib/utils";
import { StepIcon } from "./flow-parts";

export const stepLabels: Record<WorkflowStepKind | "trigger", string> = {
  trigger: "Trigger", ai: "AI step", script: "Custom step", data: "Extension", condition: "Logic", notify: "Output", human: "Human Review",
};

const options = [
  { kind: "ai", detail: "Execute a task with AI.", keywords: "Gemini model instructions" },
  { kind: "script", detail: "Create new functionality with AI.", keywords: "python calculation code analysis" },
  { kind: "trigger", detail: "Choose how this workflow starts.", keywords: "manual schedule webhook daily hourly weekly monthly" },
  { kind: "data", detail: "Select a database or app connection.", keywords: "connector database app data source postgresql" },
  { kind: "condition", detail: "Continue when a condition is met.", keywords: "condition comparison filter" },
  { kind: "human", detail: "Request a decision before continuing.", keywords: "human approval wait approve reject response" },
  { kind: "notify", detail: "Deliver an in-app result.", keywords: "notification result" },
] as const;

export function WorkflowStepPicker({ hasTrigger, onClose, onPick }: {
  hasTrigger: boolean;
  onClose: () => void;
  onPick: (kind: WorkflowStepKind | "trigger") => void;
}) {
  const [search, setSearch] = useState("");
  const origin = useRef<HTMLElement | null>(null);
  const opensTriggerPanel = useRef(false);
  const shown = options.filter(({ kind, detail, keywords }) =>
    `${stepLabels[kind]} ${detail} ${keywords}`.toLowerCase().includes(search.trim().toLowerCase()));

  function option({ kind, detail }: (typeof options)[number], featured = false) {
    return (
      <button key={kind} type="button" onClick={() => {
        opensTriggerPanel.current = kind === "trigger";
        onPick(kind);
      }}
        className={cn("flex min-w-0 items-start gap-3 rounded-md p-3 text-left hover:bg-raised focus-visible:bg-raised",
          featured && "border bg-background")}>
        <span className={cn("mt-0.5 shrink-0 text-slate", featured && "grid size-8 place-items-center rounded-md bg-raised")}>
          {kind === "trigger" ? <Clock className="size-4" /> : <StepIcon kind={kind} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{stepLabels[kind]}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">{kind === "trigger" && hasTrigger ? "Change the current trigger." : detail}</span>
          {kind === "human" && <span className="mt-1 block text-[11px] text-muted-foreground">Draft only</span>}
        </span>
        {!featured && <ArrowRight className="mt-0.5 size-4 shrink-0 text-muted-foreground" />}
      </button>
    );
  }

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto" onOpenAutoFocus={(event) => {
        origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        event.preventDefault();
        document.getElementById("workflow-step-search")?.focus();
      }} onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (!opensTriggerPanel.current) origin.current?.focus();
      }}>
        <DialogTitle className="text-base font-semibold">Add step</DialogTitle>
        <DialogDescription className="sr-only">Choose a step type to add to your workflow.</DialogDescription>
        <label className="relative my-4 block">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" />
          <input id="workflow-step-search" aria-label="Search step types" type="search" placeholder="Search steps and actions…" value={search}
            onChange={(event) => setSearch(event.target.value)} className="h-9 w-full rounded-md border bg-background pl-9 pr-2 text-sm" />
        </label>
        <div className="grid grid-cols-2 gap-2">{shown.filter(({ kind }) => kind === "ai" || kind === "script").map((item) => option(item, true))}</div>
        <div className="mt-2 grid">{shown.filter(({ kind }) => kind !== "ai" && kind !== "script").map((item) => option(item))}</div>
        {!shown.length && <p role="status" className="py-4 text-sm text-muted-foreground">No matching steps.</p>}
      </DialogContent>
    </Dialog>
  );
}
