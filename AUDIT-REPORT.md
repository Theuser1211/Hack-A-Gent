# Hack-A-Gent Engineering Audit Report

> **Historical snapshot — dated 2026-06-26.** For current status, see
> `ARCHITECTURE-REPORT.md`.

**Date:** 2026-06-26  
**Scope:** Full codebase — benchmarks/, kernel/, agents/  
**Auditor:** Automated Engineering Analysis

---

## Executive Summary

Hack-A-Gent is a sophisticated adversarial benchmark system with a well-structured IR schema, mutation engine, verification pipeline, repair system, multi-agent league, and genome evolution. The architecture demonstrates strong separation of concerns across 20+ modules. However, the system exhibits **significant integration gaps between its legacy static mutation system and its newer dynamic genome evolution system**, several **logic bugs** in critical scoring paths, and **non-deterministic behaviors** that undermine reproducibility guarantees.

**Overall Maturity Score: 62/100**

---

## Architecture Review

### Separation of Concerns
| Layer | Quality | Issues |
|-------|---------|--------|
| IR Schema (Repository→Module→File) | **Good** | Clean immutable factories, well-typed |
| Mutation Engine | **Good** | 15 base operations, genome-driven branch |
| Mutation Difficulty Controller | **Fair** | Dynamic type registration works but oscillation risk |
| Mutation Genome Evolution | **Fair** | Solid structure but uses `Math.random()` (non-deterministic) |
| Adversarial Curriculum | **Fair** | Only 3-state classification, boundary oscillation risk |
| Repair System | **Good** | Two-tier (file-patch + module regeneration), well-structured |
| Verification System | **Good** | Mutation-aware detection, 6+ error categories |
| Judge System | **Fair** | Scoring logic has multiple bugs |
| Multi-Agent League | **Good** | AgentRegistry + Leaderboard + specialization profiles |
| Research Layer | **New** | 9 new files, mostly untested integration |

### Data Flow Correctness
- **Generation → Mutation**: Well-defined via `createSharedMutationState`
- **Mutation → Verification**: `perTypeStats` tracking works but has counting issues
- **Verification → Repair**: Error categorization and module identification is sound
- **Repair → Judge**: Repair history passed correctly to judge
- **Judge → Leaderboard**: Leaderboard updates work but uses static mutation types

---

## Feature Inventory

| Feature | Status | Notes |
|---------|--------|-------|
| IR System (Repository→Module→File) | **Fully implemented** | Clean, immutable, well-typed |
| Mutation Engine | **Fully implemented** | 15 base ops + genome-driven `applyGenomeMutations` |
| Mutation Difficulty Controller | **Fully implemented** | Dynamic registration, EMA smoothing |
| Mutation Genome Evolution | **Partially implemented** | `Math.random()` breaks determinism; lineage tracking works |
| Adversarial Curriculum (BDI) | **Fully implemented** | BDI formula is sound, but only 3 discrete states |
| Repair System (file + module) | **Fully implemented** | Two-tier repair with strategy selection |
| Verification System (mutation-aware) | **Fully implemented** | Detects corruption, schema breaks, type inconsistency |
| Judge System (robustness scoring) | **Partially implemented** | Scoring bugs (see Bug Analysis) |
| Multi-Agent League System | **Fully implemented** | Registry + Leaderboard + specialization |
| Leaderboard Persistence | **Fully implemented** | JSON file save/load |
| Specialization Profiles | **Partially implemented** | Static `ALL_MUTATION_TYPES` — new genome types not tracked |
| Experiment Reproducibility | **Partially implemented** | `Date.now()` used in key places, genome uses `Math.random()` |
| Cross-Model Evaluation | **Implemented (untested)** | `ModelAdapter` interface + `CrossModelReport` |
| Dataset Export | **Implemented (untested)** | Full schema definitions, `exportCompleteDataset` |
| Paper Export | **Implemented (untested)** | LaTeX/Markdown table export, chart data incomplete |

---

## Bug Analysis

### 🔴 A. TypeScript / Type Safety Issues

#### A1. `build-verifier.ts:244-246` — Logic bug with unmatched braces
```typescript
const closeBraces = (content.match(/\}/g) ?? []);
const unmatchedBraces = closeBraces.filter((b) => !content.includes('} // BROKEN')).length;
if (openBraces > 0 && closeBraces.length !== openBraces && content.includes('}}')) {
```
`closeBraces` is `string[]`, `closeBraces.length` is used on line 247 for comparison, but `unmatchedBraces` on line 246 computes `closeBraces.filter(...).length` — which is always `closeBraces.length` because `b` is a single character `}` and `content.includes('} // BROKEN')` will match the **entire file content**, not the individual brace. **This always counts all close braces as "unmatched"**.  
**Fix:** Check the line context, not the entire content.

#### A2. `benchmark-judge.ts:179` — Incorrect correctness formula
```typescript
const correctness = m.mutations_repaired > 0 || m.mutations_applied === 0
  ? overallPct
  : Math.round(overallPct * (1 - m.mutations_applied / Math.max(m.mutations_applied, 1) * 0.3));
```
When `m.mutations_applied > 1`, the expression `m.mutations_applied / Math.max(m.mutations_applied, 1)` = 1 (it's always exactly 1 for any positive value). So the penalty is always exactly 30% regardless of the number of un-repaired mutations.  
**Fix:** Use `(m.mutations_applied - m.mutations_repaired) / m.mutations_applied` instead.

### 🔴 B. Logic Bugs

#### B1. `hackathon-benchmark-runner.ts:220` — Non-deterministic seed
```typescript
const mutationSeed = Date.now() % 100000;
```
Uses wall-clock time instead of a configurable deterministic seed. **Breaks reproducibility guarantees.**  
**Fix:** Accept a seed parameter from the `BenchmarkRunnerConfig`.

#### B2. `hackathon-benchmark-runner.ts:340` — False repair success attribution
```typescript
mutations_repaired: loopResult.verificationPassed
  ? mutationMetrics.mutations_applied
  : Math.max(0, mutationMetrics.mutations_applied - mutationAwareErrors.length),
```
Assumes ALL mutations were repaired if verification passed. Verification can pass for reasons other than repairing every mutation (e.g., mutations that don't affect build correctness). **This inflates repair_success_rate artificially.**  
**Fix:** Track which specific mutations were repaired via the repair history, not verification pass/fail.

#### B3. `leaderboard.ts:19-26` — Static mutation types only
```typescript
private initializeMutationSpecializations(): void {
  for (const mt of ALL_MUTATION_TYPES) { ... }
}
```
`ALL_MUTATION_TYPES` is hardcoded in `agent-types.ts`. New mutation types discovered through genome evolution are **never tracked** in the leaderboard's specialization data. This creates a disconnect between the genome system and the leaderboard.  
**Fix:** Dynamically register new mutation types in the leaderboard when the genome produces them.

#### B4. `mutation-genome.ts` — `Math.random()` throughout
The entire `reproduceTopMutations`, `spawnNewVariants`, `crossoverOperations`, `mutateOperations`, `mergeCategories` methods use `Math.random()` instead of a seeded PRNG. **This makes all crossover and variant spawning non-deterministic**, preventing reproducible evolution experiments.  
**Fix:** Thread a seeded PRNG through all genome methods.

#### B5. `agent-registry.ts:177` — Rank always 0
```typescript
const point: EvolutionaryHistoryPoint = {
  ...
  rank: 0,
  ...
};
```
The `rank` field in `EvolutionaryHistoryPoint` is always set to 0 and never computed from the actual leaderboard.  
**Fix:** Compute the agent's rank at the time of the benchmark result and store it.

### 🟠 C. Architectural Risks

#### C1. Mutation type string duplication
Three different name mappings exist:
- `agent-types.ts` `ALL_MUTATION_TYPES` (15 names, outdated format)
- `mutation-engine.ts` `getBaseOperationTypes()` (15 names, old format)
- `mutation-engine.ts` `applySingleBaseOperation` (15 names, new format)
- `mutation-difficulty-controller.ts` `registerDefaultTypes` (15 names, new format)

The old-format names (`remove_random_file`, `corrupt_file_content`, etc.) in `applySingleMutation` are mapped differently from new-format names (`remove_file`, `corrupt_content`, etc.) in `applySingleBaseOperation`. **If both systems are used simultaneously, mutation type names will not match across the pipeline.**  
**Fix:** Consolidate to a single name mapping.

#### C2. `hackathon-benchmark-runner.ts:334-336` — Hardcoded mutation categories
```typescript
const mutationAwareErrors = loopResult.verificationResult.errors.filter(
  (e) => e.category === 'invalid_schema' || e.category === 'broken_module_consistency' || ...
);
```
The filter is hardcoded to specific error categories. New mutation types that produce different categories will be invisible to downstream metrics computation.  
**Fix:** Make this dynamically derived from the applied mutations.

#### C3. Difficulty controller oscillation at boundary
The `AdversarialCurriculum.classify()` uses hard thresholds (robustness >= 80, < 40). A system with robustness=79 would get "balanced" while 80 gets "too easy". **Near-boundary performance will cause oscillation between curriculum states**, destabilizing difficulty tuning.  
**Fix:** Add hysteresis (dead zone) around the thresholds.

### 🟢 D. Adversarial System Issues

#### D1. `benchmark-judge.ts:137` — Verification score inflates with many errors
```typescript
score: Math.max(0, 100 - input.verificationErrors.length * 20),
```
Each verification error deducts a flat 20 points. For very large repos with many errors, the score quickly goes to 0 and stays there. This has no meaningful differentiation between 5 errors and 50 errors.  
**Fix:** Use a logarithmic or percentage-based scaling.

#### D2. Mutation imbalance in `mutateSwapDependency` and `mutateCorruptConfig`
Several mutation methods silently fall back to `mutateCorruptContent` when their preconditions fail (e.g., no `package.json` found, no dependencies to swap). **This skews the effective mutation distribution** toward corrupt_content, making it disproportionately common.  
**Fix:** Return `null` from these fallbacks and let the caller select a different mutation type.

---

## Robustness Analysis

### Resilience Under Repeated Mutations
- The IR schema uses immutable `createRepository`, so mutations don't accumulate stale state. **Good.**
- `applyGenomeMutations` applies operations sequentially to a working copy. **No cross-mutation contamination.**

### Repair Loop Correctness
- The verification loop correctly retries up to `repairLimit` times.
- However, `collectFailedModuleTypes` always adds 'frontend', 'backend', and 'database' if `types.size === 0`. **This can trigger unnecessary full regeneration** even when the error was in a different module (e.g., 'config' or 'tests').

### BDI Stability
- BDI formula is mathematically sound (weighted combination of robustness, detection, repair, difficulty).
- But the 3-state curriculum classification lacks hysteresis, causing oscillation risk.
- `globalDifficultyMultiplier` (1.3 or 0.7) is applied but **never actually used** to scale mutation difficulty in the pipeline — it's computed but not consumed by the difficulty controller.

### Multi-Agent Fairness
- `SharedMutationState` correctly applies identical mutations across agents. **Fair.**
- However, `createSharedMutationState` uses `applyMutations` with an optional seed. If no seed is provided, each call gets a different mutation set, **breaking shared mutation guarantees.**

### Reproducibility
- ❌ `Date.now()` used for seed generation in 3 places
- ❌ `Math.random()` used throughout genome evolution
- ❌ `uuid()` for run IDs (non-deterministic)
- ⚠️ Run IDs are `uuid`-based, making replay impossible without full trace capture

---

## Performance & Scalability Risks

### Expensive Recomputation
- `createRepository` recalculates `total_files` and `total_lines` from scratch on every call. With 5 repair iterations across 3 agents, a repository is rebuilt ~15 times.
- `computeModuleDiff` recalculates line counts from scratch.

### Deep Copy Overhead
- `hackathon-benchmark-runner.ts:62-66` does a full deep clone of the repo on every mutation:
```typescript
modules: repo.modules.map((m) => ({ ...m, files: [...m.files] })),
```
With 50+ files per module and 10+ mutations, this creates 500+ intermediate objects per benchmark run.

### Scaling Issues
- Single-threaded agent execution (one agent at a time).
- No batching for genome evolution (processes one gene at a time).
- Leaderboard writes to disk on every update (O(n) file I/O per update).

---

## Research Readiness Assessment

| Criterion | Score | Gap |
|-----------|-------|-----|
| Reproducible experiments | **4/10** | Non-deterministic seeds, `Math.random()` |
| Cross-model comparisons | **7/10** | `ModelAdapter` defined but untested |
| Formal metrics | **8/10** | Well-defined `METRICS_REGISTRY` |
| Dataset export | **7/10** | Schema defined, no actual file I/O implementation |
| Paper-ready output | **6/10** | LaTeX/Markdown generators exist, chart data incomplete |
| Trace capture | **5/10** | `ExperimentTracer` defined but not integrated into pipeline |
| Statistical analysis | **6/10** | `AnalysisEngine` defined, evolutionary drift computed |
| IR schema stability | **9/10** | Clean, immutable, well-typed |

**Research Readiness Score: 6.5/10** — Not yet publication-ready. Critical reproducibility gaps must be closed.

---

## Recommendations

### 🔴 Critical Fixes (Must Fix Immediately)

1. **Remove `Date.now()` from mutation seed generation** (`hackathon-benchmark-runner.ts:220`)
   - **What:** `const mutationSeed = Date.now() % 100000;` breaks all reproducibility
   - **Why:** Every run produces different mutations, making experiments unrepeatable
   - **Fix:** Accept a `seed` parameter in `BenchmarkRunnerConfig` and use it throughout

2. **Replace `Math.random()` in mutation-genome.ts with seeded PRNG**
   - **What:** `Math.random()` in crossover, variant spawning, and drift operations
   - **Why:** Makes genome evolution completely non-deterministic
   - **Fix:** Thread a seeded PRNG function (not `Math.random()`) through all genome methods

3. **Fix `benchmark-judge.ts:179` correctness formula**
   - **What:** `m.mutations_applied / Math.max(m.mutations_applied, 1)` always equals 1
   - **Why:** Penalty is always 30% regardless of how many mutations weren't repaired
   - **Fix:** Replace with `(m.mutations_applied - m.mutations_repaired) / m.mutations_applied`

4. **Fix false repair success attribution** (`hackathon-benchmark-runner.ts:340`)
   - **What:** Assumes all mutations repaired if verification passes
   - **Why:** Inflates repair metrics when mutations don't affect build correctness
   - **Fix:** Track repair outcomes per-mutation via repair history

### 🟠 Important Improvements (Next Iteration)

5. **Add hysteresis to curriculum classification** (`adversarial-curriculum.ts:42-57`)
   - **What:** 3-state hard thresholds cause oscillation near boundaries
   - **Fix:** Add a dead zone (e.g., robustness 75-85 for "balanced" when coming from "too easy")

6. **Bridge leaderboard with dynamic mutation types** (`leaderboard.ts:19-26`)
   - **What:** Leaderboard only tracks static `ALL_MUTATION_TYPES`
   - **Fix:** Add `registerMutationType(type)` to leaderboard, called by genome when new types spawn

7. **Consolidate mutation type naming** (`mutation-engine.ts` dual naming)
   - **What:** Old names (`remove_random_file`) vs new names (`remove_file`)
   - **Fix:** Remove the old switch branch or map old names to new names

8. **Fix `build-verifier.ts:244-246` unmatched braces logic**
   - **What:** `closeBraces.filter((b) => !content.includes('} // BROKEN'))` checks entire content per character
   - **Fix:** Compare actual brace counts line-by-line

### 🟢 Optional Enhancements (Future Work)

9. **Wire `globalDifficultyMultiplier` into the mutation pipeline** — currently computed but unused
10. **Swap `uuid` for deterministic run IDs** — use `seed + runCounter` instead
11. **Add hysteresis to mutation difficulty delta computation** to prevent oscillation
12. **Implement actual dataset export file writing** (only schema exists)
13. **Integrate `ExperimentTracer` into `HackathonBenchmarkRunner`** for full trace capture
14. **Add parallel agent execution** for cross-model comparisons

---

## Final Scores + Verdict

| Category | Score | Rating |
|----------|-------|--------|
| **System Maturity** | 62/100 | Beta quality — functional but has critical gaps |
| **Architecture Quality** | 75/100 | Well-structured, good separation of concerns |
| **IR Schema Correctness** | 90/100 | Clean, immutable, type-safe |
| **Mutation System** | 70/100 | Powerful but has integration gaps between old/new systems |
| **Robustness & Stability** | 55/100 | Scoring bugs + oscillation risks |
| **Reproducibility** | 40/100 | Non-deterministic seeds, `Math.random()` |
| **Research Readiness** | 65/100 | Schema and adapters ready, but reproducibility must be fixed |

### Biggest 3 Risks

1. **Reproducibility collapse** — Non-deterministic seeds and `Math.random()` in the genome system mean that no two runs of the "same" experiment will produce the same results. This alone disqualifies the system from academic publication.

2. **Scoring metric inflation** — The false repair attribution in `hackathon-benchmark-runner.ts:340` systematically inflates repair_success_rate, meaning all robustness scores reported by the system are overestimates. Published results would be invalid.

3. **Disconnected subsystems** — The genome evolution system, leaderboard specialization tracking, and difficulty controller operate on different mutation type sets (static vs dynamic). As the genome evolves new mutation types, they become invisible to the leaderboard and scoring pipeline, creating a growing blind spot.

### Verdict

**Hack-A-Gent is an ambitious and architecturally sound system that looks complex and functional on the surface, but suffers from critical reproducibility and correctness gaps in its evaluation pipeline. The system is not yet reliable enough for academic publication. With the 4 critical fixes and 4 important improvements identified above, it would reach a publishable state.**

The core architecture (IR schema, mutation engine, repair system, multi-agent league) is production-quality. The research layer (metrics, traces, dataset export, paper exporter) is well-designed at the schema level but lacks runtime integration. The primary path to publication-readiness is: **(1) eliminate all non-deterministic paths, (2) fix the scoring bugs, and (3) bridge the static/dynamic mutation type gap.**
