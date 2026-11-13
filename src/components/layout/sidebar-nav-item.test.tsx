import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
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
    ], next_cursor: null }), { headers: { "Content-Type": "application/json" } })));
    const user = userEvent.setup();
    renderItem({ label: "Recent Analyses", href: "/history", icon: History, flyout: true, compact: false });

    await user.hover(screen.getByRole("link", { name: "Recent Analyses" }));
    expect(await screen.findByRole("link", { name: /Revenue review/ })).toHaveAttribute("href", "/chat/chat-1");
    expect(screen.getByRole("link", { name: "View all analyses" })).toHaveAttribute("href", "/history");
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
