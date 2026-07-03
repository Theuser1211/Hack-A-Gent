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

## Completed Phases

### Phase 1 — Bug Fixes & Core Stability
- CustomEndpointProvider API key lookup bug fix (`this.apiKeyEnvVar` mangling) — replaced with `this.providerId`
- `buildExecutionPlan()` stub (always threw) → `extractRequirements()` + `createExecutionPlan()` in `run.ts`
- `RouterEngine` wired into orchestrator + `generateFilesWithLLM()` method with template fallback
- Import path fixes (`../llm/` → `../kernel/llm/`)
- `process.exit()` → `process.exitCode` to avoid Node.js libuv assert crash on Windows (SIGINT still uses `process.exit()`)
- Zod config schema validation — rejects invalid provider values, validates on read/write
- `.env` file support (`HACKAGENT_PROVIDER`, `HACKAGENT_API_KEY`, `HACKAGENT_BASE_URL`, etc.)
- `checkHealth()` added to `LLMProvider` interface + all 6 implementations (CustomEndpoint uses real `GET /models`)
- `--verify` flag uses real `checkHealth()` instead of cached `getHealth()`
- `hag` bin alias + `npm run hag` script; removed broken `hack-agent` bin entry
- Command aliases (`c` → `config`, `s` → `setup`)
- Provider aliases (`nvidia-nims`, `nvidia-nim` → `nvidia`)
- SIGINT handler for graceful Ctrl+C
- Created `cli/commands/setup.ts` — interactive setup wizard
- `--endpoint` as alias for `--base-url`

### Phase 2 — CLI Experience
- Created `cli/output.ts` — ANSI color utility with `icons`, `Spinner`, `header()`, `step()`, `success()`, `error()`, `warn()`, `info()`, `labeled()`, `divider()`, `dim()`, `log()`
- Disables colors/spinners when stdout is not a TTY
- Updated `run.ts` and `setup.ts` to use output utilities
- Setup type fixes (non-null assertions, `as` cast for provider value)

### Phase 5 — New CLI Commands
- `hag doctor` — system diagnostic (Node, Git, config, provider checkHealth, workspace)
- `hag models` — lists models from configured provider via `getModels()`
- `hag providers` — shows all 6 provider statuses (configured, initialized, healthy)
- `hag version` — displays version from `package.json`
- Registered in `CommandName` union type and `index.ts`

### CLI Output Polish
- Migrated all 10 remaining command files from `console.log`/`console.error` to `cli/output.ts`:
  `benchmark.ts`, `chat.ts`, `deploy.ts`, `explain.ts`, `health.ts`,
  `memory.ts`, `replay.ts`, `resume.ts`, `status.ts`, `test.ts`

### Phase 3 — Global Install (verified)
- `npm link` works
- `hackagent`, `hag`, `npx hackagent` all work
- Help shows all commands
- Unconfigured state shows helpful error messages pointing to `hag setup`

## Key Decisions
- `process.exit()` → `process.exitCode` to avoid Node.js libuv assert crash on Windows
- Zod schema validation for config file — prevents loading corrupted config silently
- Provider validation via enum — catches typos with helpful error messages
- `.env` support as alternative to CLI config
- `hag` shorthand for `hackagent` + `c` for `config`, `s` for `setup`
- Terminal output utility (`cli/output.ts`) with no dependencies — ANSI escape codes directly

## Critical Context
- ~284 TypeScript errors across 49 files — none block runtime (same 8 in cli/commands/ pre-existed)
- `npm run build` emits `dist/cli/index.js` successfully
- `npm run hackagent` uses `tsx` directly (no build needed)
- Test suite: 400+ tests, ~19 pre-existing failures (benchmark encoding, missing `type` fields) — not caused by changes
- Pipeline produces 20 tasks for real Devpost URLs with real NVIDIA NIMs API key

## Relevant Files
- `cli/output.ts` — ANSI color/spinner/icon utility
- `cli/index.ts` — entry point, aliases, SIGINT handler
- `cli/types.ts` — `CommandName` union with all commands
- `cli/config-manager.ts` — Zod validation, `.env` support
- `cli/provider-init.ts` — creates RouterEngine from config
- `cli/commands/setup.ts` — interactive setup wizard
- `cli/commands/config.ts` — LLM/deploy config management
- `cli/commands/doctor.ts` — system diagnostic
- `cli/commands/models.ts` — list models
- `cli/commands/providers.ts` — provider status
- `cli/commands/version.ts` — version display
- `cli/commands/run.ts` — full pipeline runner
- `cli/commands/status.ts`, `memory.ts`, `health.ts`, `benchmark.ts`, `deploy.ts`, `explain.ts`, `replay.ts`, `resume.ts`, `test.ts`, `chat.ts` — all migrated to output.ts

## Remaining Ideas
- Add `hackagent update` command — check npm for newer version
- Dynamic model fetching from provider APIs (currently all static/hardcoded)
- Telemetry / usage analytics opt-in
- CI/CD pipeline for npm publishing
- More comprehensive first-run tutorial/onboarding
