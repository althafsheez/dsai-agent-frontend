import { beforeEach, describe, expect, it } from "vitest";
import { historyMockAdapter } from "./history-mock-adapter";

describe("historyMockAdapter", () => {
  beforeEach(() => window.localStorage.clear());

  it("persists rename, archive, restore and soft delete in the shared envelope", async () => {
    await historyMockAdapter.rename("revenue-analysis", "chat", "Revenue Plan");
    await historyMockAdapter.setArchived("revenue-analysis", "chat", true);
    expect((await historyMockAdapter.list()).find((record) => record.id === "revenue-analysis")).toMatchObject({ name: "Revenue Plan", archived_at: expect.any(String) });

    await historyMockAdapter.setArchived("revenue-analysis", "chat", false);
    expect((await historyMockAdapter.list()).find((record) => record.id === "revenue-analysis")?.archived_at).toBeNull();

    await historyMockAdapter.softDelete("revenue-analysis", "chat");
    expect((await historyMockAdapter.list()).some((record) => record.id === "revenue-analysis")).toBe(false);
    const persisted = JSON.parse(window.localStorage.getItem(historyMockAdapter.storageKey) ?? "{}") as { version?: number; history?: { records?: unknown[] } };
    expect(persisted.version).toBe(1);
    expect(persisted.history?.records).toHaveLength(7);
  });

  it("preserves unrelated shared mock state", async () => {
    window.localStorage.setItem(historyMockAdapter.storageKey, JSON.stringify({ version: 1, landing: { draft: "keep me" } }));
    await historyMockAdapter.list();
    const persisted = JSON.parse(window.localStorage.getItem(historyMockAdapter.storageKey) ?? "{}") as { landing?: { draft?: string } };
    expect(persisted.landing?.draft).toBe("keep me");
  });
});

