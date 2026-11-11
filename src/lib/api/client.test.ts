import { describe, expect, it } from "vitest";
import { createSseParser } from "./client";
import type { ExecutionEvent } from "./types";

describe("SSE parser", () => {
  it("parses chunk boundaries, CRLF, comments, and multiline data", () => {
    const events: ExecutionEvent[] = [];
    const parser = createSseParser((event) => events.push(event));
    const envelope = JSON.stringify({
      event_id: "event-1",
      run_id: "run-1",
      type: "message.delta",
      data: { message_id: "message-1", text: "hello" },
      timestamp: "2026-11-09T00:00:00Z",
      sequence: 1,
    });
    const split = Math.floor(envelope.length / 2);

    parser.push(`: heartbeat\r\nid: event-1\r\nevent: message.delta\r\ndata: ${envelope.slice(0, split)}`);
    parser.push(`${envelope.slice(split)}\r\n\r`);
    parser.push("\n");
    parser.finish();

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "message.delta", data: { text: "hello" } });
  });
});
