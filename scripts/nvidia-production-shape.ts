import { getLLMConfig } from '../cli/config-manager.js';
import { ProviderFactory } from '../kernel/providers/provider-factory.js';
import type { LLMRequest } from '../kernel/llm/llm-types.js';

// The production pipeline does not send one-line prompts: planning/strategy
// phases send multi-thousand-token system+user prompts and require JSON back.
// A model that only answers a trivia question is useless here, so this checks
// the exact model in STATIC_CODING_CHAIN against both shapes.

const MODEL = 'nvidia/nemotron-3-super-120b-a12b';

async function run(label: string, request: LLMRequest): Promise<void> {
  const provider = ProviderFactory.createLLMProvider(
    'nvidia',
    ProviderFactory.createApiKeyManager(),
    ProviderFactory.createRateLimitTracker(),
    ProviderFactory.createTokenUsageTracker(),
    { hardTimeoutMs: 180_000, idleTimeoutMs: 180_000 },
  );
  const t = Date.now();
  try {
    const response = await provider.execute(request);
    let note = '';
    if (request.response_format === 'json_object') {
      try {
        JSON.parse(response.content);
        note = 'json=VALID';
      } catch {
        note = 'json=INVALID';
      }
    }
    console.log(
      `OK   ${label} | http=200 | ms=${Date.now() - t} | chars=${response.content.length} | finish=${response.finish_reason} ${note}`,
    );
    console.log(`     >>> ${JSON.stringify(response.content.slice(0, 200))}`);
  } catch (err) {
    const status = (err as { status?: number }).status ?? 'ERR';
    const msg = err instanceof Error ? err.message.replace(/\s+/g, ' ') : String(err);
    console.log(`FAIL ${label} | http=${status} | ms=${Date.now() - t} | ${msg.slice(0, 160)}`);
  }
}

async function main(): Promise<void> {
  process.env.NVIDIA_API_KEY = getLLMConfig().apiKey ?? '';

  // ~4000-token prompt, the shape real planning phases send.
  const filler = Array.from(
    { length: 220 },
    (_v, i) => `Requirement ${i + 1}: the generated project must expose a REST endpoint /api/item/${i + 1} returning JSON with fields id, title, status.`,
  ).join('\n');

  await run('large-prompt-codegen', {
    model_id: MODEL,
    provider: 'nvidia',
    messages: [
      { role: 'system', content: 'You are a senior TypeScript engineer generating production code.' },
      {
        role: 'user',
        content:
          `Here is a product spec:\n\n${filler}\n\n` +
          'Write a single TypeScript file defining `type Item` and an `Express`-style router ' +
          'array for these endpoints. Output ONLY code, no explanation.',
      },
    ],
    max_tokens: 1024,
    temperature: 0,
    response_format: 'text',
  });

  await run('json-object-planning', {
    model_id: MODEL,
    provider: 'nvidia',
    messages: [
      { role: 'system', content: 'You are a project planner. Respond with strict JSON only.' },
      {
        role: 'user',
        content:
          'Return JSON: {"phases":[{"name":string,"hours":number}],"risks":[string]}. ' +
          'Plan a 24-hour hackathon build of a habit tracker with 3 phases and 2 risks.',
      },
    ],
    max_tokens: 700,
    temperature: 0,
    response_format: 'json_object',
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
