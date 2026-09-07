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
      { id: "gpt-4.1", name: "GPT-4.1" },
      { id: "gpt-4.1-mini", name: "GPT-4.1 mini" },
      { id: "gpt-4.1-nano", name: "GPT-4.1 nano" },
      { id: "gpt-4o", name: "GPT-4o" },
      { id: "gpt-4o-mini", name: "GPT-4o mini" },
    ],
  },
  {
    id: "anthropic",
    displayName: "Anthropic",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    allowedBaseUrls: ["https://api.anthropic.com"],
    models: [
      { id: "claude-fable-5-1", name: "Claude Fable 5.1" },
      { id: "claude-opus-5", name: "Claude Opus 5" },
      { id: "claude-sonnet-5", name: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5-20251001", name: "Claude Haiku 4.5" },
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
