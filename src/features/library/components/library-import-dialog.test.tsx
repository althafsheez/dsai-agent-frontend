import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LibraryImportDialog } from "./library-import-dialog";
import type { LibraryResource } from "@/lib/api";

const mockLibraryItems: LibraryResource[] = [
  {
    id: "ds-1",
    name: "Customer_Churn.csv",
    resource_type: "dataset",
    library_category: "dataset",
    library_created_at: "2026-11-09T00:00:00Z",
    scope_type: "workspace",
    size_bytes: 1048576,
    mime_type: "text/csv",
    created_at: "2026-11-09T00:00:00Z",
    created_by: "u-1",
    origin: "uploaded",
    preview_url: "/api/preview/ds-1",
    download_url: "/api/download/ds-1",
    saved: true,
    row_count: 100,
    column_count: 5,
    run_id: null,
  },
  {
    id: "art-1",
    name: "Q3_Summary.pdf",
    resource_type: "artifact",
    library_category: "report",
    library_created_at: "2026-11-09T00:00:00Z",
    kind: "pdf",
    size_bytes: 524288,
    mime_type: "application/pdf",
    created_at: "2026-11-09T00:00:00Z",
    created_by: "u-1",
    origin: "generated",
    preview_url: "/api/preview/art-1",
    download_url: "/api/download/art-1",
    saved: true,
    run_id: "run-1",
  },
];

vi.mock("@/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api")>();
  return {
    ...actual,
    getLibrary: vi.fn(async () => ({ items: mockLibraryItems })),
  };
});

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

describe("LibraryImportDialog", () => {
  it("renders library items and filters by category and search", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    const onClose = vi.fn();

    renderWithClient(
      <LibraryImportDialog open={true} onClose={onClose} onAttach={onAttach} />
    );

    expect(await screen.findByText("Customer_Churn.csv")).toBeInTheDocument();
    expect(screen.getByText("Q3_Summary.pdf")).toBeInTheDocument();

    // Filter by Reports category
    await user.click(screen.getByRole("tab", { name: "Reports" }));
    expect(screen.getByText("Q3_Summary.pdf")).toBeInTheDocument();
    expect(screen.queryByText("Customer_Churn.csv")).not.toBeInTheDocument();

    // Filter back to All
    await user.click(screen.getByRole("tab", { name: "All" }));
    expect(screen.getByText("Customer_Churn.csv")).toBeInTheDocument();

    // Search input
    const searchInput = screen.getByPlaceholderText("Search library...");
    await user.type(searchInput, "churn");
    expect(screen.getByText("Customer_Churn.csv")).toBeInTheDocument();
    expect(screen.queryByText("Q3_Summary.pdf")).not.toBeInTheDocument();
  });

  it("selects items and calls onAttach with selected assets", async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();
    const onClose = vi.fn();

    renderWithClient(
      <LibraryImportDialog open={true} onClose={onClose} onAttach={onAttach} />
    );

    const itemCheckbox = await screen.findByRole("checkbox", { name: /Customer_Churn\.csv/i });
    await user.click(itemCheckbox);

    const attachButton = screen.getByRole("button", { name: /Attach \(1\)/i });
    expect(attachButton).toBeEnabled();

    await user.click(attachButton);
    expect(onAttach).toHaveBeenCalledWith([mockLibraryItems[0]]);
    expect(onClose).toHaveBeenCalled();
  });
});
