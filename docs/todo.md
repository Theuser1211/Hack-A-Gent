# Objective

Improve Hack-A-Gent's codebase quality, type safety, test reliability, and operational hygiene before the next release. No feature work — only hardening.

---

# Architecture

## Components That Will Change

| Component | File(s) | Nature of Change |
|---|---|---|
| `.gitignore` | `.gitignore` | Add generated project dirs + stale temp files |
| CLI entry | `cli/index.ts` | Remove file-level `eslint-disable`; type-safe `FEATURE_COMMANDS` |
| Provider layer | `kernel/providers/provider-types.ts`, `anthropic-provider.ts`, `llm-builder-provider.ts` | Replace 7 `as any` casts with proper types |
| Router engine | `kernel/llm/router-engine.ts` | Replace 2 `as any` casts on health status |
| Provider factory | `kernel/providers/provider-factory.ts` | Remove `as any` on model mapping |
| CLI catch blocks | `cli/commands/health.ts`, `cli/commands/doctor.ts`, `cli/commands/status.ts`, `cli/commands/run.ts`, `cli/submission-assistant.ts`, `cli/user-memory.ts` | Add meaningful comments to 8 empty catches |
| Docs | `docs/architecture.md` | Update to match actual implementation |
| Stale files | `p0_hang_fix_v2.txt`, `test_hang.txt`, `test_help.txt`, `test_run.txt`, `not-a-url/`, `project-from-https---google-com-/`, generated project dirs | Delete or gitignore |
| Tests | `tests/features/benchmarks.test.ts`, `tests/integration/pipeline-false-positives.test.ts` | Investigate 4 pre-existing failures |

## Dependencies

- `cli/index.ts` → `cli/errors.ts` (unchanged)
- `kernel/providers/*.ts` → `kernel/llm/llm-types.ts` (will add proper type exports)
- `.gitignore` → standalone (no code deps)

## Possible Regressions

- Changing health-status mutation from `as any` to typed assignment must preserve the same runtime shape
- Replacing `as any` in FEATURE_COMMANDS must not break the dynamic import dispatch pattern
- Adding `.gitignore` entries must not accidentally ignore tracked files

## Performance Impact

None — all changes are compile-time or error-path only.

## Risks

- **Low**: The `as any` replacements are in error-handling and fallback paths — type-safe alternatives exist but need careful `@ts-expect-error` or proper type narrowing
- **Low**: Empty catch comments don't change runtime behavior
- **Medium**: Test reliability investigation may reveal root causes requiring non-trivial fixes

---

# Implementation Plan

## Phase 1 — Gitignore & Stale File Cleanup
- [ ] Add generated project directories (`ai-yes--*/`, `gatewayhacks-*/`, `hackonomics-*/`, `india-high-school-*/`) to `.gitignore`
- [ ] Add stale debug files (`p0_hang_fix_v2.txt`, `test_*.txt`, `not-a-url/`, `project-from-https---*/`) to `.gitignore`
- [ ] Run `git status` to verify no tracked files are affected
- [ ] Remove stale `docs/architecture.md` aspirational content warning (outdated vs actual implementation)
- [ ] Verify no generated projects are tracked

## Phase 2 — Fix `as any` Casts in Kernel
- [ ] `kernel/llm/router-engine.ts:271` — Replace `(health as any).status = 'unhealthy'` with proper `ProviderHealth` mutation
- [ ] `kernel/llm/router-engine.ts:273` — Replace `(health as any).status = 'degraded'` with proper mutation
- [ ] `kernel/providers/provider-types.ts:294` — Replace `(err as any)?.status` with typed error narrowing
- [ ] `kernel/providers/provider-types.ts:298` — Replace `(err as any)?.retryAfter` with typed error narrowing
- [ ] `kernel/providers/anthropic-provider.ts:301-302` — Replace `(event as any).stop_reason` with proper SSE event types
- [ ] `kernel/generation/llm-builder-provider.ts:272` — Replace `provider: this.router.selectModel(...).provider as any` with proper type
- [ ] Run `tsc --noEmit` to verify zero type errors
- [ ] Run relevant provider/router unit tests

## Phase 3 — Fix File-Level `eslint-disable` in CLI Entry
- [ ] Remove `/* eslint-disable @typescript-eslint/no-explicit-any */` from `cli/index.ts`
- [ ] Type `FEATURE_COMMANDS` properly using a command registry interface
- [ ] Replace `Promise<any>` with `Promise<Record<string, CLICommandFn>>` or similar
- [ ] Remove `/* eslint-enable @typescript-eslint/no-explicit-any */`
- [ ] Run `eslint cli/index.ts` to verify zero new errors
- [ ] Run `tsc --noEmit` to verify zero type errors

## Phase 4 — Fix Empty Catch Blocks
- [ ] `cli/commands/health.ts:35` — Add comment explaining silent catch
- [ ] `cli/commands/doctor.ts:44` — Add comment explaining silent catch
- [ ] `cli/commands/doctor.ts:126` — Add comment explaining silent catch
- [ ] `cli/commands/doctor.ts:134` — Add comment explaining silent catch
- [ ] `cli/submission-assistant.ts:75,88,173,187,216` — Add comments explaining each silent catch
- [ ] `cli/commands/status.ts:18,50,118` — Add comments explaining each silent catch
- [ ] `cli/user-memory.ts:59,70` — Add comments explaining each silent catch
- [ ] `cli/commands/run.ts:834` — Add comment explaining silent catch
- [ ] `cli/pipeline/scaffolding.ts:136` — Add comment explaining silent catch
- [ ] `cli/deployment-verifier.ts:103` — Add comment explaining silent catch

## Phase 5 — Test Reliability Investigation
- [ ] `tests/features/benchmarks.test.ts > generateStarter` — Investigate ESM vs CJS SyntaxError (`'import'` / `'export'`)
- [ ] `tests/features/benchmarks.test.ts > evaluateProject` — Investigate failure, same root cause likely
- [ ] `tests/features/benchmarks.test.ts > history + comparison` — Investigate timing/state issue (expects 2 runs, gets 1)
- [ ] `tests/integration/pipeline-false-positives.test.ts` — Investigate intermittent timeout
- [ ] For each: determine if quick fix (config change, timeout bump, env tweak) or deeper test issue
- [ ] Apply fixes where safe; document remaining root causes if non-trivial
- [ ] Run full test suite to confirm fix

## Phase 6 — Pipe Through Full Validation Suite
- [ ] Run `tsc --noEmit` — verify 0 errors
- [ ] Run `npm run build` — verify clean build
- [ ] Run `npm test` — verify pass count
- [ ] Run `eslint cli/ kernel/` — verify no new warnings
- [ ] Quick end-to-end: `npx tsx cli/index.ts doctor`

---

# Validation

| Phase | Validation |
|---|---|
| 1 | `git status` shows no unexpected changes; listed dirs appear in untracked only |
| 2 | `tsc --noEmit` passes; provider unit tests pass |
| 3 | `eslint cli/index.ts` passes with no `no-explicit-any` errors; `tsc --noEmit` passes |
| 4 | `grep -r "catch\s*{" cli/` shows all empty catches have comments |
| 5 | `npx vitest run` shows fewer or identical failure count; each investigated failure has a documented root cause |
| 6 | All above pass; `npx tsx cli/index.ts doctor` succeeds |

# Rollback

- **Phase 1**: `git checkout -- .gitignore` reverts all gitignore changes
- **Phase 2**: `git checkout -- kernel/llm/router-engine.ts kernel/providers/provider-types.ts kernel/providers/anthropic-provider.ts kernel/generation/llm-builder-provider.ts`
- **Phase 3**: `git checkout -- cli/index.ts`
- **Phase 4**: `git checkout --` each modified command file (isolated per file)
- **Phase 5**: `git checkout -- tests/` reverts all test changes
- **Full rollback**: `git reset --hard HEAD` if nothing else committed

Each phase is independent — can roll back individually without affecting others.
