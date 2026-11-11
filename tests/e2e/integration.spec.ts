import { expect, test } from "@playwright/test";

test("a persisted backend chat keeps the responsive context-panel mode", async ({ page, request, isMobile }) => {
  const content = `Persisted context test ${Date.now()}`;
  const createdResponse = await request.post("http://127.0.0.1:8000/api/chats", {
    headers: { "X-Demo-User-Id": "user-you" },
    data: {
      workspace_id: null,
      content,
      client_request_id: `playwright-context-${Date.now()}`,
    },
  });
  expect(createdResponse.ok()).toBe(true);
  const created = await createdResponse.json() as { chat: { id: string } };

  await page.goto(`/chat/${created.chat.id}`);
  await expect(page.getByRole("article").getByText(content)).toBeVisible();
  await expect(page.getByText("Live Gemini")).toHaveCount(1);

  await page.getByRole("button", { name: "Toggle context panel" }).click();
  await expect(page.getByRole("complementary", { name: "Analysis context" })).toBeVisible();
  await page.getByRole("button", { name: "Close context" }).click();
  await expect(page.getByRole("complementary", { name: "Analysis context" })).toHaveCount(0);

  if (isMobile) {
    await page.getByRole("button", { name: "Open navigation" }).click();
  }
  await page.getByRole("link", { name: "New Analysis" }).click();
  await expect(page.getByRole("heading", { name: "What would you like to understand?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
