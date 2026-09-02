/** Foundation-only descriptor; real network calls are deferred to a later task. */
export interface AnthropicAdapterOptions {
  baseUrl: string;
  apiKeyEnv: "ANTHROPIC_API_KEY";
}
