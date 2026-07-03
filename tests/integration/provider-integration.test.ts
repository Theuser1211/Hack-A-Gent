import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import type { LLMRequest } from '../../kernel/llm/llm-types.js';
import { AnthropicProvider } from '../../kernel/providers/anthropic-provider.js';
import { GeminiProvider } from '../../kernel/providers/gemini-provider.js';
import { OpenAIProvider } from '../../kernel/providers/openai-provider.js';
import { OpenRouterProvider } from '../../kernel/providers/openrouter-provider.js';
import { ProviderFactory } from '../../kernel/providers/provider-factory.js';
import { ApiKeyManager, RateLimitTracker, TokenUsageTracker } from '../../kernel/providers/provider-types.js';

const MOCK_KEY = 'sk-test-mock-key';

function makeMockFetch(status: number, body: unknown, headers?: Record<string, string>): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: new Map(Object.entries(headers ?? {})),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    body: null,
  });
}

function makeStreamingFetch(chunks: string[]): ReturnType<typeof vi.fn> {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });

  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: new Map(),
    body: stream,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
  });
}

describe('Provider Integration', () => {
  let apiKeyManager: ApiKeyManager;
  let rateLimitTracker: RateLimitTracker;
  let tokenUsageTracker: TokenUsageTracker;
  let fetchSpy: any;

  beforeEach(() => {
    apiKeyManager = new ApiKeyManager({
      anthropic: MOCK_KEY,
      gemini: MOCK_KEY,
      openai: MOCK_KEY,
      openrouter: MOCK_KEY,
    });
    rateLimitTracker = new RateLimitTracker();
    tokenUsageTracker = new TokenUsageTracker();
    fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(new Response()));
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const sampleRequest: LLMRequest = {
    messages: [{ role: 'user', content: 'Hello, generate a project plan for a hackathon app' }],
    model_id: '',
    provider: 'gemini',
    temperature: 0.7,
    max_tokens: 1000,
    response_format: 'text',
  };

  describe('AnthropicProvider', () => {
    it('executes and returns a valid response', async () => {
      const mockBody = {
        id: 'msg_123',
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: 'Here is a project plan...' }],
        model: 'claude-sonnet-4-20250514',
        usage: { input_tokens: 15, output_tokens: 42 },
        stop_reason: 'end_turn',
      };

      fetchSpy.mockImplementation(makeMockFetch(200, mockBody));

      const provider = new AnthropicProvider({
        providerId: 'anthropic',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      });
      const response = await provider.execute(sampleRequest);

      expect(response.content).toBe('Here is a project plan...');
      expect(response.provider).toBe('anthropic');
      expect(response.usage.prompt_tokens).toBe(15);
      expect(response.usage.completion_tokens).toBe(42);
      expect(response.finish_reason).toBe('end_turn');
    });

    it('handles streaming via executeStream', async () => {
      const sseChunks = [
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Building"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":" the plan"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":10}}\n\n',
      ];

      fetchSpy.mockImplementation(makeStreamingFetch(sseChunks));

      const provider = new AnthropicProvider({
        providerId: 'anthropic',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      });
      const received: string[] = [];
      const response = await provider.executeStream(sampleRequest, (chunk) => {
        if (chunk.content) received.push(chunk.content);
      });

      expect(received.join('')).toBe('Building the plan');
      expect(response.content).toBe('Building the plan');
    });

    it('throws on rate limit and updates tracker', async () => {
      fetchSpy.mockImplementation(makeMockFetch(429, { error: { message: 'Rate limited' } }));

      const provider = new AnthropicProvider({
        providerId: 'anthropic',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      });
      await expect(provider.execute(sampleRequest)).rejects.toThrow();
      expect(rateLimitTracker.isRateLimited('anthropic')).toBe(true);
    }, 15000);

    it('retries on server error then succeeds', async () => {
      let attempts = 0;
      fetchSpy.mockImplementation(() => {
        attempts++;
        if (attempts <= 2) return makeMockFetch(500, { error: 'Internal error' })();
        return makeMockFetch(200, {
          id: 'msg_456',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Final answer' }],
          model: 'claude-sonnet-4-20250514',
          usage: { input_tokens: 10, output_tokens: 5 },
          stop_reason: 'end_turn',
        })();
      });

      const provider = new AnthropicProvider({
        providerId: 'anthropic',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      });
      const response = await provider.execute(sampleRequest);
      expect(response.content).toBe('Final answer');
      expect(attempts).toBe(3);
    }, 15000);

    it('throws on unauthorized', async () => {
      fetchSpy.mockImplementation(makeMockFetch(401, { error: { message: 'Unauthorized' } }));

      const provider = new AnthropicProvider({
        providerId: 'anthropic',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      });
      await expect(provider.execute(sampleRequest)).rejects.toThrow('401');
    });
  });

  describe('GeminiProvider', () => {
    it('executes and returns a valid response', async () => {
      const mockBody = {
        candidates: [{ content: { parts: [{ text: 'Gemini project plan response' }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      };

      fetchSpy.mockImplementation(makeMockFetch(200, mockBody));

      const provider = new GeminiProvider({ providerId: 'gemini', apiKeyManager, rateLimitTracker, tokenUsageTracker });
      const response = await provider.execute(sampleRequest);

      expect(response.content).toBe('Gemini project plan response');
      expect(response.provider).toBe('gemini');
      expect(response.usage.prompt_tokens).toBe(10);
      expect(response.usage.completion_tokens).toBe(20);
    });

    it('handles streaming via executeStream', async () => {
      const sseChunks = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Step 1"}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":": Init"}]}}]}\n\n',
      ];

      fetchSpy.mockImplementation(makeStreamingFetch(sseChunks));

      const provider = new GeminiProvider({ providerId: 'gemini', apiKeyManager, rateLimitTracker, tokenUsageTracker });
      const received: string[] = [];
      const response = await provider.executeStream(sampleRequest, (chunk) => {
        if (chunk.content) received.push(chunk.content);
      });

      expect(received.join('')).toBe('Step 1: Init');
      expect(response.content).toBe('Step 1: Init');
    });

    it('handles rate limit from tracker', async () => {
      rateLimitTracker.recordRateLimit('gemini', new Date(Date.now() + 60000));
      const provider = new GeminiProvider({ providerId: 'gemini', apiKeyManager, rateLimitTracker, tokenUsageTracker });
      await expect(provider.execute(sampleRequest)).rejects.toThrow('rate limit');
    });
  });

  describe('OpenAIProvider', () => {
    it('executes and returns a valid response', async () => {
      const mockBody = {
        choices: [{ message: { content: 'OpenAI plan response', role: 'assistant' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 12, completion_tokens: 25, total_tokens: 37 },
      };

      fetchSpy.mockImplementation(makeMockFetch(200, mockBody));

      const provider = new OpenAIProvider({ providerId: 'openai', apiKeyManager, rateLimitTracker, tokenUsageTracker });
      const response = await provider.execute(sampleRequest);

      expect(response.content).toBe('OpenAI plan response');
      expect(response.provider).toBe('openai');
      expect(response.usage.prompt_tokens).toBe(12);
      expect(response.usage.completion_tokens).toBe(25);
    });

    it('handles streaming via executeStream', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Hello"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{"content":" World"},"finish_reason":null}]}\n\n',
        'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      ];

      fetchSpy.mockImplementation(makeStreamingFetch(sseChunks));

      const provider = new OpenAIProvider({ providerId: 'openai', apiKeyManager, rateLimitTracker, tokenUsageTracker });
      const received: string[] = [];
      const response = await provider.executeStream(sampleRequest, (chunk) => {
        if (chunk.content) received.push(chunk.content);
      });

      expect(received.join('')).toBe('Hello World');
      expect(response.content).toBe('Hello World');
    });
  });

  describe('OpenRouterProvider', () => {
    it('executes and returns a valid response', async () => {
      const mockBody = {
        choices: [
          { message: { content: 'OpenRouter response via any model', role: 'assistant' }, finish_reason: 'stop' },
        ],
        usage: { prompt_tokens: 8, completion_tokens: 15, total_tokens: 23 },
      };

      fetchSpy.mockImplementation(makeMockFetch(200, mockBody));

      const provider = new OpenRouterProvider({
        providerId: 'openrouter',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      });
      const response = await provider.execute(sampleRequest);

      expect(response.content).toBe('OpenRouter response via any model');
      expect(response.provider).toBe('openrouter');
      expect(response.usage.prompt_tokens).toBe(8);
    });
  });

  describe('ProviderFactory', () => {
    it('creates all provider types', () => {
      const anthropic = ProviderFactory.createLLMProvider(
        'anthropic',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      );
      const gemini = ProviderFactory.createLLMProvider('gemini', apiKeyManager, rateLimitTracker, tokenUsageTracker);
      const openai = ProviderFactory.createLLMProvider('openai', apiKeyManager, rateLimitTracker, tokenUsageTracker);
      const openrouter = ProviderFactory.createLLMProvider(
        'openrouter',
        apiKeyManager,
        rateLimitTracker,
        tokenUsageTracker,
      );

      expect(anthropic).toBeInstanceOf(AnthropicProvider);
      expect(gemini).toBeInstanceOf(GeminiProvider);
      expect(openai).toBeInstanceOf(OpenAIProvider);
      expect(openrouter).toBeInstanceOf(OpenRouterProvider);
    });

    it('throws for unknown provider', () => {
      expect(() =>
        ProviderFactory.createLLMProvider('unknown', apiKeyManager, rateLimitTracker, tokenUsageTracker),
      ).toThrow('Unknown LLM provider');
    });
  });
});
