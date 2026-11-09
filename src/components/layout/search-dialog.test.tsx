import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { SearchDialog } from "./search-dialog";

describe("navigation search", () => {
  it("opens an accessible dialog, filters routes and closes with Escape", async () => {
    const user = userEvent.setup();
    render(<SearchDialog />);
    await user.click(screen.getByRole("button", { name: "Search pages" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Search your workspace");
    await user.type(screen.getByRole("textbox", { name: "Search pages" }), "Library");
    expect(screen.getByRole("link", { name: /Library/ })).toHaveAttribute("href", "/library");
    expect(screen.queryByRole("link", { name: /Workspaces/ })).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

