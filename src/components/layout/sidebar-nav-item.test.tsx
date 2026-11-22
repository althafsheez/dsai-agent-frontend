import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FolderKanban, History } from "lucide-react";
import { SidebarNavItem } from "./sidebar-nav-item";

vi.mock("next/navigation", () => ({ usePathname: () => "/workflows" }));

function renderItem(props: React.ComponentProps<typeof SidebarNavItem>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><SidebarNavItem {...props} /></QueryClientProvider>);
}

describe("sidebar quick access", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("shows recent chats and a link to full history", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: [
      { id: "chat-1", title: "Revenue review", updated_at: new Date().toISOString(), archived_at: null, deleted_at: null },
      ...Array.from({ length: 4 }, (_, index) => ({
        id: `older-${index}`, title: `Earlier analysis ${index + 1}`, updated_at: "2026-11-01T12:00:00Z",
      })),
    ], next_cursor: null }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();
    renderItem({ label: "Recent Analyses", href: "/history", icon: History, flyout: true, compact: false });

    await user.hover(screen.getByRole("link", { name: "Recent Analyses" }));
    expect(await screen.findByRole("link", { name: /Revenue review/ })).toHaveAttribute("href", "/chat/chat-1");
    expect(screen.getByRole("link", { name: /Earlier analysis 4/ })).toHaveAttribute("href", "/chat/older-3");
    expect(screen.getByRole("link", { name: "View all analyses" })).toHaveAttribute("href", "/history");
  });

  it("pins and unpins a chat from Quick Access and places pinned chats first", async () => {
    const recent = { id: "recent", title: "Recent chat", updated_at: "2026-11-20T12:00:00Z", pinned_at: null };
    let older = { id: "older", title: "Older chat", updated_at: "2026-11-19T12:00:00Z", pinned_at: null as string | null };
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async (input, init) => {
      if (String(input).endsWith("/activity/list")) return Response.json({ items: [], next_cursor: null });
      if (init?.method === "PATCH" && String(input).endsWith("/chats/older")) {
        const { pinned } = JSON.parse(String(init.body)) as { pinned: boolean };
        older = { ...older, pinned_at: pinned ? "2026-11-21T12:00:00Z" : null };
        return Response.json(older);
      }
      return Response.json({ items: [recent, older], next_cursor: null });
    }));
    const user = userEvent.setup();
    renderItem({ label: "Recent Analyses", href: "/history", icon: History, flyout: true, compact: false });

    await user.tab();
    await screen.findByRole("link", { name: /Recent chat/ });
    await user.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}");
    expect(screen.getByRole("button", { name: "Pin Older chat" })).toHaveFocus();
    await user.keyboard("{Enter}");
    const unpin = await screen.findByRole("button", { name: "Unpin Older chat" });
    expect(screen.getAllByRole("link", { name: /^(Recent|Older) chat/ })[0]).toHaveAttribute("href", "/chat/older");
    await waitFor(() => expect(unpin).toHaveAttribute("aria-disabled", "false"));
    await user.click(unpin);
    await screen.findByRole("button", { name: "Pin Older chat" });
    expect(screen.getAllByRole("link", { name: /^(Recent|Older) chat/ })[0]).toHaveAttribute("href", "/chat/recent");
  });

  it("shows recently updated workspaces and a link to all workspaces", async () => {
    vi.stubGlobal("fetch", vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ items: [
      { id: "workspace-1", name: "Forecasting", updated_at: new Date().toISOString(), archived_at: null, deleted_at: null },
    ], next_cursor: null }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();
    renderItem({ label: "Workspaces", href: "/workspaces", icon: FolderKanban, flyout: true, compact: false });

    await user.hover(screen.getByRole("link", { name: "Workspaces" }));
    expect(await screen.findByRole("link", { name: /Forecasting/ })).toHaveAttribute("href", "/workspaces/workspace-1");
    expect(screen.getByRole("link", { name: "View all workspaces" })).toHaveAttribute("href", "/workspaces");
  });
});
