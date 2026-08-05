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

## Current Status (v1.1.1)

- **Build**: `npx tsc -p tsconfig.json` emits 133 pre-existing type-error lines (134 baseline at HEAD via `git stash`); the markdown-extraction work adds **zero** new errors. Runtime (CLI via `tsx`) works. `tsc`/`build` typechecking is not yet green repo-wide — unrelated pre-existing debt in `tests/`, `intelligence-analyzer.ts`, `section-extractor.ts`, and a `router` type mismatch in `universal-parser/index.ts`.
- **Tests**: 111 test files / 1677 tests pass (`npx vitest run --testTimeout=45000`). Suite takes several minutes (some tests 27–55s each). Run vitest single-process and kill orphaned node processes first to avoid OOM/hangs.
- **Pipeline**: 11-stage spec pipeline: Challenge Analysis → **Challenge Validation** → Dynamic Interview → Winning Strategy → Project Generation → Auto Repair → Runtime Validation → Browser Validation → Internal Judge → Improvement Pass → Submission Package
- **Version**: 1.1.1

## Completed Work

### Session: Experimental Markdown Extraction Strategy + Benchmark
- `features/extraction/` — pluggable extractor system with strategies `'dom' | 'markdown' | 'jsonld'`: types, metadata, html-cleaner (boilerplate/nav/footer/script removal via iterative same-element backreference loop), html-to-markdown (GFM tables, entity-decoded img alt, `javascript:`/hash link guard), sections (`sectionsFromMarkdown` composing structured metadata + intro content), dom/markdown/jsonld extractors, registry (falls back to `'dom'` = unchanged production path), benchmark-fixtures, benchmark.
- Wired into parser: `features/universal-parser/index.ts` uses `runExtractor(extractor, {...})`, `ParserContext` gained `aiInput`; `ai-normalizer.ts` gained `sectionsTextOverride` param. Production DOM path unchanged by default.
- CLI: `hackagent benchmark extraction` — `--seed <n>`, `--jsonld`, `--ai` flags; AI leg uses `initializeProviders().router`.
- **Benchmark result (4 fixtures, seed 42): VERDICT markdown_wins.** completeness dom=0.821 vs markdown=1.000; sponsorRecall 0→1 (img alt logos); judgingRecall 0.75→1 (tables); hallucinationRate 0/0; noiseRatio 0/0; only dom wins: aiInputBytes 805 vs 1046, runtimeMs 1.8 vs 2 (negligible).
- `tests/features/extraction-strategies.test.ts` — 21 tests, all passing.
- Known parser limitation: `stripHtml` drops `<img>` tags, so the DOM strategy loses logo-based sponsors — key reason markdown wins.
- Report: `docs/markdown-extraction-benchmark.md`

### Session: v1.1.0 / v1.1.1 — Pipeline Implementation (21 tasks, 6 phases)

**Phase 1 — Dynamic Interview Engine (Tasks 1.1–1.5)**
- `cli/interview/types.ts` — `InterviewQuestion`, `InterviewOption`, `InterviewInfluence`, `InterviewState`, `InterviewResult` types
- `cli/interview/question-generator.ts` — `generateQuestions()` from `CompetitionAnalysis`, generates prize/sponsor/budget/idea questions
- `cli/interview/runner.ts` — `runInterview()` CLI, numbered options, skip support, multi-select for sponsors
- `cli/interview/idea-generator.ts` — `generateProjectIdea()` auto-generates ideas from top criterion + top sponsor API
- `cli/interview/index.ts` — barrel export
- Wired into `cli/commands/run.ts` after Challenge Analysis and before Winning Strategy

**Phase 2 — Strategy-First Code Generation (Tasks 2.1–2.3)**
- Extended `WinningStrategy` with `TechnologyStack`, `UIDirection`, `FeaturePriority`, `RoadmapPhase`
- `cli/pipeline/strategy-adapter.ts` — `adaptStrategyToGeneration()` + `buildCodeGenContext()` decouples code gen from raw analysis
- Updated code generation entry point in `run.ts` to consume `GenerationInput`

**Phase 3 — Pipeline Refactor (Tasks 3.1–3.3)**
- `cli/pipeline/spec-pipeline.ts` — `SpecPipelineStage` enum, `SPEC_PIPELINE_ORDER`, `SpecPipeline` validation class
- `cli/pipeline/runtime-validation.ts` — `validateRuntime()` detects framework, installs deps, starts server, health check
- Reordered `run.ts` to exact 10-stage spec order

**Phase 4 — Real Improvement Pass (Tasks 4.1–4.4)**
- `cli/improvement/improvement-types.ts` — `ImprovementAction` model with 7 action types
- `cli/improvement/improvement-planner.ts` — `planImprovements()` maps judge scores to targeted actions
- `cli/improvement/improvement-executor.ts` — `executeImprovement()` writes files for all 7 action types
- `cli/improvement/index.ts` — barrel export
- Wired as "Improvement Pass" stage after Internal Judge

**Phase 5 — Submission Package (Tasks 5.1–5.3)**
- `cli/submission/package-generator.ts` — `generatePackage()` writes README.md, SETUP.md, DEPLOY.md, DEMO.md, SUBMISSION.md
- `cli/submission/readiness-check.ts` — `checkReadiness()` 6 checks (build, readme, deploy config, license, gitignore, placeholders)
- `cli/submission/index.ts` — barrel export
- Wired as "Submission Package" stage

**Phase 6 — CLI Polish (Tasks 6.1–6.2)**
- Renamed all stages to spec names in pipeline display
- Removed `--demo`, `--research`, `--simulate-only` flags
- Removed obsolete `runDemoSurfacePipeline()`
- Hidden qualification gate and learning from display (kept as internal logic)

## Previous Sessions

### Fix `hackagent run` Hang
- **Fix 1**: `res.json()` moved inside `AbortController` in all 5 providers — prevents indefinite hang on stalled HTTP body
- **Fix 2**: `withRetry` skips retries on `AbortError` (was retrying timeouts, causing 240s per failure → 40+ min delays)
- **Files**: `kernel/providers/*-provider.ts`, `kernel/providers/provider-types.ts`

### Sprint 4 — Production Readiness
- `typecheckAndRepair` removed from `executeFullPipeline` (was 558s timeout in tests), moved to `run.ts` as explicit post-pipeline step
- `typecheckAndRepair` and `runtimeSmokeTest` made `public` for external calling
- `tmp`/`__test` guard skips npm install in temp/test directories

### Sprint 5 — v1.0.3 Production Quality Overhaul
- 9 critical bug fixes (typecheck return values, validation bypass, sdkMap structure, shell injection, SSRF, path traversal, hardcoded provider, CLI UX)
- `kernel/qualification/hackathon-qualifier.ts` — 30+ supported technologies, classifies hackathons
- `kernel/repair/autonomous-repair.ts` — parses TS errors, pattern-based fixes
- `kernel/repair/code-quality-validator.ts` — validates against 10 common LLM patterns
- `kernel/evaluation/real-evaluator.ts` — 6-dimension code analysis scoring
- `kernel/validation/browser-validator.ts` — dev server + HTML analysis
- `kernel/learning/failure-tracker.ts` — records failures, tracks patterns
- 12 high/medium issue fixes (empty catches, fabricated data, unused imports, mock warnings, test timeouts)
- Version bumped to 1.0.3

### Fix `hag run` Generation Quality
- **Fix 1**: RouterEngine model fallback limited to 3 attempts (was unbounded on OpenRouter)
- **Fix 2**: `components/` → `src/components/` normalization in `postProcessProject()`
- **Fix 3**: Richer runtime diagnostics for ECONNRESET

### Fix Production Build (pages/app conflict) & ECONNRESET Race
- **Fix 4**: `writeFileSync` → `rmSync` for `pages/` directory cleanup
- **Fix 5**: Removed `resolve()` from `req.on('error')` handler — defers to close handler
- **Fix 6**: Removed unconditional `vitest` pin; added `skipLibCheck` + `types: ['node']` to generated tsconfig

### Session: Challenge Validation — Section-Scoped Parsing + Validation Stage
- `cli/pipeline/challenge-validation.ts` — `validateChallenge()`, `validateSponsors()`, `validateJudgingCriteria()`, `validateTracks()`, `validateSubmissionRequirements()`, `validateNoInferredData()` — 6 checks that verify parsed data comes from proper HTML section headings
- `features/analyze/parser.ts` — Added generic `extractSectionText(html, sectionNames)` function; refactored `extractSponsorSectionText()` to use it; made `parseJudgingCriteria()` section-scoped (requires `<h2>Judging Criteria</h2>` heading, returns empty if none found)
- `cli/pipeline/spec-pipeline.ts` — Added `ChallengeValidation` stage (now 11 stages total)
- `cli/commands/run.ts` — Wired Challenge Validation after parsing and qualification gate
- `tests/unit/challenge-validation.test.ts` — 24 tests covering all validation checks
- All test SAMPLE_HTML updated with proper `<h2>Judging Criteria</h2>` and `<h2>Sponsors</h2>` headings

### Session: QA — 6 Parser Bugs Fixed (ai-yes-competition-30441.devpost.com)
- **Bug (judging criteria)**: `parseJudgingCriteria` received `stripHtml` output (one line), losing `<li>` structure. Fixed by passing raw HTML section; added `extractCriteriaFromLis()` for `<strong>` name + percentage detection. 5 new regression tests.
- **Bug 1 (organizer)**: "Hosted by"/"Organized by" pattern not present on page. Added fallback: extract organization name from `hackathons?organization=` sidebar link.
- **Bug 2 (themes)**: False positives from footer text ("social", "security", "privacy"); missing "Beginner Friendly" and "Machine Learning/AI". Added `extractThemesFromTags()` — parses Devpost `hackathons?themes[]=` tag links; keyword fallback for non-Devpost pages.
- **Bug 3 (prizes)**: `\$[\d,]+` regex returned nothing for non-cash prizes. Added fallback: extract prize descriptions (certificates, trophies, swag) from Prizes section.
- **Bug 4 (rules)**: `extractSectionText` only matches h2/h3/h4; "Who can participate" used h6. Added fallback: regex for `<h5>/<h6>Who can participate</h6><ul>` with `<li>` extraction.
- **Bug 5 (deadlines)**: Time and timezone missing from deadline regex. Extended regex to capture `@ HH:MMam/pm` and `GMT+5:30` timezone offsets.
- **QA process**: Playwright as ground truth — extracted HTML, DOM queries for each field, compared against parser output. 9 new regression tests (62 total).
- **Status**: AI YES page parser output now matches ground truth for all 9 fields.

### Session: Production Bug Fixes (v1.1.2)
**P0 — AI Generation UX**: Changed `aiUnavailable()` in `cli/output.ts:134` to say "AI provider unavailable. Switching to production template generation." — details hidden behind `--verbose`
**P0 — Dynamic Timeline**: Rewrote `buildTimeline()` in `cli/planner.ts` with `fmt()` helper producing `Xm` for <1h, `Xh Ym` for ≥1h. Proportional to `hoursRemaining`, `teamSize`. 4 tiers: ≤1h, ≤3h, ≤8h, >8h. Created `tests/unit/planner-timeline.test.ts` (6 tests)
**P0 — Parser Cleanup**: Added `stripNoise(html)` in `cli/pipeline/parsing.ts` — strips `<nav>`, `<footer>`, `<header>`, cookie banners, login/register links, accessibility skip links, sidebar, filter/toolbar. Applied before extraction.
**P0 — Pipeline Ordering**: Fixed `cli/interactive.ts` to run interview BEFORE plan generation (was: plan → interview → regenerate; now: interview → plan). Removed broken `this.printExecutionPlan` call in `run.ts` (standalone function referencing `this`).
**P1 — Interview Skip**: `createTeamSizeQuestion()` returns null when team size inferred from problem statement. `createHoursRemainingQuestion()` returns null when submission deadline found.
**P1 — CLI Output**: Changed runtime validation messages to user-friendly wording. Split close handler into 3 branches: success (code 0 + started), not started, unexpected exit (non-zero).
**P1 — Improvement Pass**: Removed `iterRanOutOfTime` check between build and judge stages so judge always runs after successful build.
**P1 — Preferred Stack**: Fixed `determineMissingInfo()` in `cli/hackathon-context.ts:196` — now checks `ctx.preferredStack.length === 0` in addition to `!ctx.stackDetected`
**P0 — CLI Exit**: Added `[exit-diag]` instrumentation in `cli/index.ts`. Root cause: 2 orphan Sockets from keep-alive HTTP connections (Devpost fetch + OpenRouter API). Added `.unref()` on debounce timers in `model-performance-tracker.ts` and `parser-learning.ts`. Added `req.destroy()` in HTTP paths in `runtime-validation.ts` and `browser-validator.ts`. Safety-net `process.exit()` after 5s handles remaining sockets.
**Verified**: 5 dry-run hackathons (zero orphans), 1 full run (pipeline completes, CLI exits), 31 unit tests pass, build clean.

### Earlier Work (v1.0.0–v1.0.2)
- Core stability: CustomEndpointProvider API key fix, `buildExecutionPlan()` replacement, RouterEngine wiring, import path fixes
- `process.exit()` → `process.exitCode` for Windows compatibility
- Zod config schema validation, `.env` support, `checkHealth()` on all 6 providers
- CLI: `hag` alias, `hag doctor/models/providers/version` commands, setup wizard, ANSI output utilities
- Global install: `npm link`, `hackagent`, `hag`, `npx hackagent` all work
- Output polish: all 10 command files migrated from `console.log`/`console.error` to `cli/output.ts`

## Remaining Ideas / Future Work
- CI/CD pipeline for npm publishing (`.github/workflows/publish.yml` exists but untested)
- Dynamic model fetching from provider APIs (currently static/hardcoded)
- Browser smoke test with headless Chrome (not yet implemented)
- AI generation reliability (JSON parse errors in LLM output, ~40% success with NVIDIA NIM)

## Key Decisions
- `process.exit()` → `process.exitCode` to avoid Node.js libuv assert crash on Windows
- Zod schema validation for config file — prevents loading corrupted config silently
- Provider validation via enum — catches typos with helpful error messages
- `.env` support as alternative to CLI config
- `hag` shorthand for `hackagent` + `c` for `config`, `s` for `setup`
- Terminal output utility (`cli/output.ts`) with no dependencies — ANSI escape codes directly

## Relevant Files
- `cli/output.ts` — ANSI color/spinner/icon utility
- `cli/index.ts` — entry point, aliases, SIGINT handler
- `cli/types.ts` — `CommandName` union with all commands
- `cli/config-manager.ts` — Zod validation, `.env` support
- `cli/provider-init.ts` — creates RouterEngine from config
- `cli/commands/run.ts` — full 11-stage spec pipeline with Challenge Validation
- `cli/commands/setup.ts`, `config.ts`, `doctor.ts`, `models.ts`, `providers.ts`, `version.ts`, `status.ts`, `memory.ts`, `health.ts`, `benchmark.ts`, `deploy.ts`, `explain.ts`, `replay.ts`, `resume.ts`, `test.ts`, `chat.ts`
- `cli/interview/` — Dynamic Interview Engine (types, question-generator, runner, idea-generator)
- `cli/pipeline/` — spec-pipeline, runtime-validation, strategy-adapter, strategy, reporting, types
- `cli/improvement/` — improvement pass (types, planner, executor)
- `cli/submission/` — submission package (package-generator, readiness-check)
- `cli/devpost-parser.ts` — CompetitionIntelligence, WinningStrategyGenerator, PipelineReportGenerator, etc.
- `kernel/` — providers, LLM, repair, evaluation, validation, learning, qualification
