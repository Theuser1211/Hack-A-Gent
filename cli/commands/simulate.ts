import { ComplexityCollapseEngine } from '../../benchmarks/complexity-collapse-map.js';
import { DemoSurfaceCompiler } from '../../benchmarks/demo-surface-compiler.js';
import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { ParsedHackathonSpec } from '../../benchmarks/devpost-ingestion-layer.js';
import { HackathonSimulationEngine } from '../../benchmarks/hackathon-simulation-engine.js';
import { JudgeSimulator } from '../../benchmarks/judge-simulator.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

import { parseInput as parseRawInput } from './run.js';

export async function simulateCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const input = args.positional[0];
  if (!input) {
    return { success: false, message: 'Usage: hackagent simulate <input>' };
  }

  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const mode = args.flags.demo === true ? 'demo' : 'simulate';

  const parsed = await parseRawInput(input);
  if (!parsed) {
    return { success: false, message: `Cannot parse input: ${input}` };
  }

  const spec: ParsedHackathonSpec = {
    specId: 'spec-' + createDeterministicUuid(seed, 0).slice(0, 8),
    title: parsed.title,
    problemStatement: parsed.problemStatement,
    judgingCriteria: parsed.judgingCriteria,
    constraints: parsed.constraints,
    techStackHints: parsed.recommendedStack,
    implicitGoals: [],
    submissionRequirements: parsed.submissionRequirements,
    rawText: parsed.rawText,
    source: 'text',
    parsedAt: new Date().toISOString(),
  };

  if (mode === 'demo') {
    const compiler = new DemoSurfaceCompiler(seed + 13000);
    const plan = compiler.compile({
      title: spec.title,
      problemStatement: spec.problemStatement,
      judgingCriteria: spec.judgingCriteria,
      technologies: spec.techStackHints,
      constraints: spec.constraints,
    });

    const collapse = new ComplexityCollapseEngine(seed + 16000);
    const complexityReport = collapse.analyzeGraph();
    const reductionPlan = collapse.generateReductionPlan();

    return {
      success: true,
      message: `Demo simulation complete — score ${plan.winScore}/100`,
      data: {
        demoSurfacePlan: {
          winScore: plan.winScore,
          wowMoment: plan.wowMoment,
          executionSteps: plan.executionSteps,
          deployTarget: plan.deployTarget,
        },
        complexity: {
          totalComplexityScore: complexityReport.totalComplexityScore,
          removableModules: complexityReport.removableModules,
          reductionRisk: reductionPlan.riskScore,
        },
      },
      traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
    };
  }

  const simEngine = new HackathonSimulationEngine(seed + 14000);
  const simResult = simEngine.simulate({
    devpost: spec,
    strategyMode: 'fast-win',
    seed,
  });

  const judge = new JudgeSimulator({ seed: seed + 15000 });
  const verdict = judge.evaluate({
    hasUI: simResult.winnerStrategy.hasUI,
    hasLiveDeploy: simResult.finalJudgeVerdict.breakdown.demoReliability >= 5,
    hasWowMoment: simResult.winnerStrategy.hasWowMoment,
    buildSuccess: simResult.failureTimeline.filter((f) => f.phase === 'build').length === 0,
    deploySuccess: simResult.failureTimeline.filter((f) => f.phase === 'deploy').length === 0,
    testPassRate: simResult.winnerStrategy.taskCount / Math.max(simResult.winnerStrategy.taskCount, 1),
    crashFree: simResult.failureTimeline.filter((f) => f.severity === 'critical').length === 0,
    taskCompleteness: 0, // Not measured in simulation
    mockAI: simResult.winnerStrategy.mockAI,
  });

  const riskLevel =
    verdict.total >= 75 && simResult.failureTimeline.length <= 2
      ? 'low'
      : verdict.total >= 50 && simResult.failureTimeline.length <= 5
        ? 'medium'
        : 'high';

  return {
    success: true,
    message: `Simulation complete — predicted score ${verdict.total}/100 (${riskLevel} risk)`,
    data: {
      simulation: {
        winnerStrategy: simResult.winnerStrategy.name,
        winnerMode: simResult.winnerStrategy.mode,
        predictedScore: simResult.finalJudgeVerdict.total,
        independentScore: verdict.total,
        riskLevel,
        failures: simResult.failureTimeline,
        repairs: simResult.repairTimeline,
        allScores: simResult.allScores,
      },
    },
    metrics: {
      score: verdict.total,
      failures: simResult.failureTimeline.length,
      repairs: simResult.repairTimeline.length,
    },
    traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
  };
}
