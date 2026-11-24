"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { downloadResource } from "@/lib/api";
import { pretty } from "../logic/format";
import { isWorkflowQueryTable, WorkflowQueryPreview } from "./workflow-query-preview";

function isFile(value: unknown): value is { id: string; name: string } {
  if (!value || typeof value !== "object") return false;
  const file = value as Record<string, unknown>;
  return typeof file.id === "string" && typeof file.name === "string";
}

export function WorkflowOutput({ value, empty = "No output" }: { value: unknown; empty?: string }) {
  const [error, setError] = useState("");
  if (isWorkflowQueryTable(value)) return <WorkflowQueryPreview table={value} />;
  const record = value && typeof value === "object" ? value as Record<string, unknown> : null;
  const files = Array.isArray(record?.resources) ? record.resources.filter(isFile) : [];
  const text = typeof record?.text === "string" ? record.text : typeof record?.message === "string" ? record.message : "";
  if (!files.length && !text) {
    return <pre className="whitespace-pre-wrap break-words text-muted-foreground">{pretty(value) || empty}</pre>;
  }
  return (
    <div className="min-w-0 space-y-2">
      {text && <p className="whitespace-pre-wrap break-words leading-relaxed">{text}</p>}
      {files.length > 0 && <ul className="space-y-1">
        {files.map((file) => <li key={file.id}>
          <Button type="button" size="sm" variant="outline" className="max-w-full justify-start" aria-label={`Download ${file.name}`}
            onClick={() => {
              setError("");
              void downloadResource(`/api/resources/${encodeURIComponent(file.id)}/download`, file.name)
                .catch(() => setError(`Could not download ${file.name}.`));
            }}><Download /><span className="truncate">{file.name}</span></Button>
        </li>)}
      </ul>}
      {error && <p role="alert" className="text-destructive">{error}</p>}
    </div>
  );
}
