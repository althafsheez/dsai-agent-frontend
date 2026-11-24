import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AskAiBar } from "./ask-ai-bar";

const props = { placeholder: "Ask", busy: false, suggestions: ["Add a table"], label: "Ask AI" };

describe("AskAiBar", () => {
  it("sends typed text with Enter and clears the box when it worked", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<AskAiBar {...props} onSubmit={onSubmit} />);
    const box = screen.getByRole("textbox", { name: "Ask AI" });
    await userEvent.type(box, "Make it a pie{Enter}");
    expect(onSubmit).toHaveBeenCalledWith("Make it a pie");
    expect(box).toHaveValue("");
  });

  it("keeps the text when the change failed, and sends a suggestion in one click", async () => {
    const onSubmit = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined);
    render(<AskAiBar {...props} onSubmit={onSubmit} />);
    const box = screen.getByRole("textbox", { name: "Ask AI" });
    await userEvent.type(box, "Do something{Enter}");
    expect(box).toHaveValue("Do something");
    await userEvent.click(screen.getByRole("button", { name: "Add a table" }));
    expect(onSubmit).toHaveBeenLastCalledWith("Add a table");
  });

  it("ignores very short text and is locked while busy", async () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<AskAiBar {...props} onSubmit={onSubmit} />);
    await userEvent.type(screen.getByRole("textbox", { name: "Ask AI" }), "hi{Enter}");
    expect(onSubmit).not.toHaveBeenCalled();
    rerender(<AskAiBar {...props} busy onSubmit={onSubmit} />);
    expect(screen.getByRole("textbox", { name: "Ask AI" })).toBeDisabled();
  });
});
