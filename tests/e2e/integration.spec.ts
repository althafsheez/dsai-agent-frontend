import { expect, test } from "@playwright/test";

test("history opens chat and message files use the single right-panel mode", async ({ page, isMobile }) => {
  await page.goto("/history");
  await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
  await page.getByRole("link", { name: "Revenue Analysis" }).click();
  await expect(page).toHaveURL(/\/chat\/revenue-analysis$/);
  await expect(page.getByText("Revenue growth analysis")).toBeVisible();

  await page.getByRole("button", { name: "Toggle context panel" }).click();
  await expect(page.getByRole("complementary", { name: "Analysis context" })).toBeVisible();
  await expect(page.getByText("Workspace Datasets")).toBeVisible();

  await page.getByRole("button", { name: "Close context" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("complementary", { name: "Preview regional_growth_summary.csv" })).toBeVisible();
  await page.getByRole("button", { name: "Back to context" }).click();
  await expect(page.getByRole("complementary", { name: "Analysis context" })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Close context" }).click();
    await page.getByRole("button", { name: "Open navigation" }).click();
    await page.getByRole("link", { name: "New Analysis" }).click();
  } else {
    await page.getByRole("link", { name: "New Analysis" }).click();
  }
  await expect(page.getByRole("heading", { name: "What would you like to understand?" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
