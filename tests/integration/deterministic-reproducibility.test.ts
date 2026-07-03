import { describe, it, expect } from 'vitest';

import type { HackathonBenchmarkDefinition, BenchmarkRunResult } from '../../benchmarks/benchmark-types.js';
import {
  getSeededRandom,
  initializeGlobalRNG,
  resetGlobalRNG,
  getGlobalRNG,
  createDeterministicUuid,
  deterministicNow,
  RNG,
} from '../../benchmarks/determinism-kernel.js';
import {
  EvaluationOrchestrator,
  type FinalEvaluationResult,
  type EvaluationInput,
} from '../../benchmarks/evaluation-orchestrator.js';
import {
  ExperimentSnapshotBuilder,
  freezeRepository,
  freezeMutationSequence,
  type ExperimentSnapshot,
} from '../../benchmarks/experiment-snapshot.js';
import {
  HackathonBenchmarkRunner,
  type BenchmarkRunnerConfig,
  type SharedMutationState,
} from '../../benchmarks/hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from '../../benchmarks/hackathon-benchmarks.js';
import { applyMutations } from '../../benchmarks/mutation-engine.js';
import type { MutationMetadata, MutationResult } from '../../benchmarks/mutation-engine.js';
import type { MutationGene } from '../../benchmarks/mutation-genome.js';
import {
  thawRepository,
  replayMutationSequence,
  compareResults,
  validateDeterministicEquality,
} from '../../benchmarks/replay-engine.js';
import type { GeneratedModule } from '../../kernel/builders/builder-types.js';
import { createRepository, type Repository, type Module } from '../../kernel/builders/repository-types.js';
import { LLMBuilderProvider } from '../../kernel/generation/llm-builder-provider.js';
import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import type { LLMRequest, LLMResponse } from '../../kernel/llm/llm-types.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';

function makeMockModule(type: GeneratedModule['type'], name: string, fileCount: number): Module {
  const files = [];
  for (let i = 0; i < fileCount; i++) {
    files.push({
      path: `src/${type}/file-${i}.${type === 'frontend' ? 'tsx' : type === 'database' ? 'sql' : type === 'docs' ? 'md' : 'ts'}`,
      content: `// ${type} file ${i}\nexport function handler${i}() { return ${i}; }\n`,
      language: 'typescript' as const,
    });
  }
  return { name, type, files };
}

function makeBenchmarkRepo(): Repository {
  return createRepository('TestBenchmark', [
    makeMockModule('frontend', 'web-ui', 2),
    makeMockModule('backend', 'api-server', 2),
  ]);
}

function makeMockPlanner() {
  return {
    execute: async () => ({
      output: {
        hackathon_data: { hackathon_name: 'Mock Hackathon', description: 'Test' },
        project_ideas: [{ name: 'Mock Project', description: 'Generated', difficulty_score: 5, innovation_score: 6 }],
        recommended_approach: 'Full stack web app',
      } as unknown as PlannerOutput,
    }),
  };
}

function makeMockArchitect(seed: number) {
  return {
    execute: async (_input: Record<string, unknown>) => ({
      output: {
        project_name: 'BenchmarkProject',
        version: '1.0.0',
        summary: 'A benchmark project',
        recommended_stack: {
          frontend: [{ name: 'React', purpose: 'UI framework', alternatives: [] }],
          backend: [{ name: 'Node.js', purpose: 'Runtime', alternatives: [] }],
          database: [{ name: 'PostgreSQL', purpose: 'Primary DB', alternatives: [] }],
          infrastructure: [],
          tooling: [],
        },
        folder_structure: { root: 'src', entries: [] },
        database_schema: { engine: 'PostgreSQL', tables: [], relationships: [] },
        api_contracts: { base_url: '/api', endpoints: [] },
        frontend_modules: [],
        backend_modules: [],
        milestones: [],
        execution_graph: { nodes: [], edges: [], entry_point: 'm1' },
        required_skills: [],
        risks: [],
        human_checkpoints: [],
        generated_at: deterministicNow(seed),
        architect_version: '1.0.0',
      } as ArchitectureBlueprint,
    }),
  };
}

function makeDeterministicLLMProvider(providerSeed: number): LLMProvider {
  const rng = getSeededRandom(providerSeed);
  let counter = 0;
  return {
    providerId: 'local',
    getModels: () => [
      {
        model_id: 'benchmark-model',
        provider: 'local',
        capabilities: ['code_generation', 'json_output'],
        context_window: 128000,
        supports_json_mode: true,
        supports_tool_calling: false,
        typical_latency_ms: 50,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
      },
    ],
    getHealth: () => ({
      provider_id: 'local',
      status: 'healthy',
      last_check: deterministicNow(providerSeed),
      consecutive_failures: 0,
      total_requests: 0,
      failed_requests: 0,
      avg_latency_ms: 50,
    }),
    execute: async (request: LLMRequest): Promise<LLMResponse> => {
      counter++;
      const userMsg = request.messages.find((m) => m.role === 'user');
      const filePath = userMsg?.content?.match(/Generate the file "([^"]+)"/)?.[1] ?? `src/generated-${counter}.ts`;
      const ext = filePath.split('.').pop()?.toLowerCase() ?? 'ts';
      const language =
        ext === 'tsx' || ext === 'ts' ? 'typescript' : ext === 'py' ? 'python' : ext === 'sql' ? 'sql' : 'text';
      const tokenVariation = 0.8 + rng.next() * 0.4;
      const promptTokens = Math.round(100 * tokenVariation);
      const completionTokens = Math.round(50 * tokenVariation);
      const fnName =
        filePath
          .split('/')
          .pop()
          ?.replace(/[^a-zA-Z0-9_]/g, '_') ?? 'handler';
      return {
        content: JSON.stringify({
          path: filePath,
          content: `// ${filePath}\nexport function ${fnName}() { return '${filePath}'; }\n`,
          language,
          dependencies: [],
          exports: [],
          imports: [],
        }),
        model_id: 'benchmark-model',
        provider: 'local',
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        finish_reason: 'stop',
        latency_ms: Math.round(50 * tokenVariation),
      };
    },
  };
}

function makeRunnerConfig(seed: number): BenchmarkRunnerConfig {
  const providerSeed = seed * 1000 + 1;
  const provider = makeDeterministicLLMProvider(providerSeed);
  const router = new RouterEngine(
    [provider],
    {},
    { coding: { preferred: 'benchmark-model', fallback: 'benchmark-model', emergency: 'benchmark-model' } },
  );
  const builderProvider = new LLMBuilderProvider({
    router,
    taskType: 'coding',
    selfRepairConfig: { max_attempts: 1 },
    metricsTracker: undefined,
  });
  return {
    planner: makeMockPlanner(),
    architect: makeMockArchitect(seed),
    builderProvider,
    adversarialMode: true,
    mutationCount: 2,
    seed,
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const v of Object.values(obj as Record<string, unknown>)) {
      deepFreeze(v);
    }
  }
  return obj;
}

describe('Determinism Kernel', () => {
  it('same seed produces identical RNG sequence', () => {
    const a = getSeededRandom(42);
    const b = getSeededRandom(42);
    const seqA = Array.from({ length: 100 }, () => a.next());
    const seqB = Array.from({ length: 100 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds produce different sequences', () => {
    const a = getSeededRandom(42);
    const b = getSeededRandom(99);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });

  it('nextInt produces values in range [min, max]', () => {
    const rng = getSeededRandom(7);
    for (let i = 0; i < 500; i++) {
      const v = rng.nextInt(3, 10);
      expect(v).toBeGreaterThanOrEqual(3);
      expect(v).toBeLessThanOrEqual(10);
    }
  });

  it('pick selects from array', () => {
    const rng = getSeededRandom(1);
    const items = ['a', 'b', 'c'];
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 300; i++) {
      counts[rng.pick(items)]!++;
    }
    expect(Object.values(counts).every((c) => c > 0)).toBe(true);
  });

  it('shuffle is deterministic', () => {
    const a = getSeededRandom(42);
    const b = getSeededRandom(42);
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    expect(a.shuffle(items)).toEqual(b.shuffle(items));
  });

  it('createDeterministicUuid produces unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 1000; i++) {
      ids.add(createDeterministicUuid(42, i));
    }
    expect(ids.size).toBe(1000);
  });

  it('deterministicNow returns ISO string', () => {
    const ts = deterministicNow(42);
    expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('global RNG initialization and reset', () => {
    resetGlobalRNG();
    expect(() => getGlobalRNG()).toThrow();

    initializeGlobalRNG(42);
    const rng = getGlobalRNG();
    expect(rng.seed).toBe(42);
  });
});

describe('Mutation Engine Determinism', () => {
  it('same seed produces identical mutations', () => {
    const repo = makeBenchmarkRepo();
    const resultA = applyMutations(repo, 2, 42);
    const resultB = applyMutations(repo, 2, 42);
    expect(resultA.mutations.length).toBe(resultB.mutations.length);
    expect(resultA.mutations.map((m) => m.type)).toEqual(resultB.mutations.map((m) => m.type));
    expect(resultA.mutations.map((m) => m.moduleName)).toEqual(resultB.mutations.map((m) => m.moduleName));
  });

  it('different seeds produce different mutation sequences', () => {
    const repo = makeBenchmarkRepo();
    const resultA = applyMutations(repo, 3, 42);
    const resultB = applyMutations(repo, 3, 99);
    const typesA = resultA.mutations.map((m) => `${m.type}:${m.moduleName}`);
    const typesB = resultB.mutations.map((m) => `${m.type}:${m.moduleName}`);
    expect(typesA).not.toEqual(typesB);
  });
});

describe('EvaluationOrchestrator Determinism', () => {
  const baseInput: EvaluationInput = {
    verificationPassed: true,
    verificationErrors: [],
    testResult: {
      passed: true,
      total: 5,
      passed_count: 5,
      failed_count: 0,
      checks: [],
      errors: [],
      summary: 'all passed',
    },
    mutationMetrics: {
      mutations_applied: 10,
      mutations_detected: 7,
      mutations_repaired: 5,
      detection_rate: 0.7,
      repair_success_rate: 0.714,
      survived_mutation: false,
    },
    perTypeStats: {
      corrupt_file_content: { applied: 5, detected: 3, repaired: 2 },
      remove_file: { applied: 5, detected: 4, repaired: 3 },
    },
    repairHistory: [],
    passingThreshold: 50,
    leaderboardRank: 0,
  };

  it('same input produces identical evaluation', () => {
    const orchestrator = new EvaluationOrchestrator();
    const resultA = orchestrator.evaluate(baseInput);
    const resultB = orchestrator.evaluate(baseInput);
    expect(deepFreeze(resultA)).toEqual(deepFreeze(resultB));
    expect(resultA.canonicalScore).toBe(resultB.canonicalScore);
    expect(resultA.verdict).toBe(resultB.verdict);
  });

  it('different mutation metrics produce different scores', () => {
    const orchestrator = new EvaluationOrchestrator();
    const inputHigh = {
      ...baseInput,
      mutationMetrics: {
        ...baseInput.mutationMetrics,
        mutations_applied: 10,
        mutations_detected: 10,
        mutations_repaired: 10,
      },
    };
    const inputLow = {
      ...baseInput,
      mutationMetrics: {
        ...baseInput.mutationMetrics,
        mutations_applied: 10,
        mutations_detected: 0,
        mutations_repaired: 0,
      },
    };
    const resultHigh = orchestrator.evaluate(inputHigh);
    const resultLow = orchestrator.evaluate(inputLow);
    expect(resultHigh.canonicalScore).toBeGreaterThan(resultLow.canonicalScore);
    expect(resultHigh.verdict).toBe('pass');
    expect(resultLow.verdict).toBe('fail');
  });

  it('all metric fields are populated', () => {
    const orchestrator = new EvaluationOrchestrator();
    const result = orchestrator.evaluate(baseInput);
    const fields: (keyof FinalEvaluationResult)[] = [
      'robustnessScore',
      'repairEfficiency',
      'mutationSurvivalRate',
      'detectionAccuracy',
      'leaderboardRank',
      'correctnessScore',
      'mutationRecoveryRate',
      'canonicalScore',
      'verdict',
      'reasoning',
    ];
    for (const f of fields) {
      expect(result[f]).toBeDefined();
    }
  });
});

describe('HackathonBenchmarkRunner Determinism', () => {
  const benchmark = ALL_BENCHMARKS.find((b) => b.id === 'bench-ai-001') ?? ALL_BENCHMARKS[0];
  const benchmarkDef = {
    ...benchmark,
    difficulty: 'easy' as const,
    rubric: {
      items: [{ category: 'functionality', max_score: 100, description: 'Overall', scoring_guide: '0-100' }],
      max_total: 100,
      passing_threshold: 50,
    },
  } as HackathonBenchmarkDefinition;

  it('same seed produces identical run results (non-adversarial)', async () => {
    const config = makeRunnerConfig(42);
    const configB = makeRunnerConfig(42);
    const runnerA = new HackathonBenchmarkRunner({ ...config, adversarialMode: false });
    const runnerB = new HackathonBenchmarkRunner({ ...configB, adversarialMode: false });
    const resultA = await runnerA.runBenchmark(benchmarkDef);
    const resultB = await runnerB.runBenchmark(benchmarkDef);
    expect(resultA.overall_success).toBe(resultB.overall_success);
    expect(resultA.build_success).toBe(resultB.build_success);
    expect(resultA.phases.length).toBe(resultB.phases.length);
    for (let i = 0; i < resultA.phases.length; i++) {
      expect(resultA.phases[i]!.success).toBe(resultB.phases[i]!.success);
      expect(resultA.phases[i]!.phase).toBe(resultB.phases[i]!.phase);
    }
  }, 30000);

  it('same seed produces identical adversarial run results', async () => {
    const configA = makeRunnerConfig(42);
    const configB = makeRunnerConfig(42);
    const runnerA = new HackathonBenchmarkRunner(configA);
    const runnerB = new HackathonBenchmarkRunner(configB);
    const resultA = await runnerA.runBenchmark(benchmarkDef);
    const resultB = await runnerB.runBenchmark(benchmarkDef);
    expect(resultA.mutations_applied).toBe(resultB.mutations_applied);
    expect(resultA.mutations_detected).toBe(resultB.mutations_detected);
    expect(resultA.mutations_repaired).toBe(resultB.mutations_repaired);
    expect(resultA.robustness_score).toBe(resultB.robustness_score);
    expect(resultA.per_mutation_type_stats).toEqual(resultB.per_mutation_type_stats);
    expect(resultA.errors.length).toBe(resultB.errors.length);
  }, 60000);

  it('different seeds produce different adversarial results', async () => {
    const configA = makeRunnerConfig(42);
    const configB = makeRunnerConfig(99);
    const runnerA = new HackathonBenchmarkRunner(configA);
    const runnerB = new HackathonBenchmarkRunner(configB);
    const resultA = await runnerA.runBenchmark(benchmarkDef);
    const resultB = await runnerB.runBenchmark(benchmarkDef);
    const mutationTypesA = JSON.stringify(resultA.per_mutation_type_stats);
    const mutationTypesB = JSON.stringify(resultB.per_mutation_type_stats);
    expect(mutationTypesA).not.toEqual(mutationTypesB);
  }, 60000);

  it('deterministic across multiple identical runs (3x seed=42)', async () => {
    const configs = [makeRunnerConfig(42), makeRunnerConfig(42), makeRunnerConfig(42)];
    const runners = configs.map((c) => new HackathonBenchmarkRunner(c));
    const results = await Promise.all(runners.map((r) => r.runBenchmark(benchmarkDef)));
    const robustnessScores = results.map((r) => r.robustness_score);
    expect(new Set(robustnessScores).size).toBe(1);
    const mutationsApplied = results.map((r) => r.mutations_applied);
    expect(new Set(mutationsApplied).size).toBe(1);
  }, 120000);
});

describe('Replay Engine', () => {
  const sampleSnapshot = (): ExperimentSnapshot => {
    const repo = makeBenchmarkRepo();
    const frozenRepo = freezeRepository(repo);
    const mutationResult = applyMutations(repo, 2, 42);
    const frozenSeq = freezeMutationSequence(mutationResult.mutations);
    return new ExperimentSnapshotBuilder()
      .setMasterSeed(42)
      .setInitialRepository(frozenRepo)
      .setMutationSequence(frozenSeq)
      .setPhaseResults([
        { phase: 'planning' as const, success: true, duration_ms: 100, error: null, token_count: 50, artifacts: [] },
      ])
      .setFinalResults({
        robustnessScore: 75,
        repairEfficiency: 80,
        mutationSurvivalRate: 0.2,
        detectionAccuracy: 85,
        leaderboardRank: 1,
        correctnessScore: 90,
        mutationRecoveryRate: 80,
        perMutationTypeMetrics: [],
        aggregateMutationMetrics: {
          mutations_applied: 10,
          mutations_detected: 8,
          mutations_repaired: 6,
          detection_rate: 0.8,
          repair_success_rate: 0.75,
          survived_mutation: false,
        },
        canonicalScore: 78,
        verdict: 'pass',
        reasoning: 'Test evaluation',
      })
      .setVersions({
        protocolVersion: '1.0.0',
        mutationEngineVersion: '1.0.0',
        judgeVersion: '1.0.0',
        repairEngineVersion: '1.0.0',
      })
      .build();
  };

  it('thawRepository reconstructs the original repo', () => {
    const repo = makeBenchmarkRepo();
    const frozen = freezeRepository(repo);
    const thawed = thawRepository(frozen);
    expect(thawed.project_name).toBe(repo.project_name);
    expect(thawed.modules.length).toBe(repo.modules.length);
    expect(thawed.modules[0]!.files[0]!.content).toBe(repo.modules[0]!.files[0]!.content);
  });

  it('replayMutationSequence applies mutations deterministically', () => {
    const snapshot = sampleSnapshot();
    const replayA = replayMutationSequence(snapshot);
    const replayB = replayMutationSequence(snapshot);
    expect(replayA.mutationSequence.length).toBe(replayB.mutationSequence.length);
    expect(replayA.finalRepository.modules[0]!.files[0]!.content).toBe(
      replayB.finalRepository.modules[0]!.files[0]!.content,
    );
  });

  it('compareResults finds no mismatches for identical results', () => {
    const result: FinalEvaluationResult = {
      robustnessScore: 80,
      repairEfficiency: 75,
      mutationSurvivalRate: 0.15,
      detectionAccuracy: 90,
      leaderboardRank: 2,
      correctnessScore: 85,
      mutationRecoveryRate: 70,
      perMutationTypeMetrics: [],
      aggregateMutationMetrics: {
        mutations_applied: 10,
        mutations_detected: 9,
        mutations_repaired: 7,
        detection_rate: 0.9,
        repair_success_rate: 0.78,
        survived_mutation: false,
      },
      canonicalScore: 80,
      verdict: 'pass',
      reasoning: 'Good performance',
    };
    const mismatches = compareResults(result, result);
    expect(mismatches).toEqual([]);
  });

  it('compareResults detects differences', () => {
    const a: FinalEvaluationResult = {
      robustnessScore: 80,
      repairEfficiency: 75,
      mutationSurvivalRate: 0.15,
      detectionAccuracy: 90,
      leaderboardRank: 2,
      correctnessScore: 85,
      mutationRecoveryRate: 70,
      perMutationTypeMetrics: [],
      aggregateMutationMetrics: {
        mutations_applied: 10,
        mutations_detected: 9,
        mutations_repaired: 7,
        detection_rate: 0.9,
        repair_success_rate: 0.78,
        survived_mutation: false,
      },
      canonicalScore: 80,
      verdict: 'pass',
      reasoning: 'Good',
    };
    const b: FinalEvaluationResult = {
      ...a,
      robustnessScore: 30,
      verdict: 'fail',
    };
    const mismatches = compareResults(a, b);
    expect(mismatches.length).toBeGreaterThanOrEqual(2);
    expect(mismatches.some((m) => m.startsWith('robustnessScore'))).toBe(true);
    expect(mismatches.some((m) => m.startsWith('verdict'))).toBe(true);
  });

  it('validateDeterministicEquality passes when orchestrator is consistent', async () => {
    const snapshot = sampleSnapshot();
    const orchestratorFn = (seed: number) => ({ result: snapshot.finalResults });
    const result = await validateDeterministicEquality(snapshot, orchestratorFn);
    expect(result.match).toBe(true);
    expect(result.replayCompleted).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validateDeterministicEquality fails when orchestrator diverges', async () => {
    const snapshot = sampleSnapshot();
    const diverged: FinalEvaluationResult = { ...snapshot.finalResults, robustnessScore: 0, verdict: 'fail' };
    const orchestratorFn = (_seed: number) => ({ result: diverged });
    const result = await validateDeterministicEquality(snapshot, orchestratorFn);
    expect(result.match).toBe(false);
    expect(result.mismatches.length).toBeGreaterThan(0);
  });
});

describe('SharedMutationState Determinism', () => {
  it('same seed produces identical shared mutation state', () => {
    const repo = makeBenchmarkRepo();
    const stateA = HackathonBenchmarkRunner.createSharedMutationState(repo, 2, 42);
    const stateB = HackathonBenchmarkRunner.createSharedMutationState(repo, 2, 42);
    expect(stateA.mutations.length).toBe(stateB.mutations.length);
    expect(stateA.mutations.map((m) => m.type)).toEqual(stateB.mutations.map((m) => m.type));
    expect(stateA.mutations.map((m) => m.moduleName)).toEqual(stateB.mutations.map((m) => m.moduleName));
  });
});
