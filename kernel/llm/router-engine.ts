import type { LLMProvider } from './llm-provider.js';
import type {
  ModelSpec,
  ProviderHealth,
  ProviderId,
  RoutingDecision,
  LLMRequest,
  LLMResponse,
  ModelCapability,
} from './llm-types.js';

export interface RouterConfig {
  degraded_threshold: number;
  unhealthy_threshold: number;
  recovery_cooldown_ms: number;
  max_cost_per_task: Record<string, number>;
  max_cost_per_project: number;
  warn_at_pct: number;
}

const DEFAULT_CONFIG: RouterConfig = {
  degraded_threshold: 5,
  unhealthy_threshold: 15,
  recovery_cooldown_ms: 30000,
  max_cost_per_task: {
    planning: 0.05,
    architecture: 0.1,
    coding: 0.15,
    testing: 0.1,
    judging: 0.05,
    documentation: 0.03,
    implementation: 0.15,
  },
  max_cost_per_project: 5.0,
  warn_at_pct: 0.8,
};

export const DEFAULT_ROUTING_TABLE: Record<string, { preferred: string; fallback: string; emergency: string }> = {
  planning: { preferred: 'gemini-2.5-pro', fallback: 'mistral-large-2407', emergency: 'llama-3.1-70b' },
  architecture: { preferred: 'gemini-2.5-pro', fallback: 'mistral-large-2407', emergency: 'llama-3.1-70b' },
  coding: { preferred: 'mistral-large-2407', fallback: 'gemini-2.5-flash', emergency: 'code-qwen-7b' },
  implementation: { preferred: 'mistral-large-2407', fallback: 'gemini-2.5-flash', emergency: 'code-qwen-7b' },
  testing: { preferred: 'mistral-large-2407', fallback: 'gemini-2.5-flash', emergency: 'code-qwen-7b' },
  judging: { preferred: 'gemini-2.5-pro', fallback: 'mistral-large-2407', emergency: 'llama-3.1-70b' },
  documentation: { preferred: 'gemini-2.5-flash', fallback: 'mistral-large-2407', emergency: 'code-qwen-7b' },
};

export class RouterEngine {
  private providers: Map<string, LLMProvider> = new Map();
  private config: RouterConfig;
  private routingTable: Record<string, { preferred: string; fallback: string; emergency: string }>;
  private projectCost: number = 0;

  constructor(
    providers: LLMProvider[],
    config?: Partial<RouterConfig>,
    routingTable?: Record<string, { preferred: string; fallback: string; emergency: string }>,
  ) {
    for (const p of providers) {
      this.providers.set(p.providerId, p);
    }
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.routingTable = { ...DEFAULT_ROUTING_TABLE, ...routingTable };
  }

  getProvider(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  getHealth(providerId: string): ProviderHealth | null {
    return this.providers.get(providerId)?.getHealth() ?? null;
  }

  selectModel(
    taskType: string,
    estimatedTokens: number,
    requiredCapabilities: ModelCapability[] = [],
  ): RoutingDecision {
    const entry = this.routingTable[taskType];
    const chain = entry
      ? [entry.preferred, entry.fallback, entry.emergency]
      : ['gemini-2.5-flash', 'mistral-small-2407', 'code-qwen-7b'];

    for (let level = 0; level < chain.length; level++) {
      const modelId = chain[level]!;
      const decision = this.tryModel(modelId, taskType, estimatedTokens, requiredCapabilities, level);
      if (decision.confidence >= 0.3) return decision;
    }

    // Fallback: iterate providers by priority
    for (const [, provider] of this.providers) {
      for (const model of provider.getModels()) {
        if (provider.getHealth().status === 'healthy' || provider.getHealth().status === 'degraded') {
          return {
            model_id: model.model_id,
            provider: model.provider,
            confidence: 0.3,
            fallback_level: 5,
            reason: 'All preferred models failed, using last resort',
          };
        }
      }
    }

    return {
      model_id: 'none',
      provider: 'local' as ProviderId,
      confidence: 0,
      fallback_level: 5,
      reason: 'No provider available',
    };
  }

  async execute(taskType: string, request: LLMRequest): Promise<{ response: LLMResponse; decision: RoutingDecision }> {
    const estimatedTokens = request.messages.reduce((s, m) => s + m.content.length, 0);
    const requiredCaps: ModelCapability[] = [];
    if (request.response_format === 'json_object') requiredCaps.push('json_output');

    const entry = this.routingTable[taskType];
    const chain = entry
      ? [entry.preferred, entry.fallback, entry.emergency]
      : ['gemini-2.5-flash', 'mistral-small-2407', 'code-qwen-7b'];

    const triedModels = new Set<string>();
    let lastError: Error | null = null;

    for (let level = 0; level < chain.length + 1; level++) {
      let decision: RoutingDecision;

      if (level < chain.length) {
        const modelId = chain[level]!;
        if (triedModels.has(modelId)) continue;
        decision = this.tryModel(modelId, taskType, estimatedTokens, requiredCaps, level);
        if (decision.confidence < 0.3) continue;
        triedModels.add(modelId);
      } else {
        decision = this.selectModel(taskType, estimatedTokens, requiredCaps);
        if (decision.confidence < 0.3 || decision.model_id === 'none') {
          throw new Error(`No suitable provider for task type "${taskType}": ${decision.reason}`);
        }
        if (triedModels.has(decision.model_id)) continue;
        triedModels.add(decision.model_id);
      }

      const provider = this.providers.get(decision.provider);
      if (!provider) continue;

      const actualRequest: LLMRequest = { ...request, model_id: decision.model_id };
      const startTime = Date.now();

      try {
        const response = await provider.execute(actualRequest);
        const cost = this.estimateCost(decision.model_id, response.usage.prompt_tokens, response.usage.completion_tokens);
        this.projectCost += cost;
        return { response: { ...response, latency_ms: Date.now() - startTime }, decision };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const health = provider.getHealth();
        if (health) {
          health.consecutive_failures++;
          health.failed_requests++;
          if (health.consecutive_failures >= this.config.unhealthy_threshold) {
            (health as any).status = 'unhealthy';
          } else if (health.consecutive_failures >= this.config.degraded_threshold) {
            (health as any).status = 'degraded';
          }
        }
        continue;
      }
    }

    throw lastError ?? new Error(`All models failed for task type "${taskType}"`);
  }

  getProjectCost(): number {
    return this.projectCost;
  }

  resetProjectCost(): void {
    this.projectCost = 0;
  }

  private tryModel(
    modelId: string,
    taskType: string,
    estimatedTokens: number,
    requiredCapabilities: ModelCapability[],
    level: number,
  ): RoutingDecision {
    for (const [, provider] of this.providers) {
      const model = provider.getModels().find((m) => m.model_id === modelId);
      if (!model) continue;

      const health = provider.getHealth();
      if (health.status === 'unhealthy') continue;

      const baseConfidence = this.computeConfidence(model, health, estimatedTokens, requiredCapabilities, taskType);
      const penalizedConfidence = baseConfidence * (1 - level * 0.15);

      if (penalizedConfidence >= 0.3) {
        return {
          model_id: modelId,
          provider: model.provider,
          confidence: Math.round(penalizedConfidence * 100) / 100,
          fallback_level: level,
          reason: level === 0 ? 'Preferred model selected' : `Fallback L${level} selected`,
        };
      }
    }

    return {
      model_id: modelId,
      provider: 'local' as ProviderId,
      confidence: 0,
      fallback_level: level,
      reason: 'Model not available or unhealthy',
    };
  }

  private computeConfidence(
    model: ModelSpec,
    health: ProviderHealth,
    estimatedTokens: number,
    requiredCapabilities: ModelCapability[],
    taskType: string,
  ): number {
    let score = 0;
    const weights = { capability: 0.35, context: 0.25, history: 0.2, latency: 0.1, cost: 0.1 };

    // Capability match
    const matched = requiredCapabilities.filter((c) => model.capabilities.includes(c)).length;
    const total = requiredCapabilities.length || 1;
    score += weights.capability * (matched / total);

    // Context window fit
    score += weights.context * Math.min(1, model.context_window / Math.max(estimatedTokens, 1));

    // Historical success
    const successRate =
      health.total_requests > 0 ? (health.total_requests - health.failed_requests) / health.total_requests : 0.95;
    score += weights.history * successRate;

    // Latency score
    score += weights.latency * (1 - Math.min(1, model.typical_latency_ms / 60000));

    // Cost efficiency
    const maxCost = this.config.max_cost_per_task[taskType] ?? 0.1;
    const estCost = this.estimateCost(model.model_id, estimatedTokens, Math.round(estimatedTokens * 0.3));
    const budgetRemaining = Math.max(0, this.config.max_cost_per_project - this.projectCost);
    const costScore = Math.min(
      1,
      Math.min(maxCost / Math.max(estCost, 0.001), budgetRemaining / Math.max(estCost, 0.001)),
    );
    score += weights.cost * costScore;

    return Math.min(1, Math.max(0, score));
  }

  private estimateCost(modelId: string, inputTokens: number, outputTokens: number): number {
    for (const [, provider] of this.providers) {
      const model = provider.getModels().find((m) => m.model_id === modelId);
      if (model) {
        return (inputTokens / 1000) * model.cost_per_1k_input + (outputTokens / 1000) * model.cost_per_1k_output;
      }
    }
    return 0;
  }
}
