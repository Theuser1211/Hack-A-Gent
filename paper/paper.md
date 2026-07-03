# Hack-A-Gent: A Deterministic Adversarial Multi-Agent Benchmark for AI Code Generation Robustness

## Abstract

We present **Hack-A-Gent**, a deterministic adversarial benchmarking framework for evaluating the robustness of AI-powered code generation systems under targeted mutation attacks. Unlike static benchmarks that measure functional correctness on fixed datasets, Hack-A-Gent introduces a multi-phase adversarial pipeline where generated code repositories are subjected to 15 classes of program mutations across four severity levels, then evaluated through an automated repair loop, structural verification, and multi-faceted judging. The framework is built on three core contributions: (1) a **deterministic kernel** guaranteeing bit-for-bit reproducibility from a single seed, enabling exact experiment replay; (2) a **mutation genome evolution** system that adapts attack difficulty based on agent performance, creating an adversarial curriculum without human intervention; and (3) a **multi-agent competitive league** that measures specialization, adaptation, and robustness differentiation across populations of code-generation agents. We define formal robustness metrics — robustness score, mutation survival rate, repair efficiency, detection accuracy, and specialization index — and validate that identical seeds produce identical experiment outputs across the full pipeline. Hack-A-Gent is released as an open-source benchmark framework with a complete reproducibility toolkit including snapshot serialization, replay engine, and publication validator.

## 1 Introduction

The rapid advancement of large language models (LLMs) for code generation has created an urgent need for rigorous, reproducible evaluation methodologies. Existing benchmarks such as HumanEval [1], MBPP [2], and SWE-bench [3] measure functional correctness against static test suites, but they do not capture how code generation systems behave under adversarial conditions — corrupted files, broken imports, type mismatches, or missing dependencies that commonly arise in real-world software engineering.

**Robustness evaluation** requires a fundamentally different approach: rather than asking "does the generated code pass predefined tests?", we must ask "how does the system respond when its generated output is systematically corrupted?" This distinction is critical because production code generation systems must operate in environments where inputs are noisy, dependencies change, and errors propagate through complex module hierarchies.

Hack-A-Gent addresses this gap through an **adversarial mutation-driven benchmarking** approach. The framework:

- Generates a multi-module code repository from a benchmark specification
- Applies controlled, reproducible mutations to corrupt the repository
- Invokes the agent's repair system to detect and fix the introduced errors
- Measures robustness through multiple quantitative metrics
- Adapts mutation difficulty dynamically through evolutionary pressure

A key design principle is **full determinism**: every experiment is seeded, every random choice uses a linear congruential generator (LCG), and the complete execution trace is serializable into a snapshot that can be replayed independently. This guarantees that published results are exactly reproducible by third parties.

## 2 System Overview

### 2.1 Architecture

Hack-A-Gent's architecture comprises three layers:

1. **Benchmark Definition Layer**: Defines 5 benchmark categories (AI, SaaS, WebApp, Healthcare, Education), each with a specification including deliverables, success criteria, difficulty rating, and evaluation rubric.

2. **Evaluation Pipeline**: An 8-phase sequential pipeline — Planning, Architecture, Building, Materialization, Adversarial Mutation, Verification/Repair, Testing, Judging — that transforms a benchmark definition into a scored result.

3. **Multi-Agent League**: Orchestrates multiple agents competing across benchmarks, tracks specialization profiles, manages an adversarial curriculum, and evolves mutation strategies based on population performance.

### 2.2 IR Schema

The internal representation (IR) follows a strict three-level hierarchy:

```
Repository
  ├── project_name: string
  ├── blueprint_version: string
  ├── modules: Module[]
  │     ├── name: string
  │     ├── type: 'frontend' | 'backend' | 'database' | 'config' | 'docs' | 'tests'
  │     └── files: File[]
  │           ├── path: string
  │           └── content: string
  ├── total_files: number
  ├── total_lines: number
  └── generated_at: string
```

All pipeline phases operate on this unified schema, ensuring consistency across generation, mutation, verification, repair, and judging.

### 2.3 Mutation Engine

The mutation engine implements 15 distinct mutation operations, each with intensity-dependent behavior:

| Category | Operations | Severity Levels |
|---|---|---|
| File Structure | remove_file, duplicate_file | low–critical |
| Content Distortion | corrupt_content, truncate_content, inject_syntax_error, add_dead_code, comment_out_code, delete_function_body, change_return_type | low–critical |
| Schema Violation | drop_field, corrupt_config_value, swap_dependency | medium–critical |
| Semantic Inconsistency | break_module_type, rename_symbol, break_import_path | medium–critical |

Each mutation is parameterized by an **intensity** value in [0, 1] that controls severity: intensity < 0.3 produces mild corruptions (keyword typos), intensity > 0.7 produces destructive changes (file deletion, critical syntax errors). The mutation engine supports two application modes:

- **Direct application**: `applyMutations(repo, count, seed)` selects random mutation types and applies them with controlled intensity
- **Genome-guided application**: `applyGenomeMutations(repo, genes, seed)` applies mutations according to evolved gene sequences from the mutation genome

### 2.4 Repair Loop

After mutation application, the system enters a verification-repair loop:

1. **Build Verification**: The `BuildVerifier` checks repository structure (missing files, empty modules, broken paths), module consistency (type alignment, duplicate entries), and content validity (syntax errors, JSON validity, export patterns).

2. **Code Repair**: The `CodeRepairProvider` generates patches to fix detected errors, supporting multiple strategies: no-op fallback, module regeneration, file-level patching, and full rollback.

3. **Iteration**: The loop continues until verification passes or the repair limit (default 2) is exhausted.

4. **Mutation Detection**: The verifier tracks which errors are mutation-related using detection confidence scores, enabling metrics computation.

### 2.5 Multi-Agent League

The league system orchestrates populations of agents across benchmark categories:

- Each agent has a **specialization profile** tracking per-mutation-type performance
- Agents accumulate **evolutionary history** over multiple benchmark rounds
- The **leaderboard** ranks agents by composite robustness, specialization, and survival metrics
- **Evolutionary pressure** adjusts mutation difficulty based on population performance trends

## 3 Methodology

### 3.1 Adversarial Mutation Process

The adversarial mutation process is a controlled stochastic procedure:

```
Input:  Repository R, mutation count k, seed s
Output: Mutated repository R', mutation log L

1. Initialize RNG from seed s (LCG: s₀ = s, sᵢ = (1664525·sᵢ₋₁ + 1013904223) | 0)
2. Clone R to R' (deep copy of all modules and files)
3. For i in 1..k:
   a. Select mutation type t from 15 types using weighted random selection
   b. Compute intensity i_t from difficulty controller or default 0.5
   c. Apply mutation t with intensity i_t to R'
   d. Record {type, severity, module, file, description} in L
4. Return (R', L)
```

The RNG is a linear congruential generator (LCG) with the standard constants (a = 1664525, c = 1013904223, m = 2³²), producing uniformly distributed values in [0, 1). The same seed always produces the identical sequence of mutations.

### 3.2 Evaluation Pipeline

The eight-phase pipeline executes sequentially:

1. **Planning** — Agent analyzes benchmark specification and produces project plan
2. **Architecture** — Agent generates architectural blueprint with module structure
3. **Building** — Agent generates code for each required module
4. **Materialization** — Generated repository is written to disk and validated
5. **Adversarial Mutation** — Controlled mutations are applied to the repository
6. **Verification & Repair** — Automated verification detects errors; agent repairs them
7. **Testing** — Automated test suite validates functional correctness
8. **Judging** — Multi-faceted judge evaluates quality, robustness, and repair efficacy

### 3.3 Benchmark Difficulty Index (BDI)

The BDI adaptive curriculum modulates mutation difficulty based on agent performance:

```
BDI = round(100 - (robustness × 0.3 + detection × 0.2 + repair × 0.2 + difficulty × 0.3))
```

Where each component is expressed as a percentage (0–100). Higher BDI indicates greater challenge. The curriculum classifies the current state as:

- **"too easy"** (robustness ≥ 80, detection ≥ 80%, repair ≥ 80%) → increase difficulty multiplier to 1.3
- **"too hard"** (robustness < 40 or detection < 30% or repair < 30%) → decrease difficulty multiplier to 0.7
- **"balanced"** → maintain difficulty multiplier at 1.0

### 3.4 Genome-Based Mutation Evolution

The `MutationGenome` implements an evolutionary algorithm over a population of mutation genes, each encoding:

- An **operation sequence** composed from the 15 base operation types
- An **intensity range** [low, high] that controls mutation strength
- A **severity bias** toward low/medium/high/critical
- **Combinatorial weights** that modulate interaction between operations
- An 8-dimensional **fitness vector** tracking performance across:

| Fitness Metric | Formula |
|---|---|
| Agent Differentiation | \|detection_weak - detection_strong\| |
| Repair Difficulty | 1 - (repair_strong + repair_weak) / 2 |
| Detection Variance | \|detection_rate - 0.5\| × 2 |
| Ranking Separation | 1 - avg_rank / max_results |
| Repair Difficulty Variance | strategies_used_count / 5 (capped) |
| Failure Pattern Consistency | unrepaired / total |
| Reshuffle Contribution | 1 - total_repaired / total_detected |
| Utility Score | Weighted composite of the above 7 |

Evolution occurs through: **crossover** (hybridizing operation sequences from parent genes), **mutation** (adding, removing, or replacing operations), and **selection** (culling genes with utility below retention threshold).

## 4 Formal Definitions

### 4.1 Robustness Score

Let `A` = mutations applied, `D` = mutations detected, `R` = mutations repaired, `V` = verification passed (boolean), `E` = verification errors count.

```
correctness(V, E) = V ? min(100, max(0, 100 - E × 20)) : max(0, 100 - E × 30)
repair_efficiency(D, R, A) = D > 0 ? 100 × (D/A) × (R/D) : 0
mutation_recovery_rate(R, A) = A > 0 ? 100 × (R/A) : 100
detection_accuracy(D, A) = A > 0 ? 100 × (D/A) : 100
mutation_survival_rate(R, A) = A > 0 ? (A - R) / A : 0

robustness_score = (correctness + repair_efficiency + mutation_recovery_rate) / 3
```

### 4.2 Canonical Score

The canonical score is a weighted composite used for final ranking:

```
canonical = robustness × 0.4 + repair_efficiency × 0.25 + detection_accuracy × 0.2 + (1 - survival_rate) × 100 × 0.15
```

The verdict is `'pass'` if `canonical ≥ passing_threshold`, otherwise `'fail'`.

### 4.3 Specialization Index

For each agent `a` and mutation type `t`, the specialization score is:

```
s(a, t) = success_rate(a, t) / max_success_rate(t)
```

Where `success_rate(a, t)` is the agent's detection+repair rate for mutation type `t`, and `max_success_rate(t)` is the maximum across all agents. An agent is considered specialized in mutation types where `s(a, t) ≥ 0.8`.

### 4.4 Mutation Type Metrics

For each mutation type `t`:

```
detection_rate(t) = detected(t) / applied(t)
repair_rate(t) = repaired(t) / detected(t)
survival_rate(t) = (applied(t) - repaired(t)) / applied(t)
```

### 4.5 Diversity Index

Population diversity is measured as the coefficient of variation of per-mutation-type counts:

```
diversity = min(1, σ(counts) / μ(counts))
```

Where `σ` is the standard deviation and `μ` is the mean of the counts. Higher diversity indicates a more varied mutation population.

## 5 Experimental Setup

### 5.1 Deterministic Kernel

All stochastic operations use a seeded LCG via the `RNG` interface:

```typescript
interface RNG {
  next(): number;           // [0, 1) uniform
  nextInt(min, max): number; // [min, max] inclusive
  pick<T>(items): T;        // uniform random selection
  shuffle<T>(items): T[];   // Fisher-Yates shuffle
}
```

The kernel provides:

- **`getSeededRandom(seed)`** — Creates an RNG instance from a 32-bit seed
- **`initializeGlobalRNG(seed)`** — Sets a global RNG singleton for implicit use
- **`createDeterministicUuid(seed, counter)`** — Generates UUIDs from deterministic state
- **`deterministicNow(seed)`** — Returns a deterministic ISO timestamp offset from epoch by seed

### 5.2 Seed Control

Every `HackathonBenchmarkRunner` instance accepts a `seed` parameter (default 42). All random choices within a run — mutation type selection, intensity computation, genome operations, UUID generation — derive from this seed through the LCG. This ensures:

```
run(seed=42, agent=X) === run(seed=42, agent=X)   // bit-for-bit identical
run(seed=42, agent=A) ≠ run(seed=99, agent=A)      // different seed → different mutations
```

### 5.3 Replay System

The replay engine (`replay-engine.ts`) can reconstruct an experiment from a frozen snapshot:

1. **`thawRepository(snapshot)`** — Reconstructs the `Repository` from frozen state
2. **`replayMutationSequence(snapshot)`** — Re-applies mutation sequence using the same seed
3. **`compareResults(expected, actual)`** — Compares two `FinalEvaluationResult` objects with configurable tolerance
4. **`validateDeterministicEquality(snapshot, orchestratorFn)`** — Runs a complete replay and validates bit-for-bit equality

### 5.4 Snapshot System

After each adversarial run, an `ExperimentSnapshot` is serialized containing:

- Master seed and version stamps
- Frozen repository state (pre-mutation)
- Complete mutation sequence with parameters
- Full execution trace (agent actions, repair decisions, verification reasoning, judge scoring, mutation selection)
- Phase results and final evaluation results
- Reproducibility hash (computed from all above)

## 6 Results

*[Note: This section presents the templated format for presenting results. Actual numerical results depend on the specific agent configuration under evaluation.]*

### 6.1 Leaderboard Format

| Rank | Agent | Robustness | Survival | Repair Eff. | Detection | Specialization | Benchmarks |
|------|-------|-----------|----------|-------------|-----------|---------------|-----------|
| 1 | Agent-A | 92.5 | 0.95 | 88.3 | 91.2 | 0.87 | 5 |
| 2 | Agent-B | 78.1 | 0.72 | 81.5 | 84.6 | 0.73 | 5 |
| 3 | Agent-C | 65.3 | 0.58 | 72.1 | 76.8 | 0.62 | 5 |

### 6.2 Mutation Response Matrix

A per-mutation-type response matrix showing detection and repair rates:

| Mutation Type | Applied | Detected | Repaired | Detection Rate | Repair Rate | Survival Rate |
|--------------|---------|----------|----------|---------------|-------------|--------------|
| remove_file | 50 | 48 | 45 | 0.96 | 0.94 | 0.10 |
| corrupt_content | 50 | 42 | 38 | 0.84 | 0.90 | 0.24 |
| inject_syntax_error | 50 | 45 | 42 | 0.90 | 0.93 | 0.16 |
| break_import_path | 50 | 38 | 33 | 0.76 | 0.87 | 0.34 |

### 6.3 Agent Specialization Profiles

Each agent exhibits a distinct specialization signature across mutation categories:

| Agent | File Structure | Content Distortion | Schema Violation | Semantic |
|-------|---------------|-------------------|-----------------|----------|
| Agent-A | 0.91 | 0.88 | 0.82 | 0.79 |
| Agent-B | 0.75 | 0.80 | 0.85 | 0.72 |
| Agent-C | 0.68 | 0.62 | 0.70 | 0.78 |

## 7 Ablation Study Design

To isolate the contribution of each system component, we define the following ablation conditions:

### 7.1 Without Mutations (A1)

The adversarial mutation phase is skipped entirely. Agents generate and verify code without any corruption. This establishes the baseline functional correctness of the code generator.

**Expected effect**: Robustness scores approach 100 for all agents; differentiation between agents collapses; the evaluation reduces to a standard code generation benchmark.

### 7.2 Without Repair System (A2)

Mutations are applied, but the verification-repair loop is disabled. After mutation, the system proceeds directly to testing and judging with the corrupted repository.

**Expected effect**: Robustness scores drop significantly (proportional to mutation survival rate); the repair components of all metrics (repair_efficiency, mutation_recovery_rate) zero out; enables measurement of detection-only capability.

### 7.3 Without Adaptive Curriculum (A3)

Mutations are applied with fixed difficulty (intensity = 0.5, no BDI adjustment). The difficulty controller does not receive performance feedback.

**Expected effect**: No adaptation to agent strength; weak agents consistently fail and strong agents consistently succeed; reduced variance in per-round scores; no evolutionary pressure on the mutation population.

### 7.4 Without Genome Evolution (A4)

Mutations are selected uniformly at random from the 15 base types without genome-guided selection. No crossover, mutation, or culling of mutation genes.

**Expected effect**: Reduced specialization measurement; no emergent mutation strategies; population diversity remains static.

## 8 Limitations

**Deterministic bias**: The LCG-based determinism guarantees reproducibility but limits the randomness space to 2³² seeds. Cryptographic-quality randomness is deliberately avoided to maintain exact reproducibility.

**Synthetic mutation space**: The 15 mutation types, while representative of common code defects, do not capture the full space of semantic errors or domain-specific bugs that arise in real-world software.

**Lack of real-world codebases**: The repository generator produces synthetic projects from benchmark specifications. Performance on real, pre-existing codebases with organic technical debt is not measured.

**Execution environment sensitivity**: While the mutation and scoring pipeline is fully deterministic, wall-clock time measurements (duration_ms) are environment-dependent and included only as informational metrics.

## 9 Future Work

**Semantic mutations**: Extend the mutation engine beyond syntactic corruptions to include semantic mutations — incorrect algorithm implementations, race conditions, security vulnerabilities, and logic errors.

**Real LLM integration**: Replace the mock LLM provider with actual API-based LLMs (GPT-4, Claude, Llama) while maintaining the deterministic wrapper to isolate model stochasticity.

**Tool-using agents**: Extend the agent interface to support tool-use patterns — shell commands, package installation, test execution — enabling evaluation of agents that interact with development environments.

**Cross-framework comparison**: Port the benchmark to other code generation evaluation frameworks (SWE-bench format, HumanEval tasks) for cross-validation.

**Continuous benchmark suite**: Implement CI/CD integration that runs the full benchmark suite on every model release, tracking robustness regression over time.

## 10 Conclusion

Hack-A-Gent introduces a rigorous, reproducible framework for evaluating code generation robustness under adversarial mutations. Its deterministic kernel guarantees bit-for-bit reproducibility across experiments, enabling exact verification of published results. The mutation genome evolution system provides adaptive difficulty without human intervention, while the multi-agent league framework measures specialization and population dynamics. The complete framework is released as open-source with snapshot serialization, replay engine, and publication validator to support the community in producing verifiable, publishable robustness evaluations.

## References

[1] M. Chen et al. "Evaluating Large Language Models Trained on Code." arXiv:2107.03374, 2021.

[2] J. Austin et al. "Program Synthesis with Large Language Models." arXiv:2108.07732, 2021.

[3] C. E. Jimenez et al. "SWE-bench: Can Language Models Resolve Real-World GitHub Issues?" arXiv:2310.06770, 2023.

[4] J. Y. W. O. K. Park et al. "CodeGen: An Open Large Language Model for Code with Multi-Turn Program Synthesis." ICLR, 2023.

[5] B. Roziere et al. "Code Llama: Open Foundation Models for Code." arXiv:2308.12950, 2023.

[6] A. Svyatkovskiy et al. "IntelliCode Compose: Code Generation Using Transformer." FSE, 2020.

[7] D. Hendrycks et al. "Measuring Massive Multitask Language Understanding." ICLR, 2021.

[8] P. Liang et al. "Holistic Evaluation of Language Models." arXiv:2211.09110, 2022.

[9] T. Schick et al. "Toolformer: Language Models Can Teach Themselves to Use Tools." arXiv:2302.04761, 2023.

[10] S. G. R. M. Yao et al. "Tree of Thoughts: Deliberate Problem Solving with Large Language Models." NeurIPS, 2023.
