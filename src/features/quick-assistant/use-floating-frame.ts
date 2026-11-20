"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const MARGIN = 16;
const DEFAULT_TOP = 72;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 280;
// Resizing past this share of the free area snaps the window into full screen.
const FULLSCREEN_SNAP = 0.85;

interface Box { left: number; top: number; width: number; height: number; }
interface FrameOptions {
  ref: RefObject<HTMLElement | null>;
  /** Width, in px, taken on the right by the context or file panel. The frame never enters it. */
  rightInset: number;
  /** Default size used until the user resizes the window. */
  expanded: boolean;
}

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), Math.max(min, max));

export function useFloatingFrame({ ref, rightInset, expanded }: FrameOptions) {
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const gesture = useRef<{ kind: "drag" | "resize"; pointerX: number; pointerY: number; box: Box } | null>(null);

  // The popup is absolutely positioned inside the chat area, so that area (not the window) bounds it.
  useLayoutEffect(() => {
    const measure = () => {
      const parent = ref.current?.offsetParent;
      setArea({ width: parent?.clientWidth || window.innerWidth, height: parent?.clientHeight || window.innerHeight });
    };
    measure();
    window.addEventListener("resize", measure);
    const parent = ref.current?.offsetParent;
    const observer = typeof ResizeObserver === "undefined" || !parent ? null : new ResizeObserver(measure);
    if (parent) observer?.observe(parent);
    return () => { window.removeEventListener("resize", measure); observer?.disconnect(); };
  }, [ref]);

  const freeWidth = Math.max(0, area.width - rightInset);
  const maxWidth = freeWidth - MARGIN * 2;
  const maxHeight = area.height - MARGIN * 2;

  let box: Box;
  if (fullscreen) {
    box = { left: MARGIN, top: MARGIN, width: Math.max(MIN_WIDTH / 2, maxWidth), height: Math.max(MIN_HEIGHT / 2, maxHeight) };
  } else {
    const width = clamp(size?.width ?? (expanded ? 560 : 360), Math.min(MIN_WIDTH, maxWidth), maxWidth);
    const height = clamp(size?.height ?? (expanded ? 640 : 440), Math.min(MIN_HEIGHT, maxHeight), maxHeight);
    box = {
      width,
      height,
      left: clamp(position?.left ?? MARGIN, 0, freeWidth - width),
      top: clamp(position?.top ?? DEFAULT_TOP, 0, area.height - height),
    };
  }
  const boxRef = useRef(box);
  boxRef.current = box;

  const move = useCallback((event: PointerEvent) => {
    const current = gesture.current;
    if (!current) return;
    const dx = event.clientX - current.pointerX;
    const dy = event.clientY - current.pointerY;
    if (current.kind === "drag") setPosition({ left: current.box.left + dx, top: current.box.top + dy });
    else {
      setPosition({ left: current.box.left, top: current.box.top });
      setSize({ width: Math.max(MIN_WIDTH, current.box.width + dx), height: Math.max(MIN_HEIGHT, current.box.height + dy) });
    }
  }, []);
  const end = useCallback(() => {
    const finished = gesture.current;
    gesture.current = null;
    setInteracting(false);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", end);
    window.removeEventListener("pointercancel", end);
    if (finished?.kind === "resize") {
      const { width, height } = boxRef.current;
      if (width >= (area.width - rightInset - MARGIN * 2) * FULLSCREEN_SNAP && height >= (area.height - MARGIN * 2) * FULLSCREEN_SNAP) setFullscreen(true);
    }
  }, [move, area, rightInset]);
  useEffect(() => () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", end); window.removeEventListener("pointercancel", end); }, [move, end]);

  function begin(kind: "drag" | "resize", event: ReactPointerEvent) {
    if (event.button !== 0 || (kind === "drag" && fullscreen)) return;
    if (kind === "drag" && event.target instanceof HTMLElement && event.target.closest("button")) return;
    event.preventDefault();
    gesture.current = { kind, pointerX: event.clientX, pointerY: event.clientY, box: boxRef.current };
    setInteracting(true);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  const style: CSSProperties = { left: box.left, top: box.top, width: box.width, height: box.height };
  return {
    style,
    box,
    fullscreen,
    interacting,
    dragProps: { onPointerDown: (event: ReactPointerEvent) => begin("drag", event) },
    resizeProps: { onPointerDown: (event: ReactPointerEvent) => begin("resize", event) },
    toggleFullscreen: () => setFullscreen((current) => !current),
    /** Back to the automatic size; the position the user chose is kept. */
    resetSize: () => { setSize(null); setFullscreen(false); },
  };
}
