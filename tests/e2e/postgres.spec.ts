import { expect, test } from "@playwright/test";

const rawForm = process.env.DSAI_TEST_BROWSER_POSTGRES_FORM;
const checkLiveAgent = process.env.DSAI_TEST_BROWSER_LIVE_AGENT === "1";

test.use({ trace: "off" });

test("connects to a real PostgreSQL database and submits it from New Analysis", async ({ page }, testInfo) => {
  test.skip(!rawForm, "A real PostgreSQL test database is required.");
  test.setTimeout(120_000);
  const form = JSON.parse(rawForm!) as {
    host: string; port: number; database: string; username: string; password: string; schema: string;
  };
  const name = `Browser PostgreSQL sales ${testInfo.project.name}`;

  await page.goto("/extensions");
  await page.getByRole("tab", { name: "Databases" }).click();
  await page.getByRole("button", { name: "Add PostgreSQL" }).click();
  const setup = page.getByRole("dialog", { name: "Add PostgreSQL connection" });
  await setup.getByLabel("Connection name").fill(name);
  await setup.getByLabel("Host", { exact: true }).fill(form.host);
  await setup.getByLabel("Port", { exact: true }).fill(String(form.port));
  await setup.getByLabel("Database name").fill(form.database);
  await setup.getByLabel("Username").fill(form.username);
  await setup.getByLabel("Password", { exact: true }).fill(form.password);
  await setup.getByLabel("Allowed schemas").fill(form.schema);
  await setup.getByRole("button", { name: "Test Connection" }).click();
  await expect(setup.getByText("Connected to PostgreSQL")).toBeVisible();
  await setup.getByRole("button", { name: "Save Connection" }).click();

  await page.getByRole("button", { name: "Manage PostgreSQL" }).click();
  const saved = page.getByRole("dialog", { name: "Manage PostgreSQL" }).getByRole("article").filter({ hasText: name });
  await expect(saved).toContainText("Connected");
  await saved.getByRole("button", { name: "Browse tables" }).click();
  const browser = page.getByRole("dialog", { name });
  await browser.getByRole("button", { name: `${form.schema}.orders` }).click();
  await expect(browser.getByText("Primary key", { exact: true })).toBeVisible();
  await browser.getByRole("button", { name: "Preview rows" }).click();
  await expect(browser.getByRole("table", { name: "Table preview" })).toContainText("61");
  await browser.getByRole("button", { name: "Close dialog" }).click();

  await page.goto("/");
  await page.getByRole("button", { name: "Add to analysis" }).click();
  await page.getByRole("menuitem", { name: "Data Sources" }).click();
  await page.getByRole("dialog", { name: "Data Sources" }).getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByLabel("Selected databases")).toContainText(name);
  await page.getByRole("textbox", { name: "Analysis question" }).fill("Use the attached live PostgreSQL orders table to calculate SUM(total). State the exact total in your answer.");
  const created = page.waitForResponse((response) => response.url().endsWith("/chats") && response.request().method() === "POST");
  const stream = checkLiveAgent ? page.waitForResponse((response) => response.url().endsWith("/messages/stream")) : null;
  await page.getByRole("button", { name: "Send analysis" }).click();
  const chat = await created;
  expect(chat.status()).toBe(201);
  expect((await chat.json()).message.connection_refs).toEqual([{ id: expect.any(String), name }]);
  await expect(page.getByLabel("PostgreSQL sources")).toContainText(name);
  if (stream) {
    const response = await stream;
    expect(response.ok()).toBeTruthy();
    const payload = await response.text();
    const envelopes = payload.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
    const failure = envelopes.find((event) => event.type === "agent.failed")?.data.error?.message;
    expect(failure).toBeUndefined();
    expect(envelopes.some((event) => event.type === "tool.completed" && event.data.name === "query_database")).toBeTruthy();
    expect(envelopes.find((event) => event.type === "message.completed")?.data.content).toContain("173");
  }

  await page.goto("/extensions");
  await page.getByRole("button", { name: "Manage PostgreSQL" }).click();
  await saved.getByRole("button", { name: "Disconnect" }).click();
  await page.getByRole("dialog", { name: "Disconnect PostgreSQL" }).getByRole("button", { name: "Disconnect" }).click();
  const disconnected = page.getByRole("status").filter({ hasText: `${name} disconnected.` });
  await expect(disconnected).toBeVisible();
});
