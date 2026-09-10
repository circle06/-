import type { ChatMessage, NormalizedChatRequest, ProviderId } from "@/domain/provider";
import { providerIds } from "@/domain/provider";
import { ProviderRegistry, ProviderRegistryError, providerRegistry } from "@/providers/registry";

const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 3 * 1024 * 1024;
const MAX_TOTAL_CONTENT = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const MAX_TOKENS = 32768;

export class RequestValidationError extends Error {
  readonly code = "INVALID_REQUEST" as const;
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = "RequestValidationError";
  }
}

export interface ChatRequestInput {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ValidatedChatRequest {
  provider: ProviderId;
  request: NormalizedChatRequest;
  stream: boolean;
}

function fail(message: string): never {
  throw new RequestValidationError(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) fail("Request contains unsupported fields.");
}

export function validateChatRequest(input: unknown, registry: ProviderRegistry = providerRegistry): ValidatedChatRequest {
  if (!isRecord(input)) fail("Request body must be a JSON object.");
  assertExactKeys(input, ["provider", "model", "messages", "stream", "temperature", "max_tokens"]);

  const provider = input.provider;
  if (typeof provider !== "string" || !providerIds.includes(provider as ProviderId)) {
    throw new ProviderRegistryError("PROVIDER_NOT_ALLOWED", "Provider is not enabled.");
  }
  const providerId = provider as ProviderId;
  const model = input.model;
  if (typeof model !== "string" || model.length === 0 || model.length > 256) fail("Model is invalid.");
  registry.assertModelAllowed(providerId, model);

  const messages = input.messages;
  if (!Array.isArray(messages) || messages.length < 1 || messages.length > MAX_MESSAGES) fail("Message count is invalid.");
  let totalContent = 0;
  const normalizedMessages = messages.map((message) => {
    if (!isRecord(message)) fail("Message must be an object.");
    assertExactKeys(message, ["role", "content"]);
    if (message.role !== "system" && message.role !== "user" && message.role !== "assistant") fail("Message role is invalid.");
    if (typeof message.content !== "string" || message.content.length === 0 || message.content.length > MAX_MESSAGE_LENGTH) fail("Message content is invalid.");
    totalContent += message.content.length;
    return { role: message.role, content: message.content } as ChatMessage;
  });
  if (totalContent > MAX_TOTAL_CONTENT) fail("Total message content is too large.");

  const stream = input.stream === undefined ? false : input.stream;
  if (typeof stream !== "boolean") fail("Stream flag is invalid.");
  const temperature = input.temperature;
  if (temperature !== undefined && (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2)) fail("Temperature is invalid.");
  const max_tokens = input.max_tokens;
  if (max_tokens !== undefined && (typeof max_tokens !== "number" || !Number.isInteger(max_tokens) || max_tokens < 1 || max_tokens > MAX_TOKENS)) fail("max_tokens is invalid.");

  const bodyBytes = new TextEncoder().encode(JSON.stringify(input)).byteLength;
  if (bodyBytes > MAX_BODY_BYTES) fail("Request body is too large.");
  return { provider: providerId, request: { model, messages: normalizedMessages, temperature, max_tokens }, stream };
}
