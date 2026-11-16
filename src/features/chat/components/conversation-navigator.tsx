"use client";

import * as HoverCard from "@radix-ui/react-hover-card";
import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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

export const ConversationNavigator = memo(function ConversationNavigator({ messages, activeId, onNavigate }: { messages: ChatMessage[]; activeId?: string; onNavigate: (id: string) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const markerRefs = useRef(new Map<string, HTMLButtonElement>());
  const markers = useMemo(() => conversationMarkers(messages), [messages]);
  const [fadedEdges, setFadedEdges] = useState({ above: false, below: false });
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
    if (viewport && marker) {
      const markerTop = marker.offsetTop;
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
  }, [activeId, markers.length, updateFadedEdges]);

  const mask = edgeMask(fadedEdges.above, fadedEdges.below);

  return <nav aria-label="Conversation sections" className="col-start-1 row-start-2 hidden w-12 flex-col items-center justify-center bg-background sm:flex">
    <div
      ref={viewportRef}
      onWheel={(event) => event.stopPropagation()}
      onScroll={updateFadedEdges}
      className="flex h-[300px] w-12 overscroll-contain overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      style={{ maskImage: mask, WebkitMaskImage: mask }}
    >
    <div className="flex min-h-full w-full flex-col items-center justify-center gap-3 py-5">{markers.map(({ question, answerPreview }) => {
      return <HoverCard.Root key={question.id} openDelay={180} closeDelay={80}>
        <HoverCard.Trigger asChild><button ref={(node) => { if (node) markerRefs.current.set(question.id, node); else markerRefs.current.delete(question.id); }} onClick={() => onNavigate(question.id)} aria-label={`Go to question: ${question.content}`} aria-current={activeId === question.id ? "location" : undefined} className={cn("h-2 w-7 shrink-0 rounded-full bg-border-strong transition-colors hover:bg-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-sage", activeId === question.id && "w-9 bg-sage")} /></HoverCard.Trigger>
        <HoverCard.Portal><HoverCard.Content side="right" sideOffset={12} className="z-50 w-64 rounded-lg border bg-surface p-3 shadow-xl">
          <p className="line-clamp-2 text-xs font-medium leading-5">{question.content}</p>
          {answerPreview && <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-muted-foreground">{answerPreview}</p>}
          <time className="mt-2 block text-[10px] text-muted-foreground">{new Date(question.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>
        </HoverCard.Content></HoverCard.Portal>
      </HoverCard.Root>;
    })}</div></div>
  </nav>;
}, (previous, next) => {
  if (previous.activeId !== next.activeId) return false;
  const previousMarkers = conversationMarkers(previous.messages);
  const nextMarkers = conversationMarkers(next.messages);
  return previousMarkers.length === nextMarkers.length && previousMarkers.every((marker, index) => {
    const candidate = nextMarkers[index];
    return marker.question.id === candidate.question.id
      && marker.question.content === candidate.question.content
      && marker.question.createdAt === candidate.question.createdAt
      && marker.answerPreview === candidate.answerPreview;
  });
});
