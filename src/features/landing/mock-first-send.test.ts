import { beforeEach, describe, expect, it, vi } from "vitest";
import { createLandingMockChat, landingMockStorage } from "./mock-first-send";

describe("landing first-send mock adapter", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-09T10:00:00.000Z"));
  });

  it("creates the chat and first message only when called", () => {
    expect(window.localStorage.getItem(landingMockStorage.key)).toBeNull();
    const csv = new File(["month,revenue\nJan,20"], "revenue.csv", { type: "text/csv" });
    const image = new File(["plot"], "trend.png", { type: "image/png" });

    const chat = createLandingMockChat({
      content: "  Explore revenue by month  ",
      workspaceId: "workspace-revenue",
      modelId: "gemini-2.5-pro",
      effort: "high",
      attachments: [csv, image],
    });

    expect(chat).toMatchObject({
      title: "Explore revenue by month",
      workspaceId: "workspace-revenue",
      modelId: "gemini-2.5-pro",
      effort: "high",
    });
    expect(chat.messages[0]).toMatchObject({
      chatId: chat.id,
      content: "Explore revenue by month",
      role: "user",
    });
    expect(chat.messages[0].attachments).toEqual([
      expect.objectContaining({ name: "revenue.csv", mimeType: "text/csv", kind: "dataset", sizeBytes: csv.size }),
      expect.objectContaining({ name: "trend.png", mimeType: "image/png", kind: "artifact", sizeBytes: image.size }),
    ]);
    expect(landingMockStorage.read().chats).toHaveLength(1);
  });

  it("does not create an empty chat", () => {
    expect(() => createLandingMockChat({ content: "  ", workspaceId: null, modelId: "model", effort: "medium", attachments: [] }))
      .toThrow("Enter a question");
    expect(window.localStorage.getItem(landingMockStorage.key)).toBeNull();
  });
});
