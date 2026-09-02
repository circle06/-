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

  it("surfaces a mock upstream error without exposing credentials", async () => {
    const provider = new MockProvider("openai", { error: "simulated failure" });
    const model = provider.listModels()[0];
    await expect(provider.chat({ model: model.id, messages: [{ role: "user", content: "hello" }] }, { requestId: "err", signal: new AbortController().signal, timeoutMs: 1000 })).rejects.toMatchObject({ code: "MOCK_UPSTREAM_ERROR" });
  });

  it("maps a delayed mock call beyond timeout to UPSTREAM_TIMEOUT", async () => {
    const provider = new MockProvider("anthropic", { delayMs: 1001 });
    const model = provider.listModels()[0];
    await expect(provider.chat({ model: model.id, messages: [{ role: "user", content: "hello" }] }, { requestId: "timeout", signal: new AbortController().signal, timeoutMs: 1000 })).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
  });

  it("honors cancellation before a call and while streaming", async () => {
    const provider = new MockProvider("glm");
    const model = provider.listModels()[0];
    const controller = new AbortController();
    controller.abort();
    await expect(provider.chat({ model: model.id, messages: [{ role: "user", content: "hello" }] }, { requestId: "cancel", signal: controller.signal, timeoutMs: 1000 })).rejects.toMatchObject({ name: "AbortError" });

    const active = new AbortController();
    const iterator = provider.stream({ model: model.id, messages: [{ role: "user", content: "hello" }] }, { requestId: "stream-cancel", signal: active.signal, timeoutMs: 1000 })[Symbol.asyncIterator]();
    await iterator.next();
    await iterator.next();
    active.abort();
    await expect(iterator.next()).resolves.toMatchObject({ done: true });
  });
});
