import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';

import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from './provider-types.js';

const BASE_URL = 'https://openrouter.ai/api/v1';

const MODELS: ModelSpec[] = [
  {
    model_id: 'openrouter/auto',
    provider: 'openrouter',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'function_calling', 'streaming'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.002,
    cost_per_1k_output: 0.008,
  },
  {
    model_id: 'anthropic/claude-sonnet-4',
    provider: 'openrouter',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'streaming'],
    context_window: 200000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 3000,
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
  },
  {
    model_id: 'openai/gpt-4o',
    provider: 'openrouter',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'streaming'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 2500,
    cost_per_1k_input: 0.0025,
    cost_per_1k_output: 0.01,
  },
  {
    model_id: 'google/gemini-2.5-pro',
    provider: 'openrouter',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'streaming'],
    context_window: 1048576,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.00125,
    cost_per_1k_output: 0.005,
  },
  {
    model_id: 'meta-llama/llama-3.1-70b',
    provider: 'openrouter',
    capabilities: ['reasoning', 'code_generation', 'json_output'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 1500,
    cost_per_1k_input: 0.0009,
    cost_per_1k_output: 0.0009,
  },
  {
    model_id: 'mistralai/mistral-large',
    provider: 'openrouter',
    capabilities: ['reasoning', 'code_generation', 'json_output'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.009,
  },
];

export class OpenRouterProvider implements LLMProvider {
  public readonly providerId: string;
  private health: ProviderHealth;
  private apiKeyManager: LLMProviderConfig['apiKeyManager'];
  private rateLimitTracker: LLMProviderConfig['rateLimitTracker'];
  private tokenUsageTracker: LLMProviderConfig['tokenUsageTracker'];
  private baseUrl: string;
  private maxRetries: number;
  private timeoutMs: number;

  constructor(config: LLMProviderConfig) {
    this.providerId = config.providerId;
    this.apiKeyManager = config.apiKeyManager;
    this.rateLimitTracker = config.rateLimitTracker;
    this.tokenUsageTracker = config.tokenUsageTracker;
    this.baseUrl = config.config?.baseUrls?.openrouter ?? BASE_URL;
    this.maxRetries = config.config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
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

  getModels(): ModelSpec[] {
    return MODELS;
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
          throw Object.assign(new Error(`OpenRouter API error ${res.status}: ${text}`), { status: res.status, retryAfter: res.headers.get('Retry-After') });
        }

        return (await res.json()) as Record<string, unknown>;
      } finally {
        clearTimeout(timeout);
      }
    };

    const retryConfig = { ...DEFAULT_RETRY_CONFIG, maxRetries: this.maxRetries };
    const data = await withRetry(fetcher, retryConfig);

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
    const message = (choice?.message as Record<string, unknown>) ?? {};
    const content = (message.content as string) ?? '';

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
        throw new Error(`OpenRouter API error ${res.status}: ${text}`);
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

          try {
            const event = JSON.parse(json) as Record<string, unknown>;
            const delta =
              ((event.choices as Array<Record<string, unknown>>)?.[0]?.delta as Record<string, unknown>) ?? {};
            const text = (delta.content as string) ?? '';
            if (text) {
              fullContent.push(text);
              onChunk({ content: text, finish_reason: null });
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      this.health.failed_requests++;
      this.health.consecutive_failures++;
      if (this.health.consecutive_failures >= 5) this.health.status = 'degraded';
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    const latency = Date.now() - startTime;
    const content = fullContent.join('');

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'openrouter',
      usage: { prompt_tokens: content.length, completion_tokens: content.length, total_tokens: content.length * 2 },
      finish_reason: 'stop',
      latency_ms: latency,
    };

    this.health.total_requests++;
    this.tokenUsageTracker.recordFromResponse('openrouter', request.model_id, response);
    return response;
  }
}
