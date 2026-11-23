"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { describeSchedule } from "../logic/steps";
import { TEMPLATES } from "../logic/templates";
import { StepIcon } from "./flow-parts";

/** Predefined workflows. "Use" opens the builder with the steps filled in; nothing is created or run until you save. */
export function TemplateGallery() {
  return (
    <ul aria-label="Workflow templates" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {TEMPLATES.map((template) => (
        <li key={template.id} className="flex flex-col rounded-xl border bg-surface/40 p-4">
          <p className="text-sm font-medium">{template.name}</p>
          <p className="mt-1 flex-1 text-xs text-muted-foreground">{template.description}</p>
          <p className="mt-3 flex items-center gap-1.5 text-muted-foreground" aria-label="Steps">{template.flow.map((item, index) => <span key={index} title={item.title} className="grid size-6 place-items-center rounded-md border bg-raised"><StepIcon kind={item.kind} className="size-3" /></span>)}</p>
          <div className="mt-3 flex items-center justify-between gap-2"><span className="text-[11px] text-muted-foreground">{describeSchedule(template.trigger)}</span>
            <Link href={`/workflows/new?template=${template.id}`} aria-label={`Use the ${template.name} template`} className="inline-flex items-center gap-1 text-xs font-medium text-sky-300 hover:underline">Use<ArrowRight className="size-3.5" /></Link></div>
        </li>
      ))}
    </ul>
  );
}
