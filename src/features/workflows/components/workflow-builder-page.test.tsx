import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WorkflowBuilderPage } from "./workflow-builder-page";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }), useSearchParams: () => new URLSearchParams(search) }));

const api = vi.hoisted(() => ({ save: vi.fn(), plan: vi.fn(), rephrase: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/api", () => ({
  ApiError: class extends Error {},
  getLibrary: async () => ({ items: [{ id: "d1", name: "sales.csv", resource_type: "dataset", columns: [{ name: "region" }], preview_rows: [["N"]], row_count: 1 }] }),
  getModels: async () => ({ models: [{ id: "m" }], default_model_id: "m" }),
  getWorkflowRecord: async () => { throw new Error("none"); },
  saveWorkflowRecord: (body: unknown) => api.save(body),
  planWorkflowWithAi: (body: unknown) => api.plan(body),
  rephraseWorkflowPrompt: (body: unknown) => api.rephrase(body),
  buildWorkflowScripts: (body: unknown) => api.build(body),
}));

const wrap = () => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><WorkflowBuilderPage /></QueryClientProvider>);

describe("workflow builder", () => {
  beforeEach(() => { vi.clearAllMocks(); search = ""; });

  it("saves a prompt workflow as data, AI question and delivery on the chosen schedule", async () => {
    api.save.mockResolvedValue({ id: "w9" });
    const user = userEvent.setup();
    wrap();
    const save = await screen.findByRole("button", { name: "Save and turn on" });
    expect(save).toBeDisabled();
    expect(screen.getByRole("list", { name: "To finish" })).toHaveTextContent("Give the workflow a name.");
    await user.type(screen.getByRole("textbox", { name: "Workflow name" }), "Daily check");
    await user.type(screen.getByRole("textbox", { name: /What should it do each time/ }), "Which region is best?");
    await user.click(await screen.findByRole("checkbox", { name: /sales.csv/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "How often" }), "weekly");
    await user.click(save);
    expect(api.save).toHaveBeenCalledTimes(1);
    const body = api.save.mock.calls[0][0];
    expect(body).toMatchObject({ name: "Daily check", prompt: "Which region is best?", state: "active", trigger: { kind: "schedule", config: { frequency: "weekly", day: "Monday" } } });
    expect(body.steps.map((step: { kind: string }) => step.kind)).toEqual(["data", "ai", "notify"]);
    expect(body.steps[0].config.dataset_ids).toEqual(["d1"]);
    expect(push).toHaveBeenCalledWith("/workflows/w9");
  });

  it("turns a prompt into steps with the AI and shows them as a vertical flow", async () => {
    api.plan.mockResolvedValue({ name: "Revenue", description: "d", prompt: "Sharper prompt", steps: [
      { id: "s1", kind: "data", title: "Load", detail: "", config: { dataset_ids: ["d1"] } },
      { id: "s2", kind: "script", title: "Total it", detail: "Sum revenue", config: {} },
    ] });
    const user = userEvent.setup();
    wrap();
    await user.type(await screen.findByRole("textbox", { name: /What should it do each time/ }), "sum revenue daily");
    await user.click(screen.getByRole("button", { name: "Show it as steps" }));
    expect(await screen.findByRole("region", { name: "Step 2: Total it" })).toBeVisible();
    expect(screen.getByRole("tab", { name: /Build it/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("textbox", { name: "Workflow name" })).toHaveValue("Revenue");
    expect(api.plan).toHaveBeenCalledWith(expect.objectContaining({ prompt: "sum revenue daily", modelId: "m" }));
  });

  it("imports a template into the builder without creating anything", async () => {
    search = "template=threshold-alert";
    wrap();
    expect(await screen.findByRole("region", { name: "Step 3: Only if below target" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "Workflow name" })).toHaveValue("Alert when a number drops");
    expect(api.save).not.toHaveBeenCalled();
  });

  it("lets a step be added from the + menu, with what each type needs", async () => {
    search = "template=daily-sales-summary";
    const user = userEvent.setup();
    wrap();
    await user.click(await screen.findByRole("button", { name: "Add a step at the end" }));
    expect(screen.getByRole("menuitem", { name: /Only if/ })).toHaveTextContent("Needs: a test and a number");
    await user.click(screen.getByRole("menuitem", { name: /Only if/ }));
    expect(await screen.findByRole("region", { name: /Step 5: Only if/ })).toBeVisible();
  });
});
