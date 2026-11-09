import { expect, test } from "@playwright/test";

test("welcome draft and sidebar navigation", async ({ page, isMobile }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "What would you like to understand?" })).toBeVisible();
  await page.getByRole("button", { name: "Explore trends" }).click();
  await expect(page.getByRole("textbox", { name: "Analysis question" })).toHaveValue("Help me explore trends in my data.");
  if (isMobile) await page.getByRole("button", { name: "Open navigation" }).click();
  else {
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await page.getByRole("button", { name: "Expand sidebar" }).click();
  }
  await page.getByRole("link", { name: "Workspaces", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Workspaces", exact: true })).toBeVisible();
  if (isMobile) await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
test("search navigates to a placeholder", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Search pages" }).filter({ visible: true }).click();
  await page.getByRole("textbox", { name: "Search pages" }).fill("Library");
  await page.getByRole("link", { name: /Library Open library/ }).click();
  await expect(page.getByRole("heading", { name: "Library", exact: true })).toBeVisible();
});

