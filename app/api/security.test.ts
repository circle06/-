import { afterEach, describe, expect, it, vi } from "vitest";
import { createChatHandler } from "@/api/chat-handler";
import type { NormalizedChatRequest, ProviderCallContext, ProviderId } from "@/domain/provider";
import { providerIds } from "@/domain/provider";
import { providerConfigs } from "@/providers/config";
import type { LLMProvider } from "@/providers/llm-provider";
import { MockProvider } from "@/providers/mock-provider";
import { ProviderFactory } from "@/providers/provider-factory";
import { ProviderRegistry } from "@/providers/registry";
import { GET as getPrompts } from "./prompts/route";
import { GET as getProviders } from "./providers/route";

const validBody = {
  provider: "openai",
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hello" }],
  stream: false,
  temperature: 0.2,
  max_tokens: 256,
};

function chatRequest(body: unknown, signal?: AbortSignal, origin?: string): Request {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
    body: JSON.stringify(body),
    signal,
  });
}

function registryWith(providerId: ProviderId, provider: LLMProvider): ProviderRegistry {
  const providers = new Map<ProviderId, LLMProvider>(providerIds.map((id) => [id, new MockProvider(id)]));
  providers.set(providerId, provider);
  return new ProviderRegistry(providerConfigs, providers);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("API security boundaries", () => {
  it("rejects client API key and baseUrl overrides without echoing their values", async () => {
    const post = createChatHandler({ requestIdFactory: () => "req-sensitive-input" });
    const response = await post(chatRequest({ ...validBody, apiKey: "client-secret", baseUrl: "http://127.0.0.1:8080" }));
    const text = await response.text();

    expect(response.status).toBe(400);
    expect(text).toContain("INVALID_REQUEST");
    expect(text).not.toContain("client-secret");
    expect(text).not.toContain("127.0.0.1");
  });

  it("does not expose server API keys in responses or console logs", async () => {
    const secret = "security-test-server-key";
    vi.stubEnv("OPENAI_API_KEY", secret);
    const consoleSpies = [
      vi.spyOn(console, "log").mockImplementation(() => undefined),
      vi.spyOn(console, "info").mockImplementation(() => undefined),
      vi.spyOn(console, "warn").mockImplementation(() => undefined),
      vi.spyOn(console, "error").mockImplementation(() => undefined),
    ];
    const factory = new ProviderFactory({
      mode: "live",
      fetcher: vi.fn(async () => { throw new Error(`upstream failed with ${secret}`); }),
    });
    const post = createChatHandler({ factory, requestIdFactory: () => "req-secret-redaction" });
    const response = await post(chatRequest(validBody));
    const text = await response.text();

    expect(response.status).toBe(502);
    expect(text).not.toContain(secret);
    expect(text).not.toContain("OPENAI_API_KEY");
    const logged = consoleSpies.flatMap((spy) => spy.mock.calls).flat().map(String).join(" ");
    expect(logged).not.toContain(secret);
    expect(logged).not.toContain("OPENAI_API_KEY");
  });

  it.each([
    [{ ...validBody, provider: "unknown" }, "PROVIDER_NOT_ALLOWED"],
    [{ ...validBody, model: "unknown-model" }, "MODEL_NOT_ALLOWED"],
  ])("rejects an unapproved provider or model", async (body, code) => {
    const post = createChatHandler({ requestIdFactory: () => "req-allowlist" });
    const response = await post(chatRequest(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code } });
  });

  it.each([
    [{ ...validBody, messages: [{ role: "user", content: "x".repeat(320 * 1024 + 1) }] }, "message length"],
    [{ ...validBody, messages: Array.from({ length: 51 }, () => ({ role: "user", content: "x" })) }, "message count"],
    [{ ...validBody, messages: Array.from({ length: 4 }, () => ({ role: "user", content: "x".repeat(100 * 1024) })) }, "total message length"],
    [{ ...validBody, temperature: -0.1 }, "minimum temperature"],
    [{ ...validBody, temperature: 2.1 }, "maximum temperature"],
    [{ ...validBody, max_tokens: 0 }, "minimum max_tokens"],
    [{ ...validBody, max_tokens: 8193 }, "maximum max_tokens"],
    [{ ...validBody, max_tokens: 1.5 }, "integer max_tokens"],
  ])("enforces the %s boundary", async (body) => {
    const post = createChatHandler({ requestIdFactory: () => "req-limits" });
    const response = await post(chatRequest(body));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "INVALID_REQUEST" } });
  });

  it.each([
    [0, 1],
    [2, 8192],
  ])("accepts approved boundary values temperature=%s and max_tokens=%s", async (temperature, maxTokens) => {
    const post = createChatHandler({ requestIdFactory: () => "req-valid-limits" });
    const response = await post(chatRequest({ ...validBody, temperature, max_tokens: maxTokens }));
    expect(response.status).toBe(200);
  });

  it("does not enable cross-origin API access by default", async () => {
    vi.stubEnv("ACCESS_CODE", "");
    const foreignOrigin = "https://untrusted.example";
    const providersResponse = getProviders(new Request("http://localhost/api/providers", { headers: { origin: foreignOrigin } }));
    const promptsResponse = getPrompts(new Request("http://localhost/api/prompts", { headers: { origin: foreignOrigin } }));
    const chatResponse = await createChatHandler({ requestIdFactory: () => "req-cors" })(chatRequest(validBody, undefined, foreignOrigin));

    for (const response of [providersResponse, promptsResponse, chatResponse]) {
      expect(response.headers.get("access-control-allow-origin")).toBeNull();
      expect(response.headers.get("access-control-allow-credentials")).toBeNull();
    }
  });

  it("propagates timeout through AbortSignal and returns a safe timeout error", async () => {
    let observedSignal: AbortSignal | undefined;
    const provider: LLMProvider = {
      id: () => "openai",
      listModels: () => providerConfigs[0].models,
      chat: async (_request: NormalizedChatRequest, context: ProviderCallContext) => {
        observedSignal = context.signal;
        return await new Promise<never>((_, reject) => context.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
      },
      stream: async function* () { return; },
    };
    const post = createChatHandler({ registry: registryWith("openai", provider), timeoutMs: 5, requestIdFactory: () => "req-timeout-security" });
    const response = await post(chatRequest(validBody));

    expect(observedSignal?.aborted).toBe(true);
    expect(response.status).toBe(504);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "UPSTREAM_TIMEOUT", requestId: "req-timeout-security" } });
  });

  it("honors an already-aborted client request without calling a provider", async () => {
    const controller = new AbortController();
    controller.abort();
    const provider = new MockProvider("openai");
    const chatSpy = vi.spyOn(provider, "chat");
    const post = createChatHandler({ registry: registryWith("openai", provider), requestIdFactory: () => "req-client-abort" });
    const response = await post(chatRequest(validBody, controller.signal));

    expect(response.status).toBe(499);
    expect(chatSpy).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ error: { code: "CLIENT_CLOSED" } });
  });
});
