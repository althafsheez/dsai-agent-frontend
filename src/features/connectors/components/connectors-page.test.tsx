import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ConnectorsPage } from "./connectors-page";

const api = vi.hoisted(() => ({
  getConnectors: vi.fn(),
  startGoogleDriveAuth: vi.fn(),
  disconnectGoogleDrive: vi.fn(),
  listDriveFiles: vi.fn(),
  importDriveFiles: vi.fn(),
  getWorkspaces: vi.fn(),
}));
vi.mock("@/lib/api", () => ({
  ...api,
  ApiError: class ApiError extends Error { constructor(message: string, readonly status = 400, readonly code = "api_error") { super(message); } },
}));

const status = (state: "connected" | "disconnected" | "unavailable", email: string | null = null) => ({
  items: [{ id: "google-drive", status: state, configured: state !== "unavailable", account_email: email, connected_at: null }],
});
function render(ui: ReactElement) {
  return rtlRender(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getConnectors.mockResolvedValue(status("disconnected"));
  api.getWorkspaces.mockResolvedValue({ items: [{ id: "w1", name: "Ops", archived_at: null }], next_cursor: null });
  api.listDriveFiles.mockResolvedValue({ items: [], next_page_token: null });
});

describe("connectors page", () => {
  it("searches, filters categories, and explains unavailable installation", async () => {
    const user = userEvent.setup();
    render(<ConnectorsPage />);

    expect(screen.getByText("Snowflake")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Skills" }));
    expect(screen.getByText("Data Cleaning")).toBeVisible();
    expect(screen.queryByText("Snowflake")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "All" }));
    await user.type(screen.getByRole("textbox", { name: "Search connectors" }), "postgres");
    expect(screen.getByText("PostgreSQL")).toBeVisible();
    expect(screen.queryByText("Gmail")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Add", expanded: false }));
    expect(screen.getByRole("status")).toHaveTextContent(/coming soon/i);
  });

  it("connects and disconnects a connector (demo state)", async () => {
    const user = userEvent.setup();
    render(<ConnectorsPage />);
    await user.click(screen.getByRole("button", { name: "Connect Snowflake" }));
    expect(screen.getByRole("button", { name: "Disconnect Snowflake" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Disconnect Snowflake" }));
    expect(screen.getByRole("button", { name: "Connect Snowflake" })).toBeVisible();
  });

  it("shows Google Drive as not configured when the server has no credentials", async () => {
    api.getConnectors.mockResolvedValue(status("unavailable"));
    render(<ConnectorsPage />);
    expect(await screen.findByText(/Not configured on this server/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Connect Google Drive" })).toBeDisabled();
  });

  it("starts Google sign-in for Drive instead of toggling demo state", async () => {
    const user = userEvent.setup();
    api.startGoogleDriveAuth.mockRejectedValue(new Error("boom"));
    render(<ConnectorsPage />);
    await user.click(await screen.findByRole("button", { name: "Connect Google Drive" }));
    expect(api.startGoogleDriveAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Connect Google Drive" })).toBeVisible();
  });

  it("shows the connected account and disconnects through the backend", async () => {
    const user = userEvent.setup();
    api.getConnectors.mockResolvedValue(status("connected", "analyst@example.com"));
    api.disconnectGoogleDrive.mockResolvedValue(undefined);
    render(<ConnectorsPage />);
    expect(await screen.findByText("Connected as analyst@example.com")).toBeVisible();
    expect(screen.getByRole("button", { name: "Import files" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Disconnect Google Drive" }));
    expect(api.disconnectGoogleDrive).toHaveBeenCalledTimes(1);
  });

  it("browses Drive, selects a file and imports it into a workspace", async () => {
    const user = userEvent.setup();
    api.getConnectors.mockResolvedValue(status("connected", "analyst@example.com"));
    api.listDriveFiles.mockResolvedValue({
      items: [
        { id: "f1", name: "sales.csv", mime_type: "text/csv", is_folder: false, size_bytes: 120, modified_at: null, importable: true },
        { id: "f2", name: "setup.exe", mime_type: "application/octet-stream", is_folder: false, size_bytes: 9, modified_at: null, importable: false },
      ],
      next_page_token: null,
    });
    api.importDriveFiles.mockResolvedValue({ imported: [{ file_id: "f1", resource: { id: "r1", name: "sales.csv", resource_type: "dataset" }, already_imported: false }], failed: [] });
    render(<ConnectorsPage />);
    await user.click(await screen.findByRole("button", { name: "Import files" }));
    expect(await screen.findByRole("checkbox", { name: "Select setup.exe" })).toBeDisabled();
    await user.click(await screen.findByRole("checkbox", { name: "Select sales.csv" }));
    await user.click(screen.getByRole("button", { name: "Import 1" }));
    expect(api.importDriveFiles).toHaveBeenCalledWith({ fileIds: ["f1"], scopeType: "workspace", scopeId: "w1" });
    expect(await screen.findByText(/Imported 1 file/)).toBeVisible();
  });
});
