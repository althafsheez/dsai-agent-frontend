"use client";

import { useState } from "react";
import { Check, Copy, Download } from "lucide-react";
import { SyntaxHighlightedCode } from "./syntax-highlighted-code";

export function CodeBlock({ code, language, filename }: { code: string; language: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard?.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const extensions: Record<string, string> = { javascript: "js", typescript: "ts", python: "py", shell: "sh", bash: "sh", sql: "sql", json: "json", html: "html", css: "css" };
    const extension = extensions[language.toLowerCase()] ?? (language.toLowerCase().replace(/[^a-z0-9]/g, "") || "txt");
    const url = URL.createObjectURL(new Blob([code], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename ?? `code.${extension}`;
    link.click();
    URL.revokeObjectURL(url);
  };
  return <figure className="my-4 overflow-hidden rounded-lg border bg-background">
    <figcaption className="flex h-9 items-center border-b bg-surface px-3 text-[11px] text-muted-foreground">
      <span className="font-mono uppercase tracking-wide">{language}</span>
      {filename && <span className="ml-2 truncate border-l pl-2 normal-case">{filename}</span>}
      <button onClick={download} className="ml-auto inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-raised hover:text-foreground" aria-label="Download code"><Download className="size-3" />Download</button>
      <button onClick={copy} className="inline-flex items-center gap-1.5 rounded px-2 py-1 hover:bg-raised hover:text-foreground" aria-label="Copy code">{copied ? <Check className="size-3" /> : <Copy className="size-3" />}{copied ? "Copied" : "Copy"}</button>
    </figcaption>
    <pre className="overflow-x-auto p-4 text-[12px] leading-6"><SyntaxHighlightedCode code={code} language={language} /></pre>
  </figure>;
}
