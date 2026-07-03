# Hack-A-Gent Benchmark Usage Guide v1.0.0

## 1. Quick Start

### 1.1 Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### 1.2 Installation

```bash
git clone <repository-url>
cd hack-agent
npm install
npx tsc
```

### 1.3 Run the Benchmark Suite

```bash
# Run the full multi-agent league (benchmark + adversarial + scoring)
npm run dev

# Or run the benchmark runner directly
npx tsx benchmarks/run-benchmarks.ts
```

### 1.4 Run Tests

```bash
# Run all tests
npm test

# Run specific determinism integration tests
npx vitest run tests/integration/deterministic-reproducibility.test.ts

# Run with verbose output
npx vitest run tests/integration/deterministic-reproducibility.test.ts --reporter=verbose
```

---

## 2. How to Run a Single Benchmark

### 2.1 Programmatic API

```typescript
import { HackathonBenchmarkRunner } from './benchmarks/hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from './benchmarks/hackathon-benchmarks.js';
import { BuildVerifier } from './benchmarks/build-verifier.js';
import { BenchmarkTester } from './benchmarks/benchmark-tester.js';
import { BenchmarkJudge } from './benchmarks/benchmark-judge.js';

// Select a benchmark
const benchmark = ALL_BENCHMARKS[0];  // AI Hackathon

// Configure the runner
const runner = new HackathonBenchmarkRunner({
  planner: myPlanner,          // Your planner implementation
  architect: myArchitect,      // Your architect implementation
  builderProvider: myBuilder,  // Your builder provider
  buildVerifier: new BuildVerifier(),
  testAgent: new BenchmarkTester(),
  judgePanel: new BenchmarkJudge(),
  adversarialMode: true,       // Enable adversarial mutations
  mutationCount: 2,            // Number of mutations per run
  seed: 42,                    // Deterministic seed
});

// Run the benchmark
const result = await runner.runBenchmark(benchmark);

console.log(`Robustness: ${result.robustness_score}`);
console.log(`Survived: ${result.survived_mutation}`);
console.log(`Verdict: ${result.judge_verdict}`);
```

### 2.2 With Mock Provider For Testing

```typescript
import { getSeededRandom, deterministicNow } from './benchmarks/determinism-kernel.js';
import { RouterEngine } from '../kernel/llm/router-engine.js';
import { LLMBuilderProvider } from '../kernel/generation/llm-builder-provider.js';
import type { LLMProvider, LLMRequest, LLMResponse } from '../kernel/llm/llm-types.js';

// Create a deterministic mock LLM provider
function makeMockProvider(seed: number): LLMProvider {
  const rng = getSeededRandom(seed);
  return {
    providerId: 'mock',
    getModels: () => [{ model_id: 'mock-model', provider: 'mock', capabilities: ['code_generation'] }],
    getHealth: () => ({ provider_id: 'mock', status: 'healthy' }),
    execute: async (req) => ({
      content: JSON.stringify({
        path: 'src/generated.ts',
        content: '// deterministic mock output',
        language: 'typescript'
      }),
      usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
    }),
  };
}
```

---

## 3. How to Add New Agents

### 3.1 Agent Interface

An agent in Hack-A-Gent is defined by its configuration:

```typescript
interface AgentConfig {
  name: string;
  builderProvider: BuilderProvider;   // Code generation capability
  adversarialMode?: boolean;          // Enable/disable mutations
  mutationCount?: number;             // Mutations per run
  repairLimit?: number;               // Max repair iterations
}
```

### 3.2 Implementing a Builder Provider

The `BuilderProvider` interface requires methods for generating code modules:

```typescript
interface BuilderProvider {
  generateModule?(input: BuilderInput): Promise<GeneratedModule>;
  generateRepository?(input: BuilderInput): Promise<GeneratedRepository>;
  // ... other generation methods
}
```

### 3.3 Registering an Agent in the League

```typescript
import { AgentRegistry } from './benchmarks/agent-registry.js';
import { Leaderboard } from './benchmarks/leaderboard.js';

const agentRegistry = new AgentRegistry();
const leaderboard = new Leaderboard('./reports/leaderboard.json');

const agent = agentRegistry.registerAgent({
  name: 'My-Agent',
  builderProvider: myBuilder,
  adversarialMode: true,
  mutationCount: 3,
  repairLimit: 3,
});

// The agent is now available for league runs
```

---

## 4. How to Plug in New Mutation Types

### 4.1 Adding a Base Mutation Operation

1. **Create the mutation function** in `benchmarks/mutation-engine.ts`:

```typescript
function mutateNewOperation(
  repo: Repository,
  rng: RNG,
  intensity: number,
): { mutatedRepository: Repository; mutation: MutationMetadata } | null {
  // Select target module and file
  const moduleIdx = rng.nextInt(0, repo.modules.length - 1);
  const module = repo.modules[moduleIdx]!;
  const fileIdx = rng.nextInt(0, module.files.length - 1);
  
  // Apply the mutation
  const mutatedContent = module.files[fileIdx]!.content + '\n// mutated by new operation\n';
  
  // Build mutated repository
  const mutatedRepo = createRepository(repo.project_name,
    repo.modules.map((m, mi) =>
      mi === moduleIdx
        ? { ...m, files: m.files.map((f, fi) => fi === fileIdx ? { ...f, content: mutatedContent } : f) }
        : m
    ),
    repo.blueprint_version,
  );
  
  return {
    mutatedRepository: mutatedRepo,
    mutation: {
      type: 'new_operation',
      severity: intensity > 0.6 ? 'high' : 'medium',
      moduleName: module.name,
      filePath: module.files[fileIdx]!.path,
      description: `Applied new operation to ${module.files[fileIdx]!.path}`,
      expectedFailureCategory: 'content_corruption',
    },
  };
}
```

2. **Register in `applySingleBaseOperation`**:
   Add a new case in the switch statement mapping `'new_operation'` to `mutateNewOperation`.

3. **Register in `getBaseOperationTypes`**:
   Add `'new_operation'` to the returned array.

4. **Add to genome initialization** (optional):
   Add a seed gene in `MutationGenome.initializeSeedPopulation()`.

### 4.2 Mapping for Random Application

To make the new mutation type available for random selection, add it in `applySingleMutation`:
```typescript
case 'new_random_operation':
  return mutateNewOperation(repo, rng, intensity);
```

And add `'new_random_operation'` to the random-type names returned by the corresponding registry function.

---

## 5. How to Run Adversarial Mode

### 5.1 Enabling Adversarial Mutations

Set `adversarialMode: true` in the `BenchmarkRunnerConfig`:

```typescript
const runner = new HackathonBenchmarkRunner({
  ...config,
  adversarialMode: true,
  mutationCount: 3,        // Number of mutations per run
  difficultyController: myDifficultyController,  // Optional: adaptive difficulty
});
```

### 5.2 Using Shared Mutation State (League Mode)

For multi-agent comparisons, pre-compute shared mutations:

```typescript
// Create shared mutations once
const sharedState = HackathonBenchmarkRunner.createSharedMutationState(
  repository,
  3,                // mutations count
  42,               // seed
  difficultyController,
);

// All agents receive the same mutations
const runnerA = new HackathonBenchmarkRunner({
  ...config,
  adversarialMode: true,
  sharedMutationState: sharedState,
});

const runnerB = new HackathonBenchmarkRunner({
  ...config,
  adversarialMode: true,
  sharedMutationState: sharedState,
});
```

### 5.3 Adaptive Curriculum

The `AdversarialCurriculum` automatically adjusts mutation difficulty:

```typescript
const curriculum = new AdversarialCurriculum(difficultyController, memoryBuffer);
const decision = curriculum.classify();
// decision.state: 'too easy' | 'balanced' | 'too hard'
// decision.globalDifficultyMultiplier: 0.7 | 1.0 | 1.3
```

---

## 6. How to Export Leaderboard

### 6.1 Programmatic Export

```typescript
import { Leaderboard } from './benchmarks/leaderboard.js';

const leaderboard = new Leaderboard('./reports/leaderboard.json');

// After running benchmarks:
leaderboard.updateLeaderboard(entries);
leaderboard.updateAfterAgentRun(agentId, entry);

// Render as table
console.log(leaderboard.renderLeaderboardTable());

// Leaderboard data is auto-persisted to leaderboard.json
```

### 6.2 League Report Generation

The full league report is generated in `run-benchmarks.ts` and written to `LEAGUE_RESULTS.md`:

```bash
# Run the full league
npx tsx benchmarks/run-benchmarks.ts

# Output files:
# - reports/LEAGUE_RESULTS.md   (formatted report with tables)
# - reports/FAILURE_PATTERNS.md  (failure pattern analysis)
# - reports/leaderboard.json     (machine-readable leaderboard)
```

### 6.3 Paper Export

```typescript
import { PaperExporter } from './benchmarks/paper-exporter.js';

const exporter = new PaperExporter({
  config: {
    title: 'My Experiment',
    authors: ['Author'],
    abstract: '...',
    benchmarkSuiteName: 'Hack-A-Gent Suite',
    experimentDate: deterministicNow(0),
    includeRawData: true,
    includeCharts: false,
    includeFullTaxonomy: true,
  },
  experimentTables,
  leaderboardSnapshots,
  mutationChartData,
  robustnessComparisons,
  failureTaxonomy,
  // ...
});

const dataPackage = exporter.export();
```

---

## 7. How to Reproduce Experiments

### 7.1 From Snapshot

```typescript
import { readFileSync } from 'node:fs';
import { thawRepository, replayMutationSequence, compareResults } from './benchmarks/replay-engine.js';

// Load the snapshot
const snapshot = JSON.parse(readFileSync('./snapshots/experiment-snapshot.json', 'utf-8'));

// Reconstruct the pre-mutation repository
const repo = thawRepository(snapshot.initialRepository);

// Replay the mutation sequence
const replay = replayMutationSequence(snapshot);

// Verify reproducibility hash
console.log(`Snapshot seed: ${snapshot.masterSeed}`);
// → 42

// Re-run with the same seed to verify
const runner = new HackathonBenchmarkRunner({
  ...config,
  seed: snapshot.masterSeed,
});

const result = await runner.runBenchmark(benchmark);

// Compare
const mismatches = compareResults(snapshot.finalResults, runnerResult);
if (mismatches.length === 0) {
  console.log('EXPERIMENT FULLY REPRODUCED');
} else {
  console.log('Mismatches:', mismatches);
}
```

### 7.2 Automated Validation

```typescript
import { PublicationValidator } from './benchmarks/publication-validator.js';
import { buildPublicationOutput } from './benchmarks/publication-schema.js';

const validator = new PublicationValidator();

// Full validation
const result = validator.fullValidation(
  snapshot,
  publicationOutput,
  snapshot.finalResults,
  replayedResults,
);

console.log(`Validation ${result.passed ? 'PASSED' : 'FAILED'}`);
for (const check of result.checks) {
  console.log(`  ${check.name}: ${check.passed ? '✓' : '✗'} — ${check.details}`);
}
```

### 7.3 Reproducibility Test Suite

```bash
# Run the full determinism test suite
npx vitest run tests/integration/deterministic-reproducibility.test.ts

# Expected output: 24 tests passed
#   ✓ Determinism Kernel (8)
#   ✓ Mutation Engine (2)
#   ✓ Evaluation Orchestrator (3)
#   ✓ Runner Determinism (4)
#   ✓ Replay Engine (6)
#   ✓ Shared Mutation State (1)
```

---

## 8. Environment Variables & Configuration

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | Environment mode |
| `BENCHMARK_SEED` | `42` | Global deterministic seed |
| `BENCHMARK_REPAIR_LIMIT` | `2` | Max repair iterations |
| `BENCHMARK_MUTATION_COUNT` | `2` | Mutations per run |

---

## 9. Output Artifacts

After running, the following artifacts are produced:

```
reports/                        # League output directory
  leaderboard.json             # Persistent leaderboard
  LEAGUE_RESULTS.md            # Formatted results
  FAILURE_PATTERNS.md          # Failure analysis

benchmark-results/              # Raw benchmark output
  league/                       # League runs
    {benchmark-id}/
      {agent-id}/
        experiment-snapshot.json  # Full reproducibility snapshot
        benchmark-run-result.json # Validated run result
        generated-repository.json # Generated code
        mutations-applied.json    # Mutation log
        verification-result.json  # Build verification

snapshots/                      # Archived snapshots (manual)
dataset/                        # Dataset exports (manual)
```

---

## 10. CLI Commands

```bash
# Build the project
npm run build

# Type-check
npm run typecheck

# Run all tests
npm test

# Run specific tests
npx vitest run tests/integration/deterministic-reproducibility.test.ts

# Run benchmark suite
npx tsx benchmarks/run-benchmarks.ts

# Lint
npm run lint
```
