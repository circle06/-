import { describe, expect, it } from "vitest";
import { providerRegistry, ProviderRegistryError } from "@/providers/registry";

describe("ProviderRegistry", () => {
  it("registers all required providers and hides server-only config", () => {
    const providers = providerRegistry.listPublicProviders();
    expect(providers.map((provider) => provider.id)).toEqual(["openai", "anthropic", "deepseek", "glm"]);
    expect(providers.every((provider) => provider.models.length > 0)).toBe(true);
    expect(JSON.stringify(providers)).not.toContain("apiKeyEnv");
    expect(JSON.stringify(providers)).not.toContain("allowedBaseUrls");
  });

  it("publishes the current text model catalog", () => {
    const providers = providerRegistry.listPublicProviders();
    const models = Object.fromEntries(providers.map((provider) => [provider.id, provider.models.map((model) => model.id)]));

    expect(models.openai).toEqual(expect.arrayContaining(["gpt-6-astra", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5", "gpt-5-mini", "gpt-5-nano"]));
    expect(models.anthropic).toEqual(expect.arrayContaining(["claude-opus-4-1", "claude-sonnet-4-5", "claude-haiku-4-5-20251001", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022"]));
    expect(models.deepseek).toEqual(expect.arrayContaining(["deepseek-v4-pro", "deepseek-v4-flash"]));
    expect(models.glm).toEqual(expect.arrayContaining(["glm-5.3", "glm-5.2", "glm-4.7-flash"]));
  });

  it("rejects unknown providers and models", () => {
    expect(() => providerRegistry.getProvider("unknown")).toThrowError(ProviderRegistryError);
    expect(() => providerRegistry.assertModelAllowed("openai", "unknown-model")).toThrowError(ProviderRegistryError);
  });
});
