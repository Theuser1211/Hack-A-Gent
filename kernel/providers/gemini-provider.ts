import type { LLMProvider } from '../llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from '../llm/llm-types.js';

import type { LLMProviderConfig, StreamCallback } from './provider-types.js';
import { withRetry, DEFAULT_RETRY_CONFIG } from './provider-types.js';

const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

const MODELS: ModelSpec[] = [
  {
    model_id: 'gemini-2.5-pro',
    provider: 'gemini',
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
    context_window: 1048576,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.00125,
    cost_per_1k_output: 0.005,
  },
  {
    model_id: 'gemini-2.5-flash',
    provider: 'gemini',
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
    context_window: 1048576,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 500,
    cost_per_1k_input: 0.00015,
    cost_per_1k_output: 0.0006,
  },
];

export class GeminiProvider implements LLMProvider {
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
    this.baseUrl = config.config?.baseUrls?.gemini ?? BASE_URL;
    this.maxRetries = config.config?.maxRetries ?? DEFAULT_RETRY_CONFIG.maxRetries;
    this.timeoutMs = config.config?.timeoutMs ?? 30000;
    this.health = {
      provider_id: 'gemini',
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
    const apiKey = this.apiKeyManager.getKey('gemini');
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(`${this.baseUrl}/models?key=${apiKey}`, {
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
    const apiKey = this.apiKeyManager.getKey('gemini');
    const startTime = Date.now();

    if (this.rateLimitTracker.isRateLimited('gemini')) {
      throw new Error('Gemini rate limit exceeded');
    }

    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    for (const msg of request.messages) {
      const role = msg.role === 'assistant' ? 'model' : 'user';
      contents.push({ role, parts: [{ text: msg.content }] });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: request.temperature,
        maxOutputTokens: request.max_tokens,
      },
    };

    if (request.response_format === 'json_object') {
      (body.generationConfig as Record<string, unknown>).responseMimeType = 'application/json';
    }

    const model = request.model_id;
    const fetcher = async (): Promise<Record<string, unknown>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const url = `${this.baseUrl}/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (res.status === 429) {
          this.rateLimitTracker.recordRateLimit('gemini', new Date(Date.now() + 60000));
        }

        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining) {
          this.rateLimitTracker.recordResponse('gemini', parseInt(remaining), new Date(Date.now() + 60000), 100);
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '‹response body unavailable›');
          throw Object.assign(new Error(`Gemini API error ${res.status}: ${text}`), { status: res.status, retryAfter: res.headers.get('Retry-After') });
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

    const candidate = (data.candidates as Array<Record<string, unknown>>)?.[0];
    const contentPart = candidate?.content as Record<string, unknown>;
    const parts = (contentPart?.parts as Array<{ text?: string }>) ?? [];
    const content = parts.map((p) => p.text ?? '').join('');

    const usageMeta =
      (data.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number }) ??
      {};
    const promptTokens = usageMeta.promptTokenCount ?? content.length;
    const completionTokens = usageMeta.candidatesTokenCount ?? content.length;

    const finishReason = (candidate?.finishReason as string) ?? 'stop';

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'gemini',
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
      finish_reason: finishReason.toLowerCase(),
      latency_ms: latency,
    };

    this.tokenUsageTracker.recordFromResponse('gemini', request.model_id, response);
    return response;
  }

  async executeStream(request: LLMRequest, onChunk: StreamCallback): Promise<LLMResponse> {
    const apiKey = this.apiKeyManager.getKey('gemini');
    const startTime = Date.now();

    const model = request.model_id;
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    for (const msg of request.messages) {
      contents.push({ role: msg.role === 'assistant' ? 'model' : 'user', parts: [{ text: msg.content }] });
    }

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { temperature: request.temperature, maxOutputTokens: request.max_tokens },
    };

    const url = `${this.baseUrl}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const fullContent: string[] = [];

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '‹response body unavailable›');
        throw new Error(`Gemini API error ${res.status}: ${text}`);
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
            const candidate = (event.candidates as Array<Record<string, unknown>>)?.[0];
            const part = ((candidate?.content as Record<string, unknown>)?.parts as Array<{ text?: string }>) ?? [];
            for (const p of part) {
              if (p.text) {
                fullContent.push(p.text);
                onChunk({ content: p.text, finish_reason: null });
              }
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

    const response: LLMResponse = {
      content,
      model_id: request.model_id,
      provider: 'gemini',
      usage: { prompt_tokens: content.length, completion_tokens: content.length, total_tokens: content.length * 2 },
      finish_reason: 'stop',
      latency_ms: latency,
    };

    this.health.total_requests++;
    this.tokenUsageTracker.recordFromResponse('gemini', request.model_id, response);
    return response;
  }
}
