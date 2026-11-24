import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewWorkflowPage, WorkflowEditPage } from "./workflow-edit-page";

const { get, save, plan, run, pause, build, replace, generateAction, testAction, applyAction } = vi.hoisted(() => ({
  get: vi.fn(), save: vi.fn(), plan: vi.fn(), run: vi.fn(), pause: vi.fn(), build: vi.fn(), replace: vi.fn(),
  generateAction: vi.fn(), testAction: vi.fn(), applyAction: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }) }));
vi.mock("@/lib/api", () => ({
  getWorkflowRecord: get,
  saveWorkflowRecord: save,
  planWorkflowWithAi: plan,
  testWorkflow: run,
  setWorkflowRecordState: pause,
  buildWorkflowScripts: build,
  generateWorkflowAction: generateAction,
  testWorkflowAction: testAction,
  applyWorkflowAction: applyAction,
  getWorkflowRunRecord: async (id: string) => ({ id, trigger: "test", status: "success", results: [] }),
  listWorkflowRunRecords: async () => [],
  cancelWorkflowRunRecord: vi.fn(),
  getLibrary: async () => ({ items: [{ id: "sales", resource_type: "dataset", name: "sales.csv", columns: [{ name: "revenue", data_type: "number" }], preview_rows: [[45]], row_count: 1 }] }),
  getPostgresConnections: async () => ({ items: [{ id: "postgres-1", name: "Northwind Test", database: "northwind", status: "connected" }] }),
  getConnectors: async () => ({ items: [] }),
  getModels: async () => ({ models: [{ id: "m" }], default_model_id: "m" }),
}));

const workflow = {
  id: "w1", name: "Daily sales summary", description: "", prompt: "", state: "draft",
  trigger: { kind: "manual" },
  steps: [{ id: "s1", kind: "notify", title: "Send report", detail: "", config: { recipient: "me" } }],
};

function renderEditor(editor: ReactNode = <WorkflowEditPage workflowId={workflow.id} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{editor}</QueryClientProvider>);
}

describe("saved workflow editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    get.mockResolvedValue(workflow);
    save.mockImplementation(async (body) => body);
  });

  it("creates a workflow from the blank canvas and navigates to its saved editor", async () => {
    const user = userEvent.setup();
    save.mockImplementation(async (body) => ({ ...body, id: "new-workflow" }));
    renderEditor(<NewWorkflowPage />);

    expect(screen.getByRole("heading", { name: "New workflow" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Workflow name" }), "Weekly report");
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: /^Output/ }));
    await user.selectOptions(screen.getByRole("combobox", { name: "Destination" }), "library");
    expect(screen.queryByRole("textbox", { name: "In-app recipient" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a step at the end" }));
    await user.type(screen.getByRole("searchbox", { name: "Search step types" }), "comparison");
    await user.click(screen.getByRole("button", { name: /^Logic/ }));
    await user.click(screen.getByRole("button", { name: "Delete step: Only if" }));
    expect(screen.queryByRole("button", { name: "Delete step: Only if" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByRole("button", { name: "Delete step: Only if" })).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Redo" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save.mock.calls[0][0]).toMatchObject({
      name: "Weekly report", state: "draft", steps: [{ kind: "notify", config: { destination: "library" } }],
    });
    expect(save.mock.calls[0][0].id).toBeUndefined();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/workflows/new-workflow/edit"));
  });

  it("loads a template as an unsaved draft in the canvas", () => {
    renderEditor(<NewWorkflowPage templateId="daily-sales-summary" />);
    expect(screen.getByRole("heading", { name: "Daily sales summary" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Add a step before step 1" })).toBeVisible();
    expect(get).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("can test an unnamed draft with an AI step", async () => {
    const user = userEvent.setup();
    save.mockImplementation(async (body) => ({ ...body, id: "test-workflow" }));
    run.mockResolvedValue({ id: "test-run" });
    renderEditor(<NewWorkflowPage />);
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: /^AI step Execute/ }));
    await user.type(screen.getByRole("textbox", { name: "Instructions" }), "Summarize the workflow.");
    await user.click(screen.getByRole("button", { name: "Test run" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/workflows/test-workflow/runs/test-run"));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ name: "Untitled workflow", state: "draft" }));
    expect(run).toHaveBeenCalledWith("test-workflow", [expect.objectContaining({ kind: "ai" })]);
  });

  it("tests a selected AI step with its preceding steps and skips later steps", async () => {
    const user = userEvent.setup();
    const aiStep = { id: "analysis", kind: "ai", title: "Analyze stock", detail: "Find low stock." };
    const preceding = { ...workflow.steps[0], id: "before" };
    get.mockResolvedValue({ ...workflow, steps: [preceding, aiStep, workflow.steps[0]] });
    run.mockResolvedValue({ id: "ai-test" });
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "AI step Analyze stock" }));
    await user.click(screen.getByRole("button", { name: "Test AI step" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("w1", [preceding, aiStep]));
  });

  it("shows three trigger choices before adding a trigger and opens type-specific settings", async () => {
    const user = userEvent.setup();
    renderEditor(<NewWorkflowPage />);
    await user.click(screen.getByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: /^Trigger Choose/ }));
    expect(screen.getByRole("heading", { name: "Choose a trigger" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete trigger" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Webhook/ }));
    expect(screen.getByRole("heading", { name: "Webhook trigger" })).toBeVisible();
    expect(screen.getByText(/Webhook execution is coming soon/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Delete trigger" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Trigger types" }));
    await user.type(screen.getByRole("searchbox", { name: "Search triggers" }), "schedule");
    expect(screen.queryByRole("button", { name: /^Manual/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Schedule/ }));
    expect(screen.getByRole("heading", { name: "Schedule trigger" })).toBeVisible();
    await user.selectOptions(screen.getByRole("combobox", { name: "How often" }), "weekly");
    expect(screen.getByRole("combobox", { name: "Day of the week" })).toBeVisible();
    expect(screen.getByRole("button", { name: /^Trigger Every Monday/ })).toBeVisible();

    await user.click(screen.getByRole("button", { name: "Trigger types" }));
    await user.click(screen.getByRole("button", { name: /^Manual/ }));
    expect(screen.getByRole("heading", { name: "Manual trigger" })).toBeVisible();
    expect(screen.queryByRole("combobox", { name: "How often" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Trigger Runs when you start it" })).toBeVisible();
  });

  it("removes the trigger and saves an unconfigured Custom step as a draft", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ ...workflow, trigger: { kind: "schedule", config: { frequency: "daily", time: "09:00" } } });
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Delete trigger" }));
    expect(screen.queryByRole("button", { name: "Delete trigger" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Add a step at the end" }));
    await user.click(screen.getByRole("button", { name: /^Custom step/ }));
    expect(screen.getByRole("textbox", { name: "What should this step do?" })).toHaveValue("");
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      trigger: { kind: "manual", config: { show_on_canvas: false } },
      steps: [expect.objectContaining({ id: "s1" }), expect.objectContaining({ kind: "script", detail: "" })],
    }));
  });

  it("adds Human Review from the canvas and saves its instructions in the draft", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Add a step at the end" }));
    await user.type(screen.getByRole("searchbox", { name: "Search step types" }), "approval");
    await user.click(screen.getByRole("button", { name: /^Human Review/ }));
    await user.type(screen.getByRole("textbox", { name: "Review instructions" }), "Verify the reported totals.");
    expect(screen.getByRole("button", { name: /^Human Review Human Review/ })).toBeVisible();
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Test run" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Human Review steps can only be saved as drafts");
    expect(run).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({
      steps: [expect.objectContaining({ id: "s1" }), expect.objectContaining({ kind: "human", detail: "Verify the reported totals." })],
    }));
  });

  it("adds a saved connection directly and opens configuration for catalog entries", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: /^Extension Select/ }));
    expect(screen.getByRole("heading", { name: "Extension" })).toBeVisible();
    expect(screen.queryByText("Library datasets")).not.toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Select Northwind Test" }));
    expect(screen.getByRole("heading", { name: "Action" })).toBeVisible();
    await user.type(screen.getByRole("textbox", { name: "Action instructions" }), "Calculate monthly revenue.");
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Northwind Test selected" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Back to action" }));
    expect(screen.getByRole("textbox", { name: "Action instructions" })).toHaveValue("Calculate monthly revenue.");
    expect(screen.getByRole("button", { name: "Activate" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save.mock.calls[0][0].steps[1]).toMatchObject({
      detail: "Calculate monthly revenue.",
      config: { connection_id: "postgres-1", connection_provider: "postgresql" },
    });

    await user.click(screen.getByRole("button", { name: "Remove saved connection" }));
    await user.click(screen.getByRole("button", { name: "Add new connection" }));
    expect(screen.getByRole("button", { name: "Databases" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText("Library datasets")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "MySQL" }));
    expect(screen.getByRole("button", { name: "Configure" })).toBeDisabled();
  });

  it("generates, tests and saves a PostgreSQL action, then invalidates it when the SQL changes", async () => {
    const user = userEvent.setup();
    const action = {
      provider: "postgresql", connection_id: "postgres-1", operation: "query",
      instructions: "Show stock", arguments: { sql: "SELECT 10 AS stock", bindings: [], limit: 10 },
      output: "table", validation: "valid", test_status: "untested", summary: "Show available stock.",
    };
    let finishGeneration!: () => void;
    generateAction.mockReturnValueOnce(new Promise((resolve) => {
      finishGeneration = () => resolve({ status: "supported", action });
    }));
    testAction.mockResolvedValue({
      status: "passed", receipt: "test-proof", duration_ms: 25, logs: ["Read 1 row"],
      result: { kind: "query_table", columns: ["stock"], column_types: ["integer"], rows: [[10]], row_count: 1, duration_ms: 25 },
    });
    applyAction.mockResolvedValue({ ...action, test_status: "passed" });
    const editor = renderEditor();
    await user.click(await screen.findByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: /^Extension Select/ }));
    await user.click(await screen.findByRole("button", { name: "Select Northwind Test" }));
    await user.type(screen.getByRole("textbox", { name: "Action instructions" }), action.instructions);
    await user.click(screen.getByRole("button", { name: "Generate action" }));
    expect(screen.getByRole("status")).toHaveTextContent("Preparing and validating SQL");
    expect(screen.getByTitle("Elapsed time")).toHaveTextContent(/\d+s/);
    finishGeneration();
    await user.click(await screen.findByRole("button", { name: "Test action" }));
    expect(await screen.findByText("1 rows returned · 25 ms")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Apply action" }));
    expect(await screen.findByText("Applied action")).toBeVisible();
    expect(screen.getByRole("button", { name: "Test run" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(save.mock.calls[0][0].steps[1].config.action).toMatchObject({ ...action, test_status: "passed" });
    expect(applyAction).toHaveBeenCalledWith(action, "test-proof");
    await user.click(screen.getByText("View execution logic"));
    await user.type(screen.getByRole("textbox", { name: "SQL" }), " LIMIT 1");
    await user.click(screen.getByRole("button", { name: "Test run" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Generate and apply a PostgreSQL action");
    expect(run).not.toHaveBeenCalled();
    expect(screen.queryByText("Test passed")).not.toBeInTheDocument();

    get.mockResolvedValue({ ...workflow, ...save.mock.calls[0][0] });
    editor.unmount();
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Extension Extension" }));
    expect(screen.getByText("Applied action")).toBeVisible();
    expect(screen.getByText("Test passed")).toBeVisible();
    expect(generateAction).toHaveBeenCalledTimes(1);
  });

  it("tests edited steps without saving over an active workflow", async () => {
    const user = userEvent.setup();
    get.mockResolvedValue({ ...workflow, state: "active" });
    run.mockResolvedValue({ id: "r1" });
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Output Send report" }));
    await user.clear(screen.getByRole("textbox", { name: "Step name" }));
    await user.type(screen.getByRole("textbox", { name: "Step name" }), "Draft output");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Test run" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith("w1", [expect.objectContaining({ title: "Draft output" })]));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Logs" })).toBeVisible();
  });

  it("builds one Custom step using its selected dataset", async () => {
    const user = userEvent.setup();
    build.mockImplementation(async ({ steps }) => ({
      steps: steps.map((step: { config: object; detail: string }) => ({ ...step, config: { ...step.config, script: "result = {}", script_for: step.detail } })),
      notes: [],
    }));
    renderEditor();
    await user.click(await screen.findByRole("button", { name: "Add step" }));
    await user.click(screen.getByRole("button", { name: /^Custom step/ }));
    await user.type(screen.getByRole("textbox", { name: "What should this step do?" }), "Total revenue");
    await user.click(screen.getByRole("button", { name: "Attach Library datasets" }));
    await user.click(await screen.findByRole("checkbox", { name: /sales.csv/ }));
    await user.click(screen.getByRole("button", { name: "Build step" }));
    await screen.findByText("Generated Python");
    expect(build.mock.calls[0][0]).toMatchObject({
      datasetIds: ["sales"], steps: [{ kind: "script", detail: "Total revenue" }],
    });
    expect(screen.queryByRole("button", { name: "Parameters" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resources" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Resources" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Workflow settings" }));
    await user.click(screen.getByText("Datasets", { exact: true }));
    await user.click(screen.getByRole("button", { name: "Preview" }));
    expect(screen.getByRole("dialog", { name: "sales.csv" })).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps proposed changes out of the canvas until applied", async () => {
    const user = userEvent.setup();
    plan.mockResolvedValue({ description: "", prompt: "Notify the team", steps: [
      { id: "s2", kind: "notify", title: "Notify the team", detail: "", config: { recipient: "team" } },
    ] });
    renderEditor();
    await user.click(await screen.findByRole("tab", { name: "AI Assistant" }));
    await user.type(screen.getByRole("textbox", { name: "Ask AI to modify the workflow" }), "Notify the team instead");
    await user.click(screen.getByRole("button", { name: "Propose changes" }));
    await screen.findByRole("heading", { name: "Proposed changes" });
    expect(screen.getByRole("button", { name: /^Output Send report$/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /^Output Notify the team$/ })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Apply changes" }));
    expect(screen.getByRole("button", { name: /^Output Notify the team$/ })).toBeVisible();
    expect(save).not.toHaveBeenCalled();
  });
});
