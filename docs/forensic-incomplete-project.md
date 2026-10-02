# Forensic Audit: Why Generated Projects End Up Broken / Generic / Template

**Scope:** read-only audit of the current source. No fixes applied. Every claim cites the
exact code line that was executing at the time of the run being described.

**Sources:** `benchmarks/internet-hackathon-orchestrator.ts`, `benchmarks/internet-tool-gateway.ts`,
`cli/commands/run.ts`, `cli/pipeline/strategy-adapter.ts`, `cli/pipeline/prompt-assembler.ts`.

---

## A. End-to-end pipeline map (the path files actually take to disk)

```
run.ts
  └─ internetOrch.executePipeline(...)                 [orchestrator top level]
       └─ executeTaskInEnvironment(node) for each task
            ├─ "scaffold" node  → generateFilesWithLLM('scaffold')
            │                       └─ generateFilesWithLLMPhased()          (5 sub-phases)
            │                             phase1: generatePhase1TypesConfig  → executeLLMGeneration('scaffold')
            │                             phase2: generatePhase2ApiRoutes    → executeLLMGeneration('backend')
            │                             phase3: generatePhase3Frontend     → executeLLMGeneration('frontend')
            │                             phase4: generatePhase4Readme
            │                             phase5: generatePhase5CiCd
            │   each phase → writeAndVerifyPhase(dir, phaseFiles, name)     ← SILENT SWALLOW HERE
            │        └─ toolGateway.writeProjectFiles(plan.projectName, phaseFiles)
            │        └─ runTypeCheckOnFiles() → repairPhaseFiles() (max 3 loops)
            └─ 'frontend'/'backend' → generateFilesWithLLM('frontend','backend')
                 └─ generateFilesWithLLMSinglePhase()   ← template fallback overwrites here

run.ts
  ├─ internetOrch.validateGeneratedProject(projectDir)   ← Quality gate (build/typecheck/lint/runtime)
  └─ if !valid → internetOrch.typecheckAndRepair(projectDir)   ← destructive placeholder repair
         └─ revalidate; fail if still invalid
```

---

## B. Verified failure-mode table

| # | Failure mode | Where | Severity |
|---|--------------|-------|----------|
| F1 | A phase that fails its 3 repair attempts is **logged and silently continued**, leaving that phase's files absent/incomplete | `writeAndVerifyPhase`, orchestrator 4049-4058 | **P0** |
| F2 | `typecheckAndRepair` **overwrites broken generated files with `// placeholder`**, turning type errors into "clean" code | orchestrator 3346-3354 | **P0** |
| F3 | `typecheckAndRepair` reports success when tsc emits **no parseable error lines** (`fileErrors.size === 0 → return true`, 3329), even if compile failed non-parseably — a silent success | orchestrator 3329 | P1 |
| F4 | Scaffold generation with an LLM active has **no template fallback** — a failed phase yields zero files silently, not a usable generic project | `executeWithRetry` fallthrough 4829, writeAndVerify 3932 | P1 |
| F5 | `validateGeneratedProject` in **skipBuildChecks mode forces `valid = true`** even when required scripts/imports are missing | orchestrator 3547-3554 | P1 |
| F6 | package.json's required scripts (`dev/build/start/lint/typecheck/test`) are **never auto-generated**; they rely entirely on the LLM producing them, and a missing script fails only at the final quality gate | orchestrator 3507-3517 | P2 |
| F7 | Import validation is **report-only**; missing deps are never auto-added to package.json or auto-installed during repair | `validateImports` orchestrator 3519, 3602+ | P2 |
| F8 | **Brand/project-name drift:** the project folder + package.json name are keyed to the *slug* (`plan.projectName`), while the browser/title brand (`brandName`) only lives inside the prompt text — divergent when they differ | `strategy-adapter.ts` 175, orchestrator dir uses slug | P2 |
| F9 | per `(fileType, specificTask)` single-attempt dedupe suppresses regeneration, so one bad deduped call is never retried for that task | `generateFilesWithLLM` 3937-3944 | P3 |

---

## C. LLM output → file persistence (F1, F4)

`executeTaskInEnvironment` writes files once per task:

- scaffold → `writeProjectFiles(plan.projectName, phaseFiles)` after each phase
  (orchestrator 4035). Phases that return `[]` write nothing; `writeProjectFiles` itself
  just returns `false` on the write (doesn't throw), and its return value is **ignored**
  by the caller.

Consequence: if the output JSON for a phase is lost after extraction (the two-step
`validFiles` filter at 4786-4799 silently drops files with unbalanced `{}`/`()`), the
project persists with a **missing dependency** (e.g. no types file despite key/type
name imports). The orchestrator proceeds to the next phase regardless.

Overwrite: repeated `writeProjectFiles` to the same slice path (same `plan.projectName`)
overwrites, not appends. This is fine across phases, but a repeated task that re-writes
`package.json` with a reduced dependency set silently drops packages (F7 context).

---

## D. Fallback analysis (template vs LLM files)

- **Template fallback exists ONLY when the router is unavailable.** `generateFilesWithLLM`
  routes to `generateScaffoldFiles`/`generateFrontendFiles`/`generateBackendFiles` only
  when `!this.routerEngine` (orchestrator 3927-3932) or the attempt was deduped
  (3937-3942). These template returns **do not** overwrite LLM files in that branch.
- **Scaffold with LLM active:** all 5 phases go through `executeLLMGeneration`, which on
  failure returns `[]` (no template fallback — orchestrator 4829). That means a live LLM
  run that fails Phase 2 produces a project with Phase 1 files only; no template
  fallback, so it stays partial, not template.
- **Single-phase frontend/backend tasks (non-scaffold)** DO fall back to templates
  (`generateFrontendFiles`/`generateBackendFiles`) when LLM fails (orchestrator 4451-4453).
  Because `writeProjectFiles` overwrites by path, **template fallback can overwrite a
  previously-written LLM file** (rarer, only with mixed reruns).
- **The "looks like a template" symptom** most likely comes from the scaffold *system
  fallback template* being written when the router had no provider configured (no LLM),
  not from overwrite — the LLM branch never mixes in the template during a normal run.

---

## E. Repair analysis (autonomous-repair)

`typecheckAndRepair(projectDir)` (run.ts calls it: 431):

1. Requires real `build` + `dev` scripts (3297) — template projects (no scripts) return
   `false` early (3299) => "Could not auto-repair", genuinely fails.
2. Runs `npx tsc --noEmit` (3308). If `fileErrors.size === 0` → returns `true`
   immediately (3329) — **even when tsc emitted errors that didn't match the
   `file.tsx(line,col)` regex** (TS5-only code-frame or non-file-based errors). This is a
   silent success.
3. For files with `>3` errors: **overwrites the file with `// placeholder`** (3346-3352)
   — destroying the generated content to make tsc pass; `page.tsx`/`layout.tsx` are skipped.
4. Loops up to 3 times; returns `true` as soon as a `npm run typecheck` succeeds (3361).

This accounts for "build passes but the UI is a blank/`/* */` floor" symptom.

---

## F. Quality gate (validateGeneratedProject)

- Required scripts `dev, build, start, lint, typecheck, test` (3507). Any missing script
  → error, `valid = false`.
- Import validation gathers imports from `.ts/.tsx` (3519, 3602) and fails if a module is
  imported but not in `dependencies` — **report-only: does not add or install**.
- `npm install --legacy-peer-deps` auto-run if no `node_modules` (3532).
- **Benchmark/skipBuildChecks** path forces `result.valid = true` (3550) even with
  failures. Used only via `options.skipBuildChecks`.

**False-"success" scenarios:**
- A scaffold that never got Phase 2 → `npm run build` runs on a Phase-1-only tree; if
  Phase-1 files compile to something serverside-broken, build steps fail. But if the
  broken work is in the phase the repair blanked with `//` placeholders (F2), the build
  may pass, `valid = true`, while the feature code is gone.
- `skipBuildChecks` (used by benchmarks) unconditionally reports `valid = true`.

---

## G. Strategy / brand / sponsor propagation

Propagation is correct in-memory: `buildCodeGenContext` (strategy-adapter 99-139) carries
the full PI summary into `renderStrategyPromptBlock`, which renders `Project name:
${brandName ?? strategyName}` (175), one-liner, winning idea, judging approach, sponsor
opportunities, etc. (178-219).

Drift/impacts where the fine points stop working:
- **Folder/name divergence:** the writer uses `plan.projectName` (slug) as the root and
  `package.json` name; page-title brand comes from the slug when `generationInput`
  overwrites `projectName` from `strategy.projectName` (the slug), NOT `brandName`. So a
  becoming affected title can say the slug while STRATEGY header says the brand.
- **Empty sponsors/criteria:** if PI didn't run, `sponsorApis: []` and `judgingCriteria`
  default to `{name, weight:0}` (build via `map`) — the prompt shows "none" / 0 weights,
  so those features often don't surface. This is conditional on the LLM being provided
  fields being non-empty, not an overwrite bug.
- **PI trimming:** oversized blocks are trimmed by dropping low-priority free-text lines
  (Demo strategy, Vision, Sponsor opportunities, Architecture…) first (trimStrategyBlock
  234-253). If the block is authored mostly as those free-text lines, the trim can leave
  a genuinely empty/sparse STRATEGY block while the marker headers remain → "generic"
  generated instructions. This is deterministic but depends on ordering.

---

## H. Top problems (ranked)

1. **P0 F1 — silent phase failure swallow.** A phase failing its 3 repairs is logged
   and continues (orchestrator 4049-4058). Result falsely green while partial. Nothing
   marks the pipeline "partial".
2. **P0 F2 — placeholder-overwrite repair.** The "auto-repair" destroys generated files
   with `//` to appease tsc (orchestrator 3343-3352). This is the #1 contributor to
   "runs but empty/broken UI."
3. **P0 — no template source of truth for missing scaffold output.** When the LLM is
   active, a failed phase yields no files at all (return `[]`, 4829), so quality-gate
   standards (package.json scripts etc.) never exist. Project can have *no*
   `dev/build/start` scripts because Phase 1 produced nothing.
4. **P1 F5/F6 — quality gate can't distinguish severity and can force-pass.**
   `skipBuildChecks` hard-forces `valid=true`, and the required-script check is a brick
   wall that a "good but script-less" project fails on while a "everything-fails-butrepair" placeholder passes.
5. **P1 F8/F3 — brand/sponsor/trim drift.** Folder uses slug, title uses brand; over-cap
   STRATEGY trimming can gut the prompt. `typeCheckAndRepair` success on non-parseable
   tsc output is a false-success.

---

## I. One next fix (not implemented — decided with a follow-up)

**Highest-leverage single change: eliminate the silent swallow and the placeholder repair.**

- (a) In `writeAndVerifyPhase`, when `repairResult.success === false` on the final
  attempt, **surface the failure** — set a `phaseFailed` flag and fail the task, rather
  than `debug(...); continue`. This turns F1's silent "partial" into an actually
  reported "failed generation" so the next stage won't build on phantom files.
- (b) Stop writing `// placeholder` in `typecheckAndRepair`; instead **delete** import
  from the build (or auto-generate a valid stub from the symbol), or pass the file to a
  declaration-only fix. Never destroy content to make tsc pass.

I deliberately stopped at analysis: implementing (a)+(b) and adding regression tests
(e.g. "phase-2 fail → orchestrator reports partial", "repair never writes placeholder")
is the recommended next step. Both are small, local, and provable with a `vitest` test
that runs the orchestrator with a router/LLM fixture that returns garbage for Phase 2.