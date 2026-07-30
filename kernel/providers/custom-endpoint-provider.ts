import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';

import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
import { withRetry, DEFAULT_RETRY_CONFIG, sleep } from './provider-types.js';

const DEFAULT_MODELS: ModelSpec[] = [
  {
    model_id: 'meta/llama-3.1-70b-instruct',
    provider: 'nvidia',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'streaming', 'multilingual'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 3000,
    cost_per_1k_input: 0.0009,
    cost_per_1k_output: 0.0009,
  },
  {
    model_id: 'mistralai/mixtral-8x7b-instruct-v0.1',
    provider: 'nvidia',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'streaming'],
    context_window: 32000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.00024,
    cost_per_1k_output: 0.00024,
  },
];

export class CustomEndpointProvider implements LLMProvider {
  public readonly providerId: string;
  private health: ProviderHealth;
  private apiKeyManager: LLMProviderConfig['apiKeyManager'];
  private rateLimitTracker: LLMProviderConfig['rateLimitTracker'];
  private tokenUsageTracker: LLMProviderConfig['tokenUsageTracker'];
  private baseUrl: string;
  private apiKeyEnvVar: string;
  private maxRetries: number;
  private timeoutMs: number;
  private models: ModelSpec[];
  private modelsDiscovered: boolean = false;
  private requestTimestamps: number[] = [];
  private maxRpm: number = 40;
  private throttleWindowMs: number = 60000;

  constructor(config: LLMProviderConfig) {
    this.providerId = config.providerId;
    this.apiKeyManager = config.apiKeyManager;
    this.rateLimitTracker = config.rateLimitTracker;
    this.tokenUsageTracker = config.tokenUsageTracker;
    this.baseUrl = config.config?.baseUrls?.custom ?? config.config?.baseUrls?.nvidia ?? 'https://integrate.api.nvidia.com/v1';
    this.apiKeyEnvVar = config.providerId === 'nvidia' ? 'NVIDIA_API_KEY' : 'CUSTOM_LLM_API_KEY';
    this.maxRetries = config.config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
    this.timeoutMs = config.config?.timeoutMs ?? 120000;
    this.models = config.providerId === 'nvidia' ? DEFAULT_MODELS : DEFAULT_MODELS.map(m => ({ ...m, provider: 'custom' as const }));
    this.health = {
      provider_id: config.providerId as 'nvidia' | 'custom',
      status: 'healthy',
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 0,
    };

    this.discoverModels();
  }

  getModels(): ModelSpec[] {
    return this.models;
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
        const data = (await res.json()) as { data?: Array<{ id: string }> };
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          const discovered = data.data.map(m => ({
            model_id: m.id,
            provider: this.providerId as 'nvidia' | 'custom',
            capabilities: ['code_generation', 'reasoning'] as string[],
            context_window: 128000,
            supports_json_mode: true,
            supports_tool_calling: false,
            typical_latency_ms: 3000,
            cost_per_1k_input: 0,
            cost_per_1k_output: 0,
          } as ModelSpec));
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
    this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);
    if (this.requestTimestamps.length >= this.maxRpm) {
      const oldest = this.requestTimestamps[0]!;
      const waitMs = oldest + this.throttleWindowMs - now + 100;
      if (waitMs > 0) await sleep(waitMs);
      this.requestTimestamps = this.requestTimestamps.filter(t => t > (Date.now() - this.throttleWindowMs));
    }
  }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey(this.providerId);
    const startTime = Date.now();

    const systemMsg = request.messages.find(m => m.role === 'system');
    const userMsg = request.messages.find(m => m.role === 'user');
    const promptTotalChars = request.messages.reduce((s, m) => s + m.content.length, 0);
    const bodyStr = JSON.stringify({
      model: request.model_id,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      response_format: request.response_format === 'json_object' ? { type: 'json_object' } : undefined,
    });

    process.stderr.write(`\n=== REQUEST ===\n`);
    process.stderr.write(`provider: ${this.providerId}\n`);
    process.stderr.write(`model: ${request.model_id}\n`);
    process.stderr.write(`endpoint URL: ${this.baseUrl}/chat/completions\n`);
    process.stderr.write(`request body size: ${bodyStr.length} bytes\n`);
    process.stderr.write(`total prompt length: ${promptTotalChars} characters\n`);
    process.stderr.write(`system prompt length: ${systemMsg ? systemMsg.content.length : 0} characters\n`);
    process.stderr.write(`user prompt length: ${userMsg ? userMsg.content.length : 0} characters\n`);
    process.stderr.write(`max_tokens: ${request.max_tokens}\n`);
    process.stderr.write(`temperature: ${request.temperature}\n`);
    process.stderr.write(`stream: false\n`);
    process.stderr.write(`response_format: ${request.response_format ?? 'text'}\n`);
    process.stderr.write(`headers (excl secrets): Content-Type: application/json\n`);

    if (this.rateLimitTracker.isRateLimited(this.providerId)) {
      throw new Error(`${this.providerId} rate limit exceeded`);
    }

    await this.waitIfThrottled();

    const body: Record<string, unknown> = {
      model: request.model_id,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
    };

    if (request.response_format === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    let abortElapsed: number | null = null;
    let abortStage = '';

    const fetcher = async (): Promise<Record<string, unknown>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => {
        abortElapsed = Date.now() - startTime;
        abortStage = stage;
        process.stderr.write(`\n=== ABORT FIRED ===\n`);
        process.stderr.write(`exact elapsed time: ${abortElapsed}ms\n`);
        process.stderr.write(`current stage: ${abortStage}\n`);
        process.stderr.write(`stack: ${new Error().stack}\n`);
        controller.abort();
      }, this.timeoutMs);

      let stage = 'before fetch()';
      try {
        stage = 'before fetch()';
        const t1 = Date.now();
        process.stderr.write(`\n=== TIMING ===\n`);
        process.stderr.write(`T0 (request created): 0ms\n`);

        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const t2 = Date.now();
        stage = 'waiting for headers';
        process.stderr.write(`T1 (fetch() called): ${t2 - startTime}ms\n`);

        if (res.status === 429) {
          const resetAt = new Date(Date.now() + 60000);
          this.rateLimitTracker.recordRateLimit(this.providerId, resetAt);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '‹response body unavailable›');
          throw Object.assign(new Error(`${this.providerId} API error ${res.status}: ${text}`), { status: res.status, retryAfter: res.headers.get('Retry-After') });
        }

        const t3 = Date.now();
        stage = 'before res.json()';
        process.stderr.write(`T2 (first response headers received): ${t3 - startTime}ms\n`);
        process.stderr.write(`response status: ${res.status}\n`);

        stage = 'reading response body';
        const data = await res.json();

        const t4 = Date.now();
        stage = 'after res.json()';
        process.stderr.write(`T3 (response body fully read + parsed): ${t4 - startTime}ms\n`);

        return data as Record<string, unknown>;
      } finally {
        clearTimeout(timeout);
      }
    };

    const retryConfig = { ...DEFAULT_RETRY_CONFIG, maxRetries: this.maxRetries };
    const data = await withRetry(fetcher, retryConfig);

    const t6 = Date.now();
    process.stderr.write(`T5 (JSON parsed, provider.execute() returns): ${t6 - startTime}ms\n`);
    const latency = Date.now() - startTime;

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

    const choice = (data.choices as Array<Record<string, unknown>>)?.[0];
    const message = (choice?.message as Record<string, unknown>) ?? {};
    const content = (message.content as string) ?? '';

    const usage = (data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) ?? {};
    const promptTokens = usage.prompt_tokens ?? content.length;
    const completionTokens = usage.completion_tokens ?? content.length;

    const finishReason = (choice?.finish_reason as string) ?? 'stop';

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: this.providerId as 'nvidia' | 'custom',
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
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

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

      if (!res.ok) {
        const text = await res.text().catch(() => '‹response body unavailable›');
        throw Object.assign(new Error(`${this.providerId} API error ${res.status}: ${text}`), { status: res.status });
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let fullContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
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
            } catch { /* Ignore incomplete streaming JSON chunks. */ }
          }
        }
      }

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
        provider: this.providerId as 'nvidia' | 'custom',
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