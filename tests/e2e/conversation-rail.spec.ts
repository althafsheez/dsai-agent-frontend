import { expect, test } from "@playwright/test";
import type { MessageDto } from "../../src/lib/api/types";

for (const scrollAway of [false, true]) {
test(`rail follows Send through persistence and streaming (scroll away: ${scrollAway})`, async ({ page, isMobile }) => {
  test.skip(isMobile, "The marker rail is a desktop control");
  const chatId = "rail-regression";
  const timestamp = "2026-11-17T00:00:00Z";
  const message = (id: string, role: "user" | "assistant", content: string): MessageDto => ({
    id, chat_id: chatId, role, content, kind: "normal", status: "completed",
    created_at: timestamp, updated_at: timestamp, attachment_refs: [],
  });
  const messages = Array.from({ length: 30 }, (_, index) => [
    message(`q-${index}`, "user", `Question ${index}`),
    message(`a-${index}`, "assistant", ("A completed answer with enough height to scroll.\n\n").repeat(5)),
  ]).flat();
  let messageReads = 0;
  let releaseCreate!: () => void;
  const pendingCreate = new Promise<void>((resolve) => { releaseCreate = resolve; });
  let releaseStream!: () => void;
  const pendingStream = new Promise<void>((resolve) => { releaseStream = resolve; });
  // Explicit network fixtures: exercise real browser layout without Gemini.
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api(?:\/backend)?/, "");
    if (path === "/models") return route.fulfill({ json: {
      default_model_id: "test-model", models: [{ id: "test-model", label: "Test model", supported_efforts: ["low"], default_effort: "low" }],
    } });
    if (path === `/chats/${chatId}`) return route.fulfill({ json: {
      id: chatId, title: "Rail regression fixture", workspace_id: null,
      created_by: "user-you", created_at: timestamp, updated_at: timestamp,
    } });
    if (path === `/chats/${chatId}/messages`) {
      if (route.request().method() === "POST") {
        await pendingCreate;
        const sent = message("new-question", "user", route.request().postDataJSON().content);
        messages.push(sent);
        return route.fulfill({ status: 201, json: sent });
      }
      messageReads++;
      return route.fulfill({ json: { items: messages, next_cursor: null } });
    }
    if (path === `/chats/${chatId}/messages/stream`) {
      await pendingStream;
      const content = "A streamed answer.\n\n".repeat(80);
      messages.push(message("new-answer", "assistant", content));
      const events = [
        ["message.delta", { text: content }],
        ["message.completed", { content }],
        ["agent.completed", {}],
      ];
      return route.fulfill({ contentType: "text/event-stream", body: events.map(([type, data], sequence) =>
        `event: ${type}\ndata: ${JSON.stringify({ event_id: `e-${sequence}`, run_id: "test-run", type, data, sequence, timestamp })}\n\n`,
      ).join("") });
    }
    return route.fulfill({ json: { items: [], next_cursor: null } });
  });

  await page.goto(`/chat/${chatId}`);
  const rail = page.getByRole("navigation", { name: "Conversation sections" });
  const viewport = page.getByLabel("Conversation messages", { exact: true });
  const active = rail.locator('[aria-current="location"]');
  await expect(active).toHaveAccessibleName("Go to question: Question 29");
  await page.getByRole("combobox", { name: "Ask anything about your data" }).fill("Newest question");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(active).toHaveAccessibleName("Go to question: Newest question");
  const bottomGap = () => viewport.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
  await expect.poll(bottomGap).toBeLessThanOrEqual(2);
  releaseCreate();
  await expect(page.locator("#message-new-question")).toBeVisible();
  // Allow real observer callbacks and the query refresh to run while the
  // assistant is waiting: these previously restored the preceding marker.
  await expect.poll(() => viewport.locator("article").count()).toBe(62);
  const previousReads = messageReads;
  await expect.poll(() => messageReads).toBeGreaterThan(previousReads);
  await expect(active).toHaveAccessibleName("Go to question: Newest question");
  await expect.poll(bottomGap).toBeLessThanOrEqual(2);

  // The independent rail can reach its first pill without moving the chat.
  const railViewport = rail.locator(":scope > div").first();
  const chatTop = await viewport.evaluate((element) => element.scrollTop);
  await railViewport.evaluate((element) => { element.scrollTop = 0; });
  await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(chatTop);
  if (scrollAway) {
    await rail.getByRole("button", { name: "Go to question: Question 0", exact: true }).click();
    await expect(active).toHaveAccessibleName("Go to question: Question 0");
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);
  }
  releaseStream();
  await expect(page.getByRole("combobox", { name: "Model", exact: true })).toBeEnabled();
  if (scrollAway) {
    await expect(active).toHaveAccessibleName("Go to question: Question 0");
    await expect.poll(() => viewport.evaluate((element) => element.scrollTop)).toBe(0);
  } else {
    await expect(active).toHaveAccessibleName("Go to question: Newest question");
    await expect.poll(bottomGap).toBeLessThanOrEqual(2);
  }
  await viewport.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(active).toHaveAccessibleName("Go to question: Newest question");
  const pillBounds = await active.boundingBox();
  const railBounds = await railViewport.boundingBox();
  expect(pillBounds!.y).toBeGreaterThanOrEqual(railBounds!.y);
  expect(pillBounds!.y + pillBounds!.height).toBeLessThanOrEqual(railBounds!.y + railBounds!.height);
});
}
