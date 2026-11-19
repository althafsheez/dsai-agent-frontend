import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "../types";
import { ConversationNavigator } from "./conversation-navigator";

function conversation(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, index): ChatMessage[] => [{
    id: `question-${index}`,
    role: "user",
    content: `Prompt ${index}`,
    createdAt: "2026-11-13T00:00:00Z",
  }, {
    id: `answer-${index}`,
    role: "assistant",
    status: "completed",
    createdAt: "2026-11-13T00:00:01Z",
    blocks: [{ type: "markdown", content: `Answer ${index}` }],
  }]).flat();
}

describe("ConversationNavigator", () => {
  it("keeps every marker in a compact masked viewport and navigates by click", async () => {
    const onNavigate = vi.fn();
    render(<ConversationNavigator messages={conversation(100)} activeId="question-50" onNavigate={onNavigate} />);

    expect(screen.getAllByRole("button", { name: /Go to question/ })).toHaveLength(100);
    expect(screen.getByRole("button", { name: "Go to question: Prompt 50" })).toHaveAttribute("aria-current", "location");
    const viewport = screen.getByRole("navigation", { name: "Conversation sections" }).firstElementChild;
    expect(viewport).toHaveClass("h-[300px]", "overflow-y-auto");
    expect(viewport?.getAttribute("style") ?? "").not.toContain("linear-gradient");
    await userEvent.click(screen.getByRole("button", { name: "Go to question: Prompt 72" }));
    expect(onNavigate).toHaveBeenCalledWith("question-72");
    await userEvent.hover(screen.getByRole("button", { name: "Go to question: Prompt 72" }));
    expect(await screen.findByText("Answer 72")).toBeVisible();
  });

  it("keeps each hover preview at a consistent size", async () => {
    render(<ConversationNavigator messages={conversation(4)} activeId="question-2" onNavigate={vi.fn()} />);
    await userEvent.hover(screen.getByRole("button", { name: "Go to question: Prompt 2" }));
    expect(await screen.findByText("Answer 2")).toBeVisible();
    expect(screen.getByText("Answer 2").closest("div[class*='h-32']")).toHaveClass("w-72", "h-32");
  });

  it("does not show a preview when the conversation rail scrolls", () => {
    render(<ConversationNavigator messages={conversation(20)} activeId="question-2" onNavigate={vi.fn()} />);
    const viewport = screen.getByRole("navigation", { name: "Conversation sections" }).firstElementChild as HTMLDivElement;
    fireEvent.scroll(viewport);
    expect(screen.queryByText("Answer 2")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Loading conversation preview")).not.toBeInTheDocument();
  });

  it("switches to the nearest marker immediately while moving across the rail", async () => {
    render(<ConversationNavigator messages={conversation(4)} activeId="question-0" onNavigate={vi.fn()} />);
    const first = screen.getByRole("button", { name: "Go to question: Prompt 0" });
    const second = screen.getByRole("button", { name: "Go to question: Prompt 1" });
    const viewport = screen.getByRole("navigation", { name: "Conversation sections" }).firstElementChild as HTMLDivElement;
    vi.spyOn(first, "getBoundingClientRect").mockReturnValue({ top: 10, height: 8 } as DOMRect);
    vi.spyOn(second, "getBoundingClientRect").mockReturnValue({ top: 40, height: 8 } as DOMRect);
    fireEvent.mouseEnter(first);
    expect(screen.getByLabelText("Loading conversation preview")).toBeInTheDocument();
    fireEvent.mouseMove(viewport, { clientY: 43 });
    expect(screen.getByLabelText("Loading conversation preview")).toBeInTheDocument();
    expect(await screen.findByText("Answer 1")).toBeVisible();
    expect(screen.queryByText("Answer 0")).not.toBeInTheDocument();
    fireEvent.mouseLeave(viewport);
    expect(screen.queryByLabelText("Conversation preview")).not.toBeInTheDocument();
  });

  it("resets the rail to its true top when the main chat reaches its true top", () => {
    const { rerender } = render(<ConversationNavigator messages={conversation(10)} activeId="question-5" onNavigate={vi.fn()} />);
    const viewport = screen.getByRole("navigation", { name: "Conversation sections" }).firstElementChild as HTMLDivElement;
    Object.defineProperty(viewport, "scrollTop", { value: 180, writable: true });

    rerender(<ConversationNavigator messages={conversation(10)} activeId="question-5" onNavigate={vi.fn()} mainScrollEdge="top" />);
    expect(viewport.scrollTop).toBe(0);
  });

  it("top-aligns the complete marker list inside its independently scrollable rail", () => {
    render(<ConversationNavigator messages={conversation(100)} activeId="question-0" onNavigate={vi.fn()} />);

    const viewport = screen.getByRole("navigation", { name: "Conversation sections" }).firstElementChild as HTMLDivElement;
    const markerList = viewport.firstElementChild;

    expect(viewport).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(markerList).toHaveClass("justify-start");
    expect(markerList).not.toHaveClass("justify-center");
    expect(screen.getByRole("button", { name: "Go to question: Prompt 0" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go to question: Prompt 99" })).toBeInTheDocument();
  });
});
