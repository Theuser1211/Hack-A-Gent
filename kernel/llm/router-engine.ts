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
 * NVIDIA code-generation chain.
 *
 * Ids here were validated by issuing REAL chat requests against the configured
 * account, because `GET /v1/models` is a global catalog that is NOT authoritative:
 * it lists models this account cannot call (404 "Function not found for
 * account") and models that have been retired (410 Gone).
 *
 * Measured against the live account:
 *   - meta/llama-3.1-70b-instruct     410 Gone  (retired â€” the old chain's head)
 *   - meta/llama-3.1-8b-instruct      410 Gone  (retired)
 *   - openai/gpt-oss-120b             410 Gone  (retired)
 *   - nvidia/llama-3.1-nemotron-70b   404 not provisioned for this account
 *   - mistralai/codestral-22b         404 not provisioned for this account
 *   - openai/gpt-oss-20b              hangs (aborted at 45s; 504 after 302s)
 *   - deepseek-ai/deepseek-v4-flash   200 but empty content
 *   - nvidia/nemotron-3-super-120b-a12b  200, ~2.7s, valid TypeScript
 *
 * Only the last one actually serves this account, so the chain is exactly that.
 * A fabricated fallback would cost minutes of dead waiting per coding task.
 */
export const STATIC_CODING_CHAIN: string[] = ['nvidia/nemotron-3-super-120b-a12b'];

// â”€â”€ Capability profiles â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Only models confirmed present in the live NVIDIA catalog appear here. The
// ceilings below gate dispatch so an oversized request never reaches a model
// that would time out or return empty output.
//
// Retired/absent models removed after verifying GET /v1/models: step-3.7-flash
// and minimax-m3 (probe evidence: empty output / timeout on real
// code-generation prompts), and the meta/llama-3.1-* pair (no longer served,
// which made every coding task burn the first chain slots on guaranteed 404s).

interface CapabilityProfile {
  /** Maximum total prompt tokens (system + user) the model can handle. */
  maxPromptTokens: number;
  /** Maximum output tokens the model can reliably produce. */
  maxOutputTokens: number;
  /** Task categories this model is proven capable of. */
  suitable: Set<string>;
}

/** Conservative prompt ceiling used when a model declares no usable context window. */
const SMALL_MAX_PROMPT = 4000;

export const MODEL_CAPABILITY_PROFILES: Record<string, CapabilityProfile> = {
  'nvidia/nemotron-3-super-120b-a12b': {
    maxPromptTokens: 20000,
    maxOutputTokens: 8192,
    suitable: new Set(['planning', 'ideation', 'architecture', 'coding', 'docs', 'repair', 'implementation']),
  },
  // Nebius Token Factory serves the same NVIDIA Nemotron open-weight
  // family. Same profile as the NVIDIA NIM copy of the model.
  'nvidia/nemotron-3-nano-30b-a3b': {
    maxPromptTokens: 16000,
    maxOutputTokens: 8192,
    suitable: new Set(['planning', 'ideation', 'architecture', 'coding', 'docs', 'repair', 'implementation']),
  },
  'nvidia/nemotron-3-ultra-550b-a55b': {
    maxPromptTokens: 32000,
    maxOutputTokens: 16384,
    suitable: new Set(['planning', 'ideation', 'architecture', 'coding', 'docs', 'repair', 'implementation']),
  },
  'deepseek-ai/DeepSeek-R1-0528': {
    maxPromptTokens: 32000,
    maxOutputTokens: 16384,
    suitable: new Set(['planning', 'ideation', 'architecture', 'coding', 'docs', 'repair', 'implementation']),
  },
};

/** Map task types to capability categories for routing decisions. */
const TASK_CATEGORY: Record<string, string> = {
  planning: 'planning',
  ideation: 'ideation',
  architecture: 'architecture',
  coding: 'coding',
  implementation: 'coding',
  docs: 'docs',
  documentation: 'docs',
  repair: 'repair',
  improvement: 'repair',
  testing: 'coding',
  browser: 'repair',
};

const CUSTOM_NON_CODING_MODEL_RE =
  /whisper|tts|speech|audio|transcrib|embed|rerank|moderation|guard|vision|image|clip|bge|stt|asr|orpheus/i;
const CUSTOM_CODING_MODEL_HINT_RE =
  /llama|qwen|gpt|deepseek|codestral|mistral|mixtral|gemma|phi|claude|command|yi|starcoder|codellama|granite|gpt-oss|gpt-oss-20b|gpt-oss-120b|deepseek-v4-pro-0813|stepfun|step-3.7-flash|minimax-m3|llama-3.1-70b-instruct|llama-3.1-8b-instruct|llama-3.2-3b-instruct|llama-3.2-1b-instruct/i;
export const MIN_CODE_CONTEXT_WINDOW = 16000;

/** Rough token estimate: ceil(characters / 4). */
function estimateRequestTokens(request: LLMRequest): number {
  let chars = 0;
  for (const m of request.messages) chars += m.content.length;
  chars += 100; // overhead (role, formatting, response_format)
  return Math.ceil(chars / 4);
}

/**
 * Conservative prompt ceiling applied to `custom:*` provider models that have
 * no curated MODEL_CAPABILITY_PROFILES entry. Profiles are only defined for
 * the hardcoded NVIDIA catalog, so discovered custom::* models rely on their
 * declared `context_window`. We reserve a 25% fraction of the context window
 * for the prompt (leaving room for the model's output and formatting). When
 * `context_window` is missing/invalid, we fall back to the smallest
 * conservative prompt budget already used elsewhere in this routing table, so
 * we never dispatch an oversized prompt to a model of unknown capacity.
 */
const CUSTOM_CONTEXT_FRACTION = 0.25;
function customPromptCeiling(model: ModelSpec | undefined): number {
  const ctx = model?.context_window;
  if (typeof ctx !== 'number' || !Number.isFinite(ctx) || ctx <= 0) {
    return SMALL_MAX_PROMPT;
  }
  return Math.floor(ctx * CUSTOM_CONTEXT_FRACTION);
}

export const DEFAULT_ROUTING_TABLE: Record<string, RoutingEntry> = {
  planning: { preferred: 'gemini-3.1-pro-preview', fallback: 'claude-sonnet-4-20250514', emergency: 'gpt-4o-mini-2024-07-18' },
  architecture: {
    preferred: 'gemini-3.1-pro-preview',
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
  judging: { preferred: 'gemini-3.1-pro-preview', fallback: 'claude-sonnet-4-20250514', emergency: 'gpt-4o-mini-2024-07-18' },
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

    // When NVIDIA or Nebius is the configured coding provider, restrict execution to it
    // only. Failed managed-provider requests must not fall through to other providers
    // (e.g. custom:groq). The failure is returned to the caller via the existing
    // "all models failed" error.
    const managedCoding =
      (this.config.configuredProvider === 'nvidia' || this.config.configuredProvider === 'nebius') &&
      this.isCodeGenerationTask(taskType);

    const triedModels = new Set<string>();
    let lastError: Error | null = null;

    // Tier 0 â€” success cache: reuse the last model that completed this task type.
    const cached = await this.trySuccessCache(taskType, request, requiredCaps);
    if (cached) return cached;

    // Provider order is task-aware. For code generation with NVIDIA configured,
    // restrict to NVIDIA only so failures stay inside the NVIDIA path.
    let candidateProviders = this.orderProviders(taskType);
    if (managedCoding) {
      candidateProviders = candidateProviders.filter((pid) => pid === this.config.configuredProvider);
    }

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
        .filter((model) => requiredCaps.every((capability) => model.capabilities.includes(capability)))
        .filter((model) => this.isModelEligibleForTask(taskType, providerId, model));
      if (models.length === 0) continue;
      const modelIds = models.map((model) => model.model_id);
      let modelsToTry = modelIds;

      if (this.isCodeGenerationTask(taskType) && (providerId === 'nvidia' || providerId === 'nebius')) {
        // Production coding path: NVIDIA/Nebius use the explicit vetted chain only.
        const staticOrder = STATIC_CODING_CHAIN.filter((modelId) => modelIds.includes(modelId));
        modelsToTry = staticOrder.length > 0 ? staticOrder : modelIds;
      } else if (configuredProvider === providerId && configuredModel && modelIds.includes(configuredModel)) {
        modelsToTry = [configuredModel, ...modelIds.filter((modelId) => modelId !== configuredModel)];
      } else if (configuredProvider === providerId) {
        // Other configured providers (custom, OpenAI, Anthropic, etc.) use their own
        // discovered models. No static chain is imposed.
        modelsToTry = modelIds;
      } else if (!configuredProvider) {
        const chain = this.chainFor(taskType);
        const preferred = chain.filter((modelId) => modelIds.includes(modelId));
        modelsToTry = [...preferred, ...modelIds.filter((modelId) => !preferred.includes(modelId))];
      }

      let lastFail: { short: string; reason: string } | null = null;

      for (const modelId of modelsToTry) {
        const modelKey = `${providerId}:${modelId}`;
        if (triedModels.has(modelKey) || this.failedModels.has(modelKey)) continue;

        // Fast-fail: skip models that have never succeeded and timed out 3+ times.
        // This avoids wasting the full hard-timeout window (300s) on historically
        // dead models. The temporary demotion (5 min) handles short-lived issues;
        // this check handles permanently failing models across run restarts.
        const hist = pt?.getRecord(providerId, modelId);
        if (hist && hist.successes === 0 && hist.timeouts >= 3) {
          this.chainLog(`${icons.skip} ${shortModel(modelId)} â€” skipped (0/${hist.attempts} success, ${hist.timeouts} timeouts)`);
          triedModels.add(modelKey);
          continue;
        }

        triedModels.add(modelKey);

        const model = models.find((m) => m.model_id === modelId);
        if (!model) continue;

        // Capability-aware skip: don't send requests that exceed a model's
        // proven prompt size limit. This avoids wasting 120â€“300s on models
        // that produce empty output or timeout on oversized prompts. The skip
        // counts as intelligent filtering, NOT a failure.
        //
        // The gate is prompt size â€” the root cause of Step/MiniMax failures.
        // Probe evidence: Step produces empty output for prompts > ~1000 tokens
        // even with max_tokens=2K. MiniMax times out for prompts > ~1200 tokens.
        // Small prompts work for any task type, so task category is not gated.
        const profile = MODEL_CAPABILITY_PROFILES[modelId];
        if (profile) {
          const promptTokens = estimateRequestTokens(request);

          if (promptTokens > profile.maxPromptTokens) {
            this.chainLog(`${icons.skip} ${shortModel(modelId)} â€” skipped (prompt ${promptTokens}t > ${profile.maxPromptTokens}t limit)`);
            continue;
          }
        } else if (providerId.startsWith('custom:')) {
          // custom:* providers have no curated profiles, but we must not send
          // oversized prompts to models that may 413/400/timeout. Derive a
          // conservative prompt ceiling from the model's declared context
          // window and skip before dispatching to provider.execute().
          const promptTokens = estimateRequestTokens(request);
          const maxPrompt = customPromptCeiling(model);
          if (promptTokens > maxPrompt) {
            this.chainLog(`${icons.skip} ${providerId} / ${modelId} â€” skipped (prompt ${promptTokens}t > ${maxPrompt}t limit)`);
            continue;
          }
        }

        const startTime = Date.now();
        const thisShort = shortModel(modelId);

        if (lastFail) {
          this.chainLog(`${icons.warning} ${lastFail.short} â€” ${lastFail.reason} ${icons.arrow} Trying ${thisShort}...`);
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
            const waitMs = process.env.VITEST ? 10 : (retryAfter ? Math.min(parseInt(retryAfter) * 1000, 120000) : 60000);
            this.chainLog(
              `${icons.warning} ${thisShort} â€” rate limited (429), waiting ${Math.round(waitMs / 1000)}s then retrying once...`,
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
          // For managed coding providers (NVIDIA, Nebius) when configured, server errors
          // (503/504) must stay within that path. Handle one bounded retry, then fail.
          if (
            (configuredProvider === 'nvidia' || configuredProvider === 'nebius') &&
            this.isCodeGenerationTask(taskType) &&
            status >= 500
          ) {
            const nvidiaModelKey = `${providerId}:${modelId}`;
            if (!this.rateLimitRetried.has(nvidiaModelKey)) {
              this.rateLimitRetried.add(nvidiaModelKey);
              const retryAfter = (err as { retryAfter?: string }).retryAfter;
              const waitMs = process.env.VITEST ? 10 : (retryAfter ? Math.min(parseInt(retryAfter) * 1000, 120000) : 60000);
              this.chainLog(
                `${icons.warning} ${thisShort} â€” server error (${status}), waiting ${Math.round(waitMs / 1000)}s then retrying once for bounded NVIDIA retry...`,
              );
              await sleep(waitMs);
              try {
                const { response, latencyMs } = await this.attemptModel(provider, modelId, request, requiredCaps);
                pt?.recordSuccess(providerId, modelId, latencyMs);
                this.successCache.set(taskType, modelKey);
                const cost = this.estimateCost(modelId, response.usage.prompt_tokens, response.usage.completion_tokens);
                this.projectCost += cost;
                this.chainLog(`${icons.success} ${thisShort} (after server error retry, ${fmtLatency(latencyMs)})`);
                return {
                  response: { ...response, latency_ms: latencyMs },
                  decision: {
                    model_id: modelId,
                    provider: providerId as ProviderId,
                    confidence: 1.0,
                    fallback_level: 0,
                    reason: `Model "${modelId}" from provider "${providerId}" (retried after ${status})`,
                  },
                };
              } catch (err2) {
                err = err2;
                lastError = err2 instanceof Error ? err2 : new Error(String(err2));
                // Mark provider unavailable to break out of NVIDIA-only path and return error
                this.failedProviders.add(providerId);
              }
            } else {
              // Already retried, now mark as failed to break the loop
              this.failedProviders.add(providerId);
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
          if (this.isProviderUnavailable(err, providerId)) {
            this.failedProviders.add(providerId);
          } else if (this.shouldBlacklistModel(err)) {
            this.failedModels.add(modelKey);
          }
          if (health) {
            // For custom providers, don't count model-specific 401/403 as provider failures
            const status = this.getErrorStatus(err);
            const isCustomProvider = providerId.startsWith('custom:');
            const isModelAuthFailure = isCustomProvider && (status === 401 || status === 403);

            if (!isModelAuthFailure) {
              health.consecutive_failures++;
            }
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
        this.chainLog(`${icons.warning} ${lastFail.short} â€” ${lastFail.reason}`);
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

  private isProviderUnavailable(err: unknown, providerId?: string): boolean {
    const status = this.getErrorStatus(err);
    // 429 (rate limit) is RECOVERABLE â€” a transient throttle, not a provider
    // outage. It must go through the Retry-After cooldown mechanism, never
    // fuse into a permanent `failedProviders` blacklist that would keep the
    // provider from being used by every later phase in the run.
    if (status === 429) return false;
    // For custom providers, don't treat 401/403 as provider-unavailable â€”
    // a model-specific auth failure doesn't mean the whole provider is down.
    if (providerId?.startsWith('custom:')) {
      if (status === 401 || status === 403) return false;
    }
    if (status === 401 || status === 403 || status >= 500) return true;
    if (!(err instanceof Error)) return false;
    // NOTE: transient failures (fetch failed / ECONNRESET / ENOTFOUND) and
    // rate-limit signals are deliberately NOT provider-unavailable here. A
    // single blip (connection reset, dropped keep-alive socket) or throttle
    // burst does not mean the provider is down â€” permanently blacklisting it on
    // the first blip killed every remaining generation phase in one pipeline
    // run. Genuine outages surface through the consecutive-failure health
    // counter (degraded_threshold), which blacklists the provider only after
    // repeated failures.
    return /no api key|provider unavailable/i.test(err.message);
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
    // Reset provider health counters so repair can retry providers that became
    // degraded/unhealthy during a previous generation phase (e.g., NVIDIA 503).
    for (const provider of this.providers.values()) {
      const health = provider.getHealth();
      if (health) {
        health.status = 'healthy';
        health.consecutive_failures = 0;
        health.failed_requests = 0;
        health.total_requests = 0;
        health.avg_latency_ms = 0;
      }
    }
  }

  /** Provider order with NVIDIA-first policy for code-generation tasks. */
  private orderProviders(taskType: string): string[] {
    const configured = this.config.configuredProvider;
    const ordered: string[] = [];
    const push = (pid: string | undefined): void => {
      if (pid && this.providers.has(pid) && !ordered.includes(pid)) ordered.push(pid);
    };

    const includeOpenRouter = configured === 'openrouter';

    if (this.isCodeGenerationTask(taskType)) {
      push('nvidia');
      push('nebius');
      push(configured);
    } else {
      push(configured);
      push('nvidia');
      push('nebius');
    }

    for (const [pid] of this.providers) {
      if (pid === configured || pid === 'nvidia' || pid === 'nebius' || RouterEngine.LOCAL_PROVIDER_IDS.has(pid)) continue;
      if (pid === 'openrouter' && !includeOpenRouter) continue;
      push(pid);
    }

    for (const [pid] of this.providers) {
      if (pid === configured || pid === 'nvidia' || pid === 'nebius') continue;
      if (pid === 'openrouter' && !includeOpenRouter) continue;
      if (RouterEngine.LOCAL_PROVIDER_IDS.has(pid)) push(pid);
    }

    return ordered;
  }

  private isCodeGenerationTask(taskType: string): boolean {
    const category = TASK_CATEGORY[taskType] ?? taskType;
    return category === 'coding' || category === 'repair';
  }

  private isModelEligibleForTask(taskType: string, providerId: string, model: ModelSpec): boolean {
    if (!this.isCodeGenerationTask(taskType)) return true;
    if (!model.capabilities.includes('code_generation')) return false;
    if (model.context_window < MIN_CODE_CONTEXT_WINDOW) return false;

    if (providerId === 'nvidia' || providerId === 'nebius') {
      return STATIC_CODING_CHAIN.includes(model.model_id);
    }

    if (providerId.startsWith('custom:') || providerId === 'custom') {
      const id = model.model_id.toLowerCase();
      if (CUSTOM_NON_CODING_MODEL_RE.test(id)) return false;
      return CUSTOM_CODING_MODEL_HINT_RE.test(id);
    }

    return true;
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

    // Capability check for cached model: don't reuse a cached model that can't
    // handle the current request's prompt size.
    const cachedProfile = MODEL_CAPABILITY_PROFILES[modelId];
    const cachedPromptTokens = cachedProfile ? estimateRequestTokens(request) : 0;
    const cachedFitsPrompt = !cachedProfile || cachedPromptTokens <= cachedProfile.maxPromptTokens;

    if (
      !provider ||
      !model ||
      this.failedProviders.has(providerId) ||
      this.failedModels.has(key) ||
      provider.getHealth().status === 'unhealthy' ||
      !requiredCaps.every((capability) => model.capabilities.includes(capability)) ||
      !cachedFitsPrompt
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

    // Fast-fail on cached model reuse: skip if historically dead
    const hist = this.config.perfTracker?.getRecord(providerId, modelId);
    if (hist && hist.successes === 0 && hist.timeouts >= 3) {
      this.chainLog(`${icons.skip} ${thisShort} â€” cached model skipped (0/${hist.attempts} success, ${hist.timeouts} timeouts)`);
      this.successCache.delete(taskType);
      return null;
    }

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
      if (this.shouldBlacklistModel(err)) this.failedModels.add(key);
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
    const profile = MODEL_CAPABILITY_PROFILES[modelId];
    const maxTokens = profile ? Math.min(request.max_tokens, profile.maxOutputTokens) : request.max_tokens;
    const actualRequest: LLMRequest = { ...request, model_id: modelId, max_tokens: maxTokens };
    // Check cache first
    const cacheKey = this.responseCacheKey(actualRequest, provider.providerId, modelId);
    const cachedResponse = this.responseCache.get(cacheKey);
    if (cachedResponse) {
      return { response: cachedResponse, latencyMs: 0 };
    }

    const startTime = Date.now();
    const response = await provider.execute(actualRequest);
    
    // FORENSIC: Log raw assistant message content
    if (process.env.HAG_DEBUG_FORENSIC === '1') {
      console.error(`\n=== FORENSIC: Raw Assistant Content (${response.content.length} chars) ===`);
      console.error(response.content.slice(0, 5000));
      console.error(`=== END RAW ASSISTANT CONTENT ===\n`);
    }
    
if (!response.content.trim()) {
  throw this.invalidResponseError('Provider returned empty content');
}
this.responseCache.set(cacheKey, response);
    return { response, latencyMs: Date.now() - startTime };
  }

  private responseCache = new Map<string, LLMResponse>();

  private responseCacheKey(request: LLMRequest, providerId: string, modelId: string): string {
    // Key includes everything that can affect LLM output: messages (prompt/content),
    // provider/model identity, structured-output requirement, temperature, max_tokens.
    const msgPayload = JSON.stringify(request.messages);
    const structured = request.response_format ?? 'text';
    return `gen:${providerId}:${modelId}:${structured}:${request.temperature}:${request.max_tokens}:${msgPayload}`;
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

/** "stepfun-ai/step-3.7-flash" â†’ "Step 3.7 Flash" for concise chain logs. */
function shortModel(modelId: string): string {
  const seg = modelId.split('/').pop() ?? modelId;
  return seg.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function fmtLatency(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

