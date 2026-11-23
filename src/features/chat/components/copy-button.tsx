"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import type { MessageBlock } from "../types";

/** Plain text of an answer: prose, fenced code and tables; charts, images and files are skipped. */
export function blocksToText(blocks: MessageBlock[]): string {
  return blocks.map((block) => {
    if (block.type === "markdown") return block.content;
    if (block.type === "code") return `\`\`\`${block.language}\n${block.code}\n\`\`\``;
    if (block.type === "table") return [block.columns.join("\t"), ...block.rows.map((row) => row.join("\t"))].join("\n");
    return "";
  }).filter(Boolean).join("\n\n").trim();
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { return document.execCommand("copy"); } finally { area.remove(); }
  }
}

export function CopyButton({ getText, label, className = "" }: { getText: () => string; label: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  async function copy() {
    if (!(await writeClipboard(getText()))) return;
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1500);
  }
  return (
    <button type="button" onClick={() => void copy()} aria-label={label} className={`inline-flex items-center gap-1 hover:text-foreground ${className}`}>
      {copied ? <Check className="size-3 text-sage" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
