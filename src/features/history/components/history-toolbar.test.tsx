import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { HistoryFilters } from "../types";
import { HistoryToolbar } from "./history-toolbar";

const defaults: HistoryFilters = { ownership: "owned", status: "active", search: "", time: "any", authorId: "all", workspaceId: "all", sort: "updated_desc" };

function ToolbarHarness() {
  const [filters, setFilters] = useState(defaults);
  return <><HistoryToolbar filters={filters} options={{ authors: [{ id: "user-anita", name: "Anita" }], workspaces: [{ id: "research", name: "Research" }] }} onChange={(patch) => setFilters((value) => ({ ...value, ...patch }))} /><output>{JSON.stringify(filters)}</output></>;
}

describe("HistoryToolbar", () => {
  it("updates search, segmented controls, filters and sort", async () => {
    const user = userEvent.setup();
    render(<ToolbarHarness />);
    await user.type(screen.getByPlaceholderText("Search chats..."), "sales");
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.click(screen.getByRole("button", { name: "Archived" }));
    await user.click(screen.getByRole("button", { name: "Filters" }));
    await user.selectOptions(screen.getByLabelText("Time"), "week");
    await user.selectOptions(screen.getByLabelText("Author"), "user-anita");
    await user.selectOptions(screen.getByLabelText("Workspace"), "research");
    await user.selectOptions(screen.getByLabelText("Sort history"), "name_asc");
    expect(screen.getByRole("status")).toHaveTextContent('"search":"sales"');
    expect(screen.getByRole("status")).toHaveTextContent('"ownership":"all"');
    expect(screen.getByRole("status")).toHaveTextContent('"status":"archived"');
    expect(screen.getByRole("status")).toHaveTextContent('"time":"week"');
    expect(screen.getByRole("status")).toHaveTextContent('"authorId":"user-anita"');
    expect(screen.getByRole("status")).toHaveTextContent('"workspaceId":"research"');
    expect(screen.getByRole("status")).toHaveTextContent('"sort":"name_asc"');
  });
});
