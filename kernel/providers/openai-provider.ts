import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';

import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from './provider-types.js';

const BASE_URL = 'https://api.openai.com/v1';

const MODELS: ModelSpec[] = [
  {
    model_id: 'gpt-4o-2024-11-20',
    provider: 'openai',
    capabilities: [
      'reasoning',
      'code_generation',
      'long_context',
      'json_output',
      'function_calling',
      'vision',
      'streaming',
      'multilingual',
    ],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.0025,
    cost_per_1k_output: 0.01,
  },
  {
    model_id: 'gpt-4o-mini-2024-07-18',
    provider: 'openai',
    capabilities: ['reasoning', 'code_generation', 'json_output', 'function_calling', 'streaming'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 800,
    cost_per_1k_input: 0.00015,
    cost_per_1k_output: 0.0006,
  },
];

export class OpenAIProvider implements LLMProvider {
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
    this.baseUrl = config.config?.baseUrls?.openai ?? BASE_URL;
    this.maxRetries = config.config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
    this.timeoutMs = config.config?.timeoutMs ?? 30000;
    this.health = {
      provider_id: 'openai',
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
    return { ...this.health };
  }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey('openai');
    const startTime = Date.now();

    if (this.rateLimitTracker.isRateLimited('openai')) {
      throw new Error('OpenAI rate limit exceeded');
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

    const fetcher = async (): Promise<Response> => {
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

        if (res.status === 429) {
          const resetAt = new Date(Date.now() + 60000);
          this.rateLimitTracker.recordRateLimit('openai', resetAt);
        }

        const remaining = res.headers.get('x-ratelimit-remaining-tokens');
        const reset = res.headers.get('x-ratelimit-reset-tokens');
        if (remaining && reset) {
          this.rateLimitTracker.recordResponse('openai', parseInt(remaining), new Date(reset), 100);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw Object.assign(new Error(`OpenAI API error ${res.status}: ${text}`), { status: res.status });
        }

        return res;
      } finally {
        clearTimeout(timeout);
      }
    };

    const retryConfig = { ...DEFAULT_RETRY_CONFIG, maxRetries: this.maxRetries };
    const res = await withRetry(fetcher, retryConfig);
    const data = (await res.json()) as Record<string, unknown>;

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
      provider: 'openai',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: finishReason,
      latency_ms: latency,
    };

    this.tokenUsageTracker.recordFromResponse('openai', request.model_id, response);
    return response;
  }

  async executeStream(request: LLMRequest, onChunk: StreamCallback): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey('openai');
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
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`OpenAI API error ${res.status}: ${text}`);
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
            const finish = (event.choices as Array<Record<string, unknown>>)?.[0]?.finish_reason as string | null;
            if (finish) {
              onChunk({ content: '', finish_reason: finish });
            }
          } catch {
            // skip malformed chunks
          }
        }
      }
    } finally {
      clearTimeout(timeout);
    }

    const latency = Date.now() - startTime;
    const content = fullContent.join('');

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'openai',
      usage: { prompt_tokens: content.length, completion_tokens: content.length, total_tokens: content.length * 2 },
      finish_reason: 'stop',
      latency_ms: latency,
    };

    this.health.total_requests++;
    this.tokenUsageTracker.recordFromResponse('openai', request.model_id, response);
    return response;
  }
}
