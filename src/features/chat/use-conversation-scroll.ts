"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage } from "./types";

// Own the scroll position and its corresponding marker together. A sentinel
// inside the padded message list is not the bottom of the scroll viewport.
export function useConversationScroll(messages: ChatMessage[]) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sections = useRef(new Map<string, HTMLElement>());
  const followingLatest = useRef(true);
  const questionKey = messages.filter((message) => message.role === "user").map((message) => message.id).join("\u0000");
  const questionIds = useMemo(() => questionKey ? questionKey.split("\u0000") : [], [questionKey]);
  const [position, setPosition] = useState<{ activeId?: string; edge: "top" | "bottom" | null }>({ edge: null });

  const measurePosition = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport || !questionIds.length) return;
    const atBottom = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2;
    const atTop = viewport.scrollTop <= 1;
    let activeId = atBottom ? questionIds.at(-1) : questionIds[0];
    if (!atBottom && !atTop) {
      // A question owns the entire response until the following question
      // reaches the reading line (also the marker-click scroll offset).
      const readingLine = viewport.getBoundingClientRect().top + 80;
      for (const id of questionIds) {
        const section = sections.current.get(id);
        if (section && section.getBoundingClientRect().top <= readingLine + 1) activeId = id;
      }
    }
    const edge = atBottom ? "bottom" : atTop ? "top" : null;
    setPosition((current) => current.activeId === activeId && current.edge === edge ? current : { activeId, edge });
  }, [questionIds]);

  const reconcileLayout = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    if (followingLatest.current) viewport.scrollTop = viewport.scrollHeight;
    measurePosition();
  }, [measurePosition]);

  // Runs after the optimistic question, persisted ID, or streamed content has
  // reached the DOM, before paint. No separate optimistic active-marker state.
  useLayoutEffect(reconcileLayout, [messages, reconcileLayout]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resizeObserver = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(reconcileLayout);
    resizeObserver?.observe(viewport);
    if (viewport.firstElementChild) resizeObserver?.observe(viewport.firstElementChild);
    const intersectionObserver = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(measurePosition, { root: viewport });
    for (const section of sections.current.values()) intersectionObserver?.observe(section);
    return () => {
      resizeObserver?.disconnect();
      intersectionObserver?.disconnect();
    };
  }, [measurePosition, reconcileLayout]);

  const onScroll = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    followingLatest.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight <= 2;
    measurePosition();
  }, [measurePosition]);

  const showLatest = useCallback(() => {
    // Send requests navigation to the new question. The layout effect applies
    // it when that question exists, including while its POST is still pending.
    followingLatest.current = true;
  }, []);

  const navigate = useCallback((id: string) => {
    const viewport = viewportRef.current;
    const section = sections.current.get(id);
    if (!viewport || !section) return;
    followingLatest.current = false;
    const top = viewport.scrollTop + section.getBoundingClientRect().top - viewport.getBoundingClientRect().top - 80;
    viewport.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
  }, []);

  const registerSection = useCallback((id: string, node: HTMLElement | null) => {
    if (node) sections.current.set(id, node);
    else sections.current.delete(id);
  }, []);

  return { viewportRef, registerSection, onScroll, showLatest, navigate, activeId: position.activeId, edge: position.edge };
}
