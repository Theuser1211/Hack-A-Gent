import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';

import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
const BASE_URL = 'https://openrouter.ai/api/v1';

const MODEL_PREFERENCE = ['qwen', 'deepseek', 'gemma', 'meta-llama', 'llama'];

export class OpenRouterProvider implements LLMProvider {
  public readonly providerId: string;
  private health: ProviderHealth;
  private apiKeyManager: LLMProviderConfig['apiKeyManager'];
  private rateLimitTracker: LLMProviderConfig['rateLimitTracker'];
  private tokenUsageTracker: LLMProviderConfig['tokenUsageTracker'];
  private baseUrl: string;
  private timeoutMs: number;
  private models: ModelSpec[] = [];
  private discoveryPromise?: Promise<void>;

  constructor(config: LLMProviderConfig) {
    this.providerId = config.providerId;
    this.apiKeyManager = config.apiKeyManager;
    this.rateLimitTracker = config.rateLimitTracker;
    this.tokenUsageTracker = config.tokenUsageTracker;
    this.baseUrl = config.config?.baseUrls?.openrouter ?? BASE_URL;
    this.timeoutMs = config.config?.timeoutMs ?? 30000;
    this.health = {
      provider_id: 'openrouter',
      status: 'healthy',
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 0,
    };
  }

  prepare(): Promise<void> {
    this.discoveryPromise ??= this.discoverFreeCodingModels();
    return this.discoveryPromise;
  }

  getModels(): ModelSpec[] {
    return this.models;
  }

  /**
   * Query OpenRouter's /models endpoint to discover free coding models.
   * Prefers Qwen, DeepSeek, Gemma, Llama in that order.
   */
  private async discoverFreeCodingModels(): Promise<void> {
    const apiKey = this.apiKeyManager.getKey('openrouter');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://hackagent.dev',
          'X-Title': 'Hack-A-Gent',
        },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw Object.assign(new Error(`OpenRouter model discovery failed with status ${res.status}`), {
          status: res.status,
        });
      }

      const data = (await res.json()) as {
        data?: Array<{
          id: string;
          context_length?: number;
          pricing?: { prompt?: string; completion?: string };
          supported_parameters?: string[];
        }>;
      };
      if (!Array.isArray(data.data)) {
        throw this.invalidResponseError('OpenRouter model discovery returned invalid JSON');
      }

      const discovered: ModelSpec[] = [];

      for (const m of data.data) {
        const promptPrice = parseFloat(m.pricing?.prompt ?? '1');
        const completionPrice = parseFloat(m.pricing?.completion ?? '1');
        if (promptPrice > 0 || completionPrice > 0) continue;

        const idLower = m.id.toLowerCase();
        const isCodingRelevant = MODEL_PREFERENCE.some((prefix) => idLower.includes(prefix));
        if (!isCodingRelevant) continue;

        const parameters = m.supported_parameters ?? [];
        const supportsJson = parameters.includes('response_format') || parameters.includes('structured_outputs');
        const capabilities: ModelSpec['capabilities'] = ['reasoning', 'code_generation', 'streaming'];
        if (supportsJson) capabilities.push('json_output');

        discovered.push({
          model_id: m.id,
          provider: 'openrouter',
          capabilities,
          context_window: m.context_length ?? 128000,
          supports_json_mode: supportsJson,
          supports_tool_calling: false,
          typical_latency_ms: 2000,
          cost_per_1k_input: 0,
          cost_per_1k_output: 0,
        });
      }

      discovered.sort((a, b) => {
        const rank = (id: string): number => {
          const index = MODEL_PREFERENCE.findIndex((prefix) => id.toLowerCase().includes(prefix));
          return index === -1 ? MODEL_PREFERENCE.length : index;
        };
        return rank(a.model_id) - rank(b.model_id) || a.model_id.localeCompare(b.model_id);
      });

      if (discovered.length === 0) {
        throw new Error('OpenRouter has no available free coding models');
      }
      this.models = discovered;
    } finally {
      clearTimeout(timeout);
    }
  }

  getHealth(): ProviderHealth {
    return { ...this.health };
  }

  async checkHealth(): Promise<ProviderHealth> {
    const apiKey = this.apiKeyManager.getKey('openrouter');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://hackagent.dev',
          'X-Title': 'Hack-A-Gent',
        },
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

  async execute(request: LLMRequest): Promise<LLMResponse> {
    await this.prepare();
    const apiKey = this.apiKeyManager.getKey('openrouter');
    const startTime = Date.now();

    if (this.rateLimitTracker.isRateLimited('openrouter')) {
      throw new Error('OpenRouter rate limit exceeded');
    }

    const body: Record<string, unknown> = {
      model: request.model_id,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
    };

    if (request.response_format === 'json_object') {
      body.response_format = { type: 'json_object' };
    }

    const fetcher = async (): Promise<Record<string, unknown>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://hackagent.dev',
            'X-Title': 'Hack-A-Gent',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.status === 429) {
          const resetAfter = res.headers.get('Retry-After');
          const resetAt = resetAfter
            ? new Date(Date.now() + parseInt(resetAfter) * 1000)
            : new Date(Date.now() + 60000);
          this.rateLimitTracker.recordRateLimit('openrouter', resetAt);
        }

        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining) {
          this.rateLimitTracker.recordResponse('openrouter', parseInt(remaining), new Date(Date.now() + 60000), 100);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '‹response body unavailable›');
          throw Object.assign(new Error(`OpenRouter API error ${res.status}: ${text}`), {
            status: res.status,
            retryAfter: res.headers.get('Retry-After'),
          });
        }

        return (await res.json()) as Record<string, unknown>;
      } finally {
        clearTimeout(timeout);
      }
    };

    const data = await fetcher();

    const latency = Date.now() - startTime;

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
    const message = choice?.message as Record<string, unknown> | undefined;
    if (!choice || !message || typeof message.content !== 'string' || !message.content.trim()) {
      throw this.invalidResponseError('OpenRouter returned an invalid chat completion response');
    }
    const content = message.content;

    const usage = (data.usage as { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }) ?? {};
    const promptTokens = usage.prompt_tokens ?? content.length;
    const completionTokens = usage.completion_tokens ?? content.length;

    const finishReason = (choice?.finish_reason as string) ?? 'stop';

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'openrouter',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: finishReason,
      latency_ms: latency,
    };

    this.tokenUsageTracker.recordFromResponse('openrouter', request.model_id, response);
    return response;
  }

  async executeStream(request: LLMRequest, onChunk: StreamCallback): Promise<LLMResponse> {
    await this.prepare();
    const apiKey = this.apiKeyManager.getKey('openrouter');
    const startTime = Date.now();

    const body: Record<string, unknown> = {
      model: request.model_id,
      messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: true,
    };

    const fullContent: string[] = [];

    const streamFetcher = async (): Promise<void> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://hackagent.dev',
            'X-Title': 'Hack-A-Gent',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const text = await res.text().catch(() => '‹response body unavailable›');
          throw Object.assign(new Error(`OpenRouter API error ${res.status}: ${text}`), { status: res.status });
        }

        const reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const json = line.slice(6).trim();
            if (!json || json === '[DONE]') continue;

            let event: Record<string, unknown>;
            try {
              event = JSON.parse(json) as Record<string, unknown>;
            } catch {
              throw this.invalidResponseError('OpenRouter returned malformed streaming JSON');
            }
            if (event.error) {
              throw new Error(`OpenRouter streaming error: ${JSON.stringify(event.error)}`);
            }
            const delta =
              ((event.choices as Array<Record<string, unknown>>)?.[0]?.delta as Record<string, unknown>) ?? {};
            const text = (delta.content as string) ?? '';
            if (text) {
              fullContent.push(text);
              onChunk({ content: text, finish_reason: null });
            }
          }
        }
      } finally {
        clearTimeout(timeout);
      }
    };

    await streamFetcher();

    const latency = Date.now() - startTime;
    const content = fullContent.join('');

    this.health.total_requests++;
    this.health.consecutive_failures = 0;
    this.health.avg_latency_ms =
      this.health.total_requests === 1
        ? latency
        : Math.round(
            (this.health.avg_latency_ms * (this.health.total_requests - 1) + latency) / this.health.total_requests,
          );
    this.health.last_check = new Date().toISOString();

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'openrouter',
      usage: { prompt_tokens: content.length, completion_tokens: content.length, total_tokens: content.length * 2 },
      finish_reason: 'stop',
      latency_ms: latency,
    };

    this.tokenUsageTracker.recordFromResponse('openrouter', request.model_id, response);
    return response;
  }

  private invalidResponseError(message: string): Error {
    return Object.assign(new Error(message), { name: 'InvalidProviderResponseError' });
  }
}
