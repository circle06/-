import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  MAX_MAX_TOKENS,
  MAX_TEMPERATURE,
  MIN_MAX_TOKENS,
  MIN_TEMPERATURE,
  buildPageChatRequest,
  validMaxTokens,
  validTemperature,
} from "@/ui/chat-settings";

describe("chat page settings", () => {
  it("passes the stage-one defaults to /api/chat request data", () => {
    expect(buildPageChatRequest("openai", "gpt-5-mini", [{ role: "user", content: "hello" }], DEFAULT_TEMPERATURE, DEFAULT_MAX_TOKENS)).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
      messages: [{ role: "user", content: "hello" }],
      temperature: 0.2,
      max_tokens: 256,
    });
  });

  it("accepts boundary values and rejects values outside the approved ranges", () => {
    expect(validTemperature(MIN_TEMPERATURE)).toBe(true);
    expect(validTemperature(MAX_TEMPERATURE)).toBe(true);
    expect(validTemperature(-0.1)).toBe(false);
    expect(validTemperature(2.1)).toBe(false);
    expect(validMaxTokens(MIN_MAX_TOKENS)).toBe(true);
    expect(validMaxTokens(MAX_MAX_TOKENS)).toBe(true);
    expect(validMaxTokens(0)).toBe(false);
    expect(validMaxTokens(8193)).toBe(false);
    expect(validMaxTokens(1.5)).toBe(false);
    expect(() => buildPageChatRequest("openai", "gpt-5-mini", [{ role: "user", content: "hello" }], 3, 256)).toThrow(RangeError);
  });
});
