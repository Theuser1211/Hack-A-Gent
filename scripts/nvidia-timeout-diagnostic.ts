import { getLLMConfig } from '../cli/config-manager.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import { ApiKeyManager, RateLimitTracker, TokenUsageTracker } from '../kernel/providers/provider-types.js';
import type { LLMRequest } from '../kernel/llm/llm-types.js';

async function main() {
  const llmConfig = getLLMConfig();
  console.log('=== NVIDIA Timeout Diagnostic ===');
  console.log('Config:', {
    provider: llmConfig.provider,
    model: llmConfig.model,
    baseUrl: llmConfig.baseUrl,
    hasApiKey: !!llmConfig.apiKey,
  });

  if (llmConfig.provider !== 'nvidia') {
    console.log('ERROR: Active provider is not nvidia. Run: hag config --provider nvidia --api-key <key>');
    process.exit(1);
  }

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

  console.log('\n=== Provider Configuration ===');
  console.log('idleTimeoutMs:', (provider as any).idleTimeoutMs);
  console.log('hardTimeoutMs:', (provider as any).hardTimeoutMs);
  console.log('maxRetries:', (provider as any).maxRetries);

  const model = llmConfig.model ?? 'stepfun-ai/step-3.7-flash';
  console.log('\n=== Test Request ===');
  console.log('Model:', model);
  console.log('Endpoint: https://integrate.api.nvidia.com/v1/chat/completions');

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

  const timestamps: Record<string, number> = {};
  const originalFetch = globalThis.fetch;
  let requestDispatched = false;

  globalThis.fetch = async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    if (!requestDispatched && typeof input === 'string' && input.includes('/chat/completions')) {
      timestamps.T1 = Date.now();
      requestDispatched = true;
      console.log(`[T1] Request dispatched at ${timestamps.T1}ms`);
    }
    return originalFetch(input, init);
  };

  const startTime = Date.now();
  timestamps.T0 = startTime;
  console.log(`[T0] Request started at ${startTime}ms`);

  try {
    const response = await provider.execute(request);
    timestamps.T3 = Date.now();
    console.log(`[T3] Response body received at ${timestamps.T3}ms (elapsed: ${timestamps.T3 - timestamps.T0}ms)`);
    console.log('\n=== SUCCESS ===');
    console.log('Content:', response.content);
    console.log('Latency:', response.latency_ms, 'ms');
    console.log('Finish reason:', response.finish_reason);
  } catch (err) {
    timestamps.T4 = Date.now();
    console.log(`[T4] ERROR at ${timestamps.T4}ms (elapsed: ${timestamps.T4 - timestamps.T0}ms)`);
    console.log('\n=== FAILURE ===');
    console.log('Error:', err instanceof Error ? err.message : String(err));
    if (err instanceof Error && 'status' in err) {
      console.log('Status:', (err as any).status);
    }
    if (err instanceof Error && 'name' in err && err.name === 'AbortError') {
      console.log('ERROR TYPE: AbortError (client-side timeout/abort)');
    }
    if (err instanceof DOMException && err.name === 'AbortError') {
      console.log('ERROR TYPE: DOMException AbortError (client-side timeout/abort)');
    }
  }

  console.log('\n=== Timing Summary ===');
  if (timestamps.T0) console.log(`T0 (start):           ${timestamps.T0}`);
  if (timestamps.T1) console.log(`T1 (dispatched):      ${timestamps.T1} (${timestamps.T1 - timestamps.T0}ms after T0)`);
  if (timestamps.T3) console.log(`T3 (body received):   ${timestamps.T3} (${timestamps.T3 - timestamps.T0}ms after T0)`);
  if (timestamps.T4) console.log(`T4 (error/timeout):   ${timestamps.T4} (${timestamps.T4 - timestamps.T0}ms after T0)`);

  globalThis.fetch = originalFetch;
}

main().catch(console.error);