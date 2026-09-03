import type { ModelDescriptor, ProviderId } from "@/domain/provider";

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  apiKeyEnv: string;
  allowedBaseUrls: readonly string[];
  models: readonly ModelDescriptor[];
}

export const providerConfigs: readonly ProviderConfig[] = [
  { id: "openai", displayName: "OpenAI", apiKeyEnv: "OPENAI_API_KEY", allowedBaseUrls: ["https://api.openai.com/v1"], models: [{ id: "gpt-4o-mini", name: "GPT-4o mini" }] },
  { id: "anthropic", displayName: "Anthropic", apiKeyEnv: "ANTHROPIC_API_KEY", allowedBaseUrls: ["https://api.anthropic.com"], models: [{ id: "claude-3-5-sonnet", name: "Claude 3.5 Sonnet" }] },
  { id: "deepseek", displayName: "DeepSeek", apiKeyEnv: "DEEPSEEK_API_KEY", allowedBaseUrls: ["https://api.deepseek.com/v1"], models: [{ id: "deepseek-chat", name: "DeepSeek Chat" }] },
  { id: "glm", displayName: "GLM", apiKeyEnv: "GLM_API_KEY", allowedBaseUrls: ["https://open.bigmodel.cn/api/paas/v4"], models: [{ id: "glm-4-flash", name: "GLM-4-Flash" }] },
];
