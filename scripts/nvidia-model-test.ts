import { getLLMConfig } from '../cli/config-manager.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import { ApiKeyManager, RateLimitTracker, TokenUsageTracker } from '../kernel/providers/provider-types.js';
import type { LLMRequest } from '../kernel/llm/llm-types.js';

async function testModel(model: string) {
  const llmConfig = getLLMConfig();
  process.env.NVIDIA_API_KEY = llmConfig.apiKey ?? '';

  const apiKeyManager = ProviderFactory.createApiKeyManager(
    llmConfig.baseUrl ? { baseUrls: { [llmConfig.provider]: llmConfig.baseUrl } } : undefined,
  );
  const rateLimitTracker = ProviderFactory.createRateLimitTracker();
  const tokenUsageTracker = ProviderFactory.createTokenUsageTracker();

  const provider = ProviderFactory.createLLMProvider(
    'nvidia',
    apiKeyManager,
    rateLimitTracker,
    tokenUsageTracker,
    llmConfig.baseUrl ? { baseUrls: { nvidia: llmConfig.baseUrl } } : undefined,
  );

  const request: LLMRequest = {
    model_id: model,
    provider: 'nvidia',
    messages: [
      { role: 'system', content: 'You are a helpful assistant.' },
      { role: 'user', content: 'Say "OK" and nothing else.' },
    ],
    max_tokens: 10,
    temperature: 0,
    response_format: 'text',
  };

  console.log(`\n=== Testing ${model} ===`);
  const startTime = Date.now();
  
  try {
    const response = await provider.execute(request);
    const elapsed = Date.now() - startTime;
    console.log(`SUCCESS: ${elapsed}ms - ${response.content.slice(0, 50)}`);
    console.log(`  Latency: ${response.latency_ms}ms, Finish: ${response.finish_reason}`);
    return { success: true, elapsed, latency: response.latency_ms };
  } catch (err) {
    const elapsed = Date.now() - startTime;
    console.log(`FAILURE: ${elapsed}ms - ${err instanceof Error ? err.message : String(err)}`);
    if (err instanceof Error && 'status' in err) {
      console.log(`  Status: ${(err as any).status}`);
    }
    if (err instanceof Error && err.name === 'AbortError') {
      console.log(`  ERROR TYPE: AbortError (client-side timeout/abort)`);
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log(`  ERROR TYPE: DOMException AbortError (client-side timeout/abort)`);
    }
    return { success: false, elapsed, error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  console.log('=== NVIDIA Model Timeout Test ===');
  
  // Confirmed present in the live GET /v1/models catalog. The previously listed
  // step/minimax/llama-3.1/llama-3.2 ids are no longer served by the endpoint.
  const models = ['openai/gpt-oss-20b', 'nvidia/llama-3.1-nemotron-70b-instruct'];

  for (const model of models) {
    await testModel(model);
    await new Promise(r => setTimeout(r, 1000)); // small delay between requests
  }
}

main().catch(console.error);