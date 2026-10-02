/**
 * Hackathon contract tests for the Nebius Token Factory × NVIDIA
 * Nemotron integration.
 *
 * These cover ONLY the invariants not already asserted in
 * nebius-provider.test.ts: catalog membership by exact model id,
 * context window against the router's actual minimum constant, and
 * usage-tracker pricing at the per-1k rates declared in the provider
 * catalog. Provider construction, request shape, router selection,
 * managed-coding isolation, and .env auto-detection are tested there.
 */
import { describe, expect, it } from 'vitest';

import { MIN_CODE_CONTEXT_WINDOW } from '../../kernel/llm/router-engine.js';
import { NEBIUS_MODELS } from '../../kernel/providers/custom-endpoint-provider.js';
import { TokenUsageTracker } from '../../kernel/providers/provider-types.js';

/** The NVIDIA Nemotron open-weight models Nebius Token Factory serves. */
const EXPECTED_NEMOTRON_MODELS = [
  'nvidia/nemotron-3-super-120b-a12b',
  'nvidia/nemotron-3-nano-30b-a3b',
  'nvidia/nemotron-3-ultra-550b-a55b',
] as const;

describe('Nebius × NVIDIA Nemotron hackathon contract', () => {
  it('serves the expected NVIDIA Nemotron open-weight models', () => {
    const ids = new Set(NEBIUS_MODELS.map((m) => m.model_id));
    for (const expected of EXPECTED_NEMOTRON_MODELS) {
      expect(ids.has(expected)).toBe(true);
    }
  });

  it('gives every Nemotron model at least the router minimum context window', () => {
    // MIN_CODE_CONTEXT_WINDOW is the router's actual eligibility floor
    // for code-generation tasks (isModelEligibleForTask).
    for (const model of NEBIUS_MODELS) {
      expect(model.context_window).toBeGreaterThanOrEqual(MIN_CODE_CONTEXT_WINDOW);
    }
  });

  it('prices Nemotron usage at the per-1k rates declared in the catalog', () => {
    const tracker = new TokenUsageTracker();
    const nemotron = NEBIUS_MODELS.filter((m) => m.model_id.startsWith('nvidia/nemotron'));

    for (const model of nemotron) {
      tracker.recordFromResponse('nebius', model.model_id, {
        content: 'x',
        model_id: model.model_id,
        provider: 'nebius',
        usage: { prompt_tokens: 1000, completion_tokens: 1000, total_tokens: 2000 },
        finish_reason: 'stop',
        latency_ms: 0,
      });
    }

    // 1000 input + 1000 output tokens per record, so the expected cost
    // is exactly the sum of the catalog's per-1k input and output rates.
    const expected = nemotron.reduce(
      (sum, m) => sum + m.cost_per_1k_input + m.cost_per_1k_output,
      0,
    );
    expect(tracker.getTotalCost()).toBeCloseTo(expected, 12);
  });
});
