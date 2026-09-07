import { afterEach, describe, expect, it, vi } from "vitest";
import { providerConfigs } from "@/providers/config";
import { ProviderAdapterError } from "@/providers/adapters/errors";
import { AnthropicAdapter } from "@/providers/adapters/anthropic-adapter";
import { OpenAICompatibleAdapter } from "@/providers/adapters/openai-compatible-adapter";

const openaiConfig = providerConfigs.find((config) => config.id === "openai")!;
const anthropicConfig = providerConfigs.find((config) => config.id === "anthropic")!;
const request = { model: "gpt-4o-mini", messages: [{ role: "user" as const, content: "hello" }] };
const context = (signal = new AbortController().signal) => ({ requestId: "req-adapter", signal, timeoutMs: 1000 });
const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const sseResponse = (body: string) => new Response(body, { headers: { "content-type": "text/event-stream" } });

afterEach(() => { vi.unstubAllEnvs(); });

describe("OpenAICompatibleAdapter", () => {
  it("converts requests and responses for OpenAI-compatible providers", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-openai-key");
    const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.openai.com/v1/chat/completions");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer test-openai-key");
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "gpt-4o-mini", messages: request.messages });
      return jsonResponse({ choices: [{ message: { role: "assistant", content: "hello back" }, finish_reason: "stop" }] });
    });
    const adapter = new OpenAICompatibleAdapter(openaiConfig, { fetcher });
    await expect(adapter.chat(request, context())).resolves.toMatchObject({ provider: "openai", message: { content: "hello back" } });
  });

  it("converts OpenAI-compatible SSE chunks", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
    const config = providerConfigs.find((item) => item.id === "deepseek")!;
    const fetcher = vi.fn(async () => sseResponse('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'));
    const adapter = new OpenAICompatibleAdapter(config, { fetcher });
    const events = [];
    for await (const event of adapter.stream({ ...request, model: "deepseek-chat" }, context())) events.push(event);
    expect(events).toEqual([{ type: "start", requestId: "req-adapter", provider: "deepseek", model: "deepseek-chat" }, { type: "delta", text: "hi" }, { type: "done", finishReason: "stop" }]);
  });

  it("uses DeepSeek reasoning content when a non-stream response has no final content", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
    const config = providerConfigs.find((item) => item.id === "deepseek")!;
    const fetcher = vi.fn(async () => jsonResponse({
      choices: [{ message: { role: "assistant", content: "", reasoning_content: "分析过程" }, finish_reason: "length" }],
    }));
    const adapter = new OpenAICompatibleAdapter(config, { fetcher });

    await expect(adapter.chat({ ...request, model: "deepseek-v4-flash" }, context())).resolves.toMatchObject({
      provider: "deepseek",
      finishReason: "length",
      message: { content: expect.stringContaining("分析过程") },
    });
  });

  it("buffers DeepSeek reasoning and emits it only when the stream has no final content", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
    const config = providerConfigs.find((item) => item.id === "deepseek")!;
    const fetcher = vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"先分析"}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":"再判断"},"finish_reason":"length"}]}',
      "",
    ].join("\n\n")));
    const adapter = new OpenAICompatibleAdapter(config, { fetcher });
    const events = [];

    for await (const event of adapter.stream({ ...request, model: "deepseek-v4-flash" }, context())) events.push(event);

    expect(events).toEqual([
      { type: "start", requestId: "req-adapter", provider: "deepseek", model: "deepseek-v4-flash" },
      { type: "delta", text: expect.stringContaining("先分析再判断") },
      { type: "done", finishReason: "length" },
    ]);
  });

  it("prefers DeepSeek final content over buffered reasoning in a stream", async () => {
    vi.stubEnv("DEEPSEEK_API_KEY", "test-deepseek-key");
    const config = providerConfigs.find((item) => item.id === "deepseek")!;
    const fetcher = vi.fn(async () => sseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"内部推理"}}]}',
      'data: {"choices":[{"delta":{"content":"最终答复"}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
      "",
    ].join("\n\n")));
    const adapter = new OpenAICompatibleAdapter(config, { fetcher });
    const events = [];

    for await (const event of adapter.stream({ ...request, model: "deepseek-v4-pro" }, context())) events.push(event);

    expect(events).toEqual([
      { type: "start", requestId: "req-adapter", provider: "deepseek", model: "deepseek-v4-pro" },
      { type: "delta", text: "最终答复" },
      { type: "done", finishReason: "stop" },
    ]);
  });

  it.each([401, 429, 500])("maps upstream HTTP %s errors", async (status) => {
    vi.stubEnv("GLM_API_KEY", "test-glm-key");
    const config = providerConfigs.find((item) => item.id === "glm")!;
    const adapter = new OpenAICompatibleAdapter(config, { fetcher: vi.fn(async () => jsonResponse({}, status)) });
    await expect(adapter.chat({ ...request, model: "glm-4-flash" }, context())).rejects.toBeInstanceOf(ProviderAdapterError);
  });

  it("reads only the configured server key and fixed allowlisted URL", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const fetcher = vi.fn(async (input: RequestInfo | URL) => { expect(String(input)).toBe(openaiConfig.allowedBaseUrls[0] + "/chat/completions"); return jsonResponse({ choices: [{ message: { content: "ok" } }] }); });
    await new OpenAICompatibleAdapter(openaiConfig, { fetcher }).chat(request, context());
    expect(fetcher).toHaveBeenCalledOnce();
  });
});

describe("AnthropicAdapter", () => {
  it("converts system/messages and Anthropic response", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("x-api-key")).toBe("test-anthropic-key");
      const body = JSON.parse(String(init?.body));
      expect(body.system).toBeUndefined();
      expect(body.messages).toEqual(request.messages);
      return jsonResponse({ content: [{ type: "text", text: "anthropic reply" }], stop_reason: "end_turn" });
    });
    const adapter = new AnthropicAdapter(anthropicConfig, { fetcher });
    await expect(adapter.chat(request, context())).resolves.toMatchObject({ provider: "anthropic", message: { content: "anthropic reply" }, finishReason: "end_turn" });
  });

  it("converts Anthropic SSE events", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "test-anthropic-key");
    const fetcher = vi.fn(async () => sseResponse('event: content_block_delta\ndata: {"delta":{"text":"hello"}}\n\nevent: message_stop\ndata: {}\n\n'));
    const adapter = new AnthropicAdapter(anthropicConfig, { fetcher });
    const events = [];
    for await (const event of adapter.stream({ ...request, model: "claude-3-5-sonnet" }, context())) events.push(event);
    expect(events).toEqual([{ type: "start", requestId: "req-adapter", provider: "anthropic", model: "claude-3-5-sonnet" }, { type: "delta", text: "hello" }, { type: "done", finishReason: "stop" }]);
  });

  it("fails safely when credentials are not configured", async () => {
    const adapter = new AnthropicAdapter(anthropicConfig, { fetcher: vi.fn() });
    await expect(adapter.chat(request, context())).rejects.toMatchObject({ code: "PROVIDER_NOT_CONFIGURED" });
  });

  it("honors timeout and AbortSignal", async () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    const pending = new Promise<Response>(() => undefined);
    const adapter = new OpenAICompatibleAdapter(openaiConfig, { fetcher: vi.fn(() => pending), timeoutMs: 5 });
    await expect(adapter.chat(request, context())).rejects.toMatchObject({ code: "UPSTREAM_TIMEOUT" });
    const controller = new AbortController();
    const abortingFetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }); }));
    const abortAdapter = new OpenAICompatibleAdapter(openaiConfig, { fetcher: abortingFetcher, timeoutMs: 1000 });
    const promise = abortAdapter.chat(request, context(controller.signal));
    controller.abort();
    await expect(promise).rejects.toMatchObject({ code: "CLIENT_CLOSED" });
  });
});
