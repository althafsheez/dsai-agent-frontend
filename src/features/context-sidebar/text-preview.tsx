"use client";

import { useEffect, useState } from "react";
import { Check, Copy, LoaderCircle } from "lucide-react";
import { getResourcePreviewText } from "@/lib/api";
import type { ArtifactResource } from "./types";
import { SyntaxHighlightedCode } from "@/features/chat/components/syntax-highlighted-code";

function languageFor(name: string) {
  return name.split(".").pop()?.toLowerCase() || "text";
}

export function TextPreview({ artifact }: { artifact: ArtifactResource }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    if (!artifact.preview_url) {
      setError("Preview is unavailable for this file.");
      return;
    }
    void getResourcePreviewText(artifact.preview_url)
      .then((content) => { if (active) setText(content); })
      .catch(() => { if (active) setError("This file could not be previewed."); });
    return () => { active = false; };
  }, [artifact.preview_url]);

  const copyCode = async () => {
    if (!text || !navigator.clipboard?.writeText) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  if (error) return <div className="grid min-h-52 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">{error}</div>;
  if (text === undefined) return <div className="grid min-h-52 place-items-center text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading preview…</span></div>;
  const isCode = artifact.kind === "code";
  return <div className="flex h-full min-h-0 flex-col gap-2">
    {isCode ? <div className="flex shrink-0 justify-end"><button type="button" onClick={() => void copyCode()} aria-label="Copy code" className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-surface px-3 text-xs text-muted-foreground hover:border-border-strong hover:text-foreground">{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? "Copied" : "Copy"}</button></div> : null}
    <pre className="min-h-0 flex-1 overflow-auto rounded-lg border bg-[#0d0f11] p-4 text-[12px] leading-6"><SyntaxHighlightedCode code={text} language={languageFor(artifact.name)} /></pre>
  </div>;
}
