import { render, screen } from "@testing-library/react";
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
});
