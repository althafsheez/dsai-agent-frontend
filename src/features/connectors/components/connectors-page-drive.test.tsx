import { beforeEach, describe, expect, it, vi } from "vitest";
import { render as rtlRender, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { ExtensionsPage } from "./connectors-page";

const api = vi.hoisted(() => ({
  getConnectors: vi.fn(),
  getPostgresConnections: vi.fn(async () => ({ items: [] })),
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

describe("extensions page", () => {
  it("shows Google Drive as not configured when the server has no credentials", async () => {
    const user = userEvent.setup();
    api.getConnectors.mockResolvedValue(status("unavailable"));
    render(<ExtensionsPage />);
    await user.click(screen.getByRole("tab", { name: "Apps" }));
    expect(await screen.findByText(/Google Drive is not configured/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Add Google Drive" })).toBeDisabled();
  });

  it("starts Google sign-in for Drive instead of toggling demo state", async () => {
    const user = userEvent.setup();
    api.startGoogleDriveAuth.mockRejectedValue(new Error("boom"));
    render(<ExtensionsPage />);
    await user.click(screen.getByRole("tab", { name: "Apps" }));
    await user.click(await screen.findByRole("button", { name: "Add Google Drive" }));
    expect(api.startGoogleDriveAuth).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Add Google Drive" })).toBeVisible();
  });

  it("shows the connected account and disconnects through the backend", async () => {
    const user = userEvent.setup();
    api.getConnectors.mockResolvedValue(status("connected", "analyst@example.com"));
    api.disconnectGoogleDrive.mockResolvedValue(undefined);
    render(<ExtensionsPage />);
    await user.click(await screen.findByRole("button", { name: "Manage Google Drive" }));
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
    render(<ExtensionsPage />);
    await user.click(await screen.findByRole("button", { name: "Manage Google Drive" }));
    await user.click(screen.getByRole("button", { name: "Import files" }));
    expect(await screen.findByRole("checkbox", { name: "Select setup.exe" })).toBeDisabled();
    await user.click(await screen.findByRole("checkbox", { name: "Select sales.csv" }));
    await user.click(screen.getByRole("button", { name: "Import 1" }));
    expect(api.importDriveFiles).toHaveBeenCalledWith({ fileIds: ["f1"], scopeType: "workspace", scopeId: "w1" });
    expect(await screen.findByText(/Imported 1 file/)).toBeVisible();
  });
});
