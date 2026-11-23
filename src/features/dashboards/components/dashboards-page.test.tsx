import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { DashboardsPage } from "./dashboards-page";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const record = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, description: `${name} description`, status: "published", pinned: false, slicers: [], dataset_ids: [], widgets: [{ id: "w" }],
  owner: "You", ownership: "owned", role: "owner", refresh_minutes: 0, shares: [], created_at: "2026-11-01T00:00:00Z", updated_at: "2026-11-02T00:00:00Z",
  preview: { kpi: { label: "Revenue", value: "36" }, chart: { kind: "bar", series: [20, 15, 1], labels: ["S", "N", "E"] } }, ...extra,
});

const api = vi.hoisted(() => ({
  rows: [] as Array<Record<string, unknown>>,
  save: vi.fn(), pin: vi.fn(), remove: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error { status = 0 },
  listDashboardRecords: async () => api.rows,
  getDashboardRecord: async (id: string) => api.rows.find((row) => row.id === id),
  saveDashboardRecord: (body: unknown) => api.save(body),
  pinDashboardRecord: (id: string, pinned: boolean) => api.pin(id, pinned),
  deleteDashboardRecord: (id: string) => api.remove(id),
  listDashboardPeople: async () => [],
}));

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><DashboardsPage /></QueryClientProvider>);
}

describe("dashboards page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.rows = [
      record("a", "Revenue Overview", { pinned: true }),
      record("b", "Sales Performance", { owner: "Alex", ownership: "shared", role: "viewer", updated_at: "2026-11-03T00:00:00Z", preview: { kpi: { label: "Widgets", value: "1" }, chart: null } }),
      record("c", "Customer Health", { status: "draft", updated_at: "2026-11-04T00:00:00Z" }),
    ];
    api.pin.mockImplementation(async (id: string, pinned: boolean) => ({ ...api.rows.find((row) => row.id === id), pinned }));
  });

  it("lists the saved dashboards with their real preview, pinned first", async () => {
    renderPage();
    const cards = await screen.findAllByRole("article");
    expect(cards.map((card) => card.getAttribute("aria-label"))).toEqual(["Revenue Overview", "Customer Health", "Sales Performance"]);
    expect(within(cards[0]).getByText("Revenue")).toBeVisible();
    expect(within(cards[0]).getByText("36")).toBeVisible();
    expect(within(cards[2]).getByText("No chart yet")).toBeVisible();
    expect(screen.getByText("3 dashboards")).toBeVisible();
  });

  it("searches and filters by ownership", async () => {
    const user = userEvent.setup();
    renderPage();
    await screen.findAllByRole("article");
    await user.click(screen.getByRole("button", { name: /^Shared/ }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: /^All/ }));
    await user.type(screen.getByRole("textbox", { name: "Search dashboards" }), "health");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    await user.type(screen.getByRole("textbox", { name: "Search dashboards" }), "zzz");
    expect(screen.getByText("No matching dashboards")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getAllByRole("article")).toHaveLength(3);
  });

  it("pins and unpins through the backend", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Pin Customer Health" }));
    expect(api.pin).toHaveBeenCalledWith("c", true);
    await user.click(screen.getByRole("button", { name: "Unpin Revenue Overview" }));
    expect(api.pin).toHaveBeenCalledWith("a", false);
  });

  it("renames, duplicates and deletes from the menu, and hides owner actions from viewers", async () => {
    const user = userEvent.setup();
    api.save.mockImplementation(async (body: Record<string, unknown>) => ({ ...record(String(body.id), String(body.name)) }));
    api.remove.mockResolvedValue(undefined);
    renderPage();
    await user.click(await screen.findByRole("button", { name: "Actions for Sales Performance" }));
    expect(screen.queryByRole("menuitem", { name: /Rename/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: /Delete/ })).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: /Duplicate/ })).toBeVisible();
    await user.keyboard("{Escape}");

    await user.click(screen.getByRole("button", { name: "Actions for Customer Health" }));
    await user.click(screen.getByRole("menuitem", { name: /Rename/ }));
    const input = screen.getByRole("textbox", { name: "Dashboard name" });
    await user.clear(input);
    await user.type(input, "Health v2");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ id: "c", name: "Health v2" }));

    await user.click(screen.getByRole("button", { name: "Actions for Revenue Overview" }));
    await user.click(screen.getByRole("menuitem", { name: /Duplicate/ }));
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ name: "Copy of Revenue Overview", status: "draft", shares: [] }));
    expect(push).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Actions for Revenue Overview" }));
    await user.click(screen.getByRole("menuitem", { name: /Delete/ }));
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(api.remove).toHaveBeenCalledWith("a");
  });

  it("shows an empty state when nothing is saved", async () => {
    api.rows = [];
    renderPage();
    expect(await screen.findByText("No dashboards yet")).toBeVisible();
  });
});
