import type {
  NormalizedChatRequest, NormalizedChatResponse, NormalizedStreamEvent,
  ProviderCallContext, ProviderId,
} from "@/domain/provider";
import type { LLMProvider } from "@/providers/llm-provider";
import { providerConfigs } from "@/providers/config";

export class MockProviderError extends Error {
  constructor(readonly code: "MOCK_UPSTREAM_ERROR" | "UPSTREAM_TIMEOUT", message: string) {
    super(message);
    this.name = "MockProviderError";
  }
}

export interface MockProviderOptions {
  error?: string;
  delayMs?: number;
}

export class MockProvider implements LLMProvider {
  constructor(private readonly providerId: ProviderId, private readonly options: MockProviderOptions = {}) {}
  id(): ProviderId { return this.providerId; }
  listModels() { return providerConfigs.find((c) => c.id === this.providerId)?.models ?? []; }
  async chat(request: NormalizedChatRequest, context: ProviderCallContext): Promise<NormalizedChatResponse> {
    if (context.signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (this.options.error) throw new MockProviderError("MOCK_UPSTREAM_ERROR", this.options.error);
    if ((this.options.delayMs ?? 0) > context.timeoutMs) throw new MockProviderError("UPSTREAM_TIMEOUT", "Mock upstream timed out.");
    return { provider: this.providerId, model: request.model, message: { role: "assistant", content: "mock response" }, finishReason: "stop" };
  }
  async *stream(request: NormalizedChatRequest, context: ProviderCallContext): AsyncIterable<NormalizedStreamEvent> {
    if (context.signal.aborted) throw new DOMException("Request aborted", "AbortError");
    if (this.options.error) throw new MockProviderError("MOCK_UPSTREAM_ERROR", this.options.error);
    if ((this.options.delayMs ?? 0) > context.timeoutMs) throw new MockProviderError("UPSTREAM_TIMEOUT", "Mock upstream timed out.");
    yield { type: "start", requestId: context.requestId, provider: this.providerId, model: request.model };
    yield { type: "delta", text: "mock response" };
    if (context.signal.aborted) return;
    yield { type: "done", finishReason: "stop" };
  }
}
