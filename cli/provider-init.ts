import { getLLMConfig, getDeployConfig, type LLMConfig } from '../cli/config-manager.js';
import type { LLMProvider } from '../kernel/llm/llm-provider.js';
import { RouterEngine } from '../kernel/llm/router-engine.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import { ModelPerformanceTracker } from '../kernel/routing/model-performance-tracker.js';

export interface ProviderInitializationResult {
  router: RouterEngine;
  providers: LLMProvider[];
  config: LLMConfig;
}

export function initializeProviders(config?: LLMConfig): ProviderInitializationResult {
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

  const apiKeyManager = ProviderFactory.createApiKeyManager(
    llmConfig.baseUrl ? { baseUrls: { [llmConfig.provider]: llmConfig.baseUrl } } : undefined
  );
  const rateLimitTracker = ProviderFactory.createRateLimitTracker();
  const tokenUsageTracker = ProviderFactory.createTokenUsageTracker();

  const providers: LLMProvider[] = [];
  const providerErrors: string[] = [];

  for (const providerId of [llmConfig.provider]) {
    try {
      const provider = ProviderFactory.createLLMProvider(
        providerId,
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
        llmConfig.baseUrl ? { baseUrls: { [providerId]: llmConfig.baseUrl } } : undefined
      );
      providers.push(provider);
    } catch (err) {
      providerErrors.push(`${providerId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (providers.length === 0) {
    throw new Error(`No LLM providers available. Errors: ${providerErrors.join('; ')}`);
  }

  const perfTracker = new ModelPerformanceTracker();
  const router = new RouterEngine(providers, {
    configuredProvider: llmConfig.provider,
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