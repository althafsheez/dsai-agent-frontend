import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RecentChats } from "./recent-chats";

describe("RecentChats", () => {
  it("shows recent chat names with their workspace and update time", async () => {
    const now = Date.now();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/chats")) {
        return Response.json({
          items: [{
            id: "chat-workspace",
            title: "Revenue analysis",
            title_source: "manual",
            workspace_id: "workspace-1",
            created_by: "user-you",
            created_at: new Date(now - 10_000).toISOString(),
            updated_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            archived_at: null,
            deleted_at: null,
            first_run_at: null,
            is_unread: false,
            active_run_status: null,
          }, {
            id: "chat-standalone",
            title: "Quick question",
            title_source: "fallback",
            workspace_id: null,
            created_by: "user-you",
            created_at: new Date(now - 20_000).toISOString(),
            updated_at: new Date(now - 30 * 60 * 1000).toISOString(),
            archived_at: null,
            deleted_at: null,
            first_run_at: null,
            is_unread: false,
            active_run_status: null,
          }],
          next_cursor: null,
        });
      }
      if (url.endsWith("/api/workspaces")) {
        return Response.json({
          items: [{
            id: "workspace-1",
            name: "Revenue Intelligence",
            description: null,
            created_by: "user-you",
            created_at: new Date(now - 10_000).toISOString(),
            updated_at: new Date(now - 10_000).toISOString(),
            archived_at: null,
            deleted_at: null,
          }],
          next_cursor: null,
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }));

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <RecentChats />
      </QueryClientProvider>,
    );

    expect(await screen.findByRole("link", { name: /quick question/i })).toHaveAttribute("href", "/chat/chat-standalone");
    expect(screen.getByText("Revenue Intelligence")).toBeVisible();
    expect(screen.getByText("Standalone")).toBeVisible();
    expect(screen.getByText("2h ago")).toBeVisible();
  });
});
