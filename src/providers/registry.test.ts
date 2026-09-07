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

    expect(models.openai).toContain("gpt-4.1");
    expect(models.anthropic).toEqual(expect.arrayContaining(["claude-fable-5-1", "claude-opus-5", "claude-sonnet-5"]));
    expect(models.deepseek).toEqual(expect.arrayContaining(["deepseek-v4-pro", "deepseek-v4-flash"]));
    expect(models.glm).toEqual(expect.arrayContaining(["glm-5.3", "glm-5.2", "glm-4.7-flash"]));
  });

  it("rejects unknown providers and models", () => {
    expect(() => providerRegistry.getProvider("unknown")).toThrowError(ProviderRegistryError);
    expect(() => providerRegistry.assertModelAllowed("openai", "unknown-model")).toThrowError(ProviderRegistryError);
  });
});
