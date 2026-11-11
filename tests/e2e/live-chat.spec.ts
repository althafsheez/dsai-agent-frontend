import { expect, test } from "@playwright/test";

test("real Gemini streams an initial response, follow-up, and restores persisted messages", async ({ page }) => {
  test.skip(process.env.DSAI_LIVE_GEMINI !== "1", "Set DSAI_LIVE_GEMINI=1 for the credential-backed flow");
  test.setTimeout(120_000);
  const streamBodies: Array<Record<string, unknown>> = [];
  page.on("request", (request) => {
    if (request.url().endsWith("/messages/stream") && request.postDataJSON()) {
      streamBodies.push(request.postDataJSON() as Record<string, unknown>);
    }
  });

  await page.goto("/");
  const modelButton = page.getByRole("button", { name: /^Model:/ });
  await expect(modelButton).toBeEnabled({ timeout: 30_000 });
  await page.getByRole("button", { name: /^Reasoning effort:/ }).click();
  const highEffort = page.getByRole("menuitemradio", { name: "High" });
  if (await highEffort.isVisible()) await highEffort.click();

  await page.getByRole("textbox", { name: "Analysis question" }).fill("Reply briefly with BROWSER STREAM OK.");
  await page.getByRole("button", { name: "Send analysis" }).click();
  await expect(page).toHaveURL(/\/chat\//, { timeout: 30_000 });
  await expect.poll(() => streamBodies.length, { timeout: 60_000 }).toBe(1);
  await expect(page.locator("article").filter({ hasText: /BROWSER STREAM OK/i })).toHaveCount(2, { timeout: 60_000 });
  await expect(page.getByRole("textbox", { name: "Ask anything about your data" })).toBeEnabled({ timeout: 60_000 });
  expect(streamBodies[0]).toMatchObject({ effort: "high" });
  expect(streamBodies[0].model_id).toBeTruthy();

  await page.getByRole("textbox", { name: "Ask anything about your data" }).fill("Reply briefly with FOLLOW-UP BROWSER OK.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => streamBodies.length, { timeout: 60_000 }).toBe(2);
  await expect(page.locator("article").filter({ hasText: /FOLLOW-UP BROWSER OK/i })).toHaveCount(2, { timeout: 60_000 });
  expect(streamBodies).toHaveLength(2);
  expect(streamBodies[1]).toMatchObject({
    model_id: streamBodies[0].model_id,
    effort: "high",
  });

  await page.reload();
  await expect(page.locator("article").filter({ hasText: /BROWSER STREAM OK/i })).toHaveCount(2);
  await expect(page.locator("article").filter({ hasText: /FOLLOW-UP BROWSER OK/i })).toHaveCount(2);
});
