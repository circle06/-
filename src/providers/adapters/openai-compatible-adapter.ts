import type { ModelDescriptor, NormalizedChatRequest, NormalizedChatResponse, NormalizedStreamEvent, ProviderCallContext, ProviderId } from "@/domain/provider";
import type { ProviderConfig } from "@/providers/config";
import type { LLMProvider } from "@/providers/llm-provider";
import { ProviderAdapterError } from "@/providers/adapters/errors";
import { fetchWithContext, providerUrl, requireApiKey, responseJson, sseLines, type FetchLike } from "@/providers/adapters/transport";

export interface OpenAICompatibleAdapterOptions { config: ProviderConfig; fetcher?: FetchLike; timeoutMs?: number }

interface OpenAICompatibleMessage {
  role?: string;
  content?: string;
  reasoning_content?: string;
}

interface OpenAICompatibleDelta {
  content?: string;
  reasoning_content?: string;
}

export class OpenAICompatibleAdapter implements LLMProvider {
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  constructor(private readonly config: OpenAICompatibleAdapterOptions["config"], options: Omit<OpenAICompatibleAdapterOptions, "config"> = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 180_000;
  }
  id(): ProviderId { return this.config.id; }
  listModels(): readonly ModelDescriptor[] { return this.config.models; }
  private baseUrl(): string { return this.config.allowedBaseUrls[0]; }
  private headers(): HeadersInit { return { "content-type": "application/json", authorization: `Bearer ${requireApiKey(this.config.apiKeyEnv)}` }; }
  async chat(request: NormalizedChatRequest, context: ProviderCallContext): Promise<NormalizedChatResponse> {
    const response = await fetchWithContext(this.fetcher, providerUrl(this.baseUrl(), "/chat/completions"), { method: "POST", headers: this.headers(), body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature, max_tokens: request.max_tokens }) }, context, this.timeoutMs);
    const body = await responseJson(response);
    const choice = (body.choices as Array<{ message?: OpenAICompatibleMessage; finish_reason?: string }> | undefined)?.[0];
    const content = choice?.message?.content ?? "";
    if (!content && !choice?.message?.reasoning_content) throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream response did not contain an assistant message.");
    return { provider: this.config.id, model: typeof body.model === "string" ? body.model : request.model, message: { role: "assistant", content }, reasoning: choice?.message?.reasoning_content, finishReason: choice?.finish_reason ?? "stop" };
  }
  async *stream(request: NormalizedChatRequest, context: ProviderCallContext): AsyncIterable<NormalizedStreamEvent> {
    const response = await fetchWithContext(this.fetcher, providerUrl(this.baseUrl(), "/chat/completions"), { method: "POST", headers: this.headers(), body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature, max_tokens: request.max_tokens, stream: true }) }, context, this.timeoutMs);
    let started = false;
    const start = (model = request.model): NormalizedStreamEvent => {
      started = true;
      return { type: "start", requestId: context.requestId, provider: this.config.id, model };
    };
    for await (const line of sseLines(response)) {
      if (line.data === "[DONE]") {
        if (!started) yield start();
        yield { type: "done", finishReason: "stop" };
        return;
      }
      let payload: { model?: string; choices?: Array<{ delta?: OpenAICompatibleDelta; finish_reason?: string }> };
      try { payload = JSON.parse(line.data) as typeof payload; } catch { throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream returned invalid stream data."); }
      if (!started) yield start(typeof payload.model === "string" ? payload.model : request.model);
      const choice = payload.choices?.[0];
      if (choice?.delta?.reasoning_content) yield { type: "reasoning_delta", text: choice.delta.reasoning_content };
      if (choice?.delta?.content) yield { type: "delta", text: choice.delta.content };
      if (choice?.finish_reason) {
        yield { type: "done", finishReason: choice.finish_reason };
        return;
      }
    }
    if (!started) yield start();
    yield { type: "done", finishReason: "stop" };
  }
}
