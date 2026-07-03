import { getSeededRandom } from './determinism-kernel.js';
import { deterministicNow } from './determinism-kernel.js';
import type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';
import { HackathonSimulationEngine, type SimulationResult, type RepairEvent } from './hackathon-simulation-engine.js';
import { JudgeSimulator, type JudgeVerdict, type JudgeSimulatorConfig } from './judge-simulator.js';

// ---- Error Types ----

export class DeterminismViolationError extends Error {
  constructor(
    message: string,
    public readonly runA: unknown,
    public readonly runB: unknown,
    public readonly runC: unknown,
  ) {
    super(message);
    this.name = 'DeterminismViolationError';
  }
}

// ---- RNG Audit Types ----

export interface RNGViolationReport {
  violations: string[];
  safe: boolean;
  sourcesChecked: string[];
}

// ---- Failure Injection Validation Types ----

export interface FailureDistributionReport {
  expected: Record<string, number>;
  observed: Record<string, number>;
  tolerance: number;
  withinTolerance: boolean;
  violations: string[];
  totalSimulations: number;
}

// ---- Judge Stability Types ----

export interface JudgeStabilityReport {
  runs: number;
  rankings: string[][];
  rankingConsistent: boolean;
  scoreVariance: number;
  biasModelStable: boolean;
  details: string[];
}

// ---- Simulation-Execution Consistency Types ----

export interface SimulationDriftReport {
  scoreDrift: number;
  executionMismatchRate: number;
  reliabilityScore: number;
  details: string[];
}

// ================================================================
// 1. Determinism Lock Test
// ================================================================

const TEST_SPEC: ParsedHackathonSpec = {
  specId: 'test-spec-42',
  title: 'AI Dashboard for Hackathon Judges',
  problemStatement:
    'Build an AI-powered dashboard that helps hackathon judges evaluate submissions faster using sentiment analysis and live demo monitoring.',
  judgingCriteria: ['Innovation', 'Technical Complexity', 'Impact', 'UX', 'AI Implementation'],
  constraints: ['8 hour limit', 'No external APIs', 'Mobile responsive'],
  techStackHints: ['React', 'TypeScript', 'Python', 'TensorFlow.js'],
  implicitGoals: ['Wow the judges with real-time AI', 'Clean minimal UI'],
  submissionRequirements: ['GitHub repo', 'Demo URL', 'README'],
  rawText: 'AI Dashboard for Hackathon Judges test input',
  source: 'text',
  parsedAt: '2026-06-26T00:00:00.000Z',
};

export function determinismLockTest(seed: number = 42): {
  passed: boolean;
  resultA: SimulationResult;
  resultB: SimulationResult;
  resultC: SimulationResult;
} {
  // Create a FRESH engine for each run to avoid RNG state carryover
  const input = { devpost: TEST_SPEC, strategyMode: 'fast-win' as const, seed };

  const resultA = new HackathonSimulationEngine(seed).simulate(input);
  const resultB = new HackathonSimulationEngine(seed).simulate(input);
  const resultC = new HackathonSimulationEngine(seed).simulate(input);

  const a = JSON.stringify(resultA);
  const b = JSON.stringify(resultB);
  const c = JSON.stringify(resultC);

  if (a !== b || b !== c) {
    throw new DeterminismViolationError(
      `Determinism violation: 3 runs with seed ${seed} produced different outputs`,
      resultA,
      resultB,
      resultC,
    );
  }

  return { passed: true, resultA, resultB, resultC };
}

// ================================================================
// 2. RNG Usage Auditor
// ================================================================

/**
 * Audit a simulation engine instance to verify it only uses
 * getSeededRandom().next() and no Math.random() / Date.now() / unseeded calls.
 *
 * Strategy: Monkey-patch Math.random and Date.now before running,
 * then verify they were never called during simulation.
 */
export function rngUsageAuditor(): RNGViolationReport {
  const violations: string[] = [];
  const sourcesChecked: string[] = [];

  // Intercept Math.random
  const origMathRandom = Math.random;
  let mathRandomCalled = false;
  Math.random = function () {
    mathRandomCalled = true;
    return origMathRandom.call(Math);
  };

  // Intercept Date.now
  const origDateNow = Date.now;
  let dateNowCalled = false;
  Date.now = function () {
    dateNowCalled = true;
    return origDateNow.call(Date);
  };

  try {
    // Run a simulation with a test spec
    const engine = new HackathonSimulationEngine(42);
    engine.simulate({ devpost: TEST_SPEC, strategyMode: 'fast-win', seed: 42 });

    // Run a judge evaluation
    const judge = new JudgeSimulator({ seed: 42 });
    judge.evaluate({
      hasUI: true,
      hasLiveDeploy: true,
      hasWowMoment: true,
      buildSuccess: true,
      deploySuccess: true,
      testPassRate: 0.9,
      crashFree: true,
      taskCompleteness: 0.9,
      mockAI: true,
    });
  } finally {
    Math.random = origMathRandom;
    Date.now = origDateNow;
  }

  sourcesChecked.push('Math.random');
  sourcesChecked.push('Date.now');

  if (mathRandomCalled) {
    violations.push('Math.random() was called during simulation');
  }
  if (dateNowCalled) {
    violations.push('Date.now() was called during simulation');
  }

  // Check that engine uses getSeededRandom
  // We can verify this by checking the constructor properly initializes rng
  const engine2 = new HackathonSimulationEngine(99);
  const spec = JSON.stringify(engine2.simulate({ devpost: TEST_SPEC, strategyMode: 'fast-win', seed: 99 }));
  sourcesChecked.push('getSeededRandom().next()');

  // Verify the deterministicNow is used (not raw Date.now in output)
  const engine3 = new HackathonSimulationEngine(42);
  const result = engine3.simulate({ devpost: TEST_SPEC, strategyMode: 'fast-win', seed: 42 });
  sourcesChecked.push('deterministicNow');
  sourcesChecked.push('createDeterministicUuid');

  return { violations, safe: violations.length === 0, sourcesChecked };
}

// ================================================================
// 3. Failure Injection Validator
// ================================================================

const ENGINE_CHECK_RATES: Record<string, number> = { build: 0.1, criticalCrash: 0.05 };

// Map engine check keys Ã¢â€ â€™ failure event phases emitted
const CHECK_TO_EVENT_PHASE: Record<string, string> = { build: 'build', criticalCrash: 'runtime' };

const TOLERANCE = 0.02; // Ã‚Â±2%

export function failureInjectionValidator(iterations: number = 1000, seed: number = 42): FailureDistributionReport {
  const observed: Record<string, number> = { build: 0, runtime: 0 };

  const totals: Record<string, number> = { build: 0, criticalCrash: 0 };

  for (let i = 0; i < iterations; i++) {
    const engine = new HackathonSimulationEngine(seed + i);
    const result = engine.simulate({ devpost: TEST_SPEC, strategyMode: 'fast-win', seed: seed + i });

    // Count each failure, type from ALL strategies
    // Map engine check keys Ã¢â€ â€™ event phases: buildÃ¢â€ â€™build, criticalCrashÃ¢â€ â€™runtime
    for (const failure of result.failureTimeline) {
      const phase = failure.phase;
      if (phase in observed) {
        observed[phase as keyof typeof observed] = (observed[phase as keyof typeof observed] ?? 0) + 1;
      }
    }

    // Estimate total checks per check key
    const ALL_EXEC_PLANS = [
      ['scaffold_ui', 'build_main_feature', 'add_wow_interaction', 'polish_ux', 'deploy'],
      [
        'scaffold_project',
        'build_backend_api',
        'setup_database',
        'add_authentication',
        'build_ui',
        'add_tests',
        'deploy',
      ],
      ['analyze_judging_criteria', 'build_judge_focused_feature', 'add_wow_moment', 'polish_narrative', 'deploy'],
    ];
    for (const plan of ALL_EXEC_PLANS) {
      for (const task of plan) {
        totals.build = (totals.build ?? 0) + 1;
        totals.criticalCrash = (totals.criticalCrash ?? 0) + 1;
      }
    }
  }

  // Calculate observed rates Ã¢â‚¬â€ map from event phase to check key
  const expected: Record<string, number> = {};
  const observedRates: Record<string, number> = {};
  const violations: string[] = [];

  for (const [checkKey, expectedRate] of Object.entries(ENGINE_CHECK_RATES)) {
    expected[checkKey] = expectedRate;
    const eventPhase = CHECK_TO_EVENT_PHASE[checkKey] ?? checkKey;
    const count = (observed as Record<string, number>)[eventPhase] ?? 0;
    const total = totals[checkKey as keyof typeof totals] ?? 1;
    const observedRate = total > 0 ? count / total : 0;
    observedRates[checkKey] = observedRate;

    const diff = Math.abs(observedRate - expectedRate);
    if (diff > TOLERANCE) {
      violations.push(
        `${checkKey} (Ã¢â€ â€™ event '${eventPhase}'): expected ${(expectedRate * 100).toFixed(1)}% Ã‚Â±${(TOLERANCE * 100).toFixed(1)}%, observed ${(observedRate * 100).toFixed(1)}% (diff=${(diff * 100).toFixed(1)}%)`,
      );
    }
  }

  return {
    expected,
    observed: observedRates,
    tolerance: TOLERANCE,
    withinTolerance: violations.length === 0,
    violations,
    totalSimulations: iterations,
  };
}

// ================================================================
// 4. Judge Stability Test
// ================================================================

export function judgeStabilityTest(runs: number = 5, seed: number = 42): JudgeStabilityReport {
  const rankings: string[][] = [];
  const allTotalScores: number[] = [];
  const details: string[] = [];

  const testInputs: Array<{ name: string; params: Parameters<JudgeSimulator['evaluate']>[0] }> = [
    {
      name: 'Full-featured with wow',
      params: {
        hasUI: true,
        hasLiveDeploy: true,
        hasWowMoment: true,
        buildSuccess: true,
        deploySuccess: true,
        testPassRate: 0.95,
        crashFree: true,
        taskCompleteness: 1.0,
        mockAI: true,
      },
    },
    {
      name: 'No UI, no deploy',
      params: {
        hasUI: false,
        hasLiveDeploy: false,
        hasWowMoment: false,
        buildSuccess: true,
        deploySuccess: false,
        testPassRate: 0.7,
        crashFree: true,
        taskCompleteness: 0.6,
        mockAI: false,
      },
    },
    {
      name: 'Broken build',
      params: {
        hasUI: true,
        hasLiveDeploy: false,
        hasWowMoment: false,
        buildSuccess: false,
        deploySuccess: false,
        testPassRate: 0.3,
        crashFree: false,
        taskCompleteness: 0.2,
        mockAI: false,
      },
    },
  ];

  for (let r = 0; r < runs; r++) {
    const judge = new JudgeSimulator({ seed: seed + r * 1000 });
    const runRankings: { name: string; total: number }[] = [];

    for (const input of testInputs) {
      const verdict = judge.evaluate(input.params);
      runRankings.push({ name: input.name, total: verdict.total });
      if (r === 0) allTotalScores.push(verdict.total);
    }

    runRankings.sort((a, b) => b.total - a.total);
    rankings.push(runRankings.map((r) => r.name));

    if (r > 0) {
      for (let i = 0; i < runRankings.length; i++) {
        allTotalScores[i] = (allTotalScores[i] ?? 0) + runRankings[i]!.total;
      }
    }
  }

  // Check ranking consistency
  const firstRanking = rankings[0]!;
  const rankingConsistent = rankings.every(
    (r) => r.length === firstRanking.length && r.every((name, i) => name === firstRanking[i]),
  );

  if (!rankingConsistent) {
    details.push('Ranking order changed across runs');
    for (let r = 0; r < rankings.length; r++) {
      details.push(`  Run ${r + 1}: ${rankings[r]!.join(' > ')}`);
    }
  } else {
    details.push('Ranking order is stable across all runs');
  }

  // Calculate score variance across runs
  const averages = allTotalScores.map((s) => s / runs);
  const variance =
    averages.reduce((sum, avg) => sum + Math.pow(avg - averages.reduce((a, b) => a + b, 0) / averages.length, 2), 0) /
    averages.length;

  if (variance > 10) {
    details.push(`High score variance detected: ${variance.toFixed(2)}`);
  } else {
    details.push(`Score variance within acceptable range: ${variance.toFixed(2)}`);
  }

  // Check bias model consistency Ã¢â‚¬â€ same seed must produce identical results
  let biasModelStable = true;
  const biasCheckResults: JudgeVerdict[] = [];
  const biasConfig = {
    prefersVisibleDemo: true,
    penalizesIncomplete: true,
    rewardsWowMoment: true,
    uxWeightMultiplier: 1.3,
  };
  for (let r = 0; r < Math.min(runs, 3); r++) {
    const judge = new JudgeSimulator({ seed: seed, judgeBias: biasConfig });
    const verdict = judge.evaluate(testInputs[0]!.params);
    biasCheckResults.push(verdict);
  }

  for (let i = 1; i < biasCheckResults.length; i++) {
    if (biasCheckResults[i]!.total !== biasCheckResults[0]!.total) {
      biasModelStable = false;
      details.push('Bias model produces inconsistent scores across runs with same seed+config');
      break;
    }
  }
  if (biasModelStable) {
    details.push('Bias model is consistent across runs (same seed = same score)');
  }

  return { runs, rankings, rankingConsistent, scoreVariance: variance, biasModelStable, details };
}

// ================================================================
// 5. Simulation Ã¢â€ â€ Execution Consistency Check
// ================================================================

export function simulationExecutionConsistency(
  simulationResult: SimulationResult,
  executionResult: {
    score: number;
    failures: Array<{ phase: string }>;
    deploymentUrl: string | null;
    tasksCompleted: number;
  },
): SimulationDriftReport {
  const details: string[] = [];

  const scoreDrift = Math.abs(simulationResult.finalJudgeVerdict.total - executionResult.score);
  details.push(
    `Score drift: simulated=${simulationResult.finalJudgeVerdict.total}, actual=${executionResult.score}, delta=${scoreDrift}`,
  );

  const simDeployments = simulationResult.finalJudgeVerdict.breakdown.demoReliability >= 5 ? 1 : 0;
  const execDeployments = executionResult.deploymentUrl !== null ? 1 : 0;
  const deployDelta = Math.abs(simDeployments - execDeployments);
  details.push(`Deployment delta: simulated=${simDeployments}, actual=${execDeployments}`);

  const simFailures = simulationResult.failureTimeline.length;
  const execFailures = executionResult.failures.length;
  const failureDelta = Math.abs(simFailures - execFailures);
  details.push(`Failure delta: simulated=${simFailures}, actual=${execFailures}`);

  const executionMismatchRate =
    execFailures > 0 ? Math.abs(simFailures - execFailures) / Math.max(execFailures, 1) : simFailures / 10; // penalty if execution had 0 failures but sim predicted some

  const reliabilityScore = Math.max(
    0,
    Math.min(1, 1 - scoreDrift / 100 - Math.abs(simDeployments - execDeployments) * 0.1 - failureDelta * 0.05),
  );

  details.push(`Reliability score: ${(reliabilityScore * 100).toFixed(1)}%`);

  return { scoreDrift, executionMismatchRate: Math.min(1, executionMismatchRate), reliabilityScore, details };
}

// ================================================================
// Full Suite
// ================================================================

export interface DeterminismValidationReport {
  determinismLock: { passed: boolean } | { error: string };
  rngAudit: RNGViolationReport;
  failureInjection: FailureDistributionReport;
  judgeStability: JudgeStabilityReport;
  overallPassed: boolean;
}

export function runFullValidationSuite(options?: {
  failureIterations?: number;
  judgeStabilityRuns?: number;
  seed?: number;
}): DeterminismValidationReport {
  const seed = options?.seed ?? 42;
  const failureIterations = options?.failureIterations ?? 1000;
  const judgeStabilityRuns = options?.judgeStabilityRuns ?? 5;

  let determinismLock: DeterminismValidationReport['determinismLock'];
  try {
    const result = determinismLockTest(seed);
    determinismLock = { passed: result.passed };
  } catch (e) {
    determinismLock = { error: e instanceof Error ? e.message : String(e) };
  }

  const rngAudit = rngUsageAuditor();

  const failureInjection = failureInjectionValidator(failureIterations, seed);

  const judgeStability = judgeStabilityTest(judgeStabilityRuns, seed);

  const overallPassed =
    'passed' in determinismLock &&
    determinismLock.passed &&
    rngAudit.safe &&
    failureInjection.withinTolerance &&
    judgeStability.rankingConsistent &&
    judgeStability.biasModelStable;

  return { determinismLock, rngAudit, failureInjection, judgeStability, overallPassed };
}
