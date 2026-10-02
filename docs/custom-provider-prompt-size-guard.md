# Capability-Aware Prompt-Size Guard for `custom:*` Provider Models

## Status
Implemented, type-clean, and verified. All 8 new unit tests pass.

## Problem (Root Cause Confirmed)

`RouterEngine.execute()` gated oversized prompts only when the model had a
curated entry in `MODEL_CAPABILITY_PROFILES` (`router-engine.ts`, formerly
lines 409–430):

- **NVIDIA path**: restricted to `STATIC_CODING_CHAIN` + every model has a
  curated profile → the capability gate worked correctly.
- **`custom:*` path**: uses the full newly-discovered catalog; discovered
  models have **no** profile entry, so the `if (profile) { ... }` branch was
  skipped entirely → oversized prompts were dispatched to `provider.execute()`.
  Models with small/uncertain capacity then fail with 413/400/timeouts (e.g.
  `custom:groq` Compound Mini, Whisper, gpt-oss) or waste a turn on a prompt
  the model cannot accept.

`ModelSpec.context_window` is `z.number().positive()` on validated specs
(`llm-types.ts:25`). Discovery hardcodes `context_window: 128000` for every
custom model (`custom-endpoint-provider.ts:198`), so it is **not**
model-trustworthy — but it is the only metadata available. We use a
conservative `25%` fraction with a safe fallback rather than trusting raw value.

## Files Changed

- `kernel/llm/router-engine.ts` — MODIFIED (core change)
- `tests/unit/router-custom-capability.test.ts` — ADDED (8 tests)

## Routing Logic

Added a `custom:*`-specific skip branch after the existing NVIDIA profile gate:

```ts
const CUSTOM_CONTEXT_FRACTION = 0.25;
function customPromptCeiling(model: ModelSpec | undefined): number {
  const ctx = model?.context_window;
  if (typeof ctx !== 'number' || !Number.isFinite(ctx) || ctx <= 0) {
    return SMALL_MAX_PROMPT; // 4000 conservative fallback
  }
  return Math.floor(ctx * CUSTOM_CONTEXT_FRACTION);
}
```

```ts
} else if (providerId.startsWith('custom:')) {
  const promptTokens = estimateRequestTokens(request);
  const maxPrompt = customPromptCeiling(model);
  if (promptTokens > maxPrompt) {
    this.chainLog(`${icons.skip} ${providerId} / ${modelId} — skipped (prompt ${promptTokens}t > ${maxPrompt}t limit)`);
    continue;
  }
}
```

Behavior:
- **NVIDIA** curated profile path is untouched (unchanged gate).
- **`custom:*` WITH** a curated profile (e.g. `meta/llama-3.1-8b-instruct`)
  still uses `profile.maxPromptTokens`.
- **`custom:*` WITHOUT** a profile uses `floor(context_window * 0.25)`.
- Missing/invalid/NaN `context_window` → `SMALL_MAX_PROMPT` (4000).
- Oversized prompts are skipped **before** `provider.execute()` is reached.
- `custom:*` is never unlimited: even 128k context caps at 32000 prompt tokens.
- When every candidate model of a custom provider is skipped, `router.execute`
  rejects with the existing `All models failed for task "..."` error (the
  capability skip is a `continue`, matching the NVIDIA path).

## Proof NVIDIA Unchanged

The NVIDIA gate sits before the new branch and is gated on profile existence;
the added code is a separate `else if (providerId.startsWith('custom:'))`.
No NVIDIA models enter it. Verified by test: an oversized `nvidia` request is
still rejected (never dispatched) exactly as before.

## `custom:*` Ceiling Calculation

| context_window | ceiling = floor(ctx × 0.25) |
|----------------|------------------------------|
| 512            | 128                          |
| 32k            | 8000                         |
| 64k            | 16000                        |
| 128k           | 32000                        |
| missing / NaN / ≤ 0 | 4000 (SMALL_MAX_PROMPT) |

## Tests Added (8)

`tests/unit/router-custom-capability.test.ts`, using a `RecordingProvider`
harness that records dispatched model IDs (and can throw if reached), plus a
`cappedTokens()` helper producing an exact prompt-token count:

1. NVIDIA curated behavior unchanged (oversized `nvidia` prompt still skipped).
2. `custom:*` WITH profile uses `profile.maxPromptTokens`.
3. `custom:*` WITHOUT profile uses context-derived ceiling.
4. Oversized `custom:*` prompt skipped BEFORE `provider.execute()`.
5. Under-limit prompt dispatched normally.
6. Missing/invalid `context_window` handled safely (fallback).
7. Multi-model custom provider skips oversized and proceeds to eligible model.
8. `custom:*` is not unlimited (128k context still caps).

## Verification

- New test file: **8 tests pass**.
- Targeted router run (router-engine / failover / reliability / custom):
  50 passed.
- Full suite (`npx vitest run --testTimeout=45000`): **1739 passed, 1 failed**.
  - The single failure is `tests/integration/provider-integration.test.ts:430`
    — expected `['custom','openrouter']`, got `['openrouter']`. This is a
    **pre-existing** custom-provider registration-order failure, documented in
    AGENTS.md prior to this task and unrelated to the router gate (it concerns
    `cli/provider-init.ts` provider registration, which this change does not
    touch).
- **Build** (`npx tsc -p tsconfig.json`): my change adds **zero** new errors.
  - `kernel/llm/router-engine.ts` and the new test file are fully type-clean.
  - 12 remaining errors are pre-existing/investigation-only:
    `cli/commands/providers.ts` (`targetProvider` undefined),
    `kernel/providers/provider-types.ts` (`string | undefined`),
    `scripts/nvidia-*.ts` (leftover audit diagnostic scripts, untracked).

## Before / After

**Before**: `custom:groq` with an oversized prompt → dispatched to a model of
unknown capacity → 413/400/timeout (no gate).

**After**: the same prompt is flagged `[skip] custom:groq / compound-mini —
skipped (prompt 1300t > 320t limit)` (example) before dispatch; the router
skips that model and either proceeds to an eligible model or—on a fully-skipped
provider—rejects with `All models failed`.