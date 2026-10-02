# Forensic: HTTP 429 Rate-Limit Lifecycle — Why a 429 Falls Back to Templates

## 1. Exact root cause

A single **transient HTTP 429** on one model permanently blacklists its **entire
provider** for the whole `hag run`, so every later phase skips LLM and falls back
to templates — even though the 429 came with a valid `Retry-After` that the code
already reads.

Two code paths fuse to cause this:

1. `isProviderUnavailable()` (`kernel/llm/router-engine.ts:620`) classifies
   **429** as `true`, and `router-engine.ts:538-539` therefore runs
   `this.failedProviders.add(providerId)`.
2. `failedProviders` is a **run-scoped Set that is never cleared in the
   production path**. `resetBlacklist()` exists but is only called from
   `scripts/*.ts` and tests — never in `run.ts`/`hag run`. So one 429 poisons
   the provider for **all subsequent phases and generations** in that invocation.

Result observed: Phase 3 got `llama-3.3-70b-versatile` HTTP 429, `failedProviders`
gained `custom:groq`, phases 3/4/5 short-circuited to `aiUnavailable` → template.

## 2. Exact file + function responsible

| Layer | File | Lines | Role |
|---|---|---|---|
| 429 detector | `custom-endpoint-provider.ts` | 359–375 | reads status + `Retry-After`, records tracker, throws `{status:429, retryAfter}` |
| Pre-call throttle | `custom-endpoint-provider.ts` | 308 | `isRateLimited()` throws "rate limit exceeded" |
| Router retry | `router-engine.ts` | 496–525 | one 429 retry, `sleep(waitMs)` |
| **Permanent blacklist** | `router-engine.ts` | 538–539 → 620 | **429 → `failedProviders.add(providerId)`** |
| Break-out | `router-engine.ts` | 562 | stop remaining models in provider + prevent future phase entry (`orderProviders` skip) |
| JSON retry shell | `json-extractor.ts` | 224–265 | retries only on `ParseValidationError`, not 429 |

## 3. Request lifecycle diagram (per failing phase)

```
generatePhase3 → executeLLMGeneration(assembly,'frontend')
  └─ executeWithJSONRetry(executor, maxRetries=2)     │ json-extractor
      └─ executor(attempt) → router.execute('coding', req)
          ├─ provider.prepare() (discovery)            [1] /models
          ├─ select model (skips prompt-guard via gate)
          └─ attemptModel → provider.execute(req)     [2] POST /chat/completions
              ├─ HTTP 429 + Retry-After:22
              │    → rateLimitTracker.recordRateLimit(resetAt=+22s)
              │    → throw {status:429, retryAfter:'22'}
              └─ router catch status===429 (not yet retried)
                   ├─ sleep(22s) → attemptModel AGAIN  [3] POST /chat/completions
                   ├─ 429 again
                   └─ isProviderUnavailable(429)=true
                      → failedProviders.add(custom:groq)   ⚠ PERSISTENT
                      → break provider loop
      └─ executeWithRetry: 429 is NOT ParseValidationError → rethrow (no 3 try)
   └─ catch → debug + warnLLMFailure → return [] (template)
```

## 4. Retry-multiplication calculation (ONE failed phase → HTTP request count)

For the reported failing phase (Phase 3):

- **worker.execute** in `attemptModel` (via `/chat/completions`): **1 HTTP**.
- **Router 429 retry** (after `sleep(Retry-After)`): **+1 HTTP**.
- **executeWithJSONRetry**: does **not** retry 429 (only `ParseValidationError`), so no extra.
- **Provider**: custom provider has **no** `withRetry` (verified count = 0), so **no** extra.
- **writeAndVerifyPhase** (phase repair) does **not** re-invoke LLM; it runs `tsc` + deterministic repair only → **0** LLM HTTP.

**Total for one failed phase: 2 HTTP requests** (1 + 1 router retry). Not
amplified to per-10. The concurrency doesn't multiply (phases are serial).

### The amplification that ACTUALLY matters
Those 2 requests were for **phase 3**. Because the provider was blacklisted
persistently:

- **Phases 4 & 5**: `router.execute` → `candidateProviders` skips `custom:groq`
  via `failedToProviders.has()` → likely no provider → immediate skips, **0 HTTP**.
- **Full-run impact**: 1 transient 429 (in a run where phases 1–2 already
  succeeded via LLM) destroys LLM generation for **every remaining phase**, forcing
  template fallback across the project.

## 5. Answers A–O

**A. Where 429 detected:** `custom-endpoint-provider.ts:359` (non-stream execute)
and `:484` (stream). Also openai/anthropic/openrouter/gemini share this pattern.

**B. Is 429 retried?** Yes, once — `router-engine.ts:496-525`. JSON shell does not.

**C. Wait duration:** `router-engine.ts:499` → `Retry-After*1000` capped at 120s,
else 60s. Real run: Retry-After = "22" → slept 22s.

**D. Retry-After read?** Yes. Provider reads header → attaches `retryAfter` to the
thrown error; router reads `err.retryAfter`. Server headers drive the wait.

**E. Exponential backoff?** `withRetry` has expo backoff, but the custom provider
**does not use `withRetry`** (0 usages). So the actual failing provider uses a
**single fixed sleep** — no exponential backoff.

**F. Does orchestrator multiply?** No. `executeWithRetry` only retries JSON-parse
errors; layout is serial (`core Files` loop, phase-by-phase, no `Promise.all`).
One logical phase → 2 physical HTTP.

**G. Permanent blacklist on 429?** **YES — the bug.** `isProviderUnavailable(429)`
→ `failedProviders`. Cleared only in tests/scripts, never in a real run.

**H. Same model retried immediately?** The router retries the same model once
after `sleep(Retry-After)`; if it 429s again, that model is then not retried in
subsequent attempts (rateLimitRetried set), and the provider is blacked.

**I. Can another viable model be selected after the 429?** With current code, no —
`failedProviders.add` (line 539) + `break` (line 562) stops the whole provider
after one 429, even though other models (gpt-oss-120b, llama-3.1, etc.) exist.
This directly contradicts the goal "let another model be tried."

**J. Phases share rate-limit state?** Yes — `RateLimitTracker.isRateLimited` is
keyed by *provider* (shared across the run), and `failedModels`/`failedProviders`
are shared per router instance. A 429 in phase 3 gates the provider's throttle
for later phases too.

**K. Success cache reused?** `successCache` keyed by taskType (`'coding'`) —
yes, and the Ro engine reuses it at the top of `execute()`. But a 429 (which
delete the cache in `trySuccessCache` catch - `router-engine.ts:737`) no-op?

**L. Does a P3 429 destroy the rest?** YES — see `G`: persistent blacklist makes 4/5
skip.

**M. Concurrent requests?** No — no `Promise.all` in the orchestrator; phases and
models are serialized.

**N. Multiple requests same bucket?** No concurrency, so no accidental shared-bucket
overshoot; the provider throttle (`waitIfThrottled`) also serializes within a
provider.

**O. Distinguish transient vs permanent?** Generically: not for 429. The code knows
`status/retryAfter`, but `216`... `520`**--the router keeps 429s in the "permanent"
branch. It does distinguish 401/403 (auth) from outages, but 429 is wrongly grouped
with hard failures.

## 6. Evidence from real logs/tests
- Live `hag run` log `tmp/run-custom-ctx.log`:
  - Phase1/Phase2: `llama-3.1-70b-instruct` HTTP 200, valid JSON, persisted.
  - Phase 3: `...— skipped (prompt 3154t > 128t limit)` for gate, then
    `Llama 3.3 70b Versatile — rate limited (429), waiting 22s then retrying once...`
    then `— Rate limited (429)`.
  - Immediately after: `⚠ AI provider unavailable. Switching to production template generation.`
- `npm test`: 1754 passed / 1 pre-existing (`provider-integration`) — nothing here.
- Real `Retry-After: 22` confirmed in header → 429 is transient, TPM/RPM-cap, not
  a hard outage. The retry-after was present and honored; the mistake is the
  **lack of `Retry-After` reset clearing the persistent blacklist**, not the
  sleep.

## 7. The 429 cause (from metadata)
Groq's response gave `Retry-After: 22` (seconds)and the request hit
`llama-3.3-70b-versatile` — a **model-specific free-tier request/token-per-minute
cap** that is transient. Not concurrency, not retry-amplification (only 2
requests), not request-per-minute (TPM due to `max_tokens:8192` + large prompts).
Confirmed transient because `Retry-After` was finite and the model had succeeded
in earlier phases.

## 8. Smallest safe fix (recommended)
**Stop treating 429 as a permanent provider failure** in
`isProviderUnavailable()`:
- Change `router-engine.ts:620` so `429` is **not** "provider-unavailable"
  (remove `status === 429` from the `if`), so no `add(providerId)`.
- This is pre-existing, source-consistent position: the RateLimitTracker already
  gates bursts for a provider; removing the hard-429 blacklist means an oversized
  provider can still be retried by a later phase once its `Retry-After` window
  (resetAt) elapses — which the `isRateLimited(resetAt)` check already handles.
- With 429 not blacklisting, the 562 break in the provider/member loop won't fire
  → the router will naturally proceed to try **another model** in the same provider
  for the current phase, increasing the chance the phase succeeds via a different
  model.

This is a 1–3 line change matching the codebase's own "transient 429 is retryable,
not a permanent kill" 5xx counts (see the giant `isProviderUnavailable` docstring).

## 9. More robust fix
- In `isProviderUnavailable()`, handle 429 exclusively of provider blacklist;
  then, in the caller, on 429 add the provider to a **temporary cooldown** map
  `{resetAt}` instead of a permanent Set, and if `resetAt` has passed in a later
  phase, allow it back. Keep `resetBlacklist()` production-wired or simply
  re-check `RateLimitTracker.resetAt` before re-adding.

## 10. What NOT to change
- JSON extraction / `executeWithJSONRetry` (already correct: 429 is rethrown).
- Prompt design, max_tokens, model chain/order.
- context-window normalization and the custom:* prompt gate (proven working).
- `withRetry` backoff (custom provider intentionally doesn't use it).
- Do NOT raise `maxRetries` — the failure is blacklist persistence, not retry count.

## 11. Expected impact on full hag runs
- Phases that follow a transient 429 will **retry the same / an alternate model
  after the Retry-After window** instead of instantly dropping to templates.
- The project is much more likely to complete **all 5 phases by LLM** (target A
  or B) because a single-phase transient doesn't forfeit the remaining phases.
- No cost/request regression: still only sleeps `Retry-After`s and tries up to one
  extra model; transient caps eventually clear.

## 12. Exact tests required
1. `router-engine` unit: a model returning `429 + Retry-After=22` then success on
   the router's retry → `provider` NOT in `failedProviders` afterwards.
2. Unit: a model that 429s on both attempts → provider is NOT permanently
   blacklisted; `execute()` inside *another phase* still enters and tries a
   distinct model (2 models, P1 429s, P2 200).
3. Unit: 429 with Retry-After sets cooldown but does not `resetBlacklist` from
   `isRateLimited` — assert next phase retries after window.
4. Integration: full `InternetHackathonOrchestrator` path with a mocked
   router/provider where ph3 429s once → phases 4–5 still attempt LLM, not
   template fallback.
5. Regression: existing 8 router gate tests + 60 unit custom tests still pass.

---

## Single highest-leverage next change

**Don't permanently blacklist a provider on a transient 429 — exclude
`status === 429` from `isProviderUnavailable()` in `kernel/llm/router-engine.ts`
and let the existing `RateLimitTracker` `Retry-After` cooldown govern retries.**
This is a 1-line behavior change that removes the actual mechanism that converted
a single recoverable 429 into total template-fallback for the entire remaining
pipeline, while leaving all proven routing, context, JSON, and prompt logic intact.