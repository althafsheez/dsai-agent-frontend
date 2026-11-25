import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { CreateWorkflowDialog } from "./create-workflow-dialog";

const { save, push } = vi.hoisted(() => ({ save: vi.fn(), push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/api", () => ({ saveWorkflowRecord: save }));

it("creates a named draft and opens its editor", async () => {
  const user = userEvent.setup();
  save.mockImplementation(async (body) => ({ ...body, id: "new-id" }));
  render(<QueryClientProvider client={new QueryClient()}><CreateWorkflowDialog /></QueryClientProvider>);
  await user.click(screen.getByRole("button", { name: "New workflow" }));
  await user.type(screen.getByLabelText(/Workflow name/), "Stock report");
  await user.type(screen.getByLabelText(/Description/), "Track low stock");
  await user.click(screen.getByRole("button", { name: "Create workflow" }));
  await waitFor(() => expect(push).toHaveBeenCalledWith("/workflows/new-id/edit"));
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Stock report", description: "Track low stock", state: "draft", steps: [] }));
});
