import {
  getLLMConfig,
  getDeployConfig,
  loadEnvFileIntoProcess,
  PROVIDER_NATIVE_KEYS,
  type LLMConfig,
} from '../cli/config-manager.js';
import type { LLMProvider } from '../kernel/llm/llm-provider.js';
import { RouterEngine } from '../kernel/llm/router-engine.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import { ModelPerformanceTracker } from '../kernel/routing/model-performance-tracker.js';
import { warn } from '../cli/output.js';

export interface ProviderInitializationResult {
  router: RouterEngine;
  providers: LLMProvider[];
  config: LLMConfig;
}

export function initializeProviders(config?: LLMConfig): ProviderInitializationResult {
  // Make provider-native keys from .env (e.g. GEMINI_API_KEY) available to
  // the ApiKeyManager. Never overrides variables already set in the shell.
  loadEnvFileIntoProcess();
  const llmConfig = config ?? getLLMConfig();
  const deployConfig = getDeployConfig();

  process.env.GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? deployConfig.githubToken ?? '';
  process.env.VERCEL_TOKEN = process.env.VERCEL_TOKEN ?? deployConfig.vercelToken ?? '';
  process.env.NETLIFY_AUTH_TOKEN = process.env.NETLIFY_AUTH_TOKEN ?? deployConfig.netlifyToken ?? '';

  if (llmConfig.apiKey) {
    switch (llmConfig.provider) {
      case 'nvidia':
        process.env.NVIDIA_API_KEY = llmConfig.apiKey;
        break;
      case 'nebius':
        process.env.NEBIUS_API_KEY = llmConfig.apiKey;
        break;
      case 'custom':
        process.env.CUSTOM_LLM_API_KEY = llmConfig.apiKey;
        break;
      case 'anthropic':
        process.env.ANTHROPIC_API_KEY = llmConfig.apiKey;
        break;
      case 'openai':
        process.env.OPENAI_API_KEY = llmConfig.apiKey;
        break;
      case 'gemini':
        process.env.GEMINI_API_KEY = llmConfig.apiKey;
        break;
      case 'openrouter':
        process.env.OPENROUTER_API_KEY = llmConfig.apiKey;
        break;
    }
  }

  // Set API keys for custom providers
  if (llmConfig.customProviders?.length) {
    for (const cp of llmConfig.customProviders) {
      if (cp.apiKey) {
        process.env[`CUSTOM_${cp.name.toUpperCase()}_API_KEY`] = cp.apiKey;
      }
    }
  }

  // Shipping policy: OpenRouter is only used when explicitly configured.
  // NVIDIA can still be auto-registered (when NVIDIA_API_KEY exists) as the
  // preferred code-generation provider.
  if (llmConfig.provider !== 'openrouter' && process.env.OPENROUTER_API_KEY) {
    warn(
      'OPENROUTER_API_KEY is set but OpenRouter is not active.',
      'OpenRouter is only used when configured via `hag providers openrouter` or `hag config --provider openrouter`.',
    );
  }

  const apiKeyManager = ProviderFactory.createApiKeyManager(
    llmConfig.baseUrl ? { baseUrls: { [llmConfig.provider]: llmConfig.baseUrl } } : undefined,
  );
  const rateLimitTracker = ProviderFactory.createRateLimitTracker();
  const tokenUsageTracker = ProviderFactory.createTokenUsageTracker();

  const configuredProvider = llmConfig.provider;
  const providers: LLMProvider[] = [];
  const providerErrors: string[] = [];
  const registeredIds = new Set<string>();

  const tryRegister = (providerId: string, customConfig?: { baseUrls: Record<string, string> }): void => {
    if (registeredIds.has(providerId)) return;
    try {
      const provider = ProviderFactory.createLLMProvider(
        providerId,
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
        customConfig,
      );
      providers.push(provider);
      registeredIds.add(providerId);
    } catch (err) {
      providerErrors.push(`${providerId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // If the configured provider is a named custom provider, register it with its custom config
  let configuredProviderConfig: { baseUrls: Record<string, string> } | undefined;
  if (configuredProvider.startsWith('custom:')) {
    const customName = configuredProvider.slice(7);
    const customProvider = llmConfig.customProviders?.find(cp => cp.name === customName);
    if (customProvider) {
      configuredProviderConfig = { baseUrls: { [configuredProvider]: customProvider.baseUrl } };
    }
  }
  tryRegister(configuredProvider, configuredProviderConfig);

  // Always register NVIDIA when key is available so router can prioritize it
  // for code-generation tasks even when another provider is configured.
  if (configuredProvider !== 'nvidia' && process.env.NVIDIA_API_KEY) {
    tryRegister('nvidia');
  }

  // Always register Nebius Token Factory when a key is available: it is
  // the hackathon's required runtime platform and serves the NVIDIA
  // Nemotron open-weight family.
  if (configuredProvider !== 'nebius' && process.env.NEBIUS_API_KEY) {
    tryRegister('nebius');
  }

  // OpenRouter is registered only when explicitly configured.
  if (configuredProvider === 'openrouter') {
    tryRegister('openrouter');
  }

  // Register custom providers (skip the one already registered as configured provider)
  if (llmConfig.customProviders?.length) {
    for (const cp of llmConfig.customProviders) {
      const providerId = `custom:${cp.name}`;
      if (providerId === configuredProvider) continue; // Already registered above
      tryRegister(providerId, { baseUrls: { [providerId]: cp.baseUrl } });
    }
  }

  // Safety net: the configured provider may be unregisterable (for
  // example HACKAGENT_PROVIDER names a provider whose API key is
  // missing) while another provider's native key is available in the
  // environment. Register one of those so a working LLM is always
  // preferred over template fallback.
  if (providers.length === 0) {
    for (const { provider, envVars: keys } of PROVIDER_NATIVE_KEYS) {
      if (provider !== configuredProvider && keys.some((key) => process.env[key])) {
        tryRegister(provider);
        if (providers.length > 0) break;
      }
    }
  }

  if (providers.length === 0) {
    throw new Error(`No LLM providers available. Errors: ${providerErrors.join('; ')}`);
  }

  const perfTracker = new ModelPerformanceTracker();
  const router = new RouterEngine(providers, {
    configuredProvider,
    configuredModel: llmConfig.model,
    perfTracker,
  });

  return { router, providers, config: llmConfig };
}

export function getProviderInfo(config?: LLMConfig): string {
  const llmConfig = config ?? getLLMConfig();
  const parts: string[] = [`provider: ${llmConfig.provider}`];
  if (llmConfig.baseUrl) parts.push(`endpoint: ${llmConfig.baseUrl}`);
  if (llmConfig.apiKey) parts.push(`apiKey: ${llmConfig.apiKey.slice(0, 8)}...`);
  if (llmConfig.model) parts.push(`model: ${llmConfig.model}`);
  return parts.join(', ');
}
