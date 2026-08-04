import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec, ProviderId } from '../../kernel/llm/llm-types.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';

class TimeoutMockProvider implements LLMProvider {
  public readonly providerId: string;
  private health: ProviderHealth;
  private models: ModelSpec[];
  private timeoutCount: number;
  private callCount = 0;

  constructor(providerId: string, models: ModelSpec[], timeoutCount: number) {
    this.providerId = providerId;
    this.models = models;
    this.timeoutCount = timeoutCount;
    this.health = {
      provider_id: providerId as ProviderId,
      status: 'healthy',
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 100,
    };
  }

  getModels(): ModelSpec[] { return this.models; }
  getHealth(): ProviderHealth { return { ...this.health }; }
  async checkHealth(): Promise<ProviderHealth> { return { ...this.health }; }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    this.callCount++;
    this.health.total_requests++;

    if (this.callCount <= this.timeoutCount) {
      this.health.consecutive_failures++;
      this.health.failed_requests++;
      const err = new Error('Aborted');
      err.name = 'AbortError';
      throw err;
    }

    this.health.consecutive_failures = 0;
    this.health.status = 'healthy';
    const content = JSON.stringify({ mock_response: true, provider: this.providerId });
    return {
      content,
      model_id: request.model_id,
      provider: this.providerId as ProviderId,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      finish_reason: 'stop',
      latency_ms: 100,
    };
  }
}

class SuccessMockProvider implements LLMProvider {
  public readonly providerId: string;
  private health: ProviderHealth;
  private models: ModelSpec[];

  constructor(providerId: string, models: ModelSpec[]) {
    this.providerId = providerId;
    this.models = models;
    this.health = {
      provider_id: providerId as ProviderId,
      status: 'healthy',
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 100,
    };
  }

  getModels(): ModelSpec[] { return this.models; }
  getHealth(): ProviderHealth { return { ...this.health }; }
  async checkHealth(): Promise<ProviderHealth> { return { ...this.health }; }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    this.health.total_requests++;
    this.health.consecutive_failures = 0;
    const content = JSON.stringify({ mock_response: true, provider: this.providerId, model: request.model_id });
    return {
      content,
      model_id: request.model_id,
      provider: this.providerId as ProviderId,
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
      finish_reason: 'stop',
      latency_ms: 100,
    };
  }
}

const nvidiaModels: ModelSpec[] = [
  { model_id: 'meta/llama-3.3-70b-instruct', provider: 'nvidia', capabilities: ['reasoning', 'code_generation', 'json_output'], context_window: 128000, supports_json_mode: true, supports_tool_calling: false, typical_latency_ms: 3000, cost_per_1k_input: 0.0009, cost_per_1k_output: 0.0009 },
  { model_id: 'meta/llama-3.1-8b-instruct', provider: 'nvidia', capabilities: ['reasoning', 'code_generation', 'json_output'], context_window: 128000, supports_json_mode: true, supports_tool_calling: false, typical_latency_ms: 2000, cost_per_1k_input: 0.00024, cost_per_1k_output: 0.00024 },
];

const openrouterModels: ModelSpec[] = [
  { model_id: 'qwen/qwen-2.5-coder-32b-instruct:free', provider: 'openrouter', capabilities: ['reasoning', 'code_generation', 'json_output'], context_window: 128000, supports_json_mode: true, supports_tool_calling: false, typical_latency_ms: 2000, cost_per_1k_input: 0, cost_per_1k_output: 0 },
];

const sampleRequest: LLMRequest = {
  model_id: 'meta/llama-3.3-70b-instruct',
  provider: 'nvidia',
  messages: [{ role: 'user', content: 'Write a function' }],
  temperature: 0.3,
  max_tokens: 4096,
  response_format: 'json_object',
};

describe('Router failover', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('blacklists timed-out model and falls back to next provider', async () => {
    const nvidia = new TimeoutMockProvider('nvidia', nvidiaModels, 2);
    const openrouter = new SuccessMockProvider('openrouter', openrouterModels);

    const engine = new RouterEngine([nvidia, openrouter], { configuredProvider: 'nvidia' });

    const result = await engine.execute('coding', sampleRequest);

    expect(result.response.content).toContain('mock_response');
    expect(result.decision.provider).toBe('openrouter');
    expect(nvidia.getHealth().failed_requests).toBe(2);
    expect(openrouter.getHealth().total_requests).toBe(1);
  });

  it('blacklists all timeout models and succeeds on last provider', async () => {
    const nvidia = new TimeoutMockProvider('nvidia', nvidiaModels, 10);
    const openrouter = new TimeoutMockProvider('openrouter', openrouterModels, 0);

    const engine = new RouterEngine([nvidia, openrouter], { configuredProvider: 'nvidia' });

    const result = await engine.execute('coding', sampleRequest);

    expect(result.response.content).toContain('mock_response');
    expect(result.decision.provider).toBe('openrouter');
  });

  it('throws descriptive error when all providers fail', async () => {
    const nvidia = new TimeoutMockProvider('nvidia', nvidiaModels, 10);
    const openrouter = new TimeoutMockProvider('openrouter', openrouterModels, 10);

    const engine = new RouterEngine([nvidia, openrouter], { configuredProvider: 'nvidia' });

    await expect(engine.execute('coding', sampleRequest)).rejects.toThrow('All models failed');
  });

  it('timeout model is blacklisted for current run only', async () => {
    const nvidia = new TimeoutMockProvider('nvidia', nvidiaModels, 1);
    const openrouter = new SuccessMockProvider('openrouter', openrouterModels);

    const engine = new RouterEngine([nvidia, openrouter], { configuredProvider: 'nvidia' });

    await engine.execute('coding', sampleRequest);

    engine.resetBlacklist();

    const nvidia2 = new SuccessMockProvider('nvidia', nvidiaModels);
    const engine2 = new RouterEngine([nvidia2, openrouter], { configuredProvider: 'nvidia' });
    engine2.resetBlacklist();

    const result = await engine2.execute('coding', sampleRequest);
    expect(result.decision.provider).toBe('nvidia');
  });

  it('OpenRouter provider works with correct API key', async () => {
    const openrouter = new SuccessMockProvider('openrouter', openrouterModels);
    const engine = new RouterEngine([openrouter], { configuredProvider: 'openrouter' });

    const req: LLMRequest = {
      model_id: 'qwen/qwen-2.5-coder-32b-instruct:free',
      provider: 'openrouter',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: 'json_object',
    };

    const result = await engine.execute('coding', req);
    expect(result.response.content).toContain('mock_response');
    expect(result.decision.provider).toBe('openrouter');
  });
});
