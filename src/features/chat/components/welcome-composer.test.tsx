import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { WelcomeComposer } from "./welcome-composer";

describe("welcome composer", () => {
  it("populates and focuses the draft when a suggested question is selected", async () => {
    const user = userEvent.setup();
    render(<WelcomeComposer />);
    await user.click(screen.getByRole("button", { name: "Explore trends" }));
    expect(screen.getByRole("textbox", { name: "Analysis question" })).toHaveValue("Help me explore trends in my data.");
    expect(screen.getByRole("textbox")).toHaveFocus();
  });
  it("keeps typed text local and does not imply a working agent", async () => {
    const user = userEvent.setup();
    render(<WelcomeComposer />);
    await user.type(screen.getByRole("textbox"), "Compare these datasets");
    expect(screen.getByRole("textbox")).toHaveValue("Compare these datasets");
    expect(screen.getByRole("button", { name: "Send analysis (agent not connected)" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Model selection requires backend connection" })).toBeDisabled();
  });
});

