import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createLandingMockChat } from "@/features/landing/mock-first-send";
import { readMockEnvelope } from "@/lib/mock/mock-store";
import { ChatPage } from "./chat-page";

describe("integrated chat page", () => {
  beforeEach(() => window.localStorage.clear());

  it("connects the panel toggle, attachment preview, Back/Close, and persistent messages", async () => {
    const user = userEvent.setup();
    const chat = createLandingMockChat({
      content: "Review this dataset",
      workspaceId: "workspace-revenue",
      modelId: "gemini-2.5-flash",
      effort: "medium",
      attachments: [new File(["month,revenue\nJan,20"], "revenue.csv", { type: "text/csv" })],
    });

    render(<ChatPage chatId={chat.id} />);
    expect(screen.getAllByText("Review this dataset")).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: "Toggle context panel" }));
    expect(screen.getByRole("complementary", { name: "Analysis context" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close context" }));

    await user.click(screen.getByRole("button", { name: /revenue.csv/i }));
    expect(screen.getByRole("complementary", { name: "Preview revenue.csv" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Back to context" }));
    expect(screen.getByRole("complementary", { name: "Analysis context" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close context" }));
    expect(screen.queryByRole("complementary", { name: "Analysis context" })).not.toBeInTheDocument();

    await user.type(screen.getByRole("textbox", { name: "Ask anything about your data" }), "Summarize the trend");
    await user.click(screen.getByRole("button", { name: "Send message" }));
    expect(screen.getByText("Summarize the trend")).toBeInTheDocument();
    expect(readMockEnvelope().chatSessions).toEqual(expect.arrayContaining([expect.objectContaining({ id: chat.id })]));
  });
});
