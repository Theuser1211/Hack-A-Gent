import { describe, it, expect } from 'vitest';

import {
  mockGeminiProvider,
  mockNvidiaProvider,
  mockMistralProvider,
  mockLocalProvider,
  allMockProviders,
} from '../../kernel/llm/mock-providers.js';

describe('BaseMockProvider', () => {
  describe('mockGeminiProvider', () => {
    it('has gemini providerId', () => {
      expect(mockGeminiProvider.providerId).toBe('gemini');
    });

    it('returns models', () => {
      const models = mockGeminiProvider.getModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models[0]!.provider).toBe('gemini');
    });

    it('returns healthy by default', () => {
      const health = mockGeminiProvider.getHealth();
      expect(health.status).toBe('healthy');
    });

    it('executes successfully and returns response', async () => {
      const res = await mockGeminiProvider.execute({
        model_id: 'gemini-2.5-pro',
        provider: 'gemini',
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.3,
        max_tokens: 4096,
        response_format: 'text',
      });
      expect(res.content).toContain('mock_response');
      expect(res.provider).toBe('gemini');
      expect(res.usage.prompt_tokens).toBeGreaterThan(0);
    });
  });

  describe('mockNvidiaProvider', () => {
    it('has nvidia providerId', () => {
      expect(mockNvidiaProvider.providerId).toBe('nvidia');
    });

    it('returns Llama models', () => {
      const models = mockNvidiaProvider.getModels();
      expect(models.some((m) => m.model_id.includes('llama'))).toBe(true);
    });
  });

  describe('mockMistralProvider', () => {
    it('has mistral providerId', () => {
      expect(mockMistralProvider.providerId).toBe('mistral');
    });
  });

  describe('mockLocalProvider', () => {
    it('has local providerId', () => {
      expect(mockLocalProvider.providerId).toBe('local');
    });

    it('has zero cost models', () => {
      const models = mockLocalProvider.getModels();
      for (const m of models) {
        expect(m.cost_per_1k_input).toBe(0);
        expect(m.cost_per_1k_output).toBe(0);
      }
    });
  });

  describe('allMockProviders', () => {
    it('contains all 5 providers', () => {
      expect(allMockProviders).toHaveLength(5);
      const ids = allMockProviders.map((p) => p.providerId);
      expect(ids).toContain('gemini');
      expect(ids).toContain('nvidia');
      expect(ids).toContain('mistral');
      expect(ids).toContain('openai');
      expect(ids).toContain('local');
    });
  });
});
