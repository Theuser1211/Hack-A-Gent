import type { ModelPerformanceTracker } from '../routing/model-performance-tracker.js';
import { sleep } from '../providers/provider-types.js';
import { icons } from '../../cli/output.js';

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
  configuredProvider?: string;
  configuredModel?: string;
  perfTracker?: ModelPerformanceTracker;
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

export interface RoutingEntry {
  /**
   * Fixed model chain tried in order. When present it fully replaces
   * preferred/fallback/emergency (which are kept for backward compatibility
   * with older custom routing tables).
   */
  chain?: string[];
  preferred?: string;
  fallback?: string;
  emergency?: string;
}

/**
 * The fixed NVIDIA chain mandated by the static routing policy. Whenever the
 * user's configured provider is in play (production path), the router tries
 * ONLY these models, in this exact order. No dynamic ranking, no model
 * discovery, no latency/performance-based reordering.
 */
export const STATIC_CODING_CHAIN: string[] = [
  'stepfun-ai/step-3.7-flash',
  'minimaxai/minimax-m3',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-8b-instruct',
];

export const DEFAULT_ROUTING_TABLE: Record<string, RoutingEntry> = {
  planning: { preferred: 'gemini-2.5-pro', fallback: 'claude-sonnet-4-20250514', emergency: 'gpt-4o-mini-2024-07-18' },
  architecture: {
    preferred: 'gemini-2.5-pro',
    fallback: 'claude-sonnet-4-20250514',
    emergency: 'gpt-4o-mini-2024-07-18',
  },
  coding: { chain: STATIC_CODING_CHAIN },
  implementation: { chain: STATIC_CODING_CHAIN },
  testing: {
    preferred: 'gpt-4o-mini-2024-07-18',
    fallback: 'gemini-2.5-flash',
    emergency: 'claude-haiku-3-5-20241022',
  },
  judging: { preferred: 'gemini-2.5-pro', fallback: 'claude-sonnet-4-20250514', emergency: 'gpt-4o-mini-2024-07-18' },
  documentation: {
    preferred: 'gemini-2.5-flash',
    fallback: 'claude-haiku-3-5-20241022',
    emergency: 'gpt-4o-mini-2024-07-18',
  },
};

export class RouterEngine {
  /** Provider ids that are classified as Tier 4 (local) rather than Tier 3 (cloud). */
  private static readonly LOCAL_PROVIDER_IDS = new Set<string>([
    'local',
    'ollama',
    'lmstudio',
    'llamacpp',
    'lm-studio',
  ]);

  private providers: Map<string, LLMProvider> = new Map();
  private config: RouterConfig;
  private routingTable: Record<string, RoutingEntry>;
  private projectCost: number = 0;
  private failedModels = new Set<string>();
  private failedProviders = new Set<string>();
  /** Per-run success cache: last model that completed a task type, keyed by taskType. */
  private successCache = new Map<string, string>();
  /** Model keys that already got their one 429 retry this run. */
  private rateLimitRetried = new Set<string>();

  constructor(
    providers: LLMProvider[],
    config?: Partial<RouterConfig>,
    routingTable?: Record<string, RoutingEntry>,
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

  getConfiguredProvider(): string | undefined {
    return this.config.configuredProvider;
  }

  getConfiguredModel(): string | undefined {
    return this.config.configuredModel;
  }

  selectModel(
    taskType: string,
    estimatedTokens: number,
    requiredCapabilities: ModelCapability[] = [],
  ): RoutingDecision {
    const configuredProvider = this.config.configuredProvider;
    const configuredModel = this.config.configuredModel;

    if (configuredProvider && configuredModel) {
      const provider = this.providers.get(configuredProvider);
      if (provider) {
        const model = provider.getModels().find((m) => m.model_id === configuredModel);
        if (model) {
          const health = provider.getHealth();
          if (health.status !== 'unhealthy') {
            return {
              model_id: configuredModel,
              provider: configuredProvider as ProviderId,
              confidence: 1.0,
              fallback_level: 0,
              reason: `Using configured model "${configuredModel}" from provider "${configuredProvider}"`,
            };
          }
        }
      }
    }

    if (configuredProvider) {
      const provider = this.providers.get(configuredProvider);
      if (provider) {
        const models = provider.getModels();
        const health = provider.getHealth();
        if (health.status !== 'unhealthy') {
          const bestModel = models[0];
          if (bestModel) {
            return {
              model_id: bestModel.model_id,
              provider: configuredProvider as ProviderId,
              confidence: 0.9,
              fallback_level: 0,
              reason: `Using configured provider "${configuredProvider}" with model "${bestModel.model_id}"`,
            };
          }
        }
      }
    }

    const chain = this.chainFor(taskType);

    for (let level = 0; level < chain.length; level++) {
      const modelId = chain[level]!;
      const decision = this.tryModel(modelId, taskType, estimatedTokens, requiredCapabilities, level);
      if (decision.confidence >= 0.3) return decision;
    }

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
    const requiredCaps: ModelCapability[] = [];
    if (request.response_format === 'json_object') requiredCaps.push('json_output');

    const configuredProvider = this.config.configuredProvider;
    const configuredModel = this.config.configuredModel;
    const pt = this.config.perfTracker;

    const triedModels = new Set<string>();
    let lastError: Error | null = null;

    // Tier 0 — success cache: reuse the last model that completed this task type.
    const cached = await this.trySuccessCache(taskType, request, requiredCaps);
    if (cached) return cached;

    // Tiered candidates: Tier 1 configured provider (NVIDIA static chain) →
    // Tier 2 OpenRouter free → Tier 3 other healthy cloud providers → Tier 4 local.
    const candidateProviders = this.orderProviders();

    if (candidateProviders.length === 0) {
      throw new Error(
        `No suitable provider for task type "${taskType}": No provider available. ` +
          `Run \`hag doctor\` to check provider health, or \`hag models\` to see available models.`,
      );
    }

    for (const providerId of candidateProviders) {
      if (this.failedProviders.has(providerId)) continue;

      const provider = this.providers.get(providerId);
      if (!provider) continue;
      const health = provider.getHealth();
      if (health.status === 'unhealthy') continue;

      try {
        await provider.prepare?.();
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.failedProviders.add(providerId);
        continue;
      }

      const models = provider
        .getModels()
        .filter((model) => requiredCaps.every((capability) => model.capabilities.includes(capability)));
      const modelIds = models.map((model) => model.model_id);
      let modelsToTry = modelIds;

      if (configuredProvider === providerId && configuredModel && modelIds.includes(configuredModel)) {
        modelsToTry = [configuredModel, ...modelIds.filter((modelId) => modelId !== configuredModel)];
      } else if (configuredProvider === providerId) {
        // STATIC ROUTER: the configured provider tries ONLY the fixed 4-model
        // chain, in the mandated order. Never sweep the provider's full model
        // list and never consult discovery / latency ranking. Template fallback
        // happens only when all four chain models genuinely fail.
        const staticOrder = STATIC_CODING_CHAIN.filter((modelId) => modelIds.includes(modelId));
        modelsToTry = staticOrder.length > 0 ? staticOrder : modelIds;
      } else if (!configuredProvider) {
        const chain = this.chainFor(taskType);
        const preferred = chain.filter((modelId) => modelIds.includes(modelId));
        modelsToTry = [...preferred, ...modelIds.filter((modelId) => !preferred.includes(modelId))];
      }

      let lastFail: { short: string; reason: string } | null = null;

      for (const modelId of modelsToTry) {
        const modelKey = `${providerId}:${modelId}`;
        if (triedModels.has(modelKey) || this.failedModels.has(modelKey)) continue;
        triedModels.add(modelKey);

        const model = models.find((m) => m.model_id === modelId);
        if (!model) continue;

        const startTime = Date.now();
        const thisShort = shortModel(modelId);

        if (lastFail) {
          this.chainLog(`${icons.warning} ${lastFail.short} — ${lastFail.reason} ${icons.arrow} Trying ${thisShort}...`);
          lastFail = null;
        } else {
          this.chainLog(`${icons.arrow} Trying ${thisShort}...`);
        }

        try {
          const { response, latencyMs } = await this.attemptModel(provider, modelId, request, requiredCaps);
          pt?.recordSuccess(providerId, modelId, latencyMs);
          this.successCache.set(taskType, modelKey);
          const cost = this.estimateCost(modelId, response.usage.prompt_tokens, response.usage.completion_tokens);
          this.projectCost += cost;
          this.chainLog(`${icons.success} ${thisShort} (${fmtLatency(latencyMs)})`);
          return {
            response: { ...response, latency_ms: latencyMs },
            decision: {
              model_id: modelId,
              provider: providerId as ProviderId,
              confidence: 1.0,
              fallback_level: 0,
              reason:
                configuredModel && modelId === configuredModel
                  ? `Using configured model "${modelId}"`
                  : `Model "${modelId}" from provider "${providerId}"`,
            },
          };
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));

          const status = this.getErrorStatus(err);
          if (status === 429 && !this.rateLimitRetried.has(modelKey)) {
            this.rateLimitRetried.add(modelKey);
            const retryAfter = (err as { retryAfter?: string }).retryAfter;
            const waitMs = retryAfter ? Math.min(parseInt(retryAfter) * 1000, 120000) : 60000;
            this.chainLog(
              `${icons.warning} ${thisShort} — rate limited (429), waiting ${Math.round(waitMs / 1000)}s then retrying once...`,
            );
            await sleep(waitMs);
            try {
              const { response, latencyMs } = await this.attemptModel(provider, modelId, request, requiredCaps);
              pt?.recordSuccess(providerId, modelId, latencyMs);
              this.successCache.set(taskType, modelKey);
              const cost = this.estimateCost(modelId, response.usage.prompt_tokens, response.usage.completion_tokens);
              this.projectCost += cost;
              this.chainLog(`${icons.success} ${thisShort} (after 429, ${fmtLatency(latencyMs)})`);
              return {
                response: { ...response, latency_ms: latencyMs },
                decision: {
                  model_id: modelId,
                  provider: providerId as ProviderId,
                  confidence: 1.0,
                  fallback_level: 0,
                  reason: `Model "${modelId}" from provider "${providerId}" (retried after 429)`,
                },
              };
            } catch (err2) {
              err = err2;
              lastError = err2 instanceof Error ? err2 : new Error(String(err2));
            }
          }
          lastFail = { short: thisShort, reason: this.failureNote(err, Date.now() - startTime) };

          if (pt) {
            const isAbort =
              (err instanceof DOMException && err.name === 'AbortError') ||
              (err instanceof Error && err.name === 'AbortError');
            if (isAbort) {
              pt.recordTimeout(providerId, modelId);
            } else {
              pt.recordFailure(providerId, modelId);
            }
          }
          if (this.isProviderUnavailable(err)) {
            this.failedProviders.add(providerId);
          } else if (this.shouldBlacklistModel(err)) {
            this.failedModels.add(modelKey);
          }
          if (health) {
            health.consecutive_failures++;
            health.failed_requests++;
            if (health.consecutive_failures >= this.config.unhealthy_threshold) {
              health.status = 'unhealthy';
            } else if (health.consecutive_failures >= this.config.degraded_threshold) {
              health.status = 'degraded';
            }
            if (health.consecutive_failures >= this.config.degraded_threshold) {
              this.failedProviders.add(providerId);
            }
          }
          if (this.failedProviders.has(providerId)) break;
        }
      }

      if (lastFail) {
        this.chainLog(`${icons.warning} ${lastFail.short} — ${lastFail.reason}`);
      }
    }

    const triedList = [...triedModels].join(', ');
    const lastMsg = lastError?.message ?? 'unknown error';
    throw new Error(
      `All models failed for task "${taskType}". Tried: [${triedList}]. ` +
        `Last error: ${lastMsg}. ` +
        `Run \`hag doctor\` to check provider health, or \`hag models\` to see available models.`,
    );
  }

  getProjectCost(): number {
    return this.projectCost;
  }

  resetProjectCost(): void {
    this.projectCost = 0;
  }

  private getErrorStatus(err: unknown): number {
    if (typeof err !== 'object' || err === null) return 0;
    return Number((err as Record<string, unknown>).status ?? 0);
  }

  /** Resolve the ordered chain for a task type (chain wins over legacy fields). */
  private chainFor(taskType: string): string[] {
    const entry = this.routingTable[taskType];
    if (entry?.chain && entry.chain.length > 0) return entry.chain;
    if (entry?.preferred) {
      return [entry.preferred, entry.fallback, entry.emergency].filter((m): m is string => !!m);
    }
    return ['gemini-2.5-flash', 'gpt-4o-mini-2024-07-18', 'claude-haiku-3-5-20241022'];
  }

  private shouldBlacklistModel(err: unknown): boolean {
    const status = this.getErrorStatus(err);
    return (
      status === 404 ||
      status === 410 ||
      (err instanceof Error && (err.name === 'AbortError' || err.name === 'InvalidProviderResponseError')) ||
      err instanceof SyntaxError
    );
  }

  private isProviderUnavailable(err: unknown): boolean {
    const status = this.getErrorStatus(err);
    if (status === 401 || status === 403 || status === 429 || status >= 500) return true;
    if (!(err instanceof Error)) return false;
    return /no api key|rate limit|provider unavailable|fetch failed|econnrefused|enotfound/i.test(err.message);
  }

  private invalidResponseError(message: string): Error {
    return Object.assign(new Error(message), { name: 'InvalidProviderResponseError' });
  }

  /** Reset run-scoped state before reusing this router for a separate hag run. */
  resetBlacklist(): void {
    this.failedModels.clear();
    this.failedProviders.clear();
    this.successCache.clear();
    this.rateLimitRetried.clear();
  }

  /** Provider order: Tier 1 configured → Tier 2 OpenRouter → Tier 3 cloud → Tier 4 local. */
  private orderProviders(): string[] {
    const configured = this.config.configuredProvider;
    const ordered: string[] = [];
    const push = (pid: string | undefined): void => {
      if (pid && this.providers.has(pid) && !ordered.includes(pid)) ordered.push(pid);
    };
    push(configured);
    push('openrouter');
    for (const [pid] of this.providers) {
      if (pid !== configured && pid !== 'openrouter' && !RouterEngine.LOCAL_PROVIDER_IDS.has(pid)) push(pid);
    }
    for (const [pid] of this.providers) {
      if (pid !== configured && pid !== 'openrouter' && RouterEngine.LOCAL_PROVIDER_IDS.has(pid)) push(pid);
    }
    return ordered;
  }

  /**
   * Tier 0: reuse the last model that completed this task type. A model that
   * already proved itself is preferred over re-probing the whole chain, per the
   * success-cache policy. Any failure here demotes it back to the full chain.
   */
  private async trySuccessCache(
    taskType: string,
    request: LLMRequest,
    requiredCaps: ModelCapability[],
  ): Promise<{ response: LLMResponse; decision: RoutingDecision } | null> {
    const key = this.successCache.get(taskType);
    if (!key) return null;

    const sep = key.indexOf(':');
    const providerId = key.slice(0, sep);
    const modelId = key.slice(sep + 1);
    const provider = this.providers.get(providerId);
    const model = provider?.getModels().find((m) => m.model_id === modelId);

    if (
      !provider ||
      !model ||
      this.failedProviders.has(providerId) ||
      this.failedModels.has(key) ||
      provider.getHealth().status === 'unhealthy' ||
      !requiredCaps.every((capability) => model.capabilities.includes(capability))
    ) {
      this.successCache.delete(taskType);
      return null;
    }

    try {
      await provider.prepare?.();
    } catch {
      this.failedProviders.add(providerId);
      this.successCache.delete(taskType);
      return null;
    }

    const startTime = Date.now();
    const thisShort = shortModel(modelId);
    try {
      const { response, latencyMs } = await this.attemptModel(provider, modelId, request, requiredCaps);
      this.config.perfTracker?.recordSuccess(providerId, modelId, latencyMs);
      this.successCache.set(taskType, key);
      const cost = this.estimateCost(modelId, response.usage.prompt_tokens, response.usage.completion_tokens);
      this.projectCost += cost;
      this.chainLog(`${icons.success} ${thisShort} (cached, ${fmtLatency(latencyMs)})`);
      return {
        response: { ...response, latency_ms: latencyMs },
        decision: {
          model_id: modelId,
          provider: providerId as ProviderId,
          confidence: 1.0,
          fallback_level: 0,
          reason: `Reusing last successful model "${modelId}" for ${taskType}`,
        },
      };
    } catch (err) {
      this.successCache.delete(taskType);
      const isAbort =
        (err instanceof DOMException && err.name === 'AbortError') ||
        (err instanceof Error && err.name === 'AbortError');
      const pt = this.config.perfTracker;
      if (pt) {
        if (isAbort) pt.recordTimeout(providerId, modelId);
        else pt.recordFailure(providerId, modelId);
      }
      if (this.isProviderUnavailable(err)) this.failedProviders.add(providerId);
      else if (this.shouldBlacklistModel(err)) this.failedModels.add(key);
      this.chainLog(
        `${icons.warning} ${thisShort} failed on reuse (${this.failureNote(err, Date.now() - startTime)}) ${icons.arrow} re-probing chain...`,
      );
      return null;
    }
  }

  private async attemptModel(
    provider: LLMProvider,
    modelId: string,
    request: LLMRequest,
    requiredCaps: ModelCapability[],
  ): Promise<{ response: LLMResponse; latencyMs: number }> {
    const actualRequest: LLMRequest = { ...request, model_id: modelId };
    const startTime = Date.now();
    const response = await provider.execute(actualRequest);
    if (!response.content.trim()) {
      throw this.invalidResponseError('Provider returned empty content');
    }
    if (request.response_format === 'json_object') {
      try {
        JSON.parse(response.content);
      } catch {
        throw this.invalidResponseError('Provider returned invalid JSON content');
      }
    }
    return { response, latencyMs: Date.now() - startTime };
  }

  /** Concise per-model chain logging for normal CLI runs (suppressed in tests). */
  private chainLog(msg: string): void {
    if (process.env.VITEST === 'true' || process.env.HAG_SILENT === '1') return;
    console.log(`  ${msg}`);
  }

  private failureNote(err: unknown, latencyMs: number): string {
    const status = this.getErrorStatus(err);
    if (err instanceof Error && err.name === 'AbortError') {
      return `Timed out (${Math.round(latencyMs / 1000)}s)`;
    }
    if (status === 429) return 'Rate limited (429)';
    if (status === 401 || status === 403) return 'Unauthorized';
    if (status >= 500) return `HTTP ${status}`;
    if (status === 404 || status === 410) return 'Model unavailable';
    const msg = err instanceof Error ? err.message : String(err);
    if (/empty content/i.test(msg)) return 'Empty response';
    return msg.length > 70 ? `${msg.slice(0, 67)}...` : msg;
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

    const matched = requiredCapabilities.filter((c) => model.capabilities.includes(c)).length;
    const total = requiredCapabilities.length || 1;
    score += weights.capability * (total === 0 ? 1 : matched / total);

    score += weights.context * Math.min(1, model.context_window / Math.max(estimatedTokens, 1));

    const successRate =
      health.total_requests > 0 ? (health.total_requests - health.failed_requests) / health.total_requests : 0.95;
    score += weights.history * successRate;

    score += weights.latency * (1 - Math.min(1, model.typical_latency_ms / 60000));

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

/** "stepfun-ai/step-3.7-flash" → "Step 3.7 Flash" for concise chain logs. */
function shortModel(modelId: string): string {
  const seg = modelId.split('/').pop() ?? modelId;
  return seg.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function fmtLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}
