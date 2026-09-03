import { describe, expect, it } from "vitest";
import { listBuiltInPrompts } from "@/prompts/built-in-prompts";
import { parseSseText } from "@/ui/chat-sse";
import { builtInPromptValue, localPromptValue, promptContentForSelection } from "@/ui/prompt-selection";

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

describe("chat page prompt selection", () => {
  it("resolves built-in and local groups into the input without sending", () => {
    const builtIns = listBuiltInPrompts();
    const localPrompts = [{ id: "local-1", name: "本地模板", content: "本地内容", updatedAt: "2026-09-03T00:00:00.000Z" }];

    expect(promptContentForSelection(builtInPromptValue("summarize"), builtIns, localPrompts)).toContain("概括");
    expect(promptContentForSelection(localPromptValue("local-1"), builtIns, localPrompts)).toBe("本地内容");
    expect(promptContentForSelection("", builtIns, localPrompts)).toBeUndefined();
  });
});
