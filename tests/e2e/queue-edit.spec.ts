import { expect, test } from "@playwright/test";
import type { MessageDto } from "../../src/lib/api/types";

test("reorders queued questions from the left grip and edits their files in the composer", async ({ context, page, isMobile }) => {
  const chatId = "queue-regression";
  const timestamp = "2026-11-23T00:00:00Z";
  const queued = new Map<string, MessageDto>();
  const attachment = { resource_type: "dataset" as const, resource_id: "sales", name: "sales.csv", size_bytes: 12 };
  let savedOrder: string[] = [];

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^\/api(?:\/backend)?/, "");
    if (path === "/models") return route.fulfill({ json: {
      default_model_id: "test-model",
      models: [{ id: "test-model", label: "Test model", supported_efforts: ["low"], default_effort: "low" }],
    } });
    if (path === `/chats/${chatId}`) return route.fulfill({ json: {
      id: chatId, title: "Queue browser fixture", workspace_id: null,
      created_by: "user-you", created_at: timestamp, updated_at: timestamp,
    } });
    if (path === `/chats/${chatId}/runs`) return route.fulfill({
      json: { items: [{ id: "active", status: "running" }], next_cursor: null },
    });
    if (path === "/runs/active/queue" || path === "/runs/active/queue/with-files") {
      const number = queued.size + 1;
      const runId = `run-${number}`;
      const message: MessageDto = {
        id: `message-${number}`, chat_id: chatId, role: "user", kind: "normal", status: "queued",
        created_at: timestamp, updated_at: timestamp,
        content: number === 1 ? "Compare sales" : "Summarize trends",
        attachment_refs: number === 1 ? [attachment] : [],
      };
      queued.set(runId, message);
      return route.fulfill({ status: 201, json: { message, run: { id: runId }, position: number } });
    }
    if (path === `/chats/${chatId}/queue/order`) {
      savedOrder = request.postDataJSON().run_ids;
      return route.fulfill({ status: 204 });
    }
    if (path === "/runs/run-1/queue/with-files" && request.method() === "PATCH") {
      const body = request.postData() ?? "";
      expect(body).toContain("Compare regional sales");
      expect(body).toContain('name="remove_resource_ids"');
      expect(body).toContain('filename="regional.csv"');
      return route.fulfill({ json: {
        ...queued.get("run-1"),
        content: "Compare regional sales",
        attachment_refs: [{ ...attachment, resource_id: "regional", name: "regional.csv" }],
      } });
    }
    return route.fulfill({ json: { items: [], next_cursor: null } });
  });

  await page.goto(`/chat/${chatId}`, { waitUntil: "domcontentloaded" });
  const composer = page.getByRole("combobox", { name: "Ask anything about your data" });
  await composer.fill("Compare sales");
  await page.getByLabel("Add files to chat").setInputFiles({
    name: "sales.csv", mimeType: "text/csv", buffer: Buffer.from("sales\n100\n"),
  });
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  const rows = page.getByRole("list", { name: "Queued questions" }).getByRole("listitem");
  await expect(rows).toHaveCount(1);
  await composer.fill("Summarize trends");
  await page.getByRole("button", { name: "Queue", exact: true }).click();
  await expect(rows).toHaveCount(2);
  await expect(rows.getByText("Queued", { exact: true })).toHaveCount(0);

  const grip = page.getByRole("button", { name: "Reorder queued question: Summarize trends" });
  const source = (await grip.boundingBox())!;
  const target = (await rows.first().boundingBox())!;
  const x = source.x + source.width / 2;
  const startY = source.y + source.height / 2;
  const endY = target.y + target.height / 2;
  if (isMobile) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: endY }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  } else {
    await page.mouse.move(x, startY);
    await page.mouse.down();
    await page.mouse.move(x, endY, { steps: 5 });
    await page.mouse.up();
  }
  await expect(rows.first()).toContainText("Summarize trends");
  expect(savedOrder).toEqual(["run-2", "run-1"]);

  await composer.fill("Unsent follow-up");
  await page.getByRole("button", { name: "Edit queued question: Compare sales" }).click();
  const editor = page.getByRole("textbox", { name: "Edit queued question" });
  await expect(editor).toHaveAttribute("id", "chat-message");
  await expect(editor).toHaveValue("Compare sales");
  await page.getByRole("button", { name: "Remove sales.csv" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Add files to queued question" }).click();
  await (await chooser).setFiles({
    name: "regional.csv", mimeType: "text/csv", buffer: Buffer.from("region,sales\nNorth,100\n"),
  });
  await expect(page.getByRole("button", { name: "Remove regional.csv" })).toBeVisible();
  await editor.fill("Compare regional sales");
  await page.getByRole("button", { name: "Save question" }).click();
  await expect(rows.last()).toContainText("Compare regional sales");
  await expect(rows.last().getByLabel("sales.csv")).toHaveCount(0);
  await expect(rows.last().getByLabel("regional.csv")).toBeVisible();
  await expect(composer).toHaveValue("Unsent follow-up");
});
