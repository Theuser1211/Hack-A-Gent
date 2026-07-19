# Hack-A-Gent — Architecture Report

**Generated:** 2026-07-19
**Scope:** Full repository (working tree, no changes applied)
**Typecheck:** `tsc --noEmit` passes, 0 errors
**Test baseline (per AGENTS.md):** 1200+ tests; 2 known flaky timeouts

---

## 1. Executive Summary

Hack-A-Gent is a CLI (`hackagent` / `hag`) that turns a Devpost URL (or free-text spec) into a complete Next.js project. The codebase is the product of **many incremental sessions**, each layering features on top of the previous one. The result is a system with **two parallel architectures living side by side**:

1. **The "vision" architecture** (documented in `docs/architecture.md`, `AUDIT-REPORT.md`, `ENGINEERING_REPORT.md`) — an ambitious event-driven multi-agent orchestrator with Planner V1/V2, Architect, subagent pool, judge panel, git agent, skill system, and a research-grade adversarial benchmark.
2. **The "actual" architecture** (what `hag run` actually executes today) — a much simpler, pragmatic pipeline: `cli/commands/run.ts` → `InternetHackathonOrchestrator` (template/LLM file generation) → qualification gate → devpost-parser analysis stages → learn/score/report.

The documentation describes a system that is **largely aspirational**. The implemented system is smaller, more linear, and far more focused on "generate a working Next.js app + analyze it" than the multi-agent/papersystem the docs promise. This gap between docs and reality is the single biggest source of confusion and technical debt.

The repo is **functional and well-typed**, but carries substantial dead/orphaned code, documentation drift, and several half-wired subsystems.

---

## 2. Layered Architecture (As Actually Built)

```
┌──────────────────────────────────────────────────────────────┐
│ CLI LAYER  cli/                                                 │
│  index.ts (arg parse, dispatch) → commands/* (19 commands)     │
│  output.ts (TUI), config-manager.ts, provider-init.ts,         │
│  context.ts, devpost-parser.ts (Competition Intelligence +     │
│  Winning Strategy + Scoring + Report + Scaffolder + Optimizer) │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│ BENCHMARKS LAYER  benchmarks/  (130+ modules — mostly a        │
│ separate "adversarial benchmark" product that overlaps the CLI)│
│  internet-hackathon-orchestrator.ts  ← the real pipeline       │
│  phase-12-orchestrator.ts, devpost-ingestion-layer.ts,         │
│  hackathon-simulation-engine.ts, demo-surface-compiler.ts,     │
│  + genome/mutation/leaderboard/civilization/... (research)     │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│ KERNEL LAYER  kernel/                                          │
│  llm/ (RouterEngine + 6 providers)                             │
│  providers/ (anthropic, openai, gemini, openrouter, custom)    │
│  qualification/  evaluation/  validation/  repair/  learning/  │
│  promotion/  execution/  planning/  agents/  memory/  events/  │
│  tasks/  state/  skills/  context/  workspace/  types/        │
└───────────────┬──────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────┐
│ AGENTS LAYER  agents/  (11 orphaned planning/building agents)  │
│  architect-v1, planner-v1, frontend-builder-v1, judge-panel…   │
└──────────────────────────────────────────────────────────────┘
```

### 2.1 CLI Layer (`cli/`)
- **`index.ts`** — parses argv, resolves command aliases (`c`→config, `s`→setup), dispatches to commands via dynamic `import()`. Handles `--version`/`--help`, SIGINT/SIGTERM, output format (json/pretty/quiet).
- **`commands/`** — 19 command files. Core: `run`, `simulate`, `benchmark`, `config`, `setup`, `doctor`, `models`, `providers`, `status`, `memory`, `replay`, `resume`, `deploy`, `test`, `explain`, `health`, `chat`, `version`.
- **`devpost-parser.ts`** — *Not just Devpost parsing.* It also contains the entire "competition intelligence" feature set: `CompetitionIntelligence`, `WinningStrategyGenerator`, `SelfReviewScorer`, `PipelineReportGenerator`, `HackathonPipelineOrchestrator`, `ProjectScaffolder`, `HackathonOptimizer`, `PipelineBenchmarker`. This file is **2091 lines** and is doing the work of ~8 files. Major cohesion problem.
- **`output.ts`** — dependency-free ANSI TUI (spinner, icons, colors, pipeline header/footer, stage markers). Disables color when stdout is not a TTY.
- **`config-manager.ts`** — Zod-validated config at `~/.hackagent/config.json` + `.env` merging.

### 2.2 Benchmarks Layer (`benchmarks/`)
This is the **largest and most confusing** part of the repo. It contains two loosely-related products:
1. **The real generation pipeline**: `internet-hackathon-orchestrator.ts`, `devpost-ingestion-layer.ts`, `phase-12-orchestrator.ts`, `hackathon-simulation-engine.ts`, `demo-surface-compiler.ts`, `real-benchmark-runner.ts`, `hackathon-benchmarks.ts`.
2. **A research adversarial benchmark** (mutation engine, genome evolution, judge simulators, leaderboards, civilization/company evolution worlds): ~100 files that do **not participate in `hag run`** and are largely reachable only via `hag benchmark` (partially) and tests.

`run.ts` wires in: `InternetHackathonOrchestrator`, `Phase12Orchestrator`, `HackathonSimulationEngine` (demo mode), `DemoSurfaceCompiler`, `JudgeSimulator` (demo mode), `ComplexityCollapseEngine` (demo mode).

### 2.3 Kernel Layer (`kernel/`)
- **`llm/`** — `RouterEngine` (model selection + provider fallback chain) and 6 providers. Provider factory maps `nvidia`/`custom` → `CustomEndpointProvider`.
- **`qualification/`** — `HackathonQualifier` + `CapabilityRegistry`. Pre-run gate; classifies SUPPORTED / PARTIALLY_SUPPORTED / UNSUPPORTED.
- **`evaluation/`** — `RealEvaluator` (verifiable code analysis: build, tests, line/file counts, components, API routes).
- **`validation/`** — `BrowserValidator` (starts a dev server, fetches HTML, checks title/headings/interactive elements).
- **`repair/`** — `AutonomousRepair`, `CodeQualityValidator`. Pattern-based TS error fixes.
- **`learning/`** — `FailureTracker` (records failures, suggests prevention strategies).
- Plus: `prompts/`, `planning/`, `agents/`, `memory/`, `events/`, `tasks/`, `state/`, `skills/`, `workspace/`, `execution/`, `context/`, `recovery/`, `test/`, `judge/`, `generation/`, `builders/`. **Many of these are infrastructure for the unused agent/planner system.** `planning/`, `agents/` (kernel), `skills/`, `judge/`, `generation/`, `builders/` appear to be lightly or never used by the live `run` path.

### 2.4 Agents Layer (`agents/`)
11 self-contained agent definitions (architect-v1, planner-v1, frontend/backend/database-builder-v1, judge-panel-v1, etc.). **Orphaned** — not imported by any CLI/kernel production path; only consumed by integration tests (`*-workflow.test.ts`) and presumably intended for a dynamic agent registry that was never wired.

---

## 3. The Actual `hag run` Pipeline (Step by Step)

1. `parseInput(input)` — URL (Devpost fetch + SSRF guard), file, or free text → `ParsedInput`.
2. **Qualify** via `qualifyHackathon()` — may reject UNSUPPORTED hackathons.
3. `Phase12Orchestrator.runProject()` — "strategy competition" (uses `InternetHackathonOrchestrator`'s strategy genesis; produces winner + reward prediction).
4. `initializeProviders()` → `RouterEngine` (or template fallback if no API key).
5. `InternetHackathonOrchestrator`:
   - `extractRequirements()` — hardcoded 9 requirements + judging-criteria requirements.
   - `createExecutionPlan()` — builds a 20-node `TaskGraph` (scaffold/fe/be/test/deploy).
   - `executeFullPipeline()` — walks the task graph; for each node calls `generateFilesWithLLM()` (LLM or template fallback), writes files to `workspace/projectName/`.
   - `validateGeneratedProject()`, `typecheckAndRepair()`, `runGitHubSync()`, `runDeployment()`, `runLiveBrowserTests()`.
6. **Post-pipeline analysis** (back in `run.ts`):
   - `CompetitionIntelligence.analyze()`
   - `WinningStrategyGenerator.generate()`
   - `HackathonPipelineOrchestrator.init() + completePipeline()` → self-review, optimization, quality checks, scaffolding generation, benchmark.
   - `Phase12Orchestrator.runPostProject()` — organizational memory update.
   - `evaluateProject()` (RealEvaluator) — real code analysis.
   - Failure tracking + prevention strategies.
   - Persist trace + snapshot JSON for `explain`/`replay`.

**Key observation:** The LLM generation path (`generateFilesWithLLM`) in `internet-hackathon-orchestrator.ts` actually branches: when `routerEngine` is null it uses **template fallback** (hardcoded Next.js scaffold in `generateScaffoldFiles`); when the router exists it *should* call the LLM but the `provider: 'openai'` hardcode bug (fixed in Sprint 5) and the template-literal generation means much logic is still static. Per AGENTS.md, LLM quality is ~40% build success; template fallback is 6/6.

---

## 4. Command Inventory

| Command | Status | Notes |
|---|---|---|
| `run` | ✅ Works | Main pipeline; rich stage output |
| `simulate` | ✅ Works | Simulation only (or `--demo`) |
| `setup` | ✅ Works | Interactive wizard; also auto-invoked by `run` when no key |
| `config` | ✅ Works | Zod-validated; `--verify` calls real `checkHealth()` |
| `doctor` | ✅ Works | Node/Git/config/provider/workspace diagnostics |
| `models` | ✅ Works | Lists models from configured provider |
| `providers` | ✅ Works | Status of all 6 providers |
| `status` | ✅ Works | Lists/inspects projects |
| `memory` | ⚠️ Partial | query/stats/clear wired to `OrganizationalMemoryBank` |
| `replay` | ⚠️ Partial | Loads trace JSON; explain reads same dir |
| `resume` | ⚠️ Partial | Exists; snapshot save works, full resume logic thin |
| `deploy` | ⚠️ Partial | GitHub/Vercel/Netlify push; needs tokens; heavy network reliance |
| `test` | ✅ Works | Browser tests via `LiveBrowserTestAgent` |
| `explain` | ⚠️ Partial | Reads trace JSON; decision-trace rendering incomplete |
| `health` | ✅ Works | Provider `checkHealth()` aggregation |
| `chat` | ⚠️ Partial | Interactive REPL exists; depends on LLM |
| `benchmark` | 🔀 Split | `list`/`run` (adversarial, mostly stub planner/architect), `real list|run|run-all` (real code eval) |
| `version` | ✅ Works | Reads package.json |
| `help` | ✅ Works | |

---

## 5. Unfinished / Half-Wired Features

1. **`deploy()` / GitHub sync** — `InternetHackathonOrchestrator` creates GitHub repos and pushes commits, but with mock data warnings when no token. Real deploys depend on network/tokens and are non-fatal. The "deploy" stage in `run.ts` reports `result.deployUrl` which is almost always `null` (no Vercel token in template runs).
2. **`resume`** — snapshots are saved on failure, but the resume command does not fully reconstruct and continue an interrupted `run`. It is essentially a viewer.
3. **`explain`** — stores decision traces but the rendering only partially surfaces them.
4. **Adversarial benchmark via `hag benchmark run`** — passes **stub** planner/architect/builder providers (`execute: async () => ({})`) into `HackathonBenchmarkRunner`. The benchmark "runs" but measures almost nothing real. The "real" benchmark (`benchmark real run`) is the genuinely useful one and is well-implemented (file/code verification).
5. **Docs-envisioned features never built**: event bus, human checkpoints, skill system (`skills/`), preferences store, git safety branches, multi-agent league in the *run* path. These exist as modules but are not part of `hag run`.
6. **`SelfReviewScorer` convergence loop** is **simulated, not real** — `runImprovementLoop` models expected improvement by faking `hasWowMoment` etc.; it does not feed back into actual code regeneration. The comment in code admits this ("In a real pipeline, the builder would apply the fix").
7. **`HackathonPipelineOrchestrator.benchmark()`** writes a single `pipeline.json` and compares only against the *previous* run's baseline in the same data dir — so "improved" relative to your last run, not to a principled baseline. The comparison metric `promptSizeChars` is a fabricated `features.reduce(...) * 5`.
8. **Qualification `sponsorAPIs: []`** is hardcoded empty in `run.ts` and only populated from Devpost text in `CompetitionIntelligence` — so the pre-run qualify never sees sponsor APIs.

---

## 6. Technical Debt

### 6.1 Documentation Drift (Highest priority)
- `docs/architecture.md` describes an event-driven multi-agent system that **does not exist in the run path**.
- `README.md`, `AUDIT-REPORT.md`, `ENGINEERING_REPORT.md`, `PRODUCTION_CERTIFICATION.md`, `RELEASE-READINESS.md`, etc. describe features/metrics that don't match the code (e.g., "Single framework: Next.js only" is accurate, but "research readiness 6.5/10" and the entire adversarial-genome story is a separate product).
- 14+ top-level markdown reports, many overlapping/contradictory. High maintenance burden; readers cannot tell what is real.

### 6.2 Dead / Orphaned Code
- **`agents/` (all 11 files)** — orphaned (only tests import them). ~2,000+ LOC.
- **Adversarial benchmark ~100 files** (`mutation-*`, `genome`, `civilization-*`, `company-*`, `cognitive-injection-*`, `swarm-*`, `adversarial-*`, `judge-simulator`, etc.) — a parallel product not reachable from the main CLI flow. This is the bulk of the 130 benchmark modules.
- Two `LLMBuilderProvider` definitions (kernel/generation vs kernel/providers).
- `run.ts.backup` at repo root — leftover file, should be deleted.
- `REPOSITORY_HEALTH.md` itself reports 19 orphan files + 242 unused exports + 112 `as any` casts + 308 `console.log` in non-test source.

### 6.3 Cohesion / Structural
- **`cli/devpost-parser.ts` is 2091 lines** and mixes parsing + 8 unrelated feature classes. Should be split into `cli/competition-intelligence.ts`, `cli/scoring.ts`, `cli/report.ts`, etc.
- **`internet-hackathon-orchestrator.ts` is ~1300+ lines** and mixes orchestration, file generation, scaffolding, post-processing, typecheck, smoke test, GitHub, deploy. God-class.
- Many kernel subsystems (`planning/`, `agents/`, `skills/`, `judge/`, `generation/`, `builders/`) are infrastructure for the unused agent system — dead weight in the production graph.

### 6.4 Correctness / Quality Issues (from AUDIT-REPORT + code review)
- `benchmark-judge.ts:179` correctness formula bug (penalty always 30%).
- `hackathon-benchmark-runner.ts` non-deterministic `Date.now()` seed + false repair attribution.
- `mutation-genome.ts` uses `Math.random()` (AGENTS.md says Sprint 4 fixed some; genome file may still have issues — `b065963` "replace Math.random with seeded RNG" suggests partial).
- `build-verifier.ts:244-246` unmatched-braces logic bug (whole-content `includes` check).
- `leaderboard.ts` rank always 0.
- These live in the *adversarial* subsystem, so they don't affect `hag run` correctness — but they bloat and confuse.

### 6.5 Determinism
- CLI run path is deterministic when seeded (uses `createDeterministicUuid` / `getSeededRandom`). Good.
- Adversarial subsystem has remaining non-determinism (audit). Lower priority since not in main flow.

### 6.6 Tests
- 1200+ tests across 80+ files. Strong unit coverage of individual modules.
- **Integration tests import many orphaned modules** (`agents/*`, `benchmarks/hackathon-orchestrator`, `phase-12`, `global-hackathon-world`) — so the tests *keep the orphaned code alive* and make deletion risky. This is why orphans persist.
- 2 flaky timeout tests remain.

---

## 7. What Is Genuinely Good

- **Clean typecheck, fast install, works without an LLM** (template fallback).
- **Deterministic by design** with seeded RNG.
- **Solid provider abstraction** (6 providers, RouterEngine with fallback).
- **Real evaluation** (`RealEvaluator`) and **real benchmark** (`real-benchmark-runner`) — verifiable, no fabricated scores. Good engineering.
- **Qualification gate** prevents wasting resources on incompatible hackathons.
- **TUI output** is dependency-free and clean.
- **Security hardening** applied in Sprint 5 (SSRF guard, path-traversal guard, shell-injection sanitization, no hardcoded provider).

---

## 8. Recommended Next Steps (Pending Approval)

**Tier A — Make docs match reality (low risk, high value)**
- Rewrite `README.md` and `docs/architecture.md` to describe the *actual* `hag run` pipeline, not the aspirational multi-agent system.
- Consolidate/trim the 14 top-level report markdown files into one `REPORTS/` index or delete the stale ones.
- Delete `run.ts.backup`.

**Tier B — Reduce surface area (medium risk, high value)**
- Decide whether the **adversarial benchmark** is a first-class product. If yes, document it as a separate `hag bench` sub-product; if no, move it to `research/` or deprecate and prune.
- Split `cli/devpost-parser.ts` (2091 lines) into focused modules.
- Split / slim `internet-hackathon-orchestrator.ts`.

**Tier C — Wire or remove half-finished features**
- Make `resume` actually resume, or relabel it as a trace viewer.
- Make `benchmark run` use the RealEvaluator instead of stub planner/architect, or remove the stub path.
- Replace fabricated benchmark metrics (`promptSizeChars * 5`) with real measured values.
- Make `SelfReviewScorer` loop actually feed back into regeneration, or clearly label it as advisory.

**Tier D — Fix known correctness bugs** (in adversarial subsystem, lower priority for `hag run`):
- `benchmark-judge.ts:179`, `build-verifier.ts:244`, `leaderboard.ts` rank, genome `Math.random()`.

---

## 9. Conclusion

The repository is a **functional, well-typed CLI** with a clear core value proposition (Devpost → Next.js project + analysis) that works today, including offline. Its biggest problems are **not runtime bugs in the main path** but **scope sprawl and documentation fantasy**: a large adversarial-benchmark/research subsystem and an 11-file agent layer that are orphaned, plus architecture docs that describe a system that was never built. The highest-leverage work is consolidation (Tier A/B), not new features.

*No code changes have been made. Awaiting approval before proceeding with any Tier-A/B/C/D work.*
