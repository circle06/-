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

  it("rejects unknown providers and models", () => {
    expect(() => providerRegistry.getProvider("unknown")).toThrowError(ProviderRegistryError);
    expect(() => providerRegistry.assertModelAllowed("openai", "unknown-model")).toThrowError(ProviderRegistryError);
  });
});
