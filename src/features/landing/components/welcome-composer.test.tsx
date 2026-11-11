import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WelcomeComposer } from "./welcome-composer";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const models = {
  default_model_id: "gemini-fast",
  configuration_status: "ready",
  models: [
    { id: "gemini-fast", label: "Gemini Fast", supported_efforts: ["low", "medium"], default_effort: "medium" },
    { id: "gemini-pro", label: "Gemini Pro", supported_efforts: ["low", "high"], default_effort: "high" },
  ],
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function renderComposer() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WelcomeComposer />
    </QueryClientProvider>,
  );
}

describe("welcome composer", () => {
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/models")) return json(models);
    if (url.endsWith("/workspaces")) return json({
      items: [{ id: "workspace-revenue", name: "Revenue Planning", description: null, created_by: "user-you", created_at: "2026-11-09T00:00:00Z", updated_at: "2026-11-09T00:00:00Z", archived_at: null, deleted_at: null }],
      next_cursor: null,
    });
    if (url.endsWith("/chats") && init?.method === "POST") return json({
      chat: { id: "chat-real", title: "Compare quarterly revenue", title_source: "fallback", workspace_id: "workspace-revenue", created_by: "user-you", created_at: "2026-11-09T00:00:00Z", updated_at: "2026-11-09T00:00:00Z", archived_at: null, deleted_at: null, first_run_at: null },
      message: { id: "message-real", chat_id: "chat-real", role: "user", kind: "normal", content: "Compare quarterly revenue", status: "completed", created_at: "2026-11-09T00:00:00Z", updated_at: "2026-11-09T00:00:00Z", attachment_refs: [] },
    }, 201);
    throw new Error(`Unexpected request: ${url}`);
  });

  beforeEach(() => {
    push.mockReset();
    fetchMock.mockClear();
    window.localStorage.clear();
    window.sessionStorage.clear();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `request-${Math.random()}`) });
  });

  it("populates and focuses the draft from each suggested prompt", async () => {
    const user = userEvent.setup();
    renderComposer();
    const input = screen.getByRole("textbox", { name: "Analysis question" });

    await user.click(screen.getByRole("button", { name: "Explore trends" }));
    expect(input).toHaveValue("Help me explore trends in my data.");
    expect(input).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Find what changed" }));
    expect(input).toHaveValue("What changed in my data, and what might explain it?");
  });

  it("keeps attachment previews but blocks unsupported upload-on-send", async () => {
    const user = userEvent.setup();
    renderComposer();
    const csv = new File(["a,b"], "sales.csv", { type: "text/csv" });
    const pdf = new File(["report"], "summary.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("Upload files"), [csv, pdf]);
    const previews = screen.getByLabelText("Selected attachments");
    expect(within(previews).getByText("sales.csv")).toBeVisible();
    expect(within(previews).getByText("summary.pdf")).toBeVisible();
    expect(screen.getByText(/File upload is not connected yet/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove sales.csv" }));
    expect(screen.queryByText("sales.csv")).not.toBeInTheDocument();
  });

  it("creates a backend chat and carries the selected model and effort into the pending run", async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole("button", { name: "Model: Gemini Fast" });

    await user.type(screen.getByRole("textbox", { name: "Analysis question" }), "Compare quarterly revenue");
    await user.click(screen.getByRole("button", { name: "Workspace: Standalone" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Revenue Planning" }));
    await user.click(screen.getByRole("button", { name: "Model: Gemini Fast" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Gemini Pro" }));
    await user.click(screen.getByRole("button", { name: "Reasoning effort: High" }));
    await user.click(screen.getByRole("menuitemradio", { name: "Low" }));
    await user.click(screen.getByRole("button", { name: "Send analysis" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/chat/chat-real"));
    const createCall = fetchMock.mock.calls.find(([url, init]) => String(url).endsWith("/chats") && init?.method === "POST");
    expect(JSON.parse(String(createCall?.[1]?.body))).toMatchObject({
      workspace_id: "workspace-revenue",
      content: "Compare quarterly revenue",
    });
    const pending = JSON.parse(String(window.sessionStorage.getItem("dsai:pending-run:chat-real")));
    expect(pending).toMatchObject({
      userMessageId: "message-real",
      modelId: "gemini-pro",
      effort: "low",
    });
  });

  it("sends with Enter while Shift+Enter keeps composing", async () => {
    const user = userEvent.setup();
    renderComposer();
    await screen.findByRole("button", { name: "Model: Gemini Fast" });
    const input = screen.getByRole("textbox", { name: "Analysis question" });
    await user.type(input, "Line one{Shift>}{Enter}{/Shift}Line two");
    expect(input).toHaveValue("Line one\nLine two");
    expect(push).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(push).toHaveBeenCalledOnce());
  });
});
