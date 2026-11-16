import { AlertTriangle, RotateCcw, Sparkles } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import type { AssistantMessage as AssistantMessageType, MessageBlock } from "../types";
import { AgentTrace } from "./agent-trace";
import { ChartBlock } from "./chart-block";
import { CodeBlock } from "./code-block";
import { FileBlock } from "./file-block";
import { TableBlock } from "./table-block";

function InlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return <>{parts.map((part, index) => part.startsWith("**") && part.endsWith("**") ? <strong key={index} className="font-semibold text-foreground">{part.slice(2, -2)}</strong> : part.startsWith("`") && part.endsWith("`") ? <code key={index} className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.9em]">{part.slice(1, -1)}</code> : part)}</>;
}

function MarkdownText({ content }: { content: string }) {
  return <div className="space-y-3 text-[13px] leading-6 text-foreground/90">{content.split("\n\n").filter(Boolean).map((paragraph, index) => {
    if (paragraph.startsWith("## ")) return <h2 key={index} className="pt-1 text-base font-medium tracking-tight text-foreground"><InlineText text={paragraph.slice(3)} /></h2>;
    if (paragraph.startsWith("- ")) return <ul key={index} className="list-disc space-y-1 pl-5">{paragraph.split("\n").map((item) => <li key={item}><InlineText text={item.replace(/^- /, "")} /></li>)}</ul>;
    return <p key={index}><InlineText text={paragraph} /></p>;
  })}</div>;
}

function Markdown({ content }: { content: string }) {
  const parts: Array<{ type: "text"; content: string } | { type: "code"; code: string; language: string; filename?: string }> = [];
  const fence = /```([^\n`]*)\n([\s\S]*?)(```|$)/g;
  let offset = 0;
  for (const match of content.matchAll(fence)) {
    const index = match.index ?? 0;
    if (index > offset) parts.push({ type: "text", content: content.slice(offset, index) });
    const header = match[1].trim().split(/\s+/).filter(Boolean);
    parts.push({ type: "code", language: header[0] ?? "text", filename: header[1], code: match[2].replace(/\n$/, "") });
    offset = index + match[0].length;
  }
  if (offset < content.length) parts.push({ type: "text", content: content.slice(offset) });
  if (!parts.length) return <MarkdownText content={content} />;
  return <div>{parts.map((part, index) => part.type === "code"
    ? <CodeBlock key={`code-${index}`} {...part} />
    : <MarkdownText key={`text-${index}`} content={part.content} />)}</div>;
}

function MessageRenderer({ block, onFileSelect, onFileDownload }: { block: MessageBlock; onFileSelect?: (id: string) => void; onFileDownload?: (id: string) => void }) {
  switch (block.type) {
    case "markdown": return <Markdown content={block.content} />;
    case "code": return <CodeBlock {...block} />;
    case "table": return <TableBlock {...block} />;
    case "chart": return <ChartBlock {...block} />;
    case "image": return <figure className="my-4 overflow-hidden rounded-lg border bg-surface"><Image src={block.src} alt={block.alt} width={1200} height={800} unoptimized className="max-h-[480px] w-full object-contain" />{block.caption && <figcaption className="border-t px-3 py-2 text-[11px] text-muted-foreground">{block.caption}</figcaption>}</figure>;
    case "file": return <FileBlock {...block} onPreview={onFileSelect} onDownload={onFileDownload} />;
  }
}

export function AssistantMessage({ message, onRetry, onFileSelect, onFileDownload }: { message: AssistantMessageType; onRetry?: (message: AssistantMessageType) => void; onFileSelect?: (id: string) => void; onFileDownload?: (id: string) => void }) {
  return <div className="flex gap-3">
    <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-md border bg-surface text-sage"><Sparkles className="size-3.5" /></div>
    <div className="min-w-0 max-w-3xl flex-1">
      {message.trace?.length ? <AgentTrace steps={message.trace} onResourceSelect={onFileSelect} /> : null}
      <div aria-live={message.status === "running" ? "polite" : undefined}>{message.blocks.map((block, index) => <MessageRenderer key={`${message.id}-${index}`} block={block} onFileSelect={onFileSelect} onFileDownload={onFileDownload} />)}</div>
      {message.status === "running" && <span className="mt-2 inline-block h-4 w-1 animate-pulse rounded bg-sage" aria-label="Response streaming" />}
      {(message.status === "failed" || message.status === "interrupted") && <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-400/5 p-3"><AlertTriangle className="mt-0.5 size-4 text-red-400" /><div className="flex-1"><p className="text-xs font-medium">{message.status === "failed" ? "The Gemini response failed" : "The Gemini response was interrupted"}</p><p className="mt-1 text-[11px] text-muted-foreground">Any completed output remains saved in this conversation.</p></div>{onRetry && <Button variant="outline" size="sm" onClick={() => onRetry(message)}><RotateCcw />Retry</Button>}</div>}
      <time dateTime={message.createdAt} className="mt-3 block text-[10px] text-muted-foreground">{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
    </div>
  </div>;
}
