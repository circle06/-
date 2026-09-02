import { describe, expect, it } from "vitest";
import { parseSseText } from "@/ui/chat-sse";

describe("chat page SSE parsing", () => {
  it("parses message lifecycle, deltas and errors", () => {
    const events = parseSseText([
      "event: message_start",
      'data: {"requestId":"req-1"}',
      "",
      "event: message_delta",
      'data: {"text":"hello"}',
      "",
      "event: message_end",
      'data: {"finishReason":"stop"}',
      "",
      "event: error",
      'data: {"code":"UPSTREAM_TIMEOUT","message":"timeout"}',
      "",
    ].join("\n"));

    expect(events.map((event) => event.event)).toEqual([
      "message_start",
      "message_delta",
      "message_end",
      "error",
    ]);
    expect(JSON.parse(events[1].data)).toEqual({ text: "hello" });
  });
});
