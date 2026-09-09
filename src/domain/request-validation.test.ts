import { describe, expect, it } from "vitest";
import { validateChatRequest, RequestValidationError } from "@/domain/request-validation";
import { ProviderRegistryError } from "@/providers/registry";

const validRequest = {
  provider: "openai",
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "hello" }],
};

describe("validateChatRequest", () => {
  it("normalizes a valid request", () => {
    expect(validateChatRequest(validRequest)).toMatchObject({ provider: "openai", stream: false, request: { model: "gpt-5-mini" } });
  });

  it("rejects arbitrary baseUrl and invalid roles", () => {
    expect(() => validateChatRequest({ ...validRequest, baseUrl: "http://127.0.0.1" })).toThrowError(RequestValidationError);
    expect(() => validateChatRequest({ ...validRequest, messages: [{ role: "tool", content: "hello" }] })).toThrowError(RequestValidationError);
  });

  it("rejects unknown provider/model and out-of-range limits", () => {
    expect(() => validateChatRequest({ ...validRequest, provider: "unknown" })).toThrowError(ProviderRegistryError);
    expect(() => validateChatRequest({ ...validRequest, model: "unknown" })).toThrowError(ProviderRegistryError);
    expect(() => validateChatRequest({ ...validRequest, max_tokens: 0 })).toThrowError(RequestValidationError);
    expect(() => validateChatRequest({ ...validRequest, temperature: 3 })).toThrowError(RequestValidationError);
  });
});
