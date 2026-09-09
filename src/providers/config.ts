import type { ModelDescriptor, ProviderId } from "@/domain/provider";

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  apiKeyEnv: string;
  allowedBaseUrls: readonly string[];
  models: readonly ModelDescriptor[];
}

export const providerConfigs: readonly ProviderConfig[] = [
  {
    id: "openai",
    displayName: "OpenAI",
    apiKeyEnv: "OPENAI_API_KEY",
    allowedBaseUrls: ["https://api.openai.com/v1"],
    models: [
      { id: "gpt-6-astra", name: "GPT-6 Astra" },
      { id: "gpt-5.6-sol", name: "GPT-5.6 Sol" },
      { id: "gpt-5.6-terra", name: "GPT-5.6 Terra" },
      { id: "gpt-5.6-luna", name: "GPT-5.6 Luna" },
      { id: "gpt-5.6", name: "GPT-5.6" },
      { id: "gpt-5", name: "GPT-5" },
      { id: "gpt-5-mini", name: "GPT-5 mini" },
      { id: "gpt-5-nano", name: "GPT-5 nano" },
    ],
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    allowedBaseUrls: ["https://api.anthropic.com"],
    models: [
      { id: "claude-opus-4-1", name: "Claude Opus 4.1" },
      { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
      { id: "claude-opus-4", name: "Claude Opus 4" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4" },
      { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
      { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
    ],
  },
  {
    id: "deepseek",
    displayName: "DeepSeek",
    apiKeyEnv: "DEEPSEEK_API_KEY",
    allowedBaseUrls: ["https://api.deepseek.com/v1"],
    models: [
      { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
      { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      { id: "deepseek-chat", name: "DeepSeek Chat（兼容）" },
      { id: "deepseek-reasoner", name: "DeepSeek Reasoner（兼容）" },
    ],
  },
  {
    id: "glm",
    displayName: "GLM",
    apiKeyEnv: "GLM_API_KEY",
    allowedBaseUrls: ["https://open.bigmodel.cn/api/paas/v4"],
    models: [
      { id: "glm-5.3", name: "GLM-5.3" },
      { id: "glm-5.2", name: "GLM-5.2" },
      { id: "glm-5", name: "GLM-5" },
      { id: "glm-4.7-flash", name: "GLM-4.7 Flash" },
      { id: "glm-4-flash", name: "GLM-4 Flash（兼容）" },
    ],
  },
];
