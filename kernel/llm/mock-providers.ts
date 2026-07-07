import type { LLMProvider } from './llm-provider.js';
import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec, ProviderId } from './llm-types.js';

class BaseMockProvider implements LLMProvider {
  public readonly providerId: string;
  private health: ProviderHealth;
  private models: ModelSpec[];
  private failCountdown: number;

  constructor(providerId: string, models: ModelSpec[], failCountdown: number = 0) {
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
    this.failCountdown = failCountdown;
  }

  getModels(): ModelSpec[] {
    return this.models;
  }

  getHealth(): ProviderHealth {
    return { ...this.health };
  }

  async checkHealth(): Promise<ProviderHealth> {
    return { ...this.health };
  }

  async execute(request: LLMRequest): Promise<LLMResponse> {
    this.health.total_requests++;

    if (this.failCountdown > 0) {
      this.failCountdown--;
      this.health.consecutive_failures++;
      this.health.failed_requests++;
      if (this.health.consecutive_failures >= 5) {
        this.health.status = 'degraded';
      }
      throw new Error(`${this.providerId} mock failure`);
    }

    this.health.consecutive_failures = 0;
    this.health.status = 'healthy';
    const modelId = request.model_id;
    const content = JSON.stringify({
      mock_response: true,
      provider: this.providerId,
      echo: request.messages.map((m) => m.content.slice(0, 50)),
    });

    return {
      content,
      model_id: modelId,
      provider: this.providerId as ProviderId,
      usage: {
        prompt_tokens: request.messages.reduce((sum, m) => sum + m.content.length, 0),
        completion_tokens: content.length,
        total_tokens: request.messages.reduce((sum, m) => sum + m.content.length, 0) + content.length,
      },
      finish_reason: 'stop',
      latency_ms: 75,
    };
  }

  setFailCountdown(n: number): void {
    this.failCountdown = n;
  }
}

const geminiModels: ModelSpec[] = [
  {
    model_id: 'gemini-2.5-pro',
    provider: 'gemini',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'function_calling', 'vision'],
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
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'streaming'],
    context_window: 1048576,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 500,
    cost_per_1k_input: 0.00015,
    cost_per_1k_output: 0.0006,
  },
];
const nvidiaModels: ModelSpec[] = [
  {
    model_id: 'llama-3.1-70b',
    provider: 'nvidia',
    capabilities: ['reasoning', 'code_generation', 'json_output'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 1500,
    cost_per_1k_input: 0.0009,
    cost_per_1k_output: 0.0009,
  },
  {
    model_id: 'llama-3.1-405b',
    provider: 'nvidia',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 3000,
    cost_per_1k_input: 0.0025,
    cost_per_1k_output: 0.0025,
  },
];
const mistralModels: ModelSpec[] = [
  {
    model_id: 'mistral-large-2407',
    provider: 'mistral',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'function_calling', 'json_output'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.003,
    cost_per_1k_output: 0.009,
  },
  {
    model_id: 'mistral-small-2407',
    provider: 'mistral',
    capabilities: ['reasoning', 'code_generation', 'json_output'],
    context_window: 32000,
    supports_json_mode: true,
    supports_tool_calling: false,
    typical_latency_ms: 800,
    cost_per_1k_input: 0.001,
    cost_per_1k_output: 0.003,
  },
];
const openAiModels: ModelSpec[] = [
  {
    model_id: 'gpt-4o-2024-05-13',
    provider: 'openai',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'function_calling', 'vision'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 1500,
    cost_per_1k_input: 0.005,
    cost_per_1k_output: 0.015,
  },
  {
    model_id: 'gpt-4o-mini-2024-07-18',
    provider: 'openai',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'function_calling', 'vision'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 500,
    cost_per_1k_input: 0.00015,
    cost_per_1k_output: 0.0006,
  },
  {
    model_id: 'gpt-4-turbo-2024-04-09',
    provider: 'openai',
    capabilities: ['reasoning', 'code_generation', 'long_context', 'json_output', 'function_calling', 'vision'],
    context_window: 128000,
    supports_json_mode: true,
    supports_tool_calling: true,
    typical_latency_ms: 2000,
    cost_per_1k_input: 0.01,
    cost_per_1k_output: 0.03,
  },
];

const localModels: ModelSpec[] = [
  {
    model_id: 'code-qwen-7b',
    provider: 'local',
    capabilities: ['reasoning', 'code_generation'],
    context_window: 32768,
    supports_json_mode: false,
    supports_tool_calling: false,
    typical_latency_ms: 5000,
    cost_per_1k_input: 0,
    cost_per_1k_output: 0,
  },
];

export const mockGeminiProvider = new BaseMockProvider('gemini', geminiModels);
export const mockNvidiaProvider = new BaseMockProvider('nvidia', nvidiaModels);
export const mockMistralProvider = new BaseMockProvider('mistral', mistralModels);
export const mockOpenAIProvider = new BaseMockProvider('openai', openAiModels);
export const mockLocalProvider = new BaseMockProvider('local', localModels);

export const allMockProviders: LLMProvider[] = [
  mockGeminiProvider,
  mockNvidiaProvider,
  mockMistralProvider,
  mockOpenAIProvider,
  mockLocalProvider,
];
