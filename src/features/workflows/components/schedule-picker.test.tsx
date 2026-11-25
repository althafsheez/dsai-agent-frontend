import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { WorkflowTriggerDto } from "@/lib/api";
import { SchedulePicker } from "./schedule-picker";

function Editor() {
  const [trigger, setTrigger] = useState<WorkflowTriggerDto>({ kind: "schedule", config: { frequency: "daily" } });
  return <SchedulePicker trigger={trigger} onChange={setTrigger} />;
}

describe("schedule rules", () => {
  it("offers interval fields for a single rule", async () => {
    const user = userEvent.setup();
    render(<Editor />);
    await user.selectOptions(screen.getByLabelText("Trigger Interval"), "weeks");
    expect(screen.getByText("Trigger on Weekdays")).toBeVisible();
    expect(screen.getByLabelText("Trigger at Hour")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add Rule" })).not.toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Trigger Interval"), "months");
    expect(screen.getByLabelText("Trigger at Day of Month")).toBeVisible();
  });
});
