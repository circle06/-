import type {
  NormalizedChatRequest, NormalizedChatResponse, NormalizedStreamEvent,
  ProviderCallContext, ProviderId,
} from "@/domain/provider";
import type { LLMProvider } from "@/providers/llm-provider";
import { providerConfigs } from "@/providers/config";

export class MockProvider implements LLMProvider {
  constructor(private readonly providerId: ProviderId) {}
  id(): ProviderId { return this.providerId; }
  listModels() { return providerConfigs.find((c) => c.id === this.providerId)?.models ?? []; }
  async chat(request: NormalizedChatRequest, context: ProviderCallContext): Promise<NormalizedChatResponse> {
    if (context.signal.aborted) throw new DOMException("Request aborted", "AbortError");
    return { provider: this.providerId, model: request.model, message: { role: "assistant", content: "mock response" }, finishReason: "stop" };
  }
  async *stream(request: NormalizedChatRequest, context: ProviderCallContext): AsyncIterable<NormalizedStreamEvent> {
    if (context.signal.aborted) throw new DOMException("Request aborted", "AbortError");
    yield { type: "start", requestId: context.requestId, provider: this.providerId, model: request.model };
    yield { type: "delta", text: "mock response" };
    if (context.signal.aborted) return;
    yield { type: "done", finishReason: "stop" };
  }
}
