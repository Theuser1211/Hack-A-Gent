import { getLLMConfig } from '../cli/config-manager.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import type { LLMRequest } from '../kernel/llm/llm-types.js';

// Confirm which candidate is actually usable for real CODE GENERATION, not just
// a one-token echo. GET /v1/models lists models this account cannot call (404
// `Not found for account`) and models that are retired (410 Gone), so only a
// request with a code-shaped prompt and a realistically-sized output tells us
// whether a model belongs in the production coding chain.

const CANDIDATES = [
  'nvidia/nemotron-3-super-120b-a12b',
  'openai/gpt-oss-20b',
  'deepseek-ai/deepseek-v4-flash-0731',
];

const PROMPT =
  'Write a TypeScript function `reverseWords(s: string): string` that reverses the order of words. ' +
  'Output ONLY the function code, no explanation, no markdown fences.';

async function main(): Promise<void> {
  const llmConfig = getLLMConfig();
  process.env.NVIDIA_API_KEY = llmConfig.apiKey ?? '';

  const provider = ProviderFactory.createLLMProvider(
    'nvidia',
    ProviderFactory.createApiKeyManager(),
    ProviderFactory.createRateLimitTracker(),
    ProviderFactory.createTokenUsageTracker(),
    { hardTimeoutMs: 120_000, idleTimeoutMs: 120_000 },
  );

  console.log('=== NVIDIA code-generation suitability check ===');
  for (const model_id of CANDIDATES) {
    const request: LLMRequest = {
      model_id,
      provider: 'nvidia',
      messages: [
        { role: 'system', content: 'You are a senior TypeScript engineer. Output only code.' },
        { role: 'user', content: PROMPT },
      ],
      max_tokens: 512,
      temperature: 0,
      response_format: 'text',
    };
    const t = Date.now();
    try {
      const response = await provider.execute(request);
      const hasCode = /function|=>|return/.test(response.content);
      console.log(
        `OK   ${model_id} | http=200 | ms=${Date.now() - t} | chars=${response.content.length} | looksLikeCode=${hasCode} | finish=${response.finish_reason}`,
      );
      console.log(`     >>> ${JSON.stringify(response.content.slice(0, 160))}`);
    } catch (err) {
      const status = (err as { status?: number }).status ?? 'ERR';
      const msg = err instanceof Error ? err.message.replace(/\s+/g, ' ') : String(err);
      console.log(`FAIL ${model_id} | http=${status} | ms=${Date.now() - t} | ${msg.slice(0, 140)}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
