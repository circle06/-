export const providerIds = ["openai", "anthropic", "deepseek", "glm"] as const;
export type ProviderId = (typeof providerIds)[number];
export type MessageRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: MessageRole;
  content: string;
}
export interface ModelDescriptor { id: string; name: string }
export interface NormalizedChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
}
export interface ProviderCallContext {
  requestId: string;
  signal: AbortSignal;
  timeoutMs: number;
}
export interface Usage { inputTokens?: number; outputTokens?: number }
export interface NormalizedChatResponse {
  provider: ProviderId;
  model: string;
  message: ChatMessage;
  finishReason: string;
  usage?: Usage;
}
export type NormalizedStreamEvent =
  | { type: "start"; requestId: string; provider: ProviderId; model: string }
  | { type: "delta"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done"; finishReason: string }
  | { type: "error"; code: string; message: string; requestId: string };
