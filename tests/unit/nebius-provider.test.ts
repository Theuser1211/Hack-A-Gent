import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getLLMConfig, PROVIDER_NATIVE_KEYS } from '../../cli/config-manager.js';
import { ApiKeyManager, RateLimitTracker, TokenUsageTracker } from '../../kernel/providers/provider-types.js';
import { CustomEndpointProvider, NEBIUS_MODELS } from '../../kernel/providers/custom-endpoint-provider.js';
import { ProviderFactory } from '../../kernel/providers/provider-factory.js';
import { AnthropicProvider } from '../../kernel/providers/anthropic-provider.js';
import { GeminiProvider } from '../../kernel/providers/gemini-provider.js';
import { OpenAIProvider } from '../../kernel/providers/openai-provider.js';
import { OpenRouterProvider } from '../../kernel/providers/openrouter-provider.js';
import { RouterEngine, STATIC_CODING_CHAIN } from '../../kernel/llm/router-engine.js';
import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import type { LLMRequest, LLMResponse, ModelSpec, ProviderHealth } from '../../kernel/llm/llm-types.js';

/** The Nemotron model both NVIDIA NIM and Nebius Token Factory serve. */
const NEBIUS_MODEL = 'nvidia/nemotron-3-super-120b-a12b';
const NEBIUS_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
const NEBIUS_KEY = 'test-nebius-key';

// ── Catalog integrity ─────────────────────────────────────────────────

describe('Nebius Token Factory model catalog', () => {
  it('serves NVIDIA Nemotron open-weight models', () => {
    const nemotron = NEBIUS_MODELS.filter((m) => m.model_id.startsWith('nvidia/nemotron'));
    expect(nemotron.length).toBeGreaterThanOrEqual(1);
  });

  it('tags every model with the nebius provider and code_generation capability', () => {
    for (const model of NEBIUS_MODELS) {
      expect(model.provider).toBe('nebius');
      expect(model.capabilities).toContain('code_generation');
      expect(model.context_window).toBeGreaterThanOrEqual(16000);
    }
  });

  it('includes the vetted static coding chain model so the router can resolve it', () => {
    const ids = NEBIUS_MODELS.map((m) => m.model_id);
    for (const modelId of STATIC_CODING_CHAIN) {
      expect(ids).toContain(modelId);
    }
  });

  it('uses non-empty, well-formed model ids for every catalog entry', () => {
    // Generic validity only — the catalog is curated and may evolve,
    // so no specific model is assumed here.
    for (const model of NEBIUS_MODELS) {
      expect(typeof model.model_id).toBe('string');
      expect(model.model_id.length).toBeGreaterThan(0);
      expect(model.model_id).toBe(model.model_id.trim());
      expect(/\s/.test(model.model_id)).toBe(false);
    }
  });
});

// ── Provider construction ─────────────────────────────────────────────

function makeNebiusProvider(): CustomEndpointProvider {
  const apiKeyManager = new ApiKeyManager({ nebius: NEBIUS_KEY });
  return new CustomEndpointProvider({
    providerId: 'nebius',
    apiKeyManager,
    rateLimitTracker: new RateLimitTracker(),
    tokenUsageTracker: new TokenUsageTracker(),
  });
}

describe('Nebius provider construction', () => {
  it('exposes the curated NEBIUS_MODELS catalog', () => {
    const provider = makeNebiusProvider();
    expect(provider.providerId).toBe('nebius');
    expect(provider.getModels()).toEqual(NEBIUS_MODELS);
  });

  it('reports nebius as its health provider id', () => {
    const provider = makeNebiusProvider();
    expect(provider.getHealth().provider_id).toBe('nebius');
  });

  it('resolves the API key from NEBIUS_API_KEY via ApiKeyManager', () => {
    const manager = new ApiKeyManager();
    process.env.NEBIUS_API_KEY = NEBIUS_KEY;
    try {
      expect(manager.getKey('nebius')).toBe(NEBIUS_KEY);
      expect(manager.hasKey('nebius')).toBe(true);
    } finally {
      delete process.env.NEBIUS_API_KEY;
    }
  });

  it('is created by the ProviderFactory as a CustomEndpointProvider', () => {
    const provider = ProviderFactory.createLLMProvider(
      'nebius',
      new ApiKeyManager({ nebius: NEBIUS_KEY }),
      new RateLimitTracker(),
      new TokenUsageTracker(),
    );
    expect(provider.providerId).toBe('nebius');
    // Nebius rides the existing provider abstraction: the factory
    // instantiates it through CustomEndpointProvider, exactly like
    // the nvidia and custom:<name> providers.
    expect(provider).toBeInstanceOf(CustomEndpointProvider);
  });
});

// ── Factory regression: existing providers keep working ──────

describe('Provider factory keeps existing providers working', () => {
  const keys: Record<string, string> = {
    nebius: NEBIUS_KEY,
    nvidia: 'test-nvidia-key',
    gemini: 'test-gemini-key',
    anthropic: 'test-anthropic-key',
    openai: 'test-openai-key',
    openrouter: 'test-openrouter-key',
  };

  it('instantiates every built-in provider (the Nebius addition displaced none)', () => {
    const apiKeyManager = new ApiKeyManager(keys);
    const rateLimitTracker = new RateLimitTracker();
    const tokenUsageTracker = new TokenUsageTracker();

    // Nebius and nvidia ride the existing CustomEndpointProvider.
    expect(
      ProviderFactory.createLLMProvider('nebius', apiKeyManager, rateLimitTracker, tokenUsageTracker),
    ).toBeInstanceOf(CustomEndpointProvider);
    expect(
      ProviderFactory.createLLMProvider('nvidia', apiKeyManager, rateLimitTracker, tokenUsageTracker),
    ).toBeInstanceOf(CustomEndpointProvider);
    // The dedicated provider implementations are unchanged.
    expect(
      ProviderFactory.createLLMProvider('gemini', apiKeyManager, rateLimitTracker, tokenUsageTracker),
    ).toBeInstanceOf(GeminiProvider);
    expect(
      ProviderFactory.createLLMProvider('anthropic', apiKeyManager, rateLimitTracker, tokenUsageTracker),
    ).toBeInstanceOf(AnthropicProvider);
    expect(
      ProviderFactory.createLLMProvider('openai', apiKeyManager, rateLimitTracker, tokenUsageTracker),
    ).toBeInstanceOf(OpenAIProvider);
    expect(
      ProviderFactory.createLLMProvider('openrouter', apiKeyManager, rateLimitTracker, tokenUsageTracker),
    ).toBeInstanceOf(OpenRouterProvider);
  });

  it('still rejects unknown provider ids', () => {
    const apiKeyManager = new ApiKeyManager(keys);
    expect(() =>
      ProviderFactory.createLLMProvider(
        'not-a-provider',
        apiKeyManager,
        new RateLimitTracker(),
        new TokenUsageTracker(),
      ),
    ).toThrow(/Unknown LLM provider/);
  });
});

// ── Real HTTP request shape (mocked fetch) ──────────────────────────

describe('Nebius provider request shape', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      body: null,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: 'console.log("hello nebius")' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
        }),
    }));
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to the Token Factory chat/completions endpoint with Bearer auth and the Nemotron model', async () => {
    const provider = makeNebiusProvider();
    const request: LLMRequest = {
      model_id: NEBIUS_MODEL,
      provider: 'nebius',
      messages: [{ role: 'user', content: 'Generate code' }],
      max_tokens: 256,
      temperature: 0,
      response_format: 'text',
    };

    const response = await provider.execute(request);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe(`${NEBIUS_BASE_URL}/chat/completions`);
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Bearer ${NEBIUS_KEY}`);
    const body = JSON.parse(init.body as string) as {
      model: string;
      messages: Array<{ role: string; content: string }>;
      max_tokens: number;
      temperature: number;
    };
    expect(body.model).toBe(NEBIUS_MODEL);
    expect(body.messages[0]!.content).toBe('Generate code');
    // Sampling parameters must pass through to the Token Factory
    // request body unchanged.
    expect(body.max_tokens).toBe(256);
    expect(body.temperature).toBe(0);

    expect(response.provider).toBe('nebius');
    expect(response.model_id).toBe(NEBIUS_MODEL);
    expect(response.content).toBe('console.log("hello nebius")');
  });

  it('applies json_object response format (Token Factory is OpenAI-compatible)', async () => {
    const provider = makeNebiusProvider();
    const request: LLMRequest = {
      model_id: NEBIUS_MODEL,
      provider: 'nebius',
      messages: [{ role: 'user', content: 'Generate JSON' }],
      max_tokens: 256,
      temperature: 0,
      response_format: 'json_object',
    };

    await provider.execute(request);

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { response_format?: { type: string } };
    expect(body.response_format).toEqual({ type: 'json_object' });
  });
});

// ── Router integration ────────────────────────────────────────────────

class MockProvider implements LLMProvider {
  readonly providerId: string;
  private readonly models: ModelSpec[];
  private readonly health: ProviderHealth;
  fail = false;
  calls: string[] = [];

  constructor(providerId: string, models: ModelSpec[], providerTag: ProviderHealth['provider_id']) {
    this.providerId = providerId;
    this.models = models;
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
    if (this.fail) {
      throw Object.assign(new Error(`mock failure on ${this.providerId}`), { status: 500 });
    }
    return {
      content: `response-from-${this.providerId}`,
      model_id: request.model_id,
      provider: this.health.provider_id,
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      finish_reason: 'stop',
      latency_ms: 5,
    };
  }
}

function nebiusSpec(model_id: string): ModelSpec {
  return {
    model_id,
    provider: 'nebius',
    capabilities: ['code_generation', 'json_output', 'reasoning'],
    context_window: 262144,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 100,
    cost_per_1k_input: 0,
    cost_per_1k_output: 0,
  };
}

describe('Nebius router integration', () => {
  it('selects the Nemotron coding chain on the nebius provider when nebius is configured', () => {
    const nebius = new MockProvider('nebius', NEBIUS_MODELS.map((m) => ({ ...m })), 'nebius');
    const router = new RouterEngine([nebius], {
      configuredProvider: 'nebius',
      perfTracker: undefined,
    });

    const decision = router.selectModel('coding', 2000, ['code_generation']);
    expect(decision.provider).toBe('nebius');
    expect(decision.model_id).toBe(NEBIUS_MODEL);
  });

  it('keeps coding execution inside nebius when nebius is the configured provider', async () => {
    const nebius = new MockProvider('nebius', [nebiusSpec(NEBIUS_MODEL)], 'nebius');
    nebius.fail = true;
    const gemini = new MockProvider('gemini', [nebiusSpec('gemini-2.5-flash')], 'gemini');

    const router = new RouterEngine([nebius, gemini], {
      configuredProvider: 'nebius',
      perfTracker: undefined,
    });

    const request: LLMRequest = {
      model_id: NEBIUS_MODEL,
      provider: 'nebius',
      messages: [{ role: 'user', content: 'Generate code' }],
      max_tokens: 256,
      temperature: 0,
      response_format: 'text',
    };

    // A managed coding provider failure must NOT fall through to other
    // providers — the caller receives the failure instead.
    await expect(router.execute('coding', request)).rejects.toThrow();
    expect(gemini.calls).toEqual([]);
  });

  it('routes coding tasks to nebius even when another provider is configured', async () => {
    const nebius = new MockProvider('nebius', [nebiusSpec(NEBIUS_MODEL)], 'nebius');
    const openai = new MockProvider('openai', [nebiusSpec('gpt-4o-mini')], 'openai');

    const router = new RouterEngine([openai, nebius], {
      configuredProvider: 'openai',
      perfTracker: undefined,
    });

    const request: LLMRequest = {
      model_id: 'gpt-4o-mini',
      provider: 'openai',
      messages: [{ role: 'user', content: 'Generate code' }],
      max_tokens: 256,
      temperature: 0,
      response_format: 'text',
    };

    const { decision } = await router.execute('coding', request);
    // NVIDIA/Nebius are prioritized for code generation.
    expect(decision.provider).toBe('nebius');
    expect(decision.model_id).toBe(NEBIUS_MODEL);
  });
});

// ── Config auto-detection ─────────────────────────────────────────────

const mocks = vi.hoisted(() => ({ homeDir: '', projDir: '' }));

vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mocks.homeDir };
});

describe('Nebius config auto-detection', () => {
  let envBackup: Record<string, string | undefined>;

  beforeEach(() => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), 'hag-nebius-'));
    mocks.homeDir = path.join(tmp, 'home');
    mocks.projDir = path.join(tmp, 'proj');
    mkdirSync(mocks.homeDir, { recursive: true });
    mkdirSync(mocks.projDir, { recursive: true });

    envBackup = {};
    for (const key of [
      'NEBIUS_API_KEY',
      'GEMINI_API_KEY',
      'ANTHROPIC_API_KEY',
      'OPENAI_API_KEY',
      'NVIDIA_API_KEY',
      'HACKAGENT_PROVIDER',
      'LLM_PROVIDER',
      'OPENROUTER_API_KEY',
    ]) {
      envBackup[key] = process.env[key];
      delete process.env[key];
    }

    vi.spyOn(process, 'cwd').mockReturnValue(mocks.projDir);

    // Machine state: config file names a different provider.
    mkdirSync(path.join(mocks.homeDir, '.hackagent'), { recursive: true });
    writeFileSync(
      path.join(mocks.homeDir, '.hackagent', 'config.json'),
      JSON.stringify({ llm: { provider: 'openai', apiKey: 'sk-config' }, updatedAt: '2026-01-01T00:00:00.000Z' }),
      'utf-8',
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const [key, value] of Object.entries(envBackup)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(path.dirname(mocks.homeDir), { recursive: true, force: true });
  });

  it('lists nebius among the auto-detected native providers', () => {
    expect(PROVIDER_NATIVE_KEYS.some((entry) => entry.provider === 'nebius' && entry.envVars.includes('NEBIUS_API_KEY'))).toBe(true);
  });

  it('auto-selects nebius from a NEBIUS_API_KEY in .env, displacing the config provider', () => {
    writeFileSync(path.join(mocks.projDir, '.env'), 'NEBIUS_API_KEY=nebius-env-key\n', 'utf-8');

    const llm = getLLMConfig();
    expect(llm.provider).toBe('nebius');
    // Credentials from the displaced provider must not leak into nebius.
    expect(llm.apiKey).toBeUndefined();
    expect(llm.model).toBeUndefined();
  });
});
