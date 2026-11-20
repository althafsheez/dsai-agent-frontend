"use client";

import { BarChart3, BookOpen, Check, Download, FileImage, FileText, FileType2 } from "lucide-react";
import { downloadResource } from "@/lib/api";
import { formatBytes } from "./resource-utils";
import type { ArtifactKind, ArtifactResource } from "./types";

interface ArtifactsPanelProps {
  artifacts: ArtifactResource[];
  onFileSelect: (artifact: ArtifactResource) => void;
  onLibraryToggle?: (artifact: ArtifactResource) => void;
  searchQuery?: string;
}

function ArtifactIcon({ kind }: { kind: ArtifactKind }) {
  const className = "size-3.5 text-slate";
  if (kind === "chart") return <BarChart3 className={className} strokeWidth={1.6} />;
  if (kind === "image") return <FileImage className={className} strokeWidth={1.6} />;
  if (kind === "pdf") return <FileType2 className={className} strokeWidth={1.6} />;
  return <FileText className={className} strokeWidth={1.6} />;
}

export function ArtifactsPanel({ artifacts, onFileSelect, onLibraryToggle, searchQuery }: ArtifactsPanelProps) {
  const groups = [
    { label: "Input", items: artifacts.filter((artifact) => (artifact.source ?? (artifact.origin === "generated" ? "output" : "input")) === "input") },
    { label: "Output", items: artifacts.filter((artifact) => (artifact.source ?? (artifact.origin === "generated" ? "output" : "input")) === "output") },
  ];

  return (
    <div id="artifacts-panel" role="tabpanel" aria-label="Artifacts" className="h-full min-h-0 overflow-y-auto overscroll-contain py-2">
      {artifacts.length === 0 ? (
        <p className="px-4 py-5 text-center text-xs text-muted-foreground">
          {searchQuery ? `No artifacts matching \u201C${searchQuery}\u201D` : "No artifacts in this context."}
        </p>
      ) : null}
      {groups.map((group) => {
        if (!group.items.length) return null;
        return (
          <section key={group.label} aria-labelledby={`artifact-group-${group.label.toLowerCase()}`} className="mb-3 last:mb-0">
            <h3 id={`artifact-group-${group.label.toLowerCase()}`} className="px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {group.label}
            </h3>
            <ul>
              {group.items.map((artifact) => {
                const saved = artifact.in_library ?? artifact.saved ?? false;
                return (
                  <li key={artifact.id} className="group flex items-center px-2 hover:bg-raised/70">
                    <button type="button" className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2 text-left" onClick={() => onFileSelect(artifact)}>
                      <span className="grid size-7 shrink-0 place-items-center rounded-md border bg-surface"><ArtifactIcon kind={artifact.kind} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-foreground">{artifact.name}</span>
                        <span className="mt-0.5 block text-[11px] text-muted-foreground">{formatBytes(artifact.size_bytes)} · {artifact.origin}</span>
                      </span>
                    </button>
                    <button type="button" onClick={() => onLibraryToggle?.(artifact)} aria-label={saved ? `Saved in Library: ${artifact.name}` : `Add ${artifact.name} to Library`} aria-pressed={saved} className="group/library relative grid size-8 shrink-0 place-items-center rounded-md border bg-surface text-muted-foreground hover:border-border-strong hover:text-foreground">
                      <BookOpen className="size-4" />
                      {saved ? <span className="absolute -bottom-0.5 -right-0.5 grid size-3.5 place-items-center rounded-full border border-sidebar bg-sage text-sidebar"><Check className="size-2.5 stroke-[3]" /></span> : null}
                      <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] text-foreground opacity-0 shadow-lg transition-opacity group-hover/library:opacity-100 after:absolute after:right-2.5 after:top-full after:border-x-4 after:border-t-4 after:border-x-transparent after:border-t-border-strong">{saved ? "Saved to Library" : "Add to Library"}</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Download ${artifact.name}`}
                      className="group/download relative grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-surface hover:text-foreground"
                      onClick={() => void downloadResource(artifact.download_url, artifact.name)}
                    >
                      <Download className="size-4" />
                      <span role="tooltip" className="pointer-events-none absolute bottom-full right-0 z-20 mb-2 w-max rounded-md border border-border-strong bg-surface px-2.5 py-1.5 text-[11px] text-foreground opacity-0 shadow-lg transition-opacity group-hover/download:opacity-100 after:absolute after:right-2.5 after:top-full after:border-x-4 after:border-t-4 after:border-x-transparent after:border-t-border-strong">Download</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
