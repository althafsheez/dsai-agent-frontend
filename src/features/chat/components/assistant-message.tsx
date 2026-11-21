import React, { useMemo } from "react";
import { AlertTriangle, RotateCcw, Sparkles } from "lucide-react";
import Image from "next/image";
import type { AgentRunDto } from "@/lib/api";
import type { ContextFile } from "@/features/context-sidebar";
import { Button } from "@/components/ui/button";
import type { AssistantMessage as AssistantMessageType, MessageBlock } from "../types";
import { AgentTrace } from "./agent-trace";
import { ChartBlock } from "./chart-block";
import { CodeBlock } from "./code-block";
import { FileBlock } from "./file-block";
import { TableBlock } from "./table-block";
import { parseMarkdownTable } from "../markdown-table";
import { renderRichText, type DataReferenceResource } from "./data-reference";

function StreamingCursor() {
  return (
    <span
      data-testid="streaming-cursor"
      className="inline-block h-3.5 w-1.5 ml-1 rounded-sm bg-sage align-middle animate-pulse"
      aria-label="Response streaming"
    />
  );
}

function MarkdownText({
  content,
  isStreaming,
  isLast,
  availableResources,
  onFileSelect,
}: {
  content: string;
  isStreaming?: boolean;
  isLast?: boolean;
  availableResources?: DataReferenceResource[];
  onFileSelect?: (id: string) => void;
}) {
  const paragraphs = content.split("\n\n").filter(Boolean);

  if (!paragraphs.length) {
    if (isStreaming && isLast) {
      return <StreamingCursor />;
    }
    return null;
  }

  return (
    <div className="space-y-3 text-[13px] leading-6 text-foreground/90">
      {paragraphs.map((paragraph, index) => {
        const isLastParagraph = isLast && index === paragraphs.length - 1;
        const cursor = isStreaming && isLastParagraph ? <StreamingCursor /> : null;

        const table = parseMarkdownTable(paragraph);
        if (table) return <TableBlock key={index} columns={table.columns} rows={table.rows} />;
        if (paragraph.startsWith("## ")) {
          return (
            <h2 key={index} className="pt-1 text-base font-medium tracking-tight text-foreground">
              {renderRichText(paragraph.slice(3), availableResources, onFileSelect)}
              {cursor}
            </h2>
          );
        }
        if (paragraph.startsWith("- ")) {
          const items = paragraph.split("\n");
          return (
            <ul key={index} className="list-disc space-y-1 pl-5">
              {items.map((item, itemIdx) => (
                <li key={itemIdx}>
                  {renderRichText(item.replace(/^- /, ""), availableResources, onFileSelect)}
                  {isLastParagraph && itemIdx === items.length - 1 ? cursor : null}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index}>
            {renderRichText(paragraph, availableResources, onFileSelect)}
            {cursor}
          </p>
        );
      })}
    </div>
  );
}

function Markdown({
  content,
  isStreaming,
  availableResources,
  onFileSelect,
}: {
  content: string;
  isStreaming?: boolean;
  availableResources?: DataReferenceResource[];
  onFileSelect?: (id: string) => void;
}) {
  const parts: Array<{
    type: "text";
    content: string;
  } | {
    type: "code";
    code: string;
    language: string;
    filename?: string;
    isUnclosed?: boolean;
  }> = [];

  const fence = /```([^\n`]*)\n([\s\S]*?)(```|$)/g;
  let offset = 0;
  for (const match of content.matchAll(fence)) {
    const index = match.index ?? 0;
    if (index > offset) {
      parts.push({ type: "text", content: content.slice(offset, index) });
    }
    const header = match[1].trim().split(/\s+/).filter(Boolean);
    const isUnclosed = !match[3];
    parts.push({
      type: "code",
      language: header[0] ?? "text",
      filename: header[1],
      code: match[2].replace(/\n$/, ""),
      isUnclosed,
    });
    offset = index + match[0].length;
  }
  if (offset < content.length) {
    parts.push({ type: "text", content: content.slice(offset) });
  }

  if (!parts.length) {
    if (isStreaming) return <StreamingCursor />;
    return (
      <MarkdownText
        content={content}
        availableResources={availableResources}
        onFileSelect={onFileSelect}
      />
    );
  }

  return (
    <div className="space-y-3">
      {parts.map((part, index) => {
        const isLastPart = index === parts.length - 1;
        if (part.type === "code") {
          return (
            <div key={`code-${index}`} className="relative">
              <CodeBlock {...part} />
              {isStreaming && isLastPart && part.isUnclosed && (
                <div className="absolute bottom-2.5 right-3 flex items-center gap-1.5 rounded bg-surface/90 px-2 py-0.5 text-[10px] text-sage border border-border">
                  <span className="size-1.5 rounded-full bg-sage animate-ping" />
                  Streaming code
                </div>
              )}
            </div>
          );
        }
        return (
          <MarkdownText
            key={`text-${index}`}
            content={part.content}
            isStreaming={isStreaming}
            isLast={isLastPart}
            availableResources={availableResources}
            onFileSelect={onFileSelect}
          />
        );
      })}
    </div>
  );
}

function MessageRenderer({
  block,
  resources,
  onLibraryToggle,
  isStreaming,
  availableResources,
  onFileSelect,
  onFileDownload,
}: {
  block: MessageBlock;
  resources?: Map<string, ContextFile>;
  onLibraryToggle?: (file: ContextFile) => Promise<void>;
  isStreaming?: boolean;
  availableResources?: DataReferenceResource[];
  onFileSelect?: (id: string) => void;
  onFileDownload?: (id: string) => void;
}) {
  switch (block.type) {
    case "markdown":
      return (
        <Markdown
          content={block.content}
          isStreaming={isStreaming}
          availableResources={availableResources}
          onFileSelect={onFileSelect}
        />
      );
    case "code":
      return <CodeBlock {...block} />;
    case "table":
      return <TableBlock {...block} />;
    case "chart":
      return <ChartBlock {...block} />;
    case "image":
      return (
        <figure className="my-4 overflow-hidden rounded-lg border bg-surface">
          <Image
            src={block.src}
            alt={block.alt}
            width={1200}
            height={800}
            unoptimized
            className="max-h-[480px] w-full object-contain"
          />
          {block.caption && (
            <figcaption className="border-t px-3 py-2 text-[11px] text-muted-foreground">
              {block.caption}
            </figcaption>
          )}
        </figure>
      );
    case "file":
      return <FileBlock {...block} file={resources?.get(block.id)} onLibraryToggle={onLibraryToggle} onPreview={onFileSelect} onDownload={onFileDownload} />;
  }
}

export function AssistantMessage({
  message,
  resources,
  onLibraryToggle,
  run,
  availableResources,
  onRetry,
  onFileSelect,
  onFileDownload,
}: {
  message: AssistantMessageType;
  resources?: Map<string, ContextFile>;
  onLibraryToggle?: (file: ContextFile) => Promise<void>;
  run?: AgentRunDto;
  availableResources?: DataReferenceResource[];
  onRetry?: (message: AssistantMessageType) => void;
  onFileSelect?: (id: string) => void;
  onFileDownload?: (id: string) => void;
}) {
  const isRunning = message.status === "running";
  const hasText = message.blocks.some(
    (b) => (b.type === "markdown" && b.content.trim().length > 0) || b.type !== "markdown"
  );
  const isRecoverable = message.errorType !== "unrecoverable";

  const resolvedResources = useMemo(() => {
    const map = new Map<string, DataReferenceResource>();
    (availableResources ?? []).forEach((r) => map.set(r.id, r));
    (message.trace ?? []).forEach((step) => {
      (step.inputs ?? []).forEach((r) =>
        map.set(r.id, { id: r.id, name: r.name, resourceType: r.resourceType })
      );
      (step.outputs ?? []).forEach((r) =>
        map.set(r.id, { id: r.id, name: r.name, resourceType: r.resourceType })
      );
    });
    message.blocks.forEach((b) => {
      if (b.type === "file") {
        map.set(b.id, { id: b.id, name: b.name, kind: b.kind });
      }
    });
    return Array.from(map.values());
  }, [availableResources, message.trace, message.blocks]);

  return (
    <div className="flex gap-3">
      <div className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg border border-border-strong bg-surface text-sage shadow-sm">
        <Sparkles className="size-3.5" />
      </div>
      <div className="min-w-0 max-w-3xl flex-1">
        {message.trace?.length ? (
          <AgentTrace steps={message.trace} run={run} isStreaming={isRunning} onResourceSelect={onFileSelect} />
        ) : null}

        <div aria-live={isRunning ? "polite" : undefined} className="space-y-3">
          {message.blocks.map((block, index) => {
            const isLastBlock = index === message.blocks.length - 1;
            return (
              <MessageRenderer
                key={`${message.id}-${index}`}
                block={block}
                resources={resources}
                onLibraryToggle={onLibraryToggle}
                isStreaming={isRunning && isLastBlock}
                availableResources={resolvedResources}
                onFileSelect={onFileSelect}
                onFileDownload={onFileDownload}
              />
            );
          })}
        </div>

        {isRunning && !hasText && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground animate-pulse" role="status" aria-label="Thinking">
            <span className="size-2 rounded-full bg-sage" />
            <span>Thinking…</span>
          </div>
        )}

        {(message.status === "failed" || message.status === "interrupted") && (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-400/5 p-3.5">
            <AlertTriangle className="mt-0.5 size-4 text-red-400 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold text-foreground">
                  {message.status === "failed"
                    ? isRecoverable
                      ? "The Gemini response failed"
                      : "Unrecoverable response error"
                    : "The Gemini response was interrupted"}
                </p>
                <span
                  className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    isRecoverable
                      ? "bg-amber-400/10 text-amber-300 border border-amber-400/20"
                      : "bg-red-400/10 text-red-300 border border-red-400/20"
                  }`}
                >
                  {isRecoverable ? "Recoverable failure" : "Unrecoverable failure"}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {message.error
                  ? message.error
                  : message.status === "failed"
                    ? "A temporary error halted response generation. Any completed output remains saved."
                    : "The run was stopped or interrupted. Any partial output remains saved in this conversation."}
              </p>
              {!isRecoverable && (
                <p className="mt-1 text-[10px] text-red-300/80">
                  This failure cannot be resolved by retrying with the same parameters. Please adjust your prompt or configuration.
                </p>
              )}
            </div>
            {onRetry && isRecoverable && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRetry(message)}
                className="h-7 text-xs border-red-400/30 text-red-200 hover:bg-red-400/10 gap-1.5"
              >
                <RotateCcw className="size-3" />
                Retry
              </Button>
            )}
          </div>
        )}

        <time dateTime={message.createdAt} className="mt-3 block text-[10px] text-muted-foreground">
          {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </time>
      </div>
    </div>
  );
}
