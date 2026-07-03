# Reproducibility Statement

## 1. Determinism Guarantee

Hack-A-Gent provides a **strong bit-for-bit determinism guarantee**: running the benchmark twice with identical seed, configuration, and agent produces identical outputs across all phases, metrics, and artifacts.

Formally:

```
∀ seed ∈ ℕ, ∀ config ∈ BenchmarkRunnerConfig, ∀ agent ∈ Agent:
  run(seed, config, agent) = run(seed, config, agent)

  — Identical outputs including:
    • BenchmarkRunResult (all fields)
    • ExperimentSnapshot (all fields including reproducibilityHash)
    • Mutation log (exact sequence, types, intensities, targets)
    • Phase outcomes (success/failure per phase)
    • Final evaluation result (all metric values to floating-point precision)
    • Validation verdict
```

## 2. Deterministic Kernel

All stochastic operations use a seeded Linear Congruential Generator (LCG):

```
x₀ = seed
x_{n+1} = (x_n × 1664525 + 1013904223) mod 2³²
u_n = x_n / 2³² ∈ [0, 1)
```

The kernel is implemented in `benchmarks/determinism-kernel.ts` and provides:

| Function | Purpose | Determinism |
|---|---|---|
| `getSeededRandom(seed)` | Creates RNG instance | Same seed → identical sequence |
| `initializeGlobalRNG(seed)` | Sets global singleton | All downstream consumers use seeded state |
| `resetGlobalRNG()` | Clears global RNG | Enables clean initialization for replay |
| `createDeterministicUuid(seed, counter)` | Generates deterministic UUIDs | Same (seed, counter) → same UUID |
| `deterministicNow(seed)` | Generates deterministic timestamps | Same seed → same ISO timestamp |
| `deterministicSort(items, keyFn)` | Stable sort | Always produces identical ordering |

## 3. Seeded Execution Guarantees

The following components derive all randomness from the seed:

### 3.1 Mutation Engine
- **Mutation type selection**: Weighted random selection from 15 types
- **Intensity computation**: Difficulty-controlled or uniform random
- **Target selection**: Module and file selection within repository
- **All 15 mutation functions**: Content corruption, file removal, syntax injection, etc.

### 3.2 Mutation Genome
- **Initial population**: 11 seed genes created in deterministic order
- **Crossover**: Operation sequence hybridization (random pick at each position)
- **Mutation**: Operation insertion, removal, replacement at controlled rates
- **Selection**: Sorting and culling with deterministic tie-breaking
- **Variant spawning**: New gene parameter generation

### 3.3 Pipeline
- **Run ID generation**: `createDeterministicUuid(masterSeed, runCounter)`
- **Phase timestamps**: `deterministicNow(masterSeed + offset)` for every timestamp
- **Difficulty controller**: EMA updates use deterministic state
- **Memory buffer**: Records stored with deterministic timestamps

### 3.4 NOT Deterministic (by design)
- **Wall-clock duration** (`Date.now()`): Used only for reporting `total_duration_ms` and per-phase `duration_ms`. Does not influence any decision, scoring, or random selection.
- **LLM provider responses**: When using real LLM APIs, model responses are inherently non-deterministic. The framework supports mock providers for reproducible testing.

## 4. Snapshot & Replay System

### 4.1 Snapshots

After each adversarial run, an `ExperimentSnapshot` is automatically serialized to `experiment-snapshot.json` in the artifacts directory. The snapshot captures:

```
Snapshot Contents:
├── snapshotId              : Deterministic identifier
├── createdAt               : Deterministic timestamp
├── masterSeed              : Integer seed → full reproducibility
├── agents                  : Frozen agent state (IDs, configs, profiles)
├── mutationGenomeState     : Full gene population with fitness values
├── initialRepository       : Frozen pre-mutation repository
├── mutationSequence        : Complete ordered list of mutations
├── fullExecutionTrace      : All events (agent, repair, verify, judge, mutation selection)
├── phaseResults            : All phase outcomes
├── finalResults            : Complete FinalEvaluationResult
├── protocolVersion         : Benchmark protocol version
├── mutationEngineVersion   : Mutation engine version
├── judgeVersion            : Judge version
├── repairEngineVersion     : Repair engine version
└── reproducibilityHash     : DJB2 hash of all above fields
```

### 4.2 Replay

The replay engine (`benchmarks/replay-engine.ts`) can reconstruct a complete experiment from a snapshot:

```typescript
// Step 1: Thaw the pre-mutation repository
const repo = thawRepository(snapshot.initialRepository);

// Step 2: Re-apply the mutation sequence using the original seed
const replay = replayMutationSequence(snapshot);
// replay.originalRepository === snapshot.initialRepository (reconstructed)
// replay.finalRepository === repository with mutations re-applied

// Step 3: Compare results
const mismatches = compareResults(snapshot.finalResults, actualResults);
// mismatches = [] if bit-for-bit identical (within tolerance)
```

The `validateDeterministicEquality` function performs end-to-end replay:

```typescript
const result = await validateDeterministicEquality(snapshot, orchestratorFn);
// result.match = true  if replay matches snapshot
// result.match = false if any divergence detected
// result.mismatches[] = detailed list of differences
```

## 5. Publication Validator

The publication validator (`benchmarks/publication-validator.ts`) provides automated compliance checks:

| Check | Description | Failure Condition |
|---|---|---|
| `validateDeterminism` | Validates master seed is a valid integer | Missing or non-integer seed |
| `validateReplayEquivalence` | Compares original vs replayed results | Any metric differs by more than tolerance (0.01) |
| `validateScoringConsistency` | Checks all metric fields are present and self-consistent | Missing metrics or NaN values |
| `validateTraceCompleteness` | Verifies all 5 trace types are present | Empty trace arrays |
| `validateSchema` | Validates against PublicationExperimentOutput schema | Missing required fields |

The `fullValidation()` method runs all 5 checks and produces a `ValidationResult`:

```typescript
interface ValidationResult {
  passed: boolean;         // All checks passed
  checks: ValidationCheck[];  // Individual check results
  summary: string;         // Human-readable summary
}
```

## 6. Version Stamping

All snapshots and publication outputs include immutable version stamps:

```typescript
interface VersionStamps {
  protocolVersion: '1.0.0';           // Changes with protocol modifications
  mutationEngineVersion: '1.0.0';      // Changes with mutation logic updates
  judgeVersion: '1.0.0';              // Changes with scoring formula updates
  repairEngineVersion: '1.0.0';        // Changes with repair logic updates
}
```

Version changes that could affect determinism or metric computation must be documented and the corresponding version incremented. All published results must specify the versions used.

## 7. Testing Validation

The integration test suite (`tests/integration/deterministic-reproducibility.test.ts`) includes 24 tests that validate determinism across the full pipeline, including:

- **Determinism kernel** (8 tests): RNG sequence identity, range correctness, UUID uniqueness, timestamp format
- **Mutation engine** (2 tests): Same seed → identical mutations; different seeds → different mutations
- **Evaluation orchestrator** (3 tests): Identical inputs produce identical outputs; different inputs produce different outputs
- **Full runner** (4 tests): 3× identical runs with seed=42 produce identical results; different seeds produce different mutation types
- **Replay engine** (6 tests): Repository thawing, mutation replay, result comparison (match and mismatch), deterministic equality validation
- **Shared mutation state** (1 test): Identical seeds produce identical shared state

## 8. Usage for Third-Party Reproduction

To reproduce any published Hack-A-Gent result:

```
1. Install the framework (git clone + npm install)
2. Locate the experiment-snapshot.json for the target run
3. Read the masterSeed field from the snapshot
4. Re-run with: new HackathonBenchmarkRunner({ seed: masterSeed, ...config })
5. Verify: The published snapshot.finalResults matches the re-run results
6. Optionally run the publication validator for automated verification
```

The framework guarantees that steps 4–5 produce identical outputs given the same agent implementation. If the agent uses a real LLM provider, results will differ due to model stochasticity; for exact reproduction, use the mock LLM provider included in the framework.
