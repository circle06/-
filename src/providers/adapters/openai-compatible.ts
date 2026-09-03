import type { ProviderId } from "@/domain/provider";

/** Foundation-only descriptor; real network calls are deferred to a later task. */
export interface OpenAICompatibleAdapterOptions {
  providerId: Exclude<ProviderId, "anthropic">;
  baseUrl: string;
  apiKeyEnv: string;
}
