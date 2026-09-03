import { afterEach, describe, expect, it, vi } from "vitest";
import { providerConfigs } from "@/providers/config";
import { OpenAICompatibleAdapter } from "@/providers/adapters/openai-compatible-adapter";
import { AnthropicAdapter } from "@/providers/adapters/anthropic-adapter";
import { ProviderFactory, runtimeModeFromEnv } from "@/providers/provider-factory";

afterEach(() => { vi.unstubAllEnvs(); });

describe("ProviderFactory", () => {
  it("defaults to mock mode and selects Mock Providers", () => {
    vi.stubEnv("LLM_MODE", "");
    const factory = new ProviderFactory();
    expect(factory.mode).toBe("mock");
    expect(factory.getProvider("openai").constructor.name).toBe("MockProvider");
  });

  it("selects the OpenAI-compatible adapter for OpenAI, DeepSeek and GLM in live mode", () => {
    const factory = new ProviderFactory({ mode: "live", fetcher: vi.fn() });
    for (const providerId of ["openai", "deepseek", "glm"] as const) {
      expect(factory.getProvider(providerId)).toBeInstanceOf(OpenAICompatibleAdapter);
    }
  });

  it("selects the independent Anthropic adapter in live mode", () => {
    const factory = new ProviderFactory({ mode: "live", fetcher: vi.fn() });
    expect(factory.getProvider("anthropic")).toBeInstanceOf(AnthropicAdapter);
  });

  it("uses only configured provider metadata and keeps public data sanitized", () => {
    const factory = new ProviderFactory({ mode: "live", configs: providerConfigs, fetcher: vi.fn() });
    const publicProviders = factory.listPublicProviders();
    expect(publicProviders).toHaveLength(4);
    expect(JSON.stringify(publicProviders)).not.toContain("apiKeyEnv");
    expect(JSON.stringify(publicProviders)).not.toContain("allowedBaseUrls");
  });

  it("fails closed to mock for an unknown runtime mode", () => {
    expect(runtimeModeFromEnv("invalid")).toBe("mock");
  });
});
