"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Database, FileText, Image as ImageIcon, Table2 } from "lucide-react";
import type { ChatMessage, UserMessage } from "../types";
import { cn } from "@/lib/utils";

function conversationMarkers(messages: ChatMessage[]) {
  const markers: Array<{ question: UserMessage; answerPreview?: string }> = [];
  for (const message of messages) {
    if (message.role === "user") {
      markers.push({ question: message });
      continue;
    }
    const marker = markers.at(-1);
    if (!marker || marker.answerPreview || message.status !== "completed") continue;
    const answer = message.blocks.find((block) => block.type === "markdown");
    if (answer?.type === "markdown") marker.answerPreview = answer.content.replace(/[#*`]/g, "").trim();
  }
  return markers;
}

function edgeMask(hasAbove: boolean, hasBelow: boolean): string | undefined {
  if (hasAbove && hasBelow) return "linear-gradient(to bottom, transparent 0, black 30px, black calc(100% - 30px), transparent 100%)";
  if (hasAbove) return "linear-gradient(to bottom, transparent 0, black 30px, black 100%)";
  if (hasBelow) return "linear-gradient(to bottom, black 0, black calc(100% - 30px), transparent 100%)";
  return undefined;
}

export const ConversationNavigator = memo(function ConversationNavigator({ messages, activeId, onNavigate, mainScrollEdge = null }: { messages: ChatMessage[]; activeId?: string; onNavigate: (id: string) => void; mainScrollEdge?: "top" | "bottom" | null }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoveredId = useRef<string | null>(null);
  const markers = useMemo(() => conversationMarkers(messages), [messages]);
  const [fadedEdges, setFadedEdges] = useState({ above: false, below: false });
  const [preview, setPreview] = useState<{ id: string; top: number; loading: boolean } | null>(null);
  const hidePreview = useCallback(() => {
    hoveredId.current = null;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = null;
    setPreview(null);
  }, []);
  const showPreview = useCallback((id: string) => {
    if (hoveredId.current === id) return;
    const marker = markerRefs.current.get(id);
    const nav = viewportRef.current?.parentElement;
    if (!marker || !nav) return;
    hoveredId.current = id;
    if (previewTimer.current) clearTimeout(previewTimer.current);
    const markerBox = marker.getBoundingClientRect();
    const navBox = nav.getBoundingClientRect();
    const top = Math.max(0, Math.min(markerBox.top + markerBox.height / 2 - navBox.top - 100, navBox.height - 200));
    setPreview({ id, top, loading: true });
    previewTimer.current = setTimeout(() => {
      setPreview((current) => current?.id === id ? { ...current, loading: false } : current);
      previewTimer.current = null;
    }, 90);
  }, []);
  useEffect(() => () => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
  }, []);
  const updateFadedEdges = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const next = {
      above: viewport.scrollTop > 1,
      below: viewport.scrollTop + viewport.clientHeight < viewport.scrollHeight - 1,
    };
    setFadedEdges((current) => current.above === next.above && current.below === next.below ? current : next);
  }, []);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const marker = activeId ? markerRefs.current.get(activeId) : undefined;
    if (viewport && mainScrollEdge === "top") {
      viewport.scrollTop = 0;
    } else if (viewport && mainScrollEdge === "bottom") {
      viewport.scrollTop = viewport.scrollHeight;
    } else if (viewport && marker) {
      const markerTop = marker.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop;
      const markerBottom = markerTop + marker.offsetHeight;
      const inset = 16;
      const visibleTop = viewport.scrollTop + inset;
      const visibleBottom = viewport.scrollTop + viewport.clientHeight - inset;
      // Preserve chronological placement: the latest marker stays at the bottom
      // of the rail rather than being pulled into the visual middle.
      if (markerTop < visibleTop) viewport.scrollTop = Math.max(0, markerTop - inset);
      else if (markerBottom > visibleBottom) viewport.scrollTop = markerBottom - viewport.clientHeight + inset;
    }
    const frame = requestAnimationFrame(updateFadedEdges);
    return () => cancelAnimationFrame(frame);
  }, [activeId, mainScrollEdge, markers.length, updateFadedEdges]);

  const mask = edgeMask(fadedEdges.above, fadedEdges.below);

  return <nav aria-label="Conversation sections" onMouseLeave={hidePreview} className="relative col-start-2 row-start-2 hidden w-12 flex-col items-center justify-center bg-background sm:flex">
    <div
      ref={viewportRef}
      onWheel={(event) => event.stopPropagation()}
      onScroll={updateFadedEdges}
      onMouseMove={(event) => {
        const target = event.target;
        if (target instanceof HTMLButtonElement && target.dataset.questionId) {
          showPreview(target.dataset.questionId);
          return;
        }
        let closestId: string | null = null;
        let closestDistance = Infinity;
        for (const [id, marker] of markerRefs.current) {
          const box = marker.getBoundingClientRect();
          const distance = Math.abs(event.clientY - box.top - box.height / 2);
          if (distance < closestDistance) { closestId = id; closestDistance = distance; }
        }
        if (closestId) showPreview(closestId);
      }}
      className="flex h-[300px] w-12 overscroll-contain overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
    <div className="flex min-h-full w-full flex-col items-center justify-start gap-3 py-4">{markers.map(({ question }) => {
      return <button key={question.id} data-question-id={question.id} ref={(node) => { if (node) markerRefs.current.set(question.id, node); else markerRefs.current.delete(question.id); }} onClick={() => { hidePreview(); onNavigate(question.id); }} onMouseEnter={() => showPreview(question.id)} onFocus={() => showPreview(question.id)} onBlur={hidePreview} aria-label={`Go to question: ${question.content}`} aria-current={activeId === question.id ? "location" : undefined} className={cn("h-2 w-7 shrink-0 rounded-full bg-border-strong transition-colors hover:bg-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage", activeId === question.id && "w-9 bg-sage")} />;
    })}</div></div>
    {preview && (() => {
      const marker = markers.find(({ question }) => question.id === preview.id);
      if (!marker) return null;
      return <div aria-label="Conversation preview" className="absolute left-[calc(100%+10px)] z-50 max-h-64 min-h-32 w-72 overflow-y-auto rounded-lg border bg-surface p-3 shadow-xl transition-[top] duration-100 ease-out" style={{ top: preview.top }}>
        {preview.loading ? <div aria-label="Loading conversation preview" className="space-y-2.5"><span className="block h-3 w-4/5 animate-pulse rounded bg-muted" /><span className="block h-3 w-full animate-pulse rounded bg-muted" /><span className="block h-3 w-3/4 animate-pulse rounded bg-muted" /></div> : <><p className="line-clamp-2 text-xs font-medium leading-5">{marker.question.content}</p>{(marker.question.attachments?.length || marker.question.databases?.length) ? <div aria-label="Attached data" className="mt-2 space-y-1 border-t pt-2">
          {marker.question.attachments?.map((file) => {
            const Icon = /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name) ? ImageIcon : /\.(csv|xlsx?|parquet)$/i.test(file.name) ? Table2 : FileText;
            return <p key={file.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><Icon aria-hidden="true" className="size-3 shrink-0" /><span className="truncate" title={file.name}>{file.name}</span></p>;
          })}
          {marker.question.databases?.map((database) => <p key={database.id} className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground"><Database aria-hidden="true" className="size-3 shrink-0" /><span className="truncate" title={database.name}>{database.name}</span></p>)}
        </div> : null}{marker.answerPreview && <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-muted-foreground">{marker.answerPreview}</p>}<time className="mt-2 block text-[10px] text-muted-foreground">{new Date(marker.question.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time></>}
      </div>;
    })()}
  </nav>;
}, (previous, next) => {
  if (previous.onNavigate !== next.onNavigate) return false;
  if (previous.activeId !== next.activeId) return false;
  if (previous.mainScrollEdge !== next.mainScrollEdge) return false;
  const previousMarkers = conversationMarkers(previous.messages);
  const nextMarkers = conversationMarkers(next.messages);
  return previousMarkers.length === nextMarkers.length && previousMarkers.every((marker, index) => {
    const candidate = nextMarkers[index];
    return marker.question.id === candidate.question.id
      && marker.question.content === candidate.question.content
      && marker.question.createdAt === candidate.question.createdAt
      && JSON.stringify(marker.question.attachments) === JSON.stringify(candidate.question.attachments)
      && JSON.stringify(marker.question.databases) === JSON.stringify(candidate.question.databases)
      && marker.answerPreview === candidate.answerPreview;
  });
});
