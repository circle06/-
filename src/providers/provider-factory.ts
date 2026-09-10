import type { FetchLike } from "@/providers/adapters/transport";
import { AnthropicAdapter } from "@/providers/adapters/anthropic-adapter";
import { OpenAICompatibleAdapter } from "@/providers/adapters/openai-compatible-adapter";
import type { ProviderId } from "@/domain/provider";
import { providerConfigs, type ProviderConfig } from "@/providers/config";
import type { LLMProvider } from "@/providers/llm-provider";
import { MockProvider } from "@/providers/mock-provider";
import { ProviderRegistry, type PublicProviderDescriptor } from "@/providers/registry";

export type ProviderRuntimeMode = "mock" | "live";

export interface ProviderFactoryOptions {
  mode?: ProviderRuntimeMode;
  fetcher?: FetchLike;
  timeoutMs?: number;
  configs?: readonly ProviderConfig[];
  registry?: ProviderRegistry;
}

export class ProviderFactory {
  readonly mode: ProviderRuntimeMode;
  private readonly registry: ProviderRegistry;
  private readonly fetcher?: FetchLike;
  private readonly timeoutMs: number;
  private readonly configs: ReadonlyMap<ProviderId, ProviderConfig>;
  private readonly liveProviders = new Map<ProviderId, LLMProvider>();

  constructor(options: ProviderFactoryOptions = {}) {
    this.mode = options.mode ?? runtimeModeFromEnv();
    this.registry = options.registry ?? new ProviderRegistry(options.configs ?? providerConfigs);
    this.fetcher = options.fetcher;
    this.timeoutMs = options.timeoutMs ?? 180_000;
    const configs = options.configs ?? providerConfigs;
    this.configs = new Map(configs.map((config) => [config.id, config]));
  }

  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  listPublicProviders(): PublicProviderDescriptor[] {
    return this.registry.listPublicProviders();
  }

  getProvider(providerId: string): LLMProvider {
    if (this.mode === "mock") return this.registry.getProvider(providerId);
    const config = this.configs.get(providerId as ProviderId);
    if (!config) return this.registry.getProvider(providerId);
    const existing = this.liveProviders.get(config.id);
    if (existing) return existing;
    const adapter = config.id === "anthropic"
      ? new AnthropicAdapter(config, { fetcher: this.fetcher, timeoutMs: this.timeoutMs })
      : new OpenAICompatibleAdapter(config, { fetcher: this.fetcher, timeoutMs: this.timeoutMs });
    this.liveProviders.set(config.id, adapter);
    return adapter;
  }
}

export function runtimeModeFromEnv(value = process.env.LLM_MODE): ProviderRuntimeMode {
  return value?.toLowerCase() === "live" ? "live" : "mock";
}

export const providerFactory = new ProviderFactory();
