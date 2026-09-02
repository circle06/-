import { describe, expect, it } from "vitest";
import { providerConfigs } from "@/providers/config";
import { providerIds } from "@/domain/provider";
import { MockProvider } from "@/providers/mock-provider";
import { ProviderRegistry } from "@/providers/registry";
import { createChatHandler } from "@/api/chat-handler";

function registryWith(providerId: (typeof providerIds)[number], provider: MockProvider): ProviderRegistry {
  const providers = new Map(providerIds.map((id) => [id, new MockProvider(id)]));
  providers.set(providerId, provider);
  return new ProviderRegistry(providerConfigs, providers);
}

function request(body: unknown, signal?: AbortSignal): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

const validBody = {
  provider: "openai",
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello" }],
};

describe("POST /api/chat", () => {
  it("returns a unified mock success response with requestId", async () => {
    const post = createChatHandler({ requestIdFactory: () => "req-success" });
    const response = await post(request(validBody));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ requestId: "req-success", provider: "openai", model: "gpt-4o-mini", message: { role: "assistant" }, finishReason: "stop" });
  });

  it("returns a unified parameter error and rejects sensitive fields", async () => {
    const post = createChatHandler({ requestIdFactory: () => "req-invalid" });
    const response = await post(request({ ...validBody, apiKey: "secret", baseUrl: "http://127.0.0.1" }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: { code: "INVALID_REQUEST", message: "Request contains unsupported fields.", requestId: "req-invalid" } });
  });

  it("maps a mock provider error without exposing provider details", async () => {
    const registry = registryWith("openai", new MockProvider("openai", { error: "private upstream detail" }));
    const post = createChatHandler({ registry, requestIdFactory: () => "req-provider-error" });
    const response = await post(request(validBody));
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toEqual({ error: { code: "UPSTREAM_UNAVAILABLE", message: "上游服务暂时不可用。", requestId: "req-provider-error" } });
    expect(JSON.stringify(body)).not.toContain("private upstream detail");
  });

  it("returns timeout when the mock exceeds the route timeout", async () => {
    const registry = registryWith("deepseek", new MockProvider("deepseek", { delayMs: 100 }));
    const post = createChatHandler({ registry, timeoutMs: 10, requestIdFactory: () => "req-timeout" });
    const response = await post(request({ ...validBody, provider: "deepseek", model: "deepseek-chat" }));
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UPSTREAM_TIMEOUT", requestId: "req-timeout" } });
  });

  it("returns client-closed when the request is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const post = createChatHandler({ requestIdFactory: () => "req-cancel" });
    const response = await post(request(validBody, controller.signal));
    expect(response.status).toBe(499);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CLIENT_CLOSED", requestId: "req-cancel" } });
  });

  it("rejects stream mode because SSE is intentionally out of scope", async () => {
    const post = createChatHandler({ requestIdFactory: () => "req-stream" });
    const response = await post(request({ ...validBody, stream: true }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST", requestId: "req-stream" } });
  });
});
