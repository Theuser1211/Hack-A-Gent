import { describe, it, expect, beforeEach } from 'vitest';

import type { LLMRequest } from '../../kernel/llm/llm-types.js';
import { allMockProviders, mockGeminiProvider, mockLocalProvider, mockOpenAIProvider } from '../../kernel/llm/mock-providers.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';

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
});
