import React, { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { diagnosticFields, diagnosticHeadline, type ExecutionDiagnostic } from "../execution-diagnostic";

export function ErrorDetails({ error }: { error: ExecutionDiagnostic }) {
  const [copyStatus, setCopyStatus] = useState("");
  const fields = diagnosticFields(error);

  async function copyDetails() {
    try {
      await navigator.clipboard.writeText([
        diagnosticHeadline(error),
        ...fields.map(([label, value]) => `${label}: ${value}`),
      ].join("\n"));
      setCopyStatus("Copied.");
    } catch {
      setCopyStatus("Could not copy. You can select and copy the details above.");
    }
  }

  return (
    <details className="mt-2 text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer font-medium text-foreground">Error Details</summary>
      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
        {fields.map(([label, value]) => (
          <React.Fragment key={label}>
            <dt>{label}</dt>
            <dd className="break-words text-foreground">{value}</dd>
          </React.Fragment>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={copyDetails} className="h-7 gap-1.5 text-xs">
          <Copy className="size-3" aria-hidden="true" />
          Copy Error Details
        </Button>
        <span role="status">{copyStatus}</span>
      </div>
    </details>
  );
}
