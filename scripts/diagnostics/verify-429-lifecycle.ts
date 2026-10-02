#!/usr/bin/env node
/**
 * CONTROLLED, BOUNDED 429 VERIFICATION PROBE
 *
 * Purpose: prove with a REAL custom:groq request that when the provider returns
 * HTTP 429 the router runtime behaves correctly:
 *   429 -> Retry-After respected -> router retries -> provider NOT added to
 *   failedProviders -> provider remains eligible afterward.
 *
 * Diagnostic-only, NOT part of the CLI. Reuses production infrastructure
 * (ProviderFactory + RouterEngine + config-manager) via initializeProviders().
 * Sends minimal sequential requests at a conservative cadence and STOPS at the
 * FIRST genuine HTTP 429. Never hammers the API, never concurrent, never exceeds
 * the bounded window. If no live 429 is observed, it reports that clearly.
 *
 * Hard limits: no infinite loop, no uncontrolled concurrency, no aggressive
 * rate, no production-code changes, no fabrication.
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeProviders } from '../../cli/provider-init.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';
import type { LLMRequest, ProviderId } from '../../kernel/llm/llm-types.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
let durationMs = 280000; // bounded window (default 280s)
let cadenceMs = 2000; // conservative sequential cadence (default 2s)
let modelId = '';
let listOnly = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--duration') durationMs = parseInt(args[++i] ?? '280', 10) * 1000;
  else if (args[i] === '--cadence') cadenceMs = parseInt(args[++i] ?? '2', 10) * 1000;
  else if (args[i] === '--model') modelId = args[++i] ?? '';
  else if (args[i] === '--list') listOnly = true;
}

// Force groq as the configured provider exactly as production would via env.
process.env.HACKAGENT_PROVIDER = 'custom:groq';
process.env.HAG_SILENT = '0';

interface ProbeEntry {
  t: number;
  ts: string;
  model: string;
  status: string;
  retryAfter?: string;
  classification: string;
  retry: boolean;
  failedProvidersSize: number;
  decidedProvider?: string;
  errorMessage?: string;
}

const logs: ProbeEntry[] = [];
const now = (): string => new Date().toISOString();
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function classify(err: unknown): { status: string; retryAfter?: string; classification: string } {
  const status = (err as { status?: unknown })?.status;
  if (typeof status === 'number') {
    return {
      status: String(status),
      retryAfter: (err as { retryAfter?: string })?.retryAfter,
      classification: status === 429 ? 'HTTP_429' : `HTTP_${status}`,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  if (/fetch failed|ECONNRESET|ENOTFOUND/i.test(msg)) return { status: 'error', classification: 'NETWORK' };
  if (/All models failed/i.test(msg)) return { status: 'error', classification: 'ALL_MODELS_FAILED' };
  return { status: 'error', classification: 'OTHER', retryAfter: (err as { retryAfter?: string })?.retryAfter };
}

function fpSize(router: RouterEngine): number {
  return (router as unknown as { failedProviders: Set<string> }).failedProviders.size;
}

function fpHas(router: RouterEngine, id: string): boolean {
  return (router as unknown as { failedProviders: Set<string> }).failedProviders.has(id);
}

async function main(): Promise<void> {
  process.stderr.write('[probe] Initializing providers (custom:groq)...\n');
  let init: Awaited<ReturnType<typeof initializeProviders>>;
  try {
    init = initializeProviders();
  } catch (err) {
    process.stderr.write(`[probe] Provider init FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
    return;
  }

  const groq = init.providers.find((p) => p.providerId === 'custom:groq');
  if (!groq) {
    process.stderr.write('[probe] ERROR: custom:groq provider not registered.\n');
    process.exit(1);
    return;
  }

  await groq.prepare?.();
  const discovered = groq.getModels();
  process.stderr.write(`[probe] custom:groq discovered ${discovered.length} models\n`);
  if (discovered.length === 0) {
    process.stderr.write('[probe] WARN: no discovered models; using default list.\n');
  }

  if (listOnly || !modelId) {
    process.stderr.write('--- discovered models ---\n');
    for (const m of discovered) {
      process.stderr.write(`  ${m.model_id}  context_window=${m.context_window}\n`);
    }
    process.stderr.write('------------------------\n');
  }
  if (listOnly) {
    process.exit(0);
  }

  if (!modelId) {
    // Select a text-capable model that is NOT an audio/embedding/vision-only model,
    // preferring a small context window to keep each call minimal.
    const textual = discovered.filter((m) => !/(whisper|tts|embedding|guard|speech|audio|dall|stable|image|orpheus)/i.test(m.model_id));
    const sorted = [...textual].sort((a, b) => (a.context_window ?? 0) - (b.context_window ?? 0));
    modelId = sorted[0]?.model_id ?? discovered[0]?.model_id ?? 'llama-3.1-8b-instant';
  }
  process.stderr.write(`[probe] selected model: ${modelId}\n`);

  // Focused router over ONLY custom:groq, built from the SAME production
  // provider instance (so apiKeyManager / rateLimitTracker / etc match), but
  // WITHOUT the silent openrouter fallback so the exact fate of custom:groq in
  // failedProviders is observable in isolation.
  const router = new RouterEngine([groq], {
    configuredProvider: 'custom:groq',
    configuredModel: modelId,
  });

  const request: LLMRequest = {
    model_id: modelId,
    provider: 'custom:groq' as ProviderId,
    messages: [{ role: 'user', content: 'Reply with the single word: pong' }],
    temperature: 0,
    max_tokens: 4,
    response_format: 'text',
  };

  const start = Date.now();
  let observed429 = false;
  let iteration = 0;
  let lastRetryAfterMs = 0;

  while (Date.now() - start < durationMs && !observed429) {
    iteration++;
    const t0 = Date.now();
    const fpBefore = fpSize(router);
    const entry: ProbeEntry = {
      t: Date.now() - start,
      ts: now(),
      model: modelId,
      status: 'pending',
      classification: 'PENDING',
      retry: false,
      failedProvidersSize: fpBefore,
    };

    try {
      const { response, decision } = await router.execute('coding', request);
      entry.status = 'success';
      entry.classification = 'SUCCESS';
      entry.decidedProvider = decision.provider as string;
      entry.retry = false;
      entry.errorMessage = `content=${response.content.length}ch model=${decision.model_id}`;
    } catch (err) {
      const c = classify(err);
      entry.status = c.status;
      entry.retryAfter = c.retryAfter;
      entry.classification = c.classification;
      entry.retry = true;
      entry.errorMessage = err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160);
      if (c.status === '429') {
        observed429 = true;
        const r = c.retryAfter ? parseInt(c.retryAfter, 10) * 1000 : 0;
        if (r > 0) lastRetryAfterMs = r;
        process.stderr.write(
          `[probe] *** GENUINE HTTP 429 OBSERVED (attempt ${iteration}) — stopping load immediately. ***\n`,
        );
      }
    }

    entry.failedProvidersSize = fpSize(router);
    logs.push(entry);
    process.stderr.write(
      `  [probe] #${iteration} ${entry.classification} status=${entry.status} retryAfter=${entry.retryAfter ?? '-'} retry=${entry.retry} fpSize=${entry.failedProvidersSize}\n`,
    );

    if (observed429) break;
    await sleep(Math.max(0, cadenceMs - (Date.now() - t0)));
  }

  // ---- Post-observation verification ----
  if (observed429) {
    const fp = (router as unknown as { failedProviders: Set<string> }).failedProviders;
    process.stderr.write(`\n=== POST-429 VERIFICATION ===\n`);
    process.stderr.write(`failedProviders contents after 429: ${JSON.stringify([...fp])}\n`);
    if (fp.has('custom:groq')) {
      process.stderr.write('[RESULT] custom:groq IS in failedProviders => PERMANENT BLACKLIST (BUG).\n');
      process.stderr.write('[HINT] Router fix not effective, OR blacklist arose via health-threshold or another status.\n');
      process.exit(2);
    }
    process.stderr.write('[RESULT] custom:groq NOT in failedProviders => provider remains eligible. ✓\n');

    // One safe follow-up request after the cooldown window to prove eligibility.
    const waitMs = Math.max(10_000, lastRetryAfterMs + 10_000);
    process.stderr.write(
      `[probe] waiting ${Math.round(waitMs / 1000)}s (Retry-After + margin) before one isolated follow-up...\n`,
    );
    await sleep(waitMs);

    process.stderr.write('[probe] FOLLOW-UP: sending ONE request after cooldown...\n');
    try {
      const { decision } = await router.execute('coding', request);
      const groqBlacklisted = fpHas(router, 'custom:groq');
      process.stderr.write(
        `[RESULT] FOLLOW-UP SUCCEEDED via ${decision.model_id} (${decision.provider}). custom:groq blacklisted? ${groqBlacklisted}. ✓\n`,
      );
      process.exit(0);
    } catch (err) {
      const c = classify(err);
      process.stderr.write(
        `[RESULT] FOLLOW-UP FAILED (${c.classification}): ${err instanceof Error ? err.message : String(err)}. ` +
          `custom:groq blacklisted? ${fpHas(router, 'custom:groq')}.\n`,
      );
      process.exit(1);
    }
  }

  process.stderr.write(
    `\n[probe] No HTTP 429 observed within ${Math.round(durationMs / 1000)}s ` +
      `(${iteration} sequential requests, cadence ${Math.round(cadenceMs / 1000)}s).\n`,
  );
  process.stderr.write('[RESULT] Live 429 behavior NOT observed in this window — do NOT claim it is proven.\n');
  process.stderr.write('\n=== FULL EVENT LOG ===\n');
  for (const e of logs) {
    process.stderr.write(
      `  [${e.t}ms] ${e.classification} model=${e.model} status=${e.status} retryAfter=${e.retryAfter ?? '-'} retry=${e.retry} fp=${e.failedProvidersSize} ${e.errorMessage ?? ''}\n`,
    );
  }
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[probe] FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});