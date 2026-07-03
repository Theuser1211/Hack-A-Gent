import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';
import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from './provider-types.js';

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

  constructor(config: LLMProviderConfig) {
    this.providerId = config.providerId;
    this.apiKeyManager = config.apiKeyManager;
    this.rateLimitTracker = config.rateLimitTracker;
    this.tokenUsageTracker = config.tokenUsageTracker;
    this.baseUrl = config.config?.baseUrls?.custom ?? config.config?.baseUrls?.nvidia ?? 'https://integrate.api.nvidia.com/v1';
    this.apiKeyEnvVar = config.providerId === 'nvidia' ? 'NVIDIA_API_KEY' : 'CUSTOM_LLM_API_KEY';
    this.maxRetries = config.config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
    this.timeoutMs = config.config?.timeoutMs ?? 60000;
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
  }

  getModels(): ModelSpec[] {
    return this.models;
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

  async execute(request: LLMRequest): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey(this.providerId);
    const startTime = Date.now();

    if (this.rateLimitTracker.isRateLimited(this.providerId)) {
      throw new Error(`${this.providerId} rate limit exceeded`);
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
          this.rateLimitTracker.recordRateLimit(this.providerId, resetAt);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw Object.assign(new Error(`${this.providerId} API error ${res.status}: ${text}`), { status: res.status });
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
        const text = await res.text().catch(() => '');
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
            } catch {}
          }
        }
      }

      const latency = Date.now() - startTime;
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
    } finally {
      clearTimeout(timeout);
    }
  }
}