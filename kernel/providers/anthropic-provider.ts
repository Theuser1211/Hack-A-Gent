import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';

import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from './provider-types.js';

const BASE_URL = 'https://api.anthropic.com/v1';

const MODELS: ModelSpec[] = [
  {
    model_id: 'claude-sonnet-4-20250514',
    provider: 'anthropic',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'function_calling', 'streaming'],
    context_window: 200000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 2500,
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.015,
  },
  {
    model_id: 'claude-haiku-3-5-20241022',
    provider: 'anthropic',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'streaming'],
    context_window: 200000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 800,
    cost_per_1k_input: 0.0008,
    cost_per_1k_output: 0.004,
  },
  {
    model_id: 'claude-opus-4-20250514',
    provider: 'anthropic',
    capabilities: [
      'reasoning',
      'code_generation',
      'long_context',
      'json_output',
      'function_calling',
      'vision',
      'streaming',
    ],
    context_window: 200000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 4000,
    cost_per_1k_input: 0.015,
    cost_per_1k_output: 0.075,
  },
];

export class AnthropicProvider implements LLMProvider {
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
    this.baseUrl = config.config?.baseUrls?.anthropic ?? BASE_URL;
    this.maxRetries = config.config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
    this.timeoutMs = config.config?.timeoutMs ?? 30000;
    this.health = {
      provider_id: 'anthropic',
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
    const apiKey = this.apiKeyManager.getKey('anthropic');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${this.baseUrl}/models`, {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
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
    const apiKey = this.apiKeyManager.getKey('anthropic');
    const startTime = Date.now();

    if (this.rateLimitTracker.isRateLimited('anthropic')) {
      throw new Error('Anthropic rate limit exceeded');
    }

    const systemMsg = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model_id,
      messages: otherMessages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
    };

    if (systemMsg) {
      body.system = systemMsg.content;
    }

    if (request.response_format === 'json_object') {
      body.metadata = { ...((body.metadata as Record<string, unknown>) ?? {}), output_type: 'json' };
    }

    const fetcher = async (): Promise<Record<string, unknown>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}/messages`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.status === 429) {
          const resetAfter = res.headers.get('Retry-After');
          const resetAt = resetAfter
            ? new Date(Date.now() + parseInt(resetAfter) * 1000)
            : new Date(Date.now() + 60000);
          this.rateLimitTracker.recordRateLimit('anthropic', resetAt);
        }

        const remaining = res.headers.get('x-ratelimit-remaining');
        const reset = res.headers.get('x-ratelimit-reset');
        if (remaining && reset) {
          this.rateLimitTracker.recordResponse('anthropic', parseInt(remaining), new Date(reset), 100);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '‹response body unavailable›');
          throw Object.assign(new Error(`Anthropic API error ${res.status}: ${text}`), { status: res.status, retryAfter: res.headers.get('Retry-After') });
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

    const content = (data.content as Array<{ text?: string }>)?.[0]?.text ?? JSON.stringify(data);
    const usage = (data.usage as { input_tokens?: number; output_tokens?: number }) ?? {};
    const promptTokens = usage.input_tokens ?? content.length;
    const completionTokens = usage.output_tokens ?? content.length;

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'anthropic',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: (data.stop_reason as string) ?? 'stop',
      latency_ms: latency,
    };

    this.tokenUsageTracker.recordFromResponse('anthropic', request.model_id, response);
    return response;
  }

  async executeStream(request: LLMRequest, onChunk: StreamCallback): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey('anthropic');
    const startTime = Date.now();

    const systemMsg = request.messages.find((m) => m.role === 'system');
    const otherMessages = request.messages.filter((m) => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: request.model_id,
      messages: otherMessages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: request.max_tokens,
      temperature: request.temperature,
      stream: true,
    };

    if (systemMsg) body.system = systemMsg.content;

    const fullContent: string[] = [];
    let totalInput = 0;
    let totalOutput = 0;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await fetch(`${this.baseUrl}/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '‹response body unavailable›');
        throw new Error(`Anthropic API error ${res.status}: ${text}`);
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
            if (event.type === 'content_block_delta') {
              const delta = (event.delta as { text?: string }) ?? {};
              if (delta.text) {
                fullContent.push(delta.text);
                onChunk({ content: delta.text, finish_reason: null });
              }
            }
            if (event.type === 'message_delta') {
              const usage = (event.usage ?? (event as unknown)) as
                | { input_tokens?: number; output_tokens?: number }
                | undefined;
              if (usage) {
                totalInput = usage.input_tokens ?? totalInput;
                totalOutput = usage.output_tokens ?? totalOutput;
              }
            }
            if (event.type === 'message_stop' || (event as any).stop_reason) {
              const stopReason = (event as any).stop_reason ?? 'stop';
              onChunk({ content: '', finish_reason: stopReason });
            }
          } catch {
            // skip malformed chunks
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
    const promptTokens = totalInput || content.length;
    const completionTokens = totalOutput || content.length;

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'anthropic',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: 'stop',
      latency_ms: latency,
    };

    this.health.total_requests++;
    this.health.avg_latency_ms =
      this.health.total_requests === 1
        ? latency
        : Math.round(
            (this.health.avg_latency_ms * (this.health.total_requests - 1) + latency) / this.health.total_requests,
          );
    this.tokenUsageTracker.recordFromResponse('anthropic', request.model_id, response);

    return response;
  }
}
