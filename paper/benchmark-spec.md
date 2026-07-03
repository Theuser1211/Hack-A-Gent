# Hack-A-Gent Benchmark Specification v1.0.0

## 1. Overview

This document defines the formal specification for the Hack-A-Gent adversarial benchmark. It covers the benchmark schema, mutation configuration, evaluation protocol, metrics formulas, and reproducibility requirements.

---

## 2. Benchmark Schema

### 2.1 `BenchmarkSpec`

A benchmark specification defines a single evaluation scenario.

```typescript
interface BenchmarkSpec {
  id: string;                          // Unique identifier (e.g. "bench-ai-001")
  name: string;                        // Human-readable name
  category: 'ai' | 'saas' | 'webapp' | 'healthcare' | 'education';
  devpost_url: string;                 // Reference URL
  description: string;                 // Short description
  hackathon_description: string;       // Full scenario description
  expected_deliverables: Deliverable[];
  success_criteria: SuccessCriterion[];
  rubric: EvaluationRubric;
  difficulty: 'easy' | 'medium' | 'hard';
  estimated_hours: number;             // Estimated effort in hours
}
```

### 2.2 `Deliverable`

```typescript
interface Deliverable {
  path: string;                        // Relative path in repository
  description: string;                 // What this deliverable should contain
  required: boolean;                   // Whether it's mandatory
  type: 'file' | 'directory' | 'config' | 'code' | 'docs';
}
```

### 2.3 `SuccessCriterion`

```typescript
interface SuccessCriterion {
  id: string;                          // Unique criterion identifier
  description: string;                 // What constitutes success
  weight: number;                      // [0, 1] importance weight
  verification_method: 'automated' | 'manual' | 'build_check' | 'test_check' | 'judge_check';
}
```

### 2.4 `EvaluationRubric`

```typescript
interface EvaluationRubric {
  items: RubricItem[];
  max_total: number;                   // Maximum possible score
  passing_threshold: number;           // [0, 100] minimum percentage to pass
}

interface RubricItem {
  category: string;                    // Evaluation dimension
  max_score: number;                   // Points available
  description: string;                 // What is evaluated
  scoring_guide: string;               // Scoring criteria description
}
```

---

## 3. Mutation Configuration

### 3.1 `MutationConfig`

```typescript
interface MutationConfig {
  mutationCount?: number;              // Number of mutations per run (default: computed from repo size)
  sharedMutationState?: SharedMutationState;  // Pre-computed mutations for league runs
  difficultyController?: MutationDifficultyController;  // Adaptive difficulty
  seed?: number;                       // RNG seed for reproducibility (default: 42)
}
```

### 3.2 `MutationType` Registry

Fifteen base mutation types, each with intensity-dependent behavior:

| ID | Name | Category | Expected Failure | Severity Range |
|----|------|----------|-----------------|----------------|
| `remove_file` | Remove File | File Structure | missing_file | medium–critical |
| `corrupt_content` | Corrupt Content | Content Distortion | content_corruption | medium–critical |
| `truncate_content` | Truncate Content | Content Distortion | content_corruption | medium–critical |
| `drop_field` | Drop Module Field | Schema Violation | invalid_schema | medium–critical |
| `duplicate_file` | Duplicate File Entries | File Structure | broken_module_consistency | low–high |
| `break_module_type` | Break Module Type | Semantic Inconsistency | broken_module_consistency | medium–critical |
| `inject_syntax_error` | Inject Syntax Error | Content Distortion | content_corruption | medium–high |
| `swap_dependency` | Swap Dependency | Schema Violation | invalid_schema | medium–high |
| `rename_symbol` | Rename Symbol | Semantic Inconsistency | content_corruption | medium–high |
| `break_import_path` | Break Import Path | Semantic Inconsistency | content_corruption | medium–high |
| `corrupt_config_value` | Corrupt Config Value | Schema Violation | invalid_schema | medium–high |
| `delete_function_body` | Delete Function Body | Content Distortion | content_corruption | medium–high |
| `add_dead_code` | Add Dead Code | Content Distortion | content_corruption | low–medium |
| `comment_out_code` | Comment Out Code | Content Distortion | content_corruption | medium–high |
| `change_return_type` | Change Return Type | Content Distortion | content_corruption | medium–high |

### 3.3 Severity Levels

```
low      = 1    (minimal impact, easily detected)
medium   = 2    (moderate impact, detectable with analysis)
high     = 3    (significant impact, may break build)
critical = 4    (destructive, likely breaks build/execution)
```

### 3.4 `MutationDifficultyController`

```typescript
interface MutationDifficultyState {
  mutationType: string;
  difficulty: number;                  // [0.1, 0.95]
  successRate: number;                 // EMA-smoothed
  detectionRate: number;               // EMA-smoothed
  repairRate: number;                  // EMA-smoothed
}
```

**State update** (after each run):
```
detectionRate_i = α × (detected/applied) + (1-α) × detectionRate_{i-1}
repairRate_i = α × (repaired/applied) + (1-α) × repairRate_{i-1}
successRate_i = α × (1 - (detected-repaired)/applied) + (1-α) × successRate_{i-1}
```

**Difficulty adjustment**:
| Detection & Repair | Delta |
|---|---|
| detection > 0.8 AND repair > 0.8 | +0.10 |
| detection > 0.6 AND repair > 0.6 | +0.05 |
| detection < 0.4 OR repair < 0.4 | -0.10 |
| detection < 0.2 OR repair < 0.2 | -0.15 |

---

## 4. Evaluation Protocol

### 4.1 Phase Definitions

The benchmark executes 8 sequential phases:

```
Phase 1: Planning
  Input:   BenchmarkSpec
  Output:  PlannerOutput (project plan, approach)
  Success: No errors during planning

Phase 2: Architecture
  Input:   BenchmarkSpec, PlannerOutput
  Output:  ArchitectureBlueprint (module structure, schema, API contracts)
  Success: Valid blueprint generated

Phase 3: Building
  Input:   ArchitectureBlueprint
  Output:  GeneratedRepository (6 module types, files with content)
  Success: All required files generated

Phase 4: Materialization
  Input:   GeneratedRepository
  Output:  Materialized workspace on disk
  Success: Files written and validated against schema

Phase 5: Adversarial Mutation [conditional]
  Input:   Repository, MutationConfig
  Output:  Mutated repository, mutation log
  Success: Always succeeds (mutations always applied)
  Condition: adversarialMode = true

Phase 6: Verification & Repair [iterative]
  Input:   Repository, ArchitectureBlueprint, BenchmarkSpec
  Output:  Verified repository, repair history
  Success: Repository passes all verification checks
  Limit:   repairLimit iterations (default 2)

Phase 7: Testing [conditional]
  Input:   Repository, ArchitectureBlueprint
  Output:  TestSuiteResult
  Success: Tests pass per benchmark criteria
  Condition: Verification passed

Phase 8: Judging
  Input:   Repository, ArchitectureBlueprint, BenchmarkSpec,
           VerificationResult, TestResult, MutationMetrics, RepairHistory
  Output:  BenchmarkJudgeResult (score, verdict, reasoning)
  Success: Score ≥ passing_threshold
```

### 4.2 `EvaluationInput`

```typescript
interface EvaluationInput {
  verificationPassed: boolean;
  verificationErrors: VerificationError[];
  testResult: TestSuiteResult | null;
  mutationMetrics: MutationMetrics;
  perTypeStats: Record<string, { applied: number; detected: number; repaired: number }>;
  repairHistory: RepairRecord[];
  passingThreshold: number;
  leaderboardRank: number;
}
```

### 4.3 `FinalEvaluationResult`

```typescript
interface FinalEvaluationResult {
  robustnessScore: number;              // [0, 100]
  repairEfficiency: number;             // [0, 100]
  mutationSurvivalRate: number;         // [0, 1]
  detectionAccuracy: number;            // [0, 100]
  leaderboardRank: number;
  correctnessScore: number;             // [0, 100]
  mutationRecoveryRate: number;         // [0, 100]
  perMutationTypeMetrics: PerMutationTypeMetrics[];
  aggregateMutationMetrics: MutationMetrics;
  canonicalScore: number;               // [0, 100] weighted composite
  verdict: 'pass' | 'fail';
  reasoning: string;
}
```

---

## 5. Metrics Specification

### 5.1 Robustness Score

```
correctness = if verificationPassed:
               min(100, max(0, 100 - |errors| × 20))
             else:
               max(0, 100 - |errors| × 30)

repairEfficiency = if mutations_detected > 0:
                     100 × (detected/applied) × (repaired/detected)
                   else:
                     0

mutationRecoveryRate = if mutations_applied > 0:
                         100 × (repaired/applied)
                       else:
                         100

robustnessScore = (correctness + repairEfficiency + mutationRecoveryRate) / 3
```

### 5.2 Canonical Score

```
canonicalScore = robustnessScore × 0.40
               + repairEfficiency × 0.25
               + detectionAccuracy × 0.20
               + (1 - mutationSurvivalRate) × 100 × 0.15
```

### 5.3 Mutation Survival Rate

```
survivalRate = if mutations_applied > 0:
                (mutations_applied - mutations_repaired) / mutations_applied
               else:
                0
```

### 5.4 Detection Accuracy

```
detectionAccuracy = if mutations_applied > 0:
                     100 × (mutations_detected / mutations_applied)
                    else:
                     100
```

### 5.5 Repair Efficiency

```
repairEfficiency = if mutations_detected > 0:
                    100 × (detected/applied) × (repaired/detected)
                   else:
                    0
```

### 5.6 Leadeboard Rank Metric

```
rankMetric = robustnessScore × 0.30
           + repairEfficiency × 0.20
           + (1 - survivalRate) × 100 × 0.25
           + detectionAccuracy × 0.15
           + specializationScore × 0.10
```

### 5.7 Per-Mutation-Type Metrics

For each mutation type `t`:

```
detectionRate(t) = if applied(t) > 0: detected(t) / applied(t)
                   else: 0

repairRate(t) = if detected(t) > 0: repaired(t) / detected(t)
                else: 0

survivalRate(t) = if applied(t) > 0: (applied(t) - repaired(t)) / applied(t)
                  else: 0
```

### 5.8 Benchmark Difficulty Index

```
BDI = round(100 - (robustness × 0.3 + detection_rate×100 × 0.2 + repair_rate×100 × 0.2 + difficulty×100 × 0.3))
```

Where:
- `robustness` = agent's robustness score [0, 100]
- `detection_rate` = detectionRate [0, 1]
- `repair_rate` = repairSuccessRate [0, 1]
- `difficulty` = GlobalAverageDifficulty [0, 1]

---

## 6. Mutation Genome Specification

### 6.1 `MutationGene`

```typescript
interface MutationGene {
  id: string;
  type: string;                        // Base type name
  parentIds: string[];                 // Evolutionary parent genes
  generation: number;                  // Generation counter
  createdAt: string;                   // Deterministic timestamp
  parameters: {
    operationSequence: string[];        // Ordered list of operations
    intensityRange: [number, number];   // [min, max] intensity
    targetCategories: string[];         // Category affinities
    severityBias: 'low' | 'medium' | 'high' | 'critical';
    combinatorialWeights: Record<string, number>;
  };
  fitness: {
    agent_differentiation_score: number;
    repair_difficulty_score: number;
    detection_variance_score: number;
    utility_score: number;
    ranking_separation_power: number;
    failure_pattern_consistency: number;
    repair_difficulty_variance: number;
    leaderboard_reshuffle_contribution: number;
  };
  reproductionHistory: string[];
  performanceDrift: number[];
  sampleCount: number;
}
```

### 6.2 Evolution Operators

**Crossover**: Given parent genes `A` and `B`:
- `operationSequence` = alternating picks from A and B at each position
- `intensityRange` = `[max(0, (a_lo+b_lo)/2 + noise), min(1, (a_hi+b_hi)/2 + noise)]`
- `targetCategories` = union of A and B categories, with 30% chance of random addition
- `severityBias` = average index in [low, medium, high, critical], 30% chance of increment

**Mutation** (per operation with rate `mutationRate`):
- Replacement: swap with random operation from the 15 base types
- Insertion: add random operation at random position
- Removal: remove operation

**Selection**: Genes with `utility_score < retentionThreshold` and `sampleCount ≥ 2` are culled. Generation-0 genes with `sampleCount < 3` are protected.

---

## 7. Benchmark Execution

### 7.1 `BenchmarkRunnerConfig`

```typescript
interface BenchmarkRunnerConfig {
  planner: PlannerProvider;
  architect: ArchitectProvider;
  builderProvider: BuilderProvider;
  codeRepairProvider?: CodeRepairProvider;
  buildVerifier?: BuildVerifier;
  testAgent?: BenchmarkTester;
  judgePanel?: BenchmarkJudge;
  artifactsDir?: string;
  repairLimit?: number;                 // Default: 2
  adversarialMode?: boolean;            // Default: false
  mutationCount?: number;
  difficultyController?: MutationDifficultyController;
  memoryBuffer?: PerformanceMemoryBuffer;
  curriculum?: AdversarialCurriculum;
  agentId?: string;
  sharedMutationState?: SharedMutationState;
  seed?: number;                        // Default: 42
}
```

### 7.2 Run Result

```typescript
type BenchmarkRunResult = {
  agent_id: string;
  benchmark_id: string;
  benchmark_name: string;
  category: string;
  run_id: string;
  started_at: string;                   // ISO 8601 (deterministic)
  completed_at: string;                  // ISO 8601 (deterministic)
  total_duration_ms: number;
  phases: PhaseResult[];
  overall_success: boolean;
  judge_score: number | null;
  judge_verdict: string | null;
  build_success: boolean;
  test_success: boolean | null;
  total_tokens: number;
  total_cost: number;
  repair_iterations: number;
  repair_strategies_used: string[];
  per_mutation_type_stats: Record<string, PerMutationTypeStat>;
  benchmark_difficulty_index: number;
  curriculum_state: string;
  global_difficulty: number;
  errors: string[];
  artifacts_dir: string | null;
  adversarial_mode: boolean;
  mutations_applied: number;
  mutations_detected: number;
  mutations_repaired: number;
  detection_rate: number;
  repair_success_rate: number;
  survived_mutation: boolean;
  robustness_score: number;
};
```

---

## 8. Reproducibility Rules

### 8.1 Determinism Guarantee

```
∀ seed s, ∀ config C, ∀ agent A:
  run(s, C, A) === run(s, C, A)    // bit-for-bit identical

∀ seed s₁ ≠ s₂, ∀ config C, ∀ agent A:
  run(s₁, C, A) ≠ run(s₂, C, A)    // different seed → different mutations
```

### 8.2 RNG Specification

The deterministic LCG uses the recurrence:
```
x₀ = seed
x_{n+1} = (x_n × 1664525 + 1013904223) mod 2³²
```
Output: `u_n = x_n / 2³²` (uniform in [0, 1)).

### 8.3 Snapshot Integrity

Every snapshot must contain:
1. `masterSeed`: integer used to seed the RNG
2. `initialRepository`: frozen pre-mutation repository state
3. `mutationSequence`: complete ordered list of applied mutations
4. `fullExecutionTrace`: all agent actions, repair decisions, verification reasoning, judge scoring, and mutation selections
5. `finalResults`: complete `FinalEvaluationResult`
6. `reproducibilityHash`: deterministic hash of all above fields

### 8.4 Validation Checks

The `PublicationValidator` performs:
1. **Determinism check**: master seed is valid integer
2. **Replay equivalence**: `compareResults(snapshot.finalResults, replayedResults)` returns no mismatches within tolerance 0.01
3. **Scoring consistency**: all metric fields present and self-consistent
4. **Trace completeness**: all 5 trace types present in `fullExecutionTrace`
5. **Schema compliance**: output conforms to `PublicationExperimentOutput`

### 8.5 Versioning

All snapshots and publications include version stamps:

```typescript
interface VersionStamps {
  protocolVersion: '1.0.0';           // Benchmark protocol version
  mutationEngineVersion: '1.0.0';      // Mutation engine version
  judgeVersion: '1.0.0';              // Judge implementation version
  repairEngineVersion: '1.0.0';        // Repair engine version
}
```

Changes to any component that could affect determinism or metric computation must increment the corresponding version.
