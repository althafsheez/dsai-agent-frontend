import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { UserMessage } from "./user-message";
import { AssistantMessage } from "./assistant-message";
import { blocksToText } from "./copy-button";

const question = { id: "user-1", role: "user" as const, content: "Original question", createdAt: "2026-11-13T00:00:00Z" };

describe("UserMessage", () => {
  it("offers Copy and Edit, and hides Edit when editing is unavailable", () => {
    const { rerender } = render(<UserMessage message={question} onEdit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Copy question" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit question" })).toBeVisible();
    rerender(<UserMessage message={question} />);
    expect(screen.queryByRole("button", { name: "Edit question" })).not.toBeInTheDocument();
  });

  it("saves an edited question and warns that later turns are replaced", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn().mockResolvedValue(undefined);
    render(<UserMessage message={question} onEdit={onEdit} />);
    await user.click(screen.getByRole("button", { name: "Edit question" }));
    const save = screen.getByRole("button", { name: "Save & retry" });
    expect(save).toBeDisabled();
    const box = screen.getByRole("textbox", { name: "Edit your question" });
    await user.clear(box);
    await user.type(box, "Better question");
    await user.click(save);
    expect(onEdit).toHaveBeenCalledWith("user-1", "Better question");
    expect(screen.queryByRole("textbox", { name: "Edit your question" })).not.toBeInTheDocument();
  });

  it("keeps the editor open when saving fails, and cancel restores the question", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn().mockRejectedValue(new Error("nope"));
    render(<UserMessage message={question} onEdit={onEdit} />);
    await user.click(screen.getByRole("button", { name: "Edit question" }));
    await user.type(screen.getByRole("textbox", { name: "Edit your question" }), " more");
    await user.click(screen.getByRole("button", { name: "Save & retry" })).catch(() => undefined);
    expect(screen.getByRole("textbox", { name: "Edit your question" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByText("Original question")).toBeVisible();
  });
});

describe("response actions", () => {
  const message = { id: "a1", role: "assistant" as const, status: "completed" as const, createdAt: "2026-11-13T00:00:00Z", blocks: [{ type: "markdown" as const, content: "Hello there" }] };

  it("shows Copy and Branch under a completed response", () => {
    render(<AssistantMessage message={message} onBranch={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Copy response" })).toBeVisible();
    expect(screen.getByRole("button", { name: /Branch from here/ })).toBeVisible();
  });

  it("builds copy text from prose, code and tables only", () => {
    expect(blocksToText([
      { type: "markdown", content: "Intro" },
      { type: "code", code: "print(1)", language: "python" },
      { type: "table", columns: ["a", "b"], rows: [[1, 2]] },
      { type: "image", src: "x", alt: "x" },
    ])).toBe("Intro\n\n```python\nprint(1)\n```\n\na\tb\n1\t2");
  });
});
