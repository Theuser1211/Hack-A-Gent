import { describe, expect, it } from 'vitest';

import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import { RouterEngine, STATIC_CODING_CHAIN } from '../../kernel/llm/router-engine.js';
import type { LLMRequest, LLMResponse, ModelSpec, ProviderHealth } from '../../kernel/llm/llm-types.js';
import { DEFAULT_MODELS } from '../../kernel/providers/custom-endpoint-provider.js';

/** The one NVIDIA model verified to actually serve this account. */
const NVIDIA_MODEL = 'nvidia/nemotron-3-super-120b-a12b';

class MockProvider implements LLMProvider {
  readonly providerId: string;
  private readonly models: ModelSpec[];
  private readonly health: ProviderHealth;
  private readonly failStatusByModel: Record<string, number>;
  calls: string[] = [];
  requests: LLMRequest[] = [];

  constructor(
    providerId: string,
    models: ModelSpec[],
    providerTag: ProviderHealth['provider_id'],
    failStatusByModel: Record<string, number> = {},
  ) {
    this.providerId = providerId;
    this.models = models;
    this.failStatusByModel = failStatusByModel;
    this.health = {
      provider_id: providerTag,
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
    return this.getHealth();
  }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    this.calls.push(request.model_id);
    this.requests.push(request);
    const status = this.failStatusByModel[request.model_id];
    if (status) {
      throw Object.assign(new Error(`mock failure ${status}`), { status });
    }
    return {
      content: '{"ok":true}',
      model_id: request.model_id,
      provider: this.health.provider_id,
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      finish_reason: 'stop',
      latency_ms: 5,
    };
  }
}

function spec(model_id: string): ModelSpec {
  return {
    model_id,
    provider: 'nvidia',
    capabilities: ['code_generation', 'json_output', 'reasoning'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 100,
    cost_per_1k_input: 0,
    cost_per_1k_output: 0,
  };
}

function req(): LLMRequest {
  return {
    model_id: '',
    provider: 'openai',
    messages: [{ role: 'user', content: 'Generate code' }],
    max_tokens: 512,
    temperature: 0,
    response_format: 'json_object',
  };
}

describe('NVIDIA production coding chain integrity', () => {
  it('references only model ids that the NVIDIA provider can actually resolve', () => {
    const pool = DEFAULT_MODELS.map((m) => m.model_id);
    for (const modelId of STATIC_CODING_CHAIN) {
      expect(pool).toContain(modelId);
    }
  });

  it('does not reference retired or unprovisioned model ids', () => {
    // These were measured against the live account: the llama-3.1 pair and
    // gpt-oss-120b answer 410 Gone, and the nemotron-70b/codestral ids answer
    // 404 "not found for account".
    const retiredOrUnprovisioned = [
      'meta/llama-3.1-70b-instruct',
      'meta/llama-3.1-8b-instruct',
      'openai/gpt-oss-120b',
      'nvidia/llama-3.1-nemotron-70b-instruct',
      'mistralai/codestral-22b-instruct-v0.1',
    ];
    for (const modelId of retiredOrUnprovisioned) {
      expect(STATIC_CODING_CHAIN).not.toContain(modelId);
    }
  });

  it('keeps the verified account-available model as the coding chain head', () => {
    expect(STATIC_CODING_CHAIN[0]).toBe(NVIDIA_MODEL);
  });
});

describe('RouterEngine NVIDIA-first coding routing', () => {
  it('prefers NVIDIA for coding even when configured provider is custom', async () => {
    const custom = new MockProvider(
      'custom:groq',
      [
        {
          model_id: 'qwen/qwen3-32b',
          provider: 'custom',
          capabilities: ['code_generation', 'json_output'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 100,
          cost_per_1k_input: 0,
          cost_per_1k_output: 0,
        },
      ],
      'custom',
    );

    const nvidia = new MockProvider('nvidia', [spec(NVIDIA_MODEL)], 'nvidia');

    const router = new RouterEngine([custom, nvidia], { configuredProvider: 'custom:groq' });
    const out = await router.execute('coding', req());

    expect(out.decision.provider).toBe('nvidia');
    expect(out.decision.model_id).toBe(NVIDIA_MODEL);
    expect(nvidia.calls).toEqual([NVIDIA_MODEL]);
    expect(custom.calls).toEqual([]);
  });

  // A. NVIDIA coding request + NVIDIA 503/504 → NO custom:groq call.
  it('does NOT fall through to other providers when NVIDIA coding fails with 503', async () => {
    const nvidia = new MockProvider('nvidia', [spec(NVIDIA_MODEL)], 'nvidia', {
      [NVIDIA_MODEL]: 503,
    });

    const custom = new MockProvider(
      'custom:groq',
      [
        {
          model_id: 'qwen/qwen3-32b',
          provider: 'custom',
          capabilities: ['code_generation', 'json_output'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 100,
          cost_per_1k_input: 0,
          cost_per_1k_output: 0,
        },
      ],
      'custom',
    );

    const router = new RouterEngine([nvidia, custom], { configuredProvider: 'nvidia' });

    await expect(router.execute('coding', req())).rejects.toThrow('All models failed');

    // NVIDIA was attempted once + one retry for 503 (chain has one model).
    expect(nvidia.calls).toEqual([NVIDIA_MODEL, NVIDIA_MODEL]);
    // custom:groq was NEVER called — the failure stayed inside the NVIDIA path.
    expect(custom.calls).toEqual([]);
  });

  // B. NVIDIA coding request + NVIDIA failure → NO other provider call.
  it('does NOT call any other provider when NVIDIA is the sole configured provider and fails', async () => {
    const nvidia = new MockProvider('nvidia', [spec(NVIDIA_MODEL)], 'nvidia', {
      [NVIDIA_MODEL]: 504,
    });

    const router = new RouterEngine([nvidia], { configuredProvider: 'nvidia' });

    await expect(router.execute('coding', req())).rejects.toThrow('All models failed');

    // NVIDIA attempted once + one retry for 504.
    expect(nvidia.calls).toEqual([NVIDIA_MODEL, NVIDIA_MODEL]);
  });

  // C. Multi-provider / non-NVIDIA configuration retains existing fallback.
  it('retains existing fallback to custom:groq when configured provider is non-NVIDIA and NVIDIA chain fails', async () => {
    const nvidia = new MockProvider('nvidia', [spec(NVIDIA_MODEL)], 'nvidia', {
      [NVIDIA_MODEL]: 410,
    });

    const custom = new MockProvider(
      'custom:groq',
      [
        {
          model_id: 'qwen/qwen3-32b',
          provider: 'custom',
          capabilities: ['code_generation', 'json_output'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 100,
          cost_per_1k_input: 0,
          cost_per_1k_output: 0,
        },
      ],
      'custom',
    );

    const router = new RouterEngine([nvidia, custom], { configuredProvider: 'custom:groq' });
    const out = await router.execute('coding', req());

    // NVIDIA chain fails with 410 (model blacklisted), then the configured
    // custom:groq provider is tried and succeeds.
    expect(nvidia.calls).toEqual([NVIDIA_MODEL]);
    expect(custom.calls).toEqual(['qwen/qwen3-32b']);
    expect(out.decision.provider).toBe('custom:groq');
    expect(out.decision.model_id).toBe('qwen/qwen3-32b');
  });

  // D. NVIDIA successful request still works.
  it('succeeds on a healthy NVIDIA coding request', async () => {
    const nvidia = new MockProvider('nvidia', [spec(NVIDIA_MODEL)], 'nvidia');

    const router = new RouterEngine([nvidia], { configuredProvider: 'nvidia' });
    const out = await router.execute('coding', req());

    expect(out.decision.provider).toBe('nvidia');
    expect(out.decision.model_id).toBe(NVIDIA_MODEL);
    expect(nvidia.calls).toEqual([NVIDIA_MODEL]);
  });

  // E. NVIDIA 429 behavior still works (single retry, then returns error).
  it('retries a 429 once and returns the NVIDIA failure when the retry also fails', async () => {
    const nvidia = new MockProvider('nvidia', [spec(NVIDIA_MODEL)], 'nvidia', {
      [NVIDIA_MODEL]: 429,
    });

    const router = new RouterEngine([nvidia], { configuredProvider: 'nvidia' });

    await expect(router.execute('coding', req())).rejects.toThrow('All models failed');

    // Called once for the original attempt + once for the 429 retry.
    expect(nvidia.calls.length).toBe(2);
    expect(nvidia.calls.every((c) => c === NVIDIA_MODEL)).toBe(true);
  });

  it('never dispatches a pool model that is absent from the coding chain', async () => {
    const nvidia = new MockProvider(
      'nvidia',
      [spec(NVIDIA_MODEL), spec('meta/llama-3.1-70b-instruct')],
      'nvidia',
    );

    const router = new RouterEngine([nvidia], { configuredProvider: 'nvidia' });
    const out = await router.execute('coding', req());

    expect(out.decision.model_id).toBe(NVIDIA_MODEL);
    expect(nvidia.calls).toEqual([NVIDIA_MODEL]);
  });

  it('caps max_tokens for the known NVIDIA model to avoid empty length-terminated responses', async () => {
    const nvidia = new MockProvider('nvidia', [spec(NVIDIA_MODEL)], 'nvidia');

    const router = new RouterEngine([nvidia], { configuredProvider: 'nvidia' });
    await router.execute('coding', { ...req(), max_tokens: 16384 });

    expect(nvidia.requests.length).toBe(1);
    expect(nvidia.requests[0]?.max_tokens).toBe(8192);
  });

  it('filters non-coding custom catalog models for coding tasks', async () => {
    const custom = new MockProvider(
      'custom:groq',
      [
        {
          model_id: 'openai/whisper-large-v3',
          provider: 'custom',
          capabilities: ['code_generation', 'json_output'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 100,
          cost_per_1k_input: 0,
          cost_per_1k_output: 0,
        },
        {
          model_id: 'qwen/qwen3-32b',
          provider: 'custom',
          capabilities: ['code_generation', 'json_output'],
          context_window: 128000,
          supports_json_mode: true,
          supports_tool_calling: false,
          typical_latency_ms: 100,
          cost_per_1k_input: 0,
          cost_per_1k_output: 0,
        },
      ],
      'custom',
    );

    const router = new RouterEngine([custom], { configuredProvider: 'custom:groq' });
    const out = await router.execute('coding', req());

    expect(out.decision.provider).toBe('custom:groq');
    expect(out.decision.model_id).toBe('qwen/qwen3-32b');
    expect(custom.calls).toEqual(['qwen/qwen3-32b']);
  });
});
