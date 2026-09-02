import type { ModelDescriptor, ProviderId } from "@/domain/provider";
import { providerConfigs, type ProviderConfig } from "@/providers/config";
import type { LLMProvider } from "@/providers/llm-provider";
import { MockProvider } from "@/providers/mock-provider";

export class ProviderRegistryError extends Error {
  constructor(readonly code: "PROVIDER_NOT_ALLOWED" | "MODEL_NOT_ALLOWED", message: string) {
    super(message);
    this.name = "ProviderRegistryError";
  }
}

export interface PublicProviderDescriptor {
  id: ProviderId;
  name: string;
  models: readonly ModelDescriptor[];
}

export class ProviderRegistry {
  private readonly configs: ReadonlyMap<ProviderId, ProviderConfig>;
  private readonly providers: ReadonlyMap<ProviderId, LLMProvider>;

  constructor(
    configs: readonly ProviderConfig[] = providerConfigs,
    providers: ReadonlyMap<ProviderId, LLMProvider> = new Map(
      configs.map((config) => [config.id, new MockProvider(config.id)]),
    ),
  ) {
    this.configs = new Map(configs.map((config) => [config.id, config]));
    this.providers = providers;
  }

  listPublicProviders(): PublicProviderDescriptor[] {
    return [...this.configs.values()].map((config) => ({
      id: config.id,
      name: config.displayName,
      models: config.models.map((model) => ({ ...model })),
    }));
  }

  getProvider(providerId: string): LLMProvider {
    if (!this.configs.has(providerId as ProviderId) || !this.providers.has(providerId as ProviderId)) {
      throw new ProviderRegistryError("PROVIDER_NOT_ALLOWED", "Provider is not enabled.");
    }
    return this.providers.get(providerId as ProviderId)!;
  }

  getConfig(providerId: string): ProviderConfig {
    const config = this.configs.get(providerId as ProviderId);
    if (!config) throw new ProviderRegistryError("PROVIDER_NOT_ALLOWED", "Provider is not enabled.");
    return config;
  }

  assertModelAllowed(providerId: string, modelId: string): void {
    const config = this.getConfig(providerId);
    if (!config.models.some((model) => model.id === modelId)) {
      throw new ProviderRegistryError("MODEL_NOT_ALLOWED", "Model is not enabled for this provider.");
    }
  }
}

export const providerRegistry = new ProviderRegistry();
