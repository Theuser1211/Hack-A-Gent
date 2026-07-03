import { describe, it, expect } from 'vitest';

import {
  ModelCapabilitySchema,
  ProviderIdSchema,
  ProviderStatusSchema,
  ModelSpecSchema,
  ProviderHealthSchema,
  ProviderCapabilitiesSchema,
  RoutingDecisionSchema,
  RoutingTableEntrySchema,
  LLMRequestSchema,
  LLMResponseSchema,
} from '../../kernel/llm/llm-types.js';

describe('ModelCapabilitySchema', () => {
  it('accepts valid capabilities', () => {
    expect(ModelCapabilitySchema.parse('reasoning')).toBe('reasoning');
    expect(ModelCapabilitySchema.parse('code_generation')).toBe('code_generation');
    expect(ModelCapabilitySchema.parse('vision')).toBe('vision');
  });

  it('rejects invalid capabilities', () => {
    expect(() => ModelCapabilitySchema.parse('invalid')).toThrow();
  });
});

describe('ProviderIdSchema', () => {
  it('accepts valid provider IDs', () => {
    expect(ProviderIdSchema.parse('gemini')).toBe('gemini');
    expect(ProviderIdSchema.parse('local')).toBe('local');
  });

  it('rejects invalid provider IDs', () => {
    expect(() => ProviderIdSchema.parse('aws')).toThrow();
  });
});

describe('ProviderStatusSchema', () => {
  it('accepts valid statuses', () => {
    expect(ProviderStatusSchema.parse('healthy')).toBe('healthy');
    expect(ProviderStatusSchema.parse('degraded')).toBe('degraded');
  });
});

describe('ModelSpecSchema', () => {
  it('validates a complete model spec', () => {
    const spec = ModelSpecSchema.parse({
      model_id: 'test-model',
      provider: 'gemini',
      context_window: 128000,
      capabilities: ['reasoning'],
      supports_json_mode: true,
    });
    expect(spec.model_id).toBe('test-model');
    expect(spec.capabilities).toEqual(['reasoning']);
    expect(spec.cost_per_1k_input).toBe(0);
  });

  it('requires context_window', () => {
    expect(() => ModelSpecSchema.parse({ model_id: 'm', provider: 'local' })).toThrow();
  });
});

describe('ProviderHealthSchema', () => {
  it('validates with defaults', () => {
    const health = ProviderHealthSchema.parse({
      provider_id: 'mistral',
      last_check: '2026-01-01T00:00:00Z',
    });
    expect(health.status).toBe('healthy');
    expect(health.consecutive_failures).toBe(0);
  });

  it('requires last_check', () => {
    expect(() => ProviderHealthSchema.parse({ provider_id: 'nvidia' })).toThrow();
  });
});

describe('LLMRequestSchema', () => {
  it('validates a complete request', () => {
    const req = LLMRequestSchema.parse({
      model_id: 'gemini-2.5-pro',
      provider: 'gemini',
      messages: [{ role: 'user', content: 'Hello' }],
    });
    expect(req.temperature).toBe(0.3);
    expect(req.max_tokens).toBe(4096);
    expect(req.response_format).toBe('text');
  });

  it('accepts json_object format', () => {
    const req = LLMRequestSchema.parse({
      model_id: 'm',
      provider: 'local',
      messages: [{ role: 'user', content: 'test' }],
      response_format: 'json_object',
    });
    expect(req.response_format).toBe('json_object');
  });
});

describe('LLMResponseSchema', () => {
  it('validates a complete response', () => {
    const res = LLMResponseSchema.parse({
      content: 'response text',
      model_id: 'gemini-2.5-pro',
      provider: 'gemini',
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    expect(res.finish_reason).toBe('stop');
    expect(res.latency_ms).toBe(0);
  });
});

describe('RoutingDecisionSchema', () => {
  it('validates a routing decision', () => {
    const d = RoutingDecisionSchema.parse({
      model_id: 'm',
      provider: 'mistral',
      confidence: 0.8,
      reason: 'test',
    });
    expect(d.fallback_level).toBe(0);
  });
});

describe('RoutingTableEntrySchema', () => {
  it('validates a routing table entry', () => {
    const e = RoutingTableEntrySchema.parse({
      task_type: 'coding',
      preferred: 'a',
      fallback: 'b',
      emergency: 'c',
    });
    expect(e.task_type).toBe('coding');
  });
});
