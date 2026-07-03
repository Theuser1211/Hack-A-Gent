import type { LLMRequest, LLMResponse, ProviderHealth, ModelSpec } from './llm-types.js';

export interface LLMProvider {
  readonly providerId: string;
  getModels(): ModelSpec[];
  getHealth(): ProviderHealth;
  checkHealth(): Promise<ProviderHealth>;
  execute(request: LLMRequest): Promise<LLMResponse>;
}
