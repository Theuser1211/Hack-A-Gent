/**
 * Verification gate: a provider-native key in .env (e.g.
 * GEMINI_API_KEY) must auto-select that provider and serve a real
 * request through the router when no explicit provider is set.
 *
 *   npx tsx scripts/verify-provider-env.ts
 *
 * Exits non-zero on the first failed check. Makes one real API
 * call with the auto-detected provider's key.
 */
import { getLLMConfig, loadEnvFileIntoProcess } from '../cli/config-manager.js';
import { initializeProviders } from '../cli/provider-init.js';
import type { LLMRequest } from '../kernel/llm/llm-types.js';

const ok = (msg: string): void => console.log(`  ✓ ${msg}`);
const fail = (msg: string): never => {
  console.error(`  ✗ ${msg}`);
  process.exit(1);
};

// Gate scenario: provider-native key in .env, no explicit provider.
delete process.env.HACKAGENT_PROVIDER;
delete process.env.LLM_PROVIDER;
loadEnvFileIntoProcess();

const llm = getLLMConfig();
const keyVar = `${llm.provider.toUpperCase()}_API_KEY`;
if (!process.env[keyVar]) {
  fail(`auto-detected provider "${llm.provider}" but ${keyVar} is not available`);
}
ok(`auto-detected provider "${llm.provider}" from ${keyVar}`);

const { router, providers } = initializeProviders();
const provider = providers.find((p) => p.providerId === llm.provider)
  ?? fail(`provider "${llm.provider}" was not registered (have: ${providers.map((p) => p.providerId).join(', ')})`);
ok(`initializeProviders registered: ${providers.map((p) => p.providerId).join(', ')}`);

const decision = router.selectModel('coding', 2000, ['code_generation']);
if (decision.provider !== llm.provider) {
  fail(`router selected ${decision.model_id} on "${decision.provider}", expected "${llm.provider}"`);
}
ok(`router selected ${decision.model_id} on "${decision.provider}" (${decision.reason})`);

const request: LLMRequest = {
  model_id: decision.model_id,
  provider: decision.provider,
  messages: [{ role: 'user', content: 'Reply with exactly: ok' }],
  temperature: 0,
  max_tokens: 16,
  response_format: 'text',
};
const response = await provider.execute(request);
if (!response.content.trim()) {
  fail(`real request to ${response.provider}/${response.model_id} returned empty content`);
}
ok(`real request via ${response.provider}/${response.model_id}: "${response.content.trim().slice(0, 60)}" (${response.latency_ms}ms)`);

console.log('\nProvider-env verification passed.');
