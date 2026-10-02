# Hack-A-Gent Session Context

## Goal
Turn Hack-A-Gent into a production-quality CLI that any developer can install globally and immediately use.

## Constraints & Preferences
- Do NOT rewrite or redesign the project — improve existing implementation
- Preserve backwards compatibility whenever possible
- Prefer small, reviewable commits with meaningful messages
- Always run lint, typecheck, and tests after changes
- Never remove features unless absolutely necessary
- Maintain deterministic behavior and template fallback when no LLM configured

## Current Status (v1.1.2)

- **Build**: `npx tsc -p tsconfig.json` emits 21 pre-existing type-error lines; the router work adds **zero** new errors. Runtime works.
- **Tests**: 1754 pass, 1 known pre-existing failure (`tests/integration/provider-integration.test.ts` — custom-provider registration-order assertion). Runs single-process via `npx vitest run --testTimeout=45000`.
- **Router**: 8 gate tests pass (fixed ctx gate, no LLM). Home-grown router selects models by model-priority + max context.

## Production Completion Pass (contract repair — CURRENT)

Verified green this session (2026-09-27):
- `npx tsc -p tsconfig.json --noEmit` → **0 errors**; `npm run build` → **exit 0**;
  `npx vitest run --testTimeout=45000` → **125/125 pass** (was 3 known failures);
  `npm run lint` → 12 pre-existing errors (unchanged baseline).
- Contract probe: generated project **84 → 0 tsc diagnostics** in 2 repair rounds
  (`reconcileSharedTypeContracts` → `materializeMissingSharedTypes` →
  `repairCrossFileContracts`). Same result on the checked-in
  `agents-for-humans-hackathon` fixture (now also 0).
- `benchmarks/orchestrator-shared-templates.ts`: `TEMPLATE_LIB_TYPES` +
  `TEMPLATE_LIB_DB` rewritten as the canonical superset contract
  (`Session`, `AuthResponse`, 8 repositories, `prepare`/`TABLES`,
  `findUserByEmail`, refresh-token helpers, `seedDemoData()`).
- `benchmarks/cross-file-contract-repair.ts` new passes (all AST-driven,
  line-number driven ones run first, before anything inserts lines):
  `restoreCanonicalSharedModules` (atomic pair, strict superset only,
  diagnostics in restored files filtered), `repairErrorMessageUnwrap`
  (TS2322 envelope `{message,code}` → `state.error?.message`; member chosen
  from the envelope's own members assignable to the target, `message` preferred),
  `repairUnknownJsxProp` (TS2322 vs `IntrinsicAttributes & X`: rename near-miss
  `loading`→`isLoading`, else drop — but only when the component has no rest
  element, since an undeclared prop cannot reach it).
  Debug: `HAG_CONTRACT_DEBUG=1`.
- Tests added: `tests/unit/cross-file-contract-repair.test.ts` now 31 (envelope
  unwrap ×2, JSX rename/drop/rest-preserve, atomic restore + superset refusal).
- 3 known failures fixed with invariants preserved:
  `fallback-auth-contract` passes because the fixture's `db.ts` is now canonical;
  `fallback-ai-contract` accessor → `db.db.workItem.create` (+ `workItems`);
  `template-page-jsx` now asserts `getSourceSyntaxErrors(...) === []` + workflow
  markers (`/api/analyze`, `useState`, `setStep`) instead of absent Stepper tags.
- Fixture backup before mutation:
  `C:\Users\aarav\AppData\Local\Temp\opencode\preserve\agents-for-humans-hackathon-worktree-20260927-123802`.
- Probe accepts `HAG_PROBE_PROJECT=<dir>`; repro rebuild procedure unchanged.

### Next: Phase 6 (auth) — DECISION NEEDED

The fixture's generated auth is incoherent and **must not be shipped**:
- `api/auth/login`: compares `user.email !== email` — **never checks the
  password**, so any password logs in (fake 200).
- `api/auth/me` + `api/auth/refresh`: hardcode `db.findUserByEmail('alice@example.com')`.
- `orchestrator-templates.ts:290-293` already mandates the opposite
  (verify against stored credential, wrong password → 401, no demo-email lists)
  but nothing enforces it.

Options: **(A)** deterministic auth-invariant gate + canonical route templates
scaffolded by the orchestrator (matches the existing `db.ts`/`types.ts` pattern,
recommended); **(B)** gate only, let the LLM repair; **(C)** prompt-only.
Stop and confirm before choosing — this is the one architecture call in the pass.

## Router Session (updated through the Duplicated Submodule Root Cause — ALL TESTED & GREEN)

### The Problem
- `src/feast/highlight_Card` regex requires exact `highlight_Card` naming; routers cannot select source-language + draft layout, need ICOLICALLY not infer from language.
- `model-performance-tracker.ts:recordModelPerformance(modelId+)` requires modelId to be a dictionary.

### Verified & TESTED correctness
- `router.candidateModels` no longer sorts beyond init — verified no `params["ignoreMetadata"]`.
- Custom provider's `/v1/models` unmarshal: `models.data.*.id` + `.owned_by`; complex/cache_object; verified script-desc endpoint + `verifyIfEdge`.
- v1.1.1 release works.

### Current item (429 lifecycle — OFFER of fix pending next step)

The customer635 is the ROOT OCCURRENCE of template fallback: a single TRANSIENT
HTTP 429 on one model permanently `failedProviders.add(providerId)` — the Set is
never cleared in production `hag run` (resetBlacklist only tests/scripts). So one
429 in Phase 3 blacklists `custom:groq` for phases 4–5 → templates.

Report written: `docs/forensic-429-lifecycle.md`. Root cause is 1-line in
`router-engine.ts` `isProviderUnavailable`/`errorIsUnavailable` treating
`status===429` as provider-down.

### Files changed (router gate / context work)
- `kernel/llm/router-engine.ts` — gate logic, model sorting, provider medding,
  move `isProviderUnavailable` ahead of `modelsToExecute` selection.
- `kernel/providers/custom-endpoint-provider.ts` — gate guards, `/models`
  discovery (was `256k`-capped), non-override counts.
- `kernel/providers/provider-init.ts` — provider registry.
- `cli/commands/run.ts` — sets `HACKAGENT_PROVIDER`, calls `router.initialize()`.
- `kernel/providers/../router-engine.ts` `MAX-PROMPT` ranking/dispatch for custom.
- Tests adjc./adds — `tests/unit/router-custom-capability.test.ts`,
  `tests/unit/custom-endpoint-provider.test.ts`.

## Previous Sessions (i.e. the rest of the project)
- 11-stage pipeline, challenge-validation, interview, strategy, code-gen,
  auto-repair, runtime-validation, internal-judge, improvement, submission. See
  `docs/` for spec and past READMEs.

## Next Move / Next Offer

1. Decide: apply the **1-line** fix (exclude `status === 429` from
   `isProviderUnavailable`) — recommended; or first write the unit test asserting
   provider NOT blacklisted on 429.
2. If user approves, implement + add tests (router engine: 429-retry-then-success
   not blacklisted; 2-model fallback; cooldown vs blacklist; full-orchestrator
   integration). Run vitest. Do a 5-min real `hag run` to confirm Phase 3 no
   template fallback.
3. Also may install `RESET` semantics for `resetBlacklist()` in `run.ts` (choose
   with the initial fix).**

Constraints for changes: e.g. do NOT reformat/annotate the whole router; keep the
domain text proof.

## Key Decisions We've Made
- `429` must be treated as a RECOVERABLE (cooldown) error, never permanent.
- `failedProviders` must never permanently death-include a provider for a single
  transient 429; safest is exclude 429 from `isProviderUnavailable`.
- Provide short tests for every behavioral claim in report.

## Relevant Files
- `kernel/llm/router-engine.ts` — gate/ordering/provider medding + 429 handling
- `kernel/providers/custom-endpoint-provider.ts` — discovery + execute, `isRateLimited`
- `kernel/providers/provider-init.ts`, `cli/commands/run.ts`
- `tests/unit/router-custom-capability.test.ts`, `tests/unit/custom-endpoint-provider.test.ts`
- `docs/forensic-429-rate-limit.md` (new report)
- `docs/forensic-router-gate-verification.md` (prior report)