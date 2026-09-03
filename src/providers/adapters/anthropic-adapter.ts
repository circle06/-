import type { ModelDescriptor, NormalizedChatRequest, NormalizedChatResponse, NormalizedStreamEvent, ProviderCallContext } from "@/domain/provider";
import type { ProviderConfig } from "@/providers/config";
import type { LLMProvider } from "@/providers/llm-provider";
import { ProviderAdapterError } from "@/providers/adapters/errors";
import { fetchWithContext, providerUrl, requireApiKey, responseJson, sseLines, type FetchLike } from "@/providers/adapters/transport";

export interface AnthropicAdapterOptions { config: ProviderConfig; fetcher?: FetchLike; timeoutMs?: number }

export class AnthropicAdapter implements LLMProvider {
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  constructor(private readonly config: AnthropicAdapterOptions["config"], options: Omit<AnthropicAdapterOptions, "config"> = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }
  id() { return this.config.id; }
  listModels(): readonly ModelDescriptor[] { return this.config.models; }
  private baseUrl(): string { return this.config.allowedBaseUrls[0]; }
  private headers(): HeadersInit { return { "content-type": "application/json", "x-api-key": requireApiKey(this.config.apiKeyEnv), "anthropic-version": "2023-06-01" }; }
  private splitSystem(request: NormalizedChatRequest) { return { system: request.messages.find((message) => message.role === "system")?.content, messages: request.messages.filter((message) => message.role !== "system") }; }
  async chat(request: NormalizedChatRequest, context: ProviderCallContext): Promise<NormalizedChatResponse> {
    const split = this.splitSystem(request);
    const response = await fetchWithContext(this.fetcher, providerUrl(this.baseUrl(), "/v1/messages"), { method: "POST", headers: this.headers(), body: JSON.stringify({ model: request.model, system: split.system, messages: split.messages, max_tokens: request.max_tokens ?? 1024, temperature: request.temperature }) }, context, this.timeoutMs);
    const body = await responseJson(response);
    const content = (body.content as Array<{ type?: string; text?: string }> | undefined)?.find((item) => item.type === "text")?.text;
    if (!content) throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream response did not contain text content.");
    return { provider: this.config.id, model: request.model, message: { role: "assistant", content }, finishReason: typeof body.stop_reason === "string" ? body.stop_reason : "stop" };
  }
  async *stream(request: NormalizedChatRequest, context: ProviderCallContext): AsyncIterable<NormalizedStreamEvent> {
    const split = this.splitSystem(request);
    const response = await fetchWithContext(this.fetcher, providerUrl(this.baseUrl(), "/v1/messages"), { method: "POST", headers: this.headers(), body: JSON.stringify({ model: request.model, system: split.system, messages: split.messages, max_tokens: request.max_tokens ?? 1024, temperature: request.temperature, stream: true }) }, context, this.timeoutMs);
    yield { type: "start", requestId: context.requestId, provider: this.config.id, model: request.model };
    for await (const line of sseLines(response)) {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(line.data) as Record<string, unknown>; } catch { throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream returned invalid stream data."); }
      if (line.event === "content_block_delta" && (payload.delta as { text?: string } | undefined)?.text) yield { type: "delta", text: (payload.delta as { text: string }).text };
      if (line.event === "message_delta") { const reason = (payload.delta as { stop_reason?: string } | undefined)?.stop_reason; if (reason) yield { type: "done", finishReason: reason }; }
      if (line.event === "message_stop") { yield { type: "done", finishReason: "stop" }; return; }
      if (line.event === "error") throw new ProviderAdapterError("UPSTREAM_UNAVAILABLE", "Upstream returned a stream error.");
    }
    yield { type: "done", finishReason: "stop" };
  }
}
