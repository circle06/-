import { describe, expect, it } from "vitest";
import { providerIds } from "@/domain/provider";
import { MockProvider } from "@/providers/mock-provider";

describe("mock provider foundation", () => {
  it.each(providerIds)("supports the %s provider contract", async (providerId) => {
    const provider = new MockProvider(providerId);
    const controller = new AbortController();
    const context = { requestId: `test-${providerId}`, signal: controller.signal, timeoutMs: 1000 };
    const model = provider.listModels()[0];
    const request = { model: model.id, messages: [{ role: "user" as const, content: "hello" }] };
    const response = await provider.chat(request, context);
    expect(response.provider).toBe(providerId);
    const events = [];
    for await (const event of provider.stream(request, context)) events.push(event);
    expect(events[0]).toMatchObject({ type: "start", requestId: context.requestId });
    expect(events.at(-1)).toEqual({ type: "done", finishReason: "stop" });
  });
});
