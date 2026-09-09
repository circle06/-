import { describe, expect, it, vi } from "vitest";
import { providerConfigs } from "@/providers/config";
import { providerIds } from "@/domain/provider";
import { MockProvider } from "@/providers/mock-provider";
import { ProviderRegistry } from "@/providers/registry";
import { createChatHandler } from "@/api/chat-handler";
import { ProviderFactory } from "@/providers/provider-factory";

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
  model: "gpt-5-mini",
  messages: [{ role: "user", content: "hello" }],
};

describe("POST /api/chat", () => {
  it("returns a unified mock success response with requestId", async () => {
    const post = createChatHandler({ requestIdFactory: () => "req-success" });
    const response = await post(request(validBody));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ requestId: "req-success", provider: "openai", model: "gpt-5-mini", message: { role: "assistant" }, finishReason: "stop" });
  });

  it("uses the live factory with an injected fetcher and returns configuration errors without a key", async () => {
    const factory = new ProviderFactory({ mode: "live", fetcher: vi.fn() });
    const post = createChatHandler({ factory, requestIdFactory: () => "req-live-config" });
    const response = await post(request(validBody));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "PROVIDER_NOT_CONFIGURED", requestId: "req-live-config" } });
  });

  it("routes a live non-stream request through an adapter using mock fetch", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "live mock reply" }, finish_reason: "stop" }] }), { status: 200 }));
    const factory = new ProviderFactory({ mode: "live", fetcher });
    const post = createChatHandler({ factory, requestIdFactory: () => "req-live-chat" });
    const response = await post(request(validBody));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ requestId: "req-live-chat", provider: "openai", message: { content: "live mock reply" } });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("routes a live stream through an adapter using mock fetch", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetcher = vi.fn(async () => new Response('data: {"choices":[{"delta":{"content":"live"}}]}\n\ndata: [DONE]\n\n', { status: 200 }));
    const factory = new ProviderFactory({ mode: "live", fetcher });
    const post = createChatHandler({ factory, requestIdFactory: () => "req-live-sse" });
    const response = await post(request({ ...validBody, stream: true }));
    const body = await response.text();
    expect(response.status).toBe(200);
    expect(body).toContain('event: message_delta');
    expect(body).toContain('"text":"live"');
    expect(body).toContain('event: message_end');
    expect(fetcher).toHaveBeenCalledOnce();
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

  it("returns the unified SSE events for a successful mock stream", async () => {
    const post = createChatHandler({ requestIdFactory: () => "req-sse" });
    const response = await post(request({ ...validBody, stream: true }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toContain("no-cache");
    const body = await response.text();
    expect(body).toContain("event: message_start");
    expect(body).toContain("event: message_delta");
    expect(body).toContain("event: message_end");
    expect(body).not.toContain("event: start");
    expect(body).not.toContain("event: done");
  });

  it("emits a safe SSE error event for a provider error", async () => {
    const registry = registryWith("openai", new MockProvider("openai", { error: "private stream detail" }));
    const post = createChatHandler({ registry, requestIdFactory: () => "req-sse-error" });
    const response = await post(request({ ...validBody, stream: true }));
    const body = await response.text();
    expect(body).toContain("event: error");
    expect(body).toContain('"code":"UPSTREAM_UNAVAILABLE"');
    expect(body).not.toContain("private stream detail");
  });

  it("emits a timeout SSE error and closes the stream", async () => {
    const registry = registryWith("deepseek", new MockProvider("deepseek", { delayMs: 100 }));
    const post = createChatHandler({ registry, timeoutMs: 10, requestIdFactory: () => "req-sse-timeout" });
    const response = await post(request({ ...validBody, provider: "deepseek", model: "deepseek-chat", stream: true }));
    const body = await response.text();
    expect(body).toContain("event: error");
    expect(body).toContain('"code":"UPSTREAM_TIMEOUT"');
    expect(body).not.toContain("event: message_end");
  });

  it("closes without a terminal success event when the client cancels", async () => {
    const controller = new AbortController();
    const post = createChatHandler({ requestIdFactory: () => "req-sse-cancel" });
    const response = await post(request({ ...validBody, stream: true }, controller.signal));
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain("message_start");
    controller.abort();
    const rest = await reader.read();
    expect(rest.done).toBe(true);
    await reader.cancel();
  });
});
