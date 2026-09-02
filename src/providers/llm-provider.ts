import type {
  ModelDescriptor, NormalizedChatRequest, NormalizedChatResponse,
  NormalizedStreamEvent, ProviderCallContext, ProviderId,
} from "@/domain/provider";

export interface LLMProvider {
  id(): ProviderId;
  listModels(): readonly ModelDescriptor[];
  chat(request: NormalizedChatRequest, context: ProviderCallContext): Promise<NormalizedChatResponse>;
  stream(request: NormalizedChatRequest, context: ProviderCallContext): AsyncIterable<NormalizedStreamEvent>;
}
