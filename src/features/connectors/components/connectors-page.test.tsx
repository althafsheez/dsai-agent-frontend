import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ExtensionsPage } from "./connectors-page";

function renderPage() {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <ExtensionsPage />
  </QueryClientProvider>);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("extensions page", () => {
  it("searches and opens the PostgreSQL form directly", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [] })));
    renderPage();

    expect(screen.getByRole("tab", { name: "My Connections" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Snowflake")).not.toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "No extensions yet" })).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByText("Data Cleaning")).toBeVisible();
    expect(screen.queryByText("Snowflake")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Databases" }));
    await user.type(screen.getByRole("textbox", { name: "Search extensions" }), "postgres");
    expect(screen.getByText("PostgreSQL")).toBeVisible();
    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();

    const connect = screen.getByRole("button", { name: "Add PostgreSQL" });
    expect(connect).toHaveTextContent("Add");
    await user.click(connect);
    expect(screen.getByRole("dialog", { name: "Add PostgreSQL connection" })).toBeVisible();
    expect(screen.getByLabelText("Connection name")).toBeVisible();
  });

  it("shows the catalog across all three tabs and disables unfinished extensions", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ items: [] })));
    renderPage();

    await user.click(screen.getByRole("tab", { name: "Databases" }));
    expect(screen.getAllByRole("article")).toHaveLength(6);
    expect(screen.getByRole("button", { name: "Add PostgreSQL" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Add MongoDB" })).toBeDisabled();

    await user.click(screen.getByRole("tab", { name: "Apps" }));
    expect(screen.getAllByRole("article")).toHaveLength(9);
    expect(screen.getByRole("button", { name: "Add Google Analytics" })).toBeDisabled();
    expect(screen.queryByText("Shopify")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getAllByRole("article")).toHaveLength(8);
    expect(screen.getByRole("button", { name: "Add Data Cleaning" })).toBeDisabled();
  });

  it("groups saved connections under one provider and makes long lists keyboard accessible", async () => {
    const names = ["Northwind", "Production", "Staging", "Reporting"];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json({
      items: url.endsWith("/postgresql") ? names.map((name, index) => ({
        id: String(index), name, database: name.toLowerCase(), status: "connected",
      })) : [],
    })));
    renderPage();

    const list = await screen.findByRole("list", { name: "PostgreSQL connections" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(4);
    expect(list).toHaveAttribute("tabindex", "0");
    expect(screen.getByText("4 connections")).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Manage PostgreSQL" })).toHaveLength(1);
  });

  it("tests and saves PostgreSQL settings, then renders live-schema API responses", async () => {
    const user = userEvent.setup();
    let saved = false;
    const connection = { id: "database-1", name: "Sales warehouse", database: "warehouse", status: "connected", enable_previews: true };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/workspaces")) return Response.json({ items: [] });
      if (path.endsWith("/postgresql/test")) return Response.json({ schemas: { items: ["public", "analytics"] } });
      if (path.endsWith("/connectors/postgresql") && init?.method === "POST") {
        saved = true;
        return Response.json(connection, { status: 201 });
      }
      if (path.endsWith("/connectors/postgresql")) return Response.json({ items: saved ? [connection] : [] });
      if (path.endsWith("/schemas")) return Response.json({ items: ["analytics"] });
      if (path.endsWith("/tables")) return Response.json({ items: [{ schema_name: "analytics", name: "orders" }] });
      if (path.endsWith("/tables/analytics/orders")) return Response.json({
        columns: [{ name: "id", data_type: "integer", nullable: false, primary_key: true }],
        preview: url.includes("preview=true") ? { columns: ["id"], rows: [[42]], truncated: false } : null,
      });
      throw new Error(`Unexpected request ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPage();
    await user.click(screen.getByRole("button", { name: "Add connection" }));
    await user.click(within(screen.getByRole("dialog", { name: "Add an extension" })).getByRole("button", { name: "Databases" }));
    await user.click(screen.getByRole("button", { name: "Add PostgreSQL" }));
    const setup = within(screen.getByRole("dialog", { name: "Add PostgreSQL connection" }));
    await user.type(await setup.findByLabelText("Connection name"), connection.name);
    await user.type(setup.getByLabelText("Host"), "db.example.test");
    await user.type(setup.getByLabelText("Database name"), connection.database);
    await user.type(setup.getByLabelText("Username"), "reader");
    await user.type(setup.getByLabelText("Password", { exact: true }), "fixture-password");
    await user.click(setup.getByRole("button", { name: "Test Connection" }));
    expect(await setup.findByText("Connected to PostgreSQL")).toBeVisible();
    await user.click(setup.getByRole("checkbox", { name: "analytics" }));
    await user.click(setup.getByRole("button", { name: "Save Connection" }));
    const save = fetchMock.mock.calls.find(([url, init]) => url.endsWith("/connectors/postgresql") && init?.method === "POST");
    expect(JSON.parse(String(save?.[1]?.body))).toMatchObject({ schema_filter: ["public", "analytics"], ssl_mode: "verify-full", port: 5432 });
    expect(await screen.findByText("1 connection")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Manage PostgreSQL" }));
    await user.click(within(screen.getByRole("dialog", { name: "Manage PostgreSQL" })).getByRole("button", { name: "Browse tables" }));
    const browser = within(screen.getByRole("dialog", { name: connection.name }));
    await user.click(await browser.findByRole("button", { name: "analytics.orders" }));
    expect(await browser.findByText("integer")).toBeVisible();
    await user.click(browser.getByRole("button", { name: "Preview rows" }));
    expect(await browser.findByRole("table", { name: "Table preview" })).toHaveTextContent("42");
  });
});
