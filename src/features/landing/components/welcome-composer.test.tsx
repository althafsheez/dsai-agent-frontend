import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { landingMockStorage } from "../mock-first-send";
import { WelcomeComposer } from "./welcome-composer";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("welcome composer", () => {
  beforeEach(() => {
    push.mockReset();
    window.localStorage.clear();
  });

  it("populates and focuses the draft from each suggested prompt", async () => {
    const user = userEvent.setup();
    render(<WelcomeComposer />);
    const input = screen.getByRole("textbox", { name: "Analysis question" });

    await user.click(screen.getByRole("button", { name: "Explore trends" }));
    expect(input).toHaveValue("Help me explore trends in my data.");
    expect(input).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Find what changed" }));
    expect(input).toHaveValue("What changed in my data, and what might explain it?");
    await user.click(screen.getByRole("button", { name: "Create a report" }));
    expect(input).toHaveValue("Create a concise report with the key findings from my data.");
  });

  it("adds multiple attachments and removes them independently", async () => {
    const user = userEvent.setup();
    render(<WelcomeComposer />);
    const csv = new File(["a,b"], "sales.csv", { type: "text/csv" });
    const pdf = new File(["report"], "summary.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("Upload files"), [csv, pdf]);
    const previews = screen.getByLabelText("Selected attachments");
    expect(within(previews).getByText("sales.csv")).toBeVisible();
    expect(within(previews).getByText("summary.pdf")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove sales.csv" }));
    expect(screen.queryByText("sales.csv")).not.toBeInTheDocument();
    expect(screen.getByText("summary.pdf")).toBeVisible();
  });

  it("opens the add menu and exposes implemented and coming-soon actions", async () => {
    const user = userEvent.setup();
    render(<WelcomeComposer />);
    await user.click(screen.getByRole("button", { name: "Add to analysis" }));
    const menu = screen.getByRole("menu", { name: "Add to analysis" });
    expect(within(menu).getByRole("menuitem", { name: "Upload file" })).toBeEnabled();
    expect(within(menu).getByRole("menuitem", { name: /Connect source/ })).toBeDisabled();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu", { name: "Add to analysis" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to analysis" })).toHaveFocus();
  });

  it("creates a chat on Send with the selected context and attachment metadata", async () => {
    const user = userEvent.setup();
    render(<WelcomeComposer />);
    expect(window.localStorage.getItem(landingMockStorage.key)).toBeNull();

    await user.type(screen.getByRole("textbox", { name: "Analysis question" }), "Compare quarterly revenue");
    await user.upload(screen.getByLabelText("Add datasets"), new File(["q,revenue"], "quarterly.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Workspace: Standalone" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Revenue Planning" }));
    await user.click(screen.getByRole("button", { name: "Model: Gemini 2.5 Flash" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Gemini 2.5 Pro" }));
    await user.click(screen.getByRole("button", { name: "Reasoning effort: Medium" }));
    await user.click(screen.getByRole("menuitemradio", { name: "High" }));
    await user.click(screen.getByRole("button", { name: "Send analysis" }));

    const [chat] = landingMockStorage.read().chats;
    expect(chat).toMatchObject({
      workspaceId: "workspace-revenue",
      modelId: "gemini-2.5-pro",
      effort: "high",
    });
    expect(chat.messages[0].content).toBe("Compare quarterly revenue");
    expect(chat.messages[0].attachments[0]).toMatchObject({ name: "quarterly.csv", kind: "dataset" });
    expect(push).toHaveBeenCalledWith(`/chat/${chat.id}`);
  });

  it("sends with Enter while Shift+Enter keeps composing", async () => {
    const user = userEvent.setup();
    render(<WelcomeComposer />);
    const input = screen.getByRole("textbox", { name: "Analysis question" });
    await user.type(input, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(input).toHaveValue("Line one\nLine two");
    expect(push).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(push).toHaveBeenCalledOnce();
  });
});
