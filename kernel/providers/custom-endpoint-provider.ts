import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';

import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
import { readStreamedBody, sleep } from './provider-types.js';

import { debug, isVerbose } from '../../cli/output.js';

// Curated NVIDIA model catalog. Router selection for production code-generation
// is controlled in `kernel/llm/router-engine.ts` via STATIC_CODING_CHAIN, but
// this list is the pool those ids resolve against — an id absent here can never
// be selected. Validated by issuing real chat requests against the configured
// account (GET /v1/models is a global catalog that lists models this account
// cannot call and models that are retired). Only this model actually served a
// coding request; every other candidate returned 410/404, hung, or was empty.
export const DEFAULT_MODELS: ModelSpec[] = [
  {
    model_id: 'nvidia/nemotron-3-super-120b-a12b',
    provider: 'nvidia',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'long_context', 'streaming', 'multilingual'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 3000,
    cost_per_1k_input: 0,
    cost_per_1k_output: 0,
  },
];

// Curated Nebius Token Factory catalog. Nebius serves the same
// OpenAI-compatible API as NVIDIA NIM, but its managed catalog is
// distinct: the headline models are the NVIDIA Nemotron family plus
// other open-weight models. Nemotron satisfies the hackathon's
// "at least one NVIDIA open-source model" requirement on a platform
// that also satisfies "real runtime call to Nebius Token Factory".
export const NEBIUS_MODELS: ModelSpec[] = [
  {
    model_id: 'nvidia/nemotron-3-super-120b-a12b',
    provider: 'nebius',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'long_context', 'streaming', 'multilingual'],
    context_window: 262144,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 3000,
    cost_per_1k_input: 0.0003,
    cost_per_1k_output: 0.0009,
  },
  {
    model_id: 'nvidia/nemotron-3-nano-30b-a3b',
    provider: 'nebius',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'long_context', 'streaming', 'multilingual'],
    context_window: 262144,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.0001,
    cost_per_1k_output: 0.0003,
  },
  {
    model_id: 'nvidia/nemotron-3-ultra-550b-a55b',
    provider: 'nebius',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'long_context', 'streaming', 'multilingual'],
    context_window: 1048576,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 5000,
    cost_per_1k_input: 0.001,
    cost_per_1k_output: 0.003,
  },
  {
    model_id: 'deepseek-ai/DeepSeek-R1-0528',
    provider: 'nebius',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'long_context', 'streaming', 'multilingual'],
    context_window: 262144,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 4000,
    cost_per_1k_input: 0.001,
    cost_per_1k_output: 0.003,
  },
];

// ── Context-window normalization for discovered custom models ───────────────
// OpenAI-compatible /models endpoints report a per-model context window under a
// handful of field names. We read them in a deterministic priority order so the
// router's prompt-size gate (floor(context * 0.25)) uses real per-model capacity
// instead of the hardcoded 128000 default that made it inert on real workloads.
const CONTEXT_WINDOW_FIELDS = [
  'context_window',
  'context_length',
  'max_context_length',
  'max_input_tokens',
  'input_token_limit',
  'max_tokens',
] as const;

/**
 * Extract a reliable context-window value from a discovered model object.
 * Returns `undefined` when the provider gives no usable value, so the caller
 * NEVER invents a context window. `max_tokens` is last on purpose — some
 * endpoints report it as a per-model field but it may mean output cap, so it is
 * only used when none of the explicit context-window fields are present.
 */
export function normalizeContextWindow(model: Record<string, unknown>): number | undefined {
  for (const field of CONTEXT_WINDOW_FIELDS) {
    const value = model[field];
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
      return value;
    }
  }
  return undefined;
}

export class CustomEndpointProvider implements LLMProvider {
  public readonly providerId: string;
  private health: ProviderHealth;
  private apiKeyManager: LLMProviderConfig['apiKeyManager'];
  private rateLimitTracker: LLMProviderConfig['rateLimitTracker'];
  private tokenUsageTracker: LLMProviderConfig['tokenUsageTracker'];
  private baseUrl: string;
  private apiKeyEnvVar: string;
  private maxRetries: number;
  private idleTimeoutMs: number;
  private hardTimeoutMs: number;
  private models: ModelSpec[];
  private modelsDiscovered: boolean = false;
  private discoveryPromise?: Promise<void>;
  private requestTimestamps: number[] = [];
  private maxRpm: number = 40;
  private throttleWindowMs: number = 60000;

  constructor(config: LLMProviderConfig) {
    this.providerId = config.providerId;
    this.apiKeyManager = config.apiKeyManager;
    this.rateLimitTracker = config.rateLimitTracker;
    this.tokenUsageTracker = config.tokenUsageTracker;
    this.baseUrl =
      config.config?.baseUrls?.[config.providerId] ??
      config.config?.baseUrls?.custom ??
      config.config?.baseUrls?.nvidia ??
      config.config?.baseUrls?.nebius ??
      (config.providerId === 'nebius'
        ? 'https://api.tokenfactory.nebius.com/v1'
        : 'https://integrate.api.nvidia.com/v1');
    const isNamedCustom = config.providerId.startsWith('custom:');
    const isNvidia = config.providerId === 'nvidia';
    const isNebius = config.providerId === 'nebius';
    this.apiKeyEnvVar = isNvidia
      ? 'NVIDIA_API_KEY'
      : isNebius
        ? 'NEBIUS_API_KEY'
        : isNamedCustom
          ? `CUSTOM_${config.providerId.slice(7).toUpperCase()}_API_KEY`
          : 'CUSTOM_LLM_API_KEY';
    // Real LLM code generation routinely takes 30–60s+ (cold starts, long prompts,
    // 16k-token output). `idleTimeoutMs` (resets on every body byte) lets a slow
    // but actively-generating model keep going, while a dead/hung model that
    // produces no bytes aborts after the idle window. `hardTimeoutMs` is the
    // absolute ceiling so a trickling-but-stuck model can never hang forever.
    this.maxRetries = config.config?.maxRetries ?? 2;
    this.idleTimeoutMs = config.config?.idleTimeoutMs ?? config.config?.timeoutMs ?? 60000;
    this.hardTimeoutMs = config.config?.hardTimeoutMs ?? 600000;
    this.models = isNvidia
      ? DEFAULT_MODELS
      : isNebius
        ? NEBIUS_MODELS
        : DEFAULT_MODELS.map((m) => ({ ...m, provider: isNamedCustom ? 'custom' as const : 'custom' }));
    this.health = {
      provider_id: isNvidia ? 'nvidia' : isNebius ? 'nebius' : 'custom',
      status: 'healthy',
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 0,
    };

    if (isNamedCustom || config.providerId === 'custom') {
      this.discoveryPromise = this.createDiscoveryPromise();
    }
  }

  getModels(): ModelSpec[] {
    return this.models;
  }

  /**
   * Ensure model discovery has completed before the router selects a model.
   * The RouterEngine awaits this before issuing any request, so a custom
   * endpoint's real models are used instead of the bundled defaults. The
   * shared promise (same pattern as OpenRouterProvider) deduplicates the
   * /models fetch whether it was started by the constructor or here.
   */
  async prepare(): Promise<void> {
    // Model discovery exists for CUSTOM OpenAI-compatible endpoints, where the
    // real /models catalog must replace the bundled defaults. NVIDIA is a
    // managed API with a curated model list (DEFAULT_MODELS): discovery here
    // replaced it with the entire public catalog, and the router then ground
    // through hundreds of models (many queued >60s) before every generation
    // task failed and the pipeline fell back to templates.
    const isNamedCustom = this.providerId.startsWith('custom:');
    if (!isNamedCustom && this.providerId !== 'custom') return;
    // Fix: Don't perform model discovery for NVIDIA provider
    if (this.providerId === 'nvidia') return;
    // Nebius uses the curated NEBIUS_MODELS catalog: the /models
    // endpoint lists the entire public catalog, not the models this
    // account can call, so discovery would replace the vetted list.
    if (this.providerId === 'nebius') return;
    this.discoveryPromise ??= this.createDiscoveryPromise();
    await this.discoveryPromise;
  }

  private createDiscoveryPromise(): Promise<void> {
    return this.discoverModels().catch((err) => {
      this.discoveryPromise = undefined;
      throw err;
    });
  }

  private async discoverModels(): Promise<void> {
    if (this.modelsDiscovered) return;
    try {
      const apiKey = this.apiKeyManager.getKey(this.providerId);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        const data = (await res.json()) as {
          data?: Array<Record<string, unknown> & { id?: string }>;
        };
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          const discovered = data.data
            .filter((m) => typeof m?.id === 'string' && m.id.length > 0)
            .map(
              (m) =>
                ({
                  model_id: m.id,
                  provider: this.providerId as 'nvidia' | 'nebius' | 'custom',
                  capabilities: ['code_generation', 'reasoning', 'json_output', 'streaming'] as string[],
                  context_window: normalizeContextWindow(m) ?? 0,
                  supports_json_mode: true,
                  supports_tool_calling: false,
                  typical_latency_ms: 3000,
                  cost_per_1k_input: 0,
                  cost_per_1k_output: 0,
                }) as ModelSpec,
            );
          this.models = discovered;
          this.modelsDiscovered = true;
        }
      }
    } catch {
      // Discovery failed — keep default models
    }
  }

  getHealth(): ProviderHealth {
    return { ...this.health };
  }

  async checkHealth(): Promise<ProviderHealth> {
    const apiKey = this.apiKeyManager.getKey(this.providerId);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
      });
      clearTimeout(timeout);

      this.health = {
        ...this.health,
        status: res.ok ? 'healthy' : 'degraded',
        last_check: new Date().toISOString(),
        total_requests: this.health.total_requests + 1,
      };
    } catch {
      this.health = {
        ...this.health,
        status: 'unhealthy',
        last_check: new Date().toISOString(),
        consecutive_failures: this.health.consecutive_failures + 1,
      };
    }
    return { ...this.health };
  }

  private async waitIfThrottled(): Promise<void> {
    const now = Date.now();
    const windowStart = now - this.throttleWindowMs;
    this.requestTimestamps = this.requestTimestamps.filter((t) => t > windowStart);
    if (this.requestTimestamps.length >= this.maxRpm) {
      const oldest = this.requestTimestamps[0]!;
      const waitMs = oldest + this.throttleWindowMs - now + 100;
      if (waitMs > 0) await sleep(waitMs);
      this.requestTimestamps = this.requestTimestamps.filter((t) => t > Date.now() - this.throttleWindowMs);
    }
  }

  /** Per-stage execution timing. Only shown with --verbose or HAG_DEBUG=1. */
  private trace(msg: string): void {
    if (!isVerbose() && process.env.HAG_DEBUG !== '1' && process.env.HAG_DEBUG !== 'true') return;
    console.log(`  [${this.providerId}] ${msg}`);
  }

  private async executeWithTiming(
    request: LLMRequest,
    onChunk?: StreamCallback,
  ): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey(this.providerId);
    const startTime = Date.now();
    const modelShort = (request.model_id.split('/').pop() ?? request.model_id).replace(/-/g, ' ');

    const throttleStart = Date.now();
    await this.waitIfThrottled();
    const throttleMs = Date.now() - throttleStart;

    const body: Record<string, unknown> = {
      model: request.model_id,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
    };
    if (onChunk) body.stream = true;

    // NVIDIA NIM models don't reliably support response_format: json_object
    // Disable it for NVIDIA to avoid malformed JSON output. Nebius Token
    // Factory is a standard OpenAI-compatible service and does support it.
    if (request.response_format === 'json_object' && this.providerId !== 'nvidia') {
      body.response_format = { type: 'json_object' };
    }
    // Explicitly disable NVIDIA thinking/reasoning for deterministic output.
    if (this.providerId === 'nvidia') {
      (body as Record<string, unknown>).thinking = false;
    }

    const serializeStart = Date.now();
    const bodyText = JSON.stringify(body);
    const serializeMs = Date.now() - serializeStart;
    const promptChars = bodyText.length;
    this.trace(
      `prompt build ${serializeMs}ms (${(promptChars / 1024).toFixed(1)}KB, ${request.messages.length} messages, max_tokens=${request.max_tokens})${throttleMs > 0 ? `, throttle wait ${throttleMs}ms` : ''}`,
    );

    const controller = new AbortController();
    const hardTimer = setTimeout(() => controller.abort(), this.hardTimeoutMs);

    let data: unknown;
    let headersMs = -1;
    let bodyMs = -1;
    let parseMs = -1;
    try {
      const fetchStart = Date.now();
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: bodyText,
        signal: controller.signal,
      });
      headersMs = Date.now() - fetchStart;
      this.trace(`headers received in ${headersMs}ms (HTTP ${res.status})`);

      if (res.status === 429) {
        const resetHeader = res.headers.get('Retry-After');
        const resetMs = resetHeader ? parseInt(resetHeader) * 1000 : 60000;
        this.rateLimitTracker.recordRateLimit(this.providerId, new Date(Date.now() + resetMs));
      }

      if (!res.ok) {
        const textStart = Date.now();
        const text = await readStreamedBody(res, () => controller.abort(), this.idleTimeoutMs).catch(
          () => '‹response body unavailable›',
        );
        bodyMs = Date.now() - textStart;
        this.trace(`error body read in ${bodyMs}ms: ${text.slice(0, 200)}`);
        throw Object.assign(new Error(`${this.providerId} API error ${res.status}: ${text}`), {
          status: res.status,
          retryAfter: res.headers.get('Retry-After'),
        });
      }

      const readStart = Date.now();
      const raw = await readStreamedBody(res, () => controller.abort(), this.idleTimeoutMs);
      bodyMs = Date.now() - readStart;
      this.trace(`body received in ${bodyMs}ms (${(raw.length / 1024).toFixed(1)}KB)`);

      // FORENSIC: Log raw HTTP response body
      if (process.env.HAG_DEBUG_FORENSIC === '1') {
        console.error(`\n=== FORENSIC: Raw HTTP Response (${raw.length} chars) ===`);
        console.error(raw.slice(0, 5000));
        console.error(`=== END RAW HTTP RESPONSE ===\n`);
      }

      const parseStart = Date.now();
      data = JSON.parse(raw);
      parseMs = Date.now() - parseStart;
    } finally {
      clearTimeout(hardTimer);
    }

    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      throw new Error(`${this.providerId} invalid response: expected object`);
    }
    const choices = (data as { choices?: unknown }).choices as Array<{ message?: { content?: unknown }; finish_reason?: string }> | undefined;
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error(`${this.providerId} invalid response: missing choices array`);
    }
    const message = choices[0]!.message ?? {};
    const content = typeof message.content === 'string' ? message.content : '';

    const latency = Date.now() - startTime;
    this.trace(
      `${modelShort}: ${content.length.toLocaleString()} chars in ${latency}ms ` +
        `(headers ${headersMs}ms, body ${bodyMs}ms, parse ${parseMs}ms, throttle ${throttleMs}ms)`,
    );
    this.requestTimestamps.push(Date.now());
    this.health.total_requests++;
    this.health.consecutive_failures = 0;
    this.health.avg_latency_ms =
      this.health.total_requests === 1
        ? latency
        : Math.round(
            (this.health.avg_latency_ms * (this.health.total_requests - 1) + latency) / this.health.total_requests,
          );
    this.health.last_check = new Date().toISOString();
    const usage = (data as { usage?: unknown }).usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } ?? {};
    const promptTokens = usage.prompt_tokens ?? content.length;
    const completionTokens = usage.completion_tokens ?? content.length;
    const finishReason = choices[0]!.finish_reason ?? 'stop';

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: this.providerId as 'nvidia' | 'nebius' | 'custom',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: finishReason,
      latency_ms: latency,
    };

    this.tokenUsageTracker.recordFromResponse(this.providerId, request.model_id, response);
    return response;
  }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    return this.executeWithTiming(request);
  }

  async executeStream(request: LLMRequest, onChunk: StreamCallback): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey(this.providerId);
    const startTime = Date.now();

    if (this.rateLimitTracker.isRateLimited(this.providerId)) {
      throw new Error(`${this.providerId} rate limit exceeded`);
    }

    await this.waitIfThrottled();

    const body: Record<string, unknown> = {
      model: request.model_id,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: true,
    };

    if (request.response_format === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.hardTimeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (res.status === 429) {
        const resetHeader = res.headers.get('Retry-After');
        const resetMs = resetHeader ? parseInt(resetHeader) * 1000 : 60000;
        this.rateLimitTracker.recordRateLimit(this.providerId, new Date(Date.now() + resetMs));
      }

      if (!res.ok) {
        const text = await readStreamedBody(res, () => controller.abort(), this.idleTimeoutMs).catch(
          () => '‹response body unavailable›',
        );
        throw Object.assign(new Error(`${this.providerId} API error ${res.status}: ${text}`), {
          status: res.status,
          retryAfter: res.headers.get('Retry-After'),
        });
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';
      let idleTimer: NodeJS.Timeout | null = null;
      const armIdle = (): void => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => controller.abort(), this.idleTimeoutMs);
      };

      armIdle();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        armIdle();
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data) as Record<string, unknown>;
              const choice = (parsed.choices as Array<Record<string, unknown>>)?.[0];
              const delta = (choice?.delta as Record<string, unknown>)?.content as string | undefined;
              if (delta) {
                fullContent += delta;
                onChunk({
                  content: delta,
                  finish_reason: null,
                });
              }
            } catch {
              /* Ignore incomplete streaming JSON chunks. */
            }
          }
        }
      }
      if (idleTimer) clearTimeout(idleTimer);

      const latency = Date.now() - startTime;
      this.requestTimestamps.push(Date.now());
      this.health.total_requests++;
      this.health.avg_latency_ms =
        this.health.total_requests === 1
          ? latency
          : Math.round(
              (this.health.avg_latency_ms * (this.health.total_requests - 1) + latency) / this.health.total_requests,
            );
      this.health.last_check = new Date().toISOString();

      const response: LLMResponse = {
        content: fullContent,
        model_id: request.model_id,
        provider: this.providerId as 'nvidia' | 'nebius' | 'custom',
        usage: {
          prompt_tokens: Math.round(fullContent.length / 4),
          completion_tokens: fullContent.length,
          total_tokens: Math.round(fullContent.length / 4) + fullContent.length,
        },
        finish_reason: 'stop',
        latency_ms: latency,
      };

      return response;
    } catch (err) {
      this.health.failed_requests++;
      this.health.consecutive_failures++;
      if (this.health.consecutive_failures >= 5) this.health.status = 'degraded';
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }
}
