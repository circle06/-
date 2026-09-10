export const DEFAULT_TEMPERATURE = 0.2;
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 2;
export const DEFAULT_MAX_TOKENS = 4096;
export const MIN_MAX_TOKENS = 1;
export const MAX_MAX_TOKENS = 32768;

export interface ChatRequestMessage {
  role: "user" | "assistant";
  content: string;
}

export function conversationMessagesForRequest(messages: readonly ChatRequestMessage[]): ChatRequestMessage[] {
  return messages.filter((message) => message.content.trim().length > 0).map((message) => ({ ...message }));
}

export interface PageChatRequest {
  provider: string;
  model: string;
  messages: ChatRequestMessage[];
  temperature: number;
  max_tokens: number;
}

export function validTemperature(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_TEMPERATURE && value <= MAX_TEMPERATURE;
}

export function validMaxTokens(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_MAX_TOKENS && value <= MAX_MAX_TOKENS;
}

export function buildPageChatRequest(
  provider: string,
  model: string,
  messages: ChatRequestMessage[],
  temperature: number,
  maxTokens: number,
): PageChatRequest {
  if (!validTemperature(temperature) || !validMaxTokens(maxTokens)) {
    throw new RangeError("Chat settings are outside the allowed range.");
  }
  return { provider, model, messages, temperature, max_tokens: maxTokens };
}
