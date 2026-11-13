"use client";

import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { getResourcePreview } from "@/lib/api";
import type { ArtifactResource } from "./types";
import { SyntaxHighlightedCode } from "@/features/chat/components/syntax-highlighted-code";

function languageFor(name: string) {
  return name.split(".").pop()?.toLowerCase() || "text";
}

export function TextPreview({ artifact }: { artifact: ArtifactResource }) {
  const [text, setText] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let active = true;
    if (!artifact.preview_url) {
      setError("Preview is unavailable for this file.");
      return;
    }
    void getResourcePreview(artifact.preview_url)
      .then((blob) => blob.text())
      .then((content) => { if (active) setText(content); })
      .catch(() => { if (active) setError("This file could not be previewed."); });
    return () => { active = false; };
  }, [artifact.preview_url]);

  if (error) return <div className="grid min-h-52 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">{error}</div>;
  if (text === undefined) return <div className="grid min-h-52 place-items-center text-xs text-muted-foreground"><span className="inline-flex items-center gap-2"><LoaderCircle className="size-4 animate-spin" />Loading preview…</span></div>;
  return <pre className="max-h-full overflow-auto rounded-lg border bg-[#0d0f11] p-4 text-[12px] leading-6"><SyntaxHighlightedCode code={text} language={languageFor(artifact.name)} /></pre>;
}
