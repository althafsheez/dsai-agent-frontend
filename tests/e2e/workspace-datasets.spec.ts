import { expect, test } from "@playwright/test";

test("workspace dataset details keep their size and files download individually or together", async ({ page, isMobile }) => {
  const dataset = {
    id: "iris", name: "iris.csv", size_bytes: 4000, row_count: 150,
    columns: Array.from({ length: 60 }, (_, i) => ({ name: `column_${i}`, data_type: "string" })),
    download_url: "/api/resources/iris/download",
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/download")) {
      expect(route.request().headers()["x-demo-user-id"]).toBe("user-you");
      return route.fulfill({ body: "download fixture" });
    }
    if (path.endsWith("/workspaces/example")) return route.fulfill({ json: { id: "example", name: "Research" } });
    return route.fulfill({ json: { items: path.endsWith("/datasets") ? [dataset] : [], next_cursor: null } });
  });
  await page.goto("/workspaces/example");
  await page.getByRole("tab", { name: /Datasets/ }).click();
  const details = page.getByRole("complementary", { name: "Dataset details" });
  const layout = await details.evaluate((pane) => {
    const panel = pane.parentElement!;
    const list = pane.previousElementSibling!.getBoundingClientRect();
    const detail = pane.getBoundingClientRect();
    return {
      height: panel.getBoundingClientRect().height,
      detailShare: detail.width / panel.clientWidth,
      gap: list.top === detail.top ? detail.left - list.right : detail.top - list.bottom,
    };
  });
  expect(layout).toMatchObject({ height: 520, gap: 0 });
  expect(layout.detailShare).toBeCloseTo(isMobile ? 1 : 0.46, 2);
  const height = await details.evaluate((el) => el.clientHeight);
  const fileDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download iris.csv" }).click();
  expect((await fileDownload).suggestedFilename()).toBe("iris.csv");
  await page.getByRole("button", { name: /^iris.csv/ }).click();
  await expect(details.getByText("column_59")).toBeAttached();
  expect(await details.evaluate((el) => el.clientHeight)).toBe(height);
  await page.getByRole("textbox", { name: "Search datasets" }).fill("missing");
  const zipDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download all (.zip)" }).click();
  expect((await zipDownload).suggestedFilename()).toBe("Research-datasets.zip");
});
