import { z } from 'zod';

import type { LLMRequest, LLMResponse } from '../llm/llm-types.js';

export const APIKeySourceSchema = z.enum(['env', 'config', 'default']);
export type APIKeySource = z.infer<typeof APIKeySourceSchema>;

export interface ProviderConfig {
  apiKeys?: Record<string, string>;
  defaultModel?: string;
  maxRetries?: number;
  retryDelayMs?: number;
  timeoutMs?: number;
  baseUrls?: Record<string, string>;
  maxConcurrency?: number;
}

export const DEFAULT_PROVIDER_CONFIG: ProviderConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  timeoutMs: 30000,
  maxConcurrency: 5,
};

const ENV_KEY_MAP: Record<string, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  nvidia: 'NVIDIA_API_KEY',
  custom: 'CUSTOM_LLM_API_KEY',
};

export class ApiKeyManager {
  private keys: Map<string, { key: string; source: APIKeySource }> = new Map();

  constructor(configKeys?: Record<string, string>) {
    if (configKeys) {
      for (const [provider, key] of Object.entries(configKeys)) {
        this.keys.set(provider, { key, source: 'config' });
      }
    }
  }

  getKey(provider: string): string {
    const existing = this.keys.get(provider);
    if (existing) return existing.key;

    const envVar = ENV_KEY_MAP[provider];
    if (envVar) {
      const envKey = process.env[envVar];
      if (envKey) {
        this.keys.set(provider, { key: envKey, source: 'env' });
        return envKey;
      }
    }

    throw new Error(
      `No API key found for provider "${provider}". Set ${ENV_KEY_MAP[provider] ?? `${provider.toUpperCase()}_API_KEY`} env var or pass via config.`,
    );
  }

  hasKey(provider: string): boolean {
    try {
      this.getKey(provider);
      return true;
    } catch {
      return false;
    }
  }

  getSource(provider: string): APIKeySource | null {
    return this.keys.get(provider)?.source ?? null;
  }
}

export interface RateLimitState {
  remaining: number;
  resetAt: Date;
  limit: number;
}

export class RateLimitTracker {
  private limits: Map<string, RateLimitState> = new Map();

  recordResponse(provider: string, remaining: number, resetAt: Date, limit: number): void {
    this.limits.set(provider, { remaining, resetAt, limit });
  }

  recordRateLimit(provider: string, resetAt: Date): void {
    this.limits.set(provider, { remaining: 0, resetAt, limit: 0 });
  }

  isRateLimited(provider: string): boolean {
    const state = this.limits.get(provider);
    if (!state) return false;
    if (state.remaining > 0) return false;
    if (new Date() >= state.resetAt) {
      this.limits.delete(provider);
      return false;
    }
    return true;
  }

  getRemaining(provider: string): number {
    const state = this.limits.get(provider);
    if (!state) return -1;
    if (new Date() >= state.resetAt) {
      this.limits.delete(provider);
      return -1;
    }
    return state.remaining;
  }

  getResetAt(provider: string): Date | null {
    return this.limits.get(provider)?.resetAt ?? null;
  }

  clear(): void {
    this.limits.clear();
  }
}

export interface UsageRecord {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
  timestamp: string;
}

export interface UsageSummary {
  totalCost: number;
  totalTokens: number;
  byProvider: Record<string, { cost: number; tokens: number; requests: number }>;
  byModel: Record<string, { cost: number; tokens: number; requests: number }>;
}

export class TokenUsageTracker {
  private records: UsageRecord[] = [];
  private budgetLimit: number = Infinity;

  setBudgetLimit(limit: number): void {
    this.budgetLimit = limit;
  }

  recordUsage(provider: string, model: string, promptTokens: number, completionTokens: number, cost: number): void {
    this.records.push({
      provider,
      model,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      cost,
      timestamp: new Date().toISOString(),
    });
  }

  recordFromResponse(provider: string, model: string, response: LLMResponse): void {
    const inputCost = (response.usage.prompt_tokens / 1000) * this.getModelInputCost(model);
    const outputCost = (response.usage.completion_tokens / 1000) * this.getModelOutputCost(model);
    this.recordUsage(
      provider,
      model,
      response.usage.prompt_tokens,
      response.usage.completion_tokens,
      inputCost + outputCost,
    );
  }

  getTotalCost(provider?: string): number {
    if (provider) {
      return this.records.filter((r) => r.provider === provider).reduce((s, r) => s + r.cost, 0);
    }
    return this.records.reduce((s, r) => s + r.cost, 0);
  }

  getTotalTokens(provider?: string): number {
    if (provider) {
      return this.records.filter((r) => r.provider === provider).reduce((s, r) => s + r.totalTokens, 0);
    }
    return this.records.reduce((s, r) => s + r.totalTokens, 0);
  }

  getRequestCount(provider?: string): number {
    if (provider) {
      return this.records.filter((r) => r.provider === provider).length;
    }
    return this.records.length;
  }

  getSummary(): UsageSummary {
    const byProvider: Record<string, { cost: number; tokens: number; requests: number }> = {};
    const byModel: Record<string, { cost: number; tokens: number; requests: number }> = {};

    for (const r of this.records) {
      if (!byProvider[r.provider]) byProvider[r.provider] = { cost: 0, tokens: 0, requests: 0 };
      byProvider[r.provider]!.cost += r.cost;
      byProvider[r.provider]!.tokens += r.totalTokens;
      byProvider[r.provider]!.requests++;

      if (!byModel[r.model]) byModel[r.model] = { cost: 0, tokens: 0, requests: 0 };
      byModel[r.model]!.cost += r.cost;
      byModel[r.model]!.tokens += r.totalTokens;
      byModel[r.model]!.requests++;
    }

    return {
      totalCost: this.getTotalCost(),
      totalTokens: this.getTotalTokens(),
      byProvider,
      byModel,
    };
  }

  isOverBudget(): boolean {
    return this.getTotalCost() >= this.budgetLimit;
  }

  clear(): void {
    this.records = [];
  }

  private getModelInputCost(modelId: string): number {
    const rates: Record<string, number> = {
      'claude-sonnet-4-20250514': 0.003,
      'claude-haiku-3-5-20241022': 0.0008,
      'claude-opus-4-20250514': 0.015,
      'gemini-2.5-pro': 0.00125,
      'gemini-2.5-flash': 0.00015,
      'gpt-4o-2024-11-20': 0.0025,
      'gpt-4o-mini-2024-07-18': 0.00015,
    };
    return rates[modelId] ?? 0.002;
  }

  private getModelOutputCost(modelId: string): number {
    const rates: Record<string, number> = {
      'claude-sonnet-4-20250514': 0.015,
      'claude-haiku-3-5-20241022': 0.004,
      'claude-opus-4-20250514': 0.075,
      'gemini-2.5-pro': 0.005,
      'gemini-2.5-flash': 0.0006,
      'gpt-4o-2024-11-20': 0.01,
      'gpt-4o-mini-2024-07-18': 0.0006,
    };
    return rates[modelId] ?? 0.008;
  }
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  useJitter: boolean;
}

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  useJitter: true,
};

const STATUS_RETRYABLE = new Set([429, 500, 502, 503, 504]);

export function isRetryable(status: number): boolean {
  return STATUS_RETRYABLE.has(status);
}

export async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  attempt: number = 0,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (attempt >= config.maxRetries) throw err;

    const isAbortError =
      (err instanceof DOMException && err.name === 'AbortError') ||
      (err instanceof Error && err.name === 'AbortError');
    if (isAbortError) throw err;

    const status =
      err instanceof Response ? err.status : ((err as any)?.status ?? (err as any)?.statusCode ?? 0);

    if (status !== 0 && !isRetryable(status)) throw err;

    const retryAfter = (err as any)?.retryAfter;
    let delay: number;
    if (retryAfter) {
      delay = parseInt(retryAfter) * 1000;
      delay = Math.min(delay, config.maxDelayMs);
    } else {
      delay = Math.min(config.baseDelayMs * Math.pow(2, attempt), config.maxDelayMs);
    }
    const jitter = config.useJitter ? delay * (0.5 + ((Date.now() % 1000) / 2000)) : delay;

    await sleep(jitter);
    return withRetry(fn, config, attempt + 1);
  }
}

export interface StreamChunk {
  content: string;
  finish_reason: string | null;
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export type StreamCallback = (chunk: StreamChunk) => void;

export interface LLMProviderConfig {
  providerId: string;
  apiKeyManager: ApiKeyManager;
  rateLimitTracker: RateLimitTracker;
  tokenUsageTracker: TokenUsageTracker;
  config?: ProviderConfig;
}
