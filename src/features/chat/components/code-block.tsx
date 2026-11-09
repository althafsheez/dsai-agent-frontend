"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function CodeBlock({ code, language, filename }: { code: string; language: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return <figure className="my-4 overflow-hidden rounded-lg border bg-background">
    <figcaption className="flex h-9 items-center border-b bg-surface px-3 text-[11px] text-muted-foreground">
      <span className="font-mono uppercase tracking-wide">{language}</span>
      {filename && <span className="ml-2 truncate border-l pl-2 normal-case">{filename}</span>}
      <button onClick={copy} className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-raised hover:text-foreground" aria-label="Copy code">{copied ? <Check className="size-3" /> : <Copy className="size-3" />}{copied ? "Copied" : "Copy"}</button>
    </figcaption>
    <pre className="overflow-x-auto p-4 text-[12px] leading-6 text-foreground"><code className="font-mono">{code}</code></pre>
  </figure>;
}
