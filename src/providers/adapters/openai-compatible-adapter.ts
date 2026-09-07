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

function visibleAssistantContent(message: OpenAICompatibleMessage | undefined): string | undefined {
  if (message?.content) return message.content;
  if (message?.reasoning_content) {
    return `模型已返回推理内容，但未生成最终答复。请适当提高 Max tokens 后重试。\n\n${message.reasoning_content}`;
  }
  return undefined;
}

export class OpenAICompatibleAdapter implements LLMProvider {
  private readonly fetcher: FetchLike;
  private readonly timeoutMs: number;
  constructor(private readonly config: OpenAICompatibleAdapterOptions["config"], options: Omit<OpenAICompatibleAdapterOptions, "config"> = {}) {
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 60_000;
  }
  id(): ProviderId { return this.config.id; }
  listModels(): readonly ModelDescriptor[] { return this.config.models; }
  private baseUrl(): string { return this.config.allowedBaseUrls[0]; }
  private headers(): HeadersInit { return { "content-type": "application/json", authorization: `Bearer ${requireApiKey(this.config.apiKeyEnv)}` }; }
  async chat(request: NormalizedChatRequest, context: ProviderCallContext): Promise<NormalizedChatResponse> {
    const response = await fetchWithContext(this.fetcher, providerUrl(this.baseUrl(), "/chat/completions"), { method: "POST", headers: this.headers(), body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature, max_tokens: request.max_tokens }) }, context, this.timeoutMs);
    const body = await responseJson(response);
    const choice = (body.choices as Array<{ message?: OpenAICompatibleMessage; finish_reason?: string }> | undefined)?.[0];
    const content = visibleAssistantContent(choice?.message);
    if (!content) throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream response did not contain an assistant message.");
    return { provider: this.config.id, model: request.model, message: { role: "assistant", content }, finishReason: choice?.finish_reason ?? "stop" };
  }
  async *stream(request: NormalizedChatRequest, context: ProviderCallContext): AsyncIterable<NormalizedStreamEvent> {
    const response = await fetchWithContext(this.fetcher, providerUrl(this.baseUrl(), "/chat/completions"), { method: "POST", headers: this.headers(), body: JSON.stringify({ model: request.model, messages: request.messages, temperature: request.temperature, max_tokens: request.max_tokens, stream: true }) }, context, this.timeoutMs);
    yield { type: "start", requestId: context.requestId, provider: this.config.id, model: request.model };
    let reasoningContent = "";
    let emittedContent = false;
    const reasoningFallback = () => `模型已返回推理内容，但未生成最终答复。请适当提高 Max tokens 后重试。\n\n${reasoningContent}`;
    for await (const line of sseLines(response)) {
      if (line.data === "[DONE]") {
        if (!emittedContent && reasoningContent) yield { type: "delta", text: reasoningFallback() };
        yield { type: "done", finishReason: "stop" };
        return;
      }
      let payload: { choices?: Array<{ delta?: OpenAICompatibleDelta; finish_reason?: string }> };
      try { payload = JSON.parse(line.data) as typeof payload; } catch { throw new ProviderAdapterError("UPSTREAM_BAD_REQUEST", "Upstream returned invalid stream data."); }
      const choice = payload.choices?.[0];
      if (choice?.delta?.reasoning_content) reasoningContent += choice.delta.reasoning_content;
      if (choice?.delta?.content) {
        emittedContent = true;
        yield { type: "delta", text: choice.delta.content };
      }
      if (choice?.finish_reason) {
        if (!emittedContent && reasoningContent) yield { type: "delta", text: reasoningFallback() };
        yield { type: "done", finishReason: choice.finish_reason };
        return;
      }
    }
    if (!emittedContent && reasoningContent) yield { type: "delta", text: reasoningFallback() };
    yield { type: "done", finishReason: "stop" };
  }
}
