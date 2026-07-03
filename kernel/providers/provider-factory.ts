import type { BuilderProvider } from '../builders/builder-provider.js';
import type { ContextEngine } from '../context/context-engine.js';
import type { LLMProvider } from '../llm/llm-provider.js';
import type { RouterEngine } from '../llm/router-engine.js';
import type { ArchitectProvider } from '../planning/architect-provider.js';
import type { PlanningProvider } from '../planning/planning-provider.js';
import type { PromptEngine } from '../prompts/prompt-engine.js';

import { AnthropicProvider } from './anthropic-provider.js';
import { CustomEndpointProvider } from './custom-endpoint-provider.js';
import { GeminiProvider } from './gemini-provider.js';
import { LLMArchitectProvider } from './llm-architect-provider.js';
import { LLMBuilderProvider } from './llm-builder-provider.js';
import { LLMPlanningProvider } from './llm-planning-provider.js';
import { OpenAIProvider } from './openai-provider.js';
import { OpenRouterProvider } from './openrouter-provider.js';
import { ApiKeyManager, RateLimitTracker, TokenUsageTracker } from './provider-types.js';
import type { ProviderConfig } from './provider-types.js';
import type { LLMProviderConfig } from './provider-types.js';

export class ProviderFactory {
  static createApiKeyManager(config?: ProviderConfig): ApiKeyManager {
    return new ApiKeyManager(config?.apiKeys);
  }

  static createRateLimitTracker(): RateLimitTracker {
    return new RateLimitTracker();
  }

  static createTokenUsageTracker(): TokenUsageTracker {
    return new TokenUsageTracker();
  }

  private static buildProviderConfig(
    providerId: string,
    apiKeyManager: ApiKeyManager,
    rateLimitTracker: RateLimitTracker,
    tokenUsageTracker: TokenUsageTracker,
    config?: ProviderConfig,
  ): LLMProviderConfig {
    return { providerId, apiKeyManager, rateLimitTracker, tokenUsageTracker, config };
  }

  static createLLMProvider(
    providerId: string,
    apiKeyManager: ApiKeyManager,
    rateLimitTracker: RateLimitTracker,
    tokenUsageTracker: TokenUsageTracker,
    config?: ProviderConfig,
  ): LLMProvider {
    const providerConfig = this.buildProviderConfig(
      providerId,
      apiKeyManager,
      rateLimitTracker,
      tokenUsageTracker,
      config,
    );

    switch (providerId) {
      case 'anthropic':
        return new AnthropicProvider(providerConfig);
      case 'gemini':
        return new GeminiProvider(providerConfig);
      case 'openai':
        return new OpenAIProvider(providerConfig);
      case 'openrouter':
        return new OpenRouterProvider(providerConfig);
      case 'nvidia':
      case 'custom':
        return new CustomEndpointProvider(providerConfig);
      default:
        throw new Error(`Unknown LLM provider: "${providerId}". Supported: anthropic, gemini, openai, openrouter, nvidia, custom`);
    }
  }

  static createPlanningProvider(router: RouterEngine, prompts: PromptEngine, context: ContextEngine): PlanningProvider {
    return new LLMPlanningProvider(router, prompts, context);
  }

  static createArchitectProvider(
    router: RouterEngine,
    prompts: PromptEngine,
    context: ContextEngine,
  ): ArchitectProvider {
    return new LLMArchitectProvider(router, prompts, context);
  }

  static createBuilderProvider(router: RouterEngine, prompts: PromptEngine, context: ContextEngine): BuilderProvider {
    return new LLMBuilderProvider(router, prompts, context);
  }
}
