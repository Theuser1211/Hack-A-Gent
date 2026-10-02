import { getLLMConfig } from '../cli/config-manager.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import type { LLMRequest } from '../kernel/llm/llm-types.js';

// Probe which NVIDIA NIM models the configured ACCOUNT can actually call.
// GET /v1/models is a global catalog: a model can be listed there and still
// answer 404 `Not found for account ...`. Only a real chat request is
// authoritative, so this script issues one short request per candidate and
// records the HTTP status. Short timeouts keep the probe fast.

const CANDIDATES = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'nvidia/llama-3.1-nemotron-70b-instruct',
  'nvidia/llama-3.1-nemotron-51b-instruct',
  'nvidia/nemotron-3-super-120b-a12b',
  'meta/llama-3.1-70b-instruct',
  'meta/llama-3.1-8b-instruct',
  'deepseek-ai/deepseek-v4-flash-0731',
  'deepseek-ai/deepseek-coder-6.7b-instruct',
  'mistralai/codestral-22b-instruct-v0.1',
  'moonshotai/kimi-k2.6',
  'z-ai/glm-5.3',
  'ibm/granite-34b-code-instruct',
];

async function main(): Promise<void> {
  const llmConfig = getLLMConfig();
  process.env.NVIDIA_API_KEY = llmConfig.apiKey ?? '';

  const apiKeyManager = ProviderFactory.createApiKeyManager();
  const provider = ProviderFactory.createLLMProvider(
    'nvidia',
    apiKeyManager,
    ProviderFactory.createRateLimitTracker(),
    ProviderFactory.createTokenUsageTracker(),
    { hardTimeoutMs: 45_000, idleTimeoutMs: 45_000 },
  );

  console.log('=== NVIDIA account availability probe (45s cap per model) ===');
  for (const model_id of CANDIDATES) {
    const request: LLMRequest = {
      model_id,
      provider: 'nvidia',
      messages: [{ role: 'user', content: 'Reply with exactly: OK' }],
      max_tokens: 8,
      temperature: 0,
      response_format: 'text',
    };
    const t = Date.now();
    try {
      const response = await provider.execute(request);
      console.log(
        `OK    ${model_id} | http=200 | chars=${response.content.length} | ms=${Date.now() - t} | ${JSON.stringify(response.content.slice(0, 24))}`,
      );
    } catch (err) {
      const status = (err as { status?: number }).status ?? 'ERR';
      const msg = err instanceof Error ? err.message.replace(/\s+/g, ' ') : String(err);
      console.log(`FAIL  ${model_id} | http=${status} | ms=${Date.now() - t} | ${msg.slice(0, 120)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
