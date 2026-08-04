import { describe, it, expect, beforeEach } from 'vitest';

import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import type { LLMRequest, ModelSpec } from '../../kernel/llm/llm-types.js';
import { allMockProviders, mockLocalProvider } from '../../kernel/llm/mock-providers.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';
import type { ModelPerformanceTracker } from '../../kernel/routing/model-performance-tracker.js';

describe('RouterEngine', () => {
  let engine: RouterEngine;

  beforeEach(() => {
    engine = new RouterEngine(allMockProviders);
  });

  describe('selectModel', () => {
    it('selects preferred model for planning task', () => {
      const decision = engine.selectModel('planning', 1000);
      expect(decision.model_id).toBe('gemini-2.5-pro');
      expect(decision.confidence).toBeGreaterThanOrEqual(0.3);
      expect(decision.fallback_level).toBe(0);
    });

    it('selects preferred model for coding task', () => {
      const decision = engine.selectModel('coding', 1000);
      expect(decision.model_id).toBe('gpt-4o-mini-2024-07-18');
    });

    it('falls back when preferred fails', () => {
      const localEngine = new RouterEngine([mockLocalProvider]);
      const decision = localEngine.selectModel('planning', 1000);
      expect(decision.provider).toBe('local');
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
    });

    it('handles unknown task type with default chain', () => {
      const decision = engine.selectModel('unknown-task', 100);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('requires capabilities filter works', () => {
      const decision = engine.selectModel('coding', 1000, ['vision']);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('execute', () => {
    const sampleRequest: LLMRequest = {
      model_id: 'gemini-2.5-pro',
      provider: 'gemini',
      messages: [{ role: 'user', content: 'Write a function' }],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: 'text',
    };

    it('executes successfully and returns response with decision', async () => {
      const result = await engine.execute('coding', sampleRequest);
      expect(result.response).toBeDefined();
      expect(result.response.content).toContain('mock_response');
      expect(result.decision).toBeDefined();
      expect(result.decision.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('tracks project cost after execution', async () => {
      const before = engine.getProjectCost();
      await engine.execute('coding', sampleRequest);
      const after = engine.getProjectCost();
      expect(after).toBeGreaterThan(before);
    });

    it('throws when all providers are unhealthy', async () => {
      const badEngine = new RouterEngine([]);
      await expect(badEngine.execute('coding', sampleRequest)).rejects.toThrow('No suitable provider');
    });

    it('handles json_object response format', async () => {
      const req: LLMRequest = { ...sampleRequest, response_format: 'json_object' };
      const result = await engine.execute('coding', req);
      expect(result.response).toBeDefined();
    });
  });

  describe('health tracking', () => {
    it('getHealth returns provider health', () => {
      const health = engine.getHealth('gemini');
      expect(health).not.toBeNull();
      expect(health!.status).toBe('healthy');
    });

    it('getHealth returns null for unknown provider', () => {
      expect(engine.getHealth('unknown')).toBeNull();
    });
  });

  describe('getProvider', () => {
    it('returns registered provider', () => {
      const p = engine.getProvider('gemini');
      expect(p).toBeDefined();
      expect(p!.providerId).toBe('gemini');
    });

    it('returns undefined for unregistered provider', () => {
      expect(engine.getProvider('unknown')).toBeUndefined();
    });
  });

  describe('cost management', () => {
    it('resetProjectCost resets to zero', () => {
      engine.resetProjectCost();
      expect(engine.getProjectCost()).toBe(0);
    });

    it('cost accumulates across executions', async () => {
      engine.resetProjectCost();
      const req: LLMRequest = {
        model_id: 'gemini-2.5-pro',
        provider: 'gemini',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: 'text',
      };
      await engine.execute('coding', req);
      await engine.execute('coding', req);
      expect(engine.getProjectCost()).toBeGreaterThan(0);
    });
  });

  describe('fallback ranking (0% success models)', () => {
    // Provider whose model list puts the known-dead models BEFORE the never-tried
    // healthy model, so raw provider-list fallback ordering would burn calls on
    // them first. The router must rank the never-tried model ahead instead.
    class SelectiveFailProvider implements LLMProvider {
      readonly providerId = 'nvidia';
      private failModels = new Set(['fail-model', 'dead-model', 'dead-model2']);
      constructor(private models: ModelSpec[]) {}
      getModels(): ModelSpec[] {
        return this.models;
      }
      getHealth() {
        return {
          provider_id: 'nvidia' as const,
          status: 'healthy' as const,
          last_check: new Date().toISOString(),
          consecutive_failures: 0,
          total_requests: 0,
          failed_requests: 0,
          avg_latency_ms: 100,
        };
      }
      async checkHealth() {
        return this.getHealth();
      }
      async execute(request: LLMRequest) {
        if (this.failModels.has(request.model_id)) throw new Error('mock failure: ' + request.model_id);
        return {
          content: 'mock ok from ' + request.model_id,
          model_id: request.model_id,
          provider: 'nvidia' as const,
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
          finish_reason: 'stop' as const,
          latency_ms: 10,
        };
      }
    }

    const deadRecord = (attempts: number) => ({
      attempts,
      successes: 0,
      failures: attempts,
      timeouts: 1,
      emaLatencyMs: 1000,
      consecutiveTimeouts: 0,
      demotedUntil: null,
      lastAttempt: 1,
      lastSuccess: null,
    });

    const fakeTracker = {
      getRanked: (models: ModelSpec[]) => models,
      getRecord: (_p: string, mid: string) => {
        if (mid === 'dead-model') return deadRecord(5);
        if (mid === 'dead-model2') return deadRecord(3);
        return undefined;
      },
      recordSuccess: () => {},
      recordTimeout: () => {},
      recordFailure: () => {},
    } as unknown as ModelPerformanceTracker;

    const request: LLMRequest = {
      model_id: '',
      provider: 'nvidia',
      messages: [{ role: 'user', content: 'Write code' }],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: 'text',
    };

    it('skips known 0% success models in favor of never-tried models', async () => {
      const models: ModelSpec[] = [
        {
          model_id: 'fail-model',
          provider: 'nvidia',
          capabilities: ['code_generation', 'json_output'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 1000,
          cost_per_1k_input: 0.001,
          cost_per_1k_output: 0.001,
        },
        {
          model_id: 'dead-model',
          provider: 'nvidia',
          capabilities: ['code_generation'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 1000,
          cost_per_1k_input: 0.001,
          cost_per_1k_output: 0.001,
        },
        {
          model_id: 'dead-model2',
          provider: 'nvidia',
          capabilities: ['code_generation'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 1000,
          cost_per_1k_input: 0.001,
          cost_per_1k_output: 0.001,
        },
        {
          model_id: 'ok-model',
          provider: 'nvidia',
          capabilities: ['code_generation'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 1000,
          cost_per_1k_input: 0.001,
          cost_per_1k_output: 0.001,
        },
      ];

      const engine = new RouterEngine([new SelectiveFailProvider(models)], {
        configuredProvider: 'nvidia',
        configuredModel: 'fail-model',
        perfTracker: fakeTracker,
      });

      const result = await engine.execute('coding', request);
      // The configured model fails, so the router must fall back to the
      // never-tried healthy model — NOT the two known-dead ones that would
      // precede it in raw provider-list order.
      expect(result.decision.model_id).toBe('ok-model');
    });
  });

  describe('custom config and routing', () => {
    it('accepts custom routing table', () => {
      const customTable = {
        custom: { preferred: 'code-qwen-7b', fallback: 'mistral-small-2407', emergency: 'gemini-2.5-flash' },
      };
      const customEngine = new RouterEngine(allMockProviders, undefined, customTable);
      const decision = customEngine.selectModel('custom', 100);
      expect(decision.confidence).toBeGreaterThanOrEqual(0.3);
    });

    it('accepts custom config', () => {
      const customEngine = new RouterEngine(allMockProviders, { max_cost_per_project: 0.01, warn_at_pct: 0.5 });
      expect(customEngine).toBeDefined();
    });
  });

  describe('BLOCKER 1: Provider Routing', () => {
    const codingRequest: LLMRequest = {
      model_id: '',
      provider: 'gemini',
      messages: [{ role: 'user', content: 'Write code' }],
      temperature: 0.3,
      max_tokens: 4096,
      response_format: 'text',
    };

    it('uses only the configured provider when provider is explicitly set', async () => {
      const engine = new RouterEngine(allMockProviders, { configuredProvider: 'gemini' });
      const result = await engine.execute('coding', codingRequest);
      expect(result.decision.provider).toBe('gemini');
    });

    it('uses the configured model when both provider and model are set', async () => {
      const engine = new RouterEngine(allMockProviders, {
        configuredProvider: 'gemini',
        configuredModel: 'gemini-2.5-pro',
      });
      const result = await engine.execute('coding', codingRequest);
      expect(result.decision.model_id).toBe('gemini-2.5-pro');
      expect(result.decision.provider).toBe('gemini');
    });

    it('falls back to other models from same provider if configured model unavailable', async () => {
      const engine = new RouterEngine(allMockProviders, {
        configuredProvider: 'gemini',
        configuredModel: 'nonexistent-model',
      });
      const result = await engine.execute('coding', codingRequest);
      expect(result.decision.provider).toBe('gemini');
    });

    it('does not route to other providers when provider is configured', async () => {
      const engine = new RouterEngine(allMockProviders, { configuredProvider: 'gemini' });
      const result = await engine.execute('coding', codingRequest);
      expect(result.decision.provider).toBe('gemini');
    });

    it('selectModel respects configured provider', () => {
      const engine = new RouterEngine(allMockProviders, { configuredProvider: 'gemini' });
      const decision = engine.selectModel('coding', 1000);
      expect(decision.provider).toBe('gemini');
    });

    it('selectModel respects configured model', () => {
      const engine = new RouterEngine(allMockProviders, {
        configuredProvider: 'gemini',
        configuredModel: 'gemini-2.5-pro',
      });
      const decision = engine.selectModel('coding', 1000);
      expect(decision.model_id).toBe('gemini-2.5-pro');
      expect(decision.confidence).toBe(1.0);
    });

    it('getConfiguredProvider returns configured provider', () => {
      const engine = new RouterEngine(allMockProviders, { configuredProvider: 'gemini' });
      expect(engine.getConfiguredProvider()).toBe('gemini');
    });

    it('getConfiguredModel returns configured model', () => {
      const engine = new RouterEngine(allMockProviders, { configuredModel: 'gemini-2.5-pro' });
      expect(engine.getConfiguredModel()).toBe('gemini-2.5-pro');
    });
  });

  describe('production provider failover', () => {
    const model = (modelId: string, provider: 'nvidia' | 'openrouter'): ModelSpec => ({
      model_id: modelId,
      provider,
      capabilities: ['code_generation', 'json_output'],
      context_window: 128000,
      supports_json_mode: true,
      supports_tool_calling: false,
      typical_latency_ms: 10,
      cost_per_1k_input: 0,
      cost_per_1k_output: 0,
    });

    class RecordingProvider implements LLMProvider {
      public calls: string[] = [];

      constructor(
        public readonly providerId: 'nvidia' | 'openrouter',
        private readonly models: ModelSpec[],
        private readonly executeModel: (modelId: string) => Promise<string>,
      ) {}

      getModels(): ModelSpec[] {
        return this.models;
      }
      getHealth() {
        return {
          provider_id: this.providerId,
          status: 'healthy' as const,
          last_check: new Date().toISOString(),
          consecutive_failures: 0,
          total_requests: 0,
          failed_requests: 0,
          avg_latency_ms: 0,
        };
      }
      async checkHealth() {
        return this.getHealth();
      }
      async execute(request: LLMRequest) {
        this.calls.push(request.model_id);
        const content = await this.executeModel(request.model_id);
        return {
          content,
          model_id: request.model_id,
          provider: this.providerId,
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          finish_reason: 'stop',
          latency_ms: 1,
        };
      }
    }

    const request: LLMRequest = {
      model_id: '',
      provider: 'nvidia',
      messages: [{ role: 'user', content: 'generate' }],
      temperature: 0,
      max_tokens: 100,
      response_format: 'text',
    };

    it('tries every NVIDIA model in priority order before OpenRouter', async () => {
      const nvidiaIds = [
        'meta/llama-3.3-70b-instruct',
        'meta/llama-3.1-70b-instruct',
        'meta/llama-3.1-8b-instruct',
        'meta/llama-3.2-3b-instruct',
        'meta/llama-3.2-1b-instruct',
      ];
      const nvidia = new RecordingProvider(
        'nvidia',
        nvidiaIds.map((id) => model(id, 'nvidia')),
        async () => {
          throw Object.assign(new Error('model unavailable'), { status: 404 });
        },
      );
      const openrouter = new RecordingProvider(
        'openrouter',
        [model('qwen/qwen-coder:free', 'openrouter')],
        async () => 'ok',
      );
      const engine = new RouterEngine([nvidia, openrouter], { configuredProvider: 'nvidia' });

      const result = await engine.execute('coding', request);

      expect(nvidia.calls).toEqual(nvidiaIds);
      expect(openrouter.calls).toEqual(['qwen/qwen-coder:free']);
      expect(result.decision.provider).toBe('openrouter');
    });

    it('does not retry a blacklisted model in the same run', async () => {
      const nvidia = new RecordingProvider('nvidia', [model('dead', 'nvidia')], async () => {
        throw new DOMException('timed out', 'AbortError');
      });
      const openrouter = new RecordingProvider('openrouter', [model('healthy', 'openrouter')], async () => 'ok');
      const engine = new RouterEngine([nvidia, openrouter], { configuredProvider: 'nvidia' });

      await engine.execute('coding', request);
      await engine.execute('coding', request);

      expect(nvidia.calls).toEqual(['dead']);
      expect(openrouter.calls).toEqual(['healthy', 'healthy']);
    });

    it('skips an unavailable provider for the rest of the run', async () => {
      const nvidia = new RecordingProvider('nvidia', [model('nvidia-model', 'nvidia')], async () => {
        throw Object.assign(new Error('provider unavailable'), { status: 503 });
      });
      const openrouter = new RecordingProvider('openrouter', [model('healthy', 'openrouter')], async () => 'ok');
      const engine = new RouterEngine([nvidia, openrouter], { configuredProvider: 'nvidia' });

      await engine.execute('coding', request);
      await engine.execute('coding', request);

      expect(nvidia.calls).toEqual(['nvidia-model']);
      expect(openrouter.calls).toEqual(['healthy', 'healthy']);
    });
  });
});
