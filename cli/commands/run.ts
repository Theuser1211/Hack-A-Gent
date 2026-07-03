import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import { ComplexityCollapseEngine } from '../../benchmarks/complexity-collapse-map.js';
import { DemoSurfaceCompiler } from '../../benchmarks/demo-surface-compiler.js';
import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { ParsedHackathonSpec } from '../../benchmarks/devpost-ingestion-layer.js';
import { HackathonSimulationEngine } from '../../benchmarks/hackathon-simulation-engine.js';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';
import { JudgeSimulator } from '../../benchmarks/judge-simulator.js';
import { Phase12Orchestrator } from '../../benchmarks/phase-12-orchestrator.js';
import { formatDuration } from '../context.js';
import { parseDevpostUrl } from '../devpost-parser.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { initializeProviders, getProviderInfo } from '../provider-init.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';

export async function runCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const input = args.positional[0];
  if (!input) {
    return { success: false, message: 'Usage: hackagent run <input> (devpost URL, file path, or text spec)' };
  }

  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const dryRun = args.flags['dry-run'] === true || ctx.dryRun;
  const demoMode = args.flags.demo === true;

  console.log(`\n  Hack-A-Gent — ${demoMode ? 'Demo Surface' : 'Full Pipeline'} Run (seed ${seed})`);
  console.log(`  ${'='.repeat(50)}\n`);

  console.log('  • Parsing input...');
  const parsed = await parseInput(input);
  if (!parsed) {
    return { success: false, message: `Cannot parse input: ${input}` };
  }
  console.log(`    title: "${parsed.title}"`);

  if (demoMode) {
    return runDemoSurfacePipeline(ctx, parsed, seed, dryRun);
  }

  return runFullPipeline(ctx, parsed, seed, dryRun);
}

async function runDemoSurfacePipeline(
  ctx: CLIContext,
  parsed: ParsedInput,
  seed: number,
  dryRun: boolean,
): Promise<CLIResult> {
  const executionTime = Date.now();

  console.log('  • Running Demo Surface Compilation...');
  const compiler = new DemoSurfaceCompiler(seed + 13000);
  const plan = compiler.compile({
    title: parsed.title,
    problemStatement: parsed.problemStatement,
    judgingCriteria: parsed.judgingCriteria,
    technologies: parsed.recommendedStack,
    constraints: parsed.constraints,
  });
  ctx.demoSurfacePlan = plan;
  console.log(`    win score: ${plan.winScore}/100`);
  console.log(`    wow moment: ${plan.wowMoment.type} (${plan.wowMoment.description.slice(0, 60)})`);
  console.log(`    execution steps: ${plan.executionSteps.length}`);
  console.log(`    deploy target: ${plan.deployTarget}`);

  const wowValidation = compiler.validateWowMoment();
  if (!wowValidation.valid) {
    console.log(`  ⚠ Wow moment issue: ${wowValidation.reason}`);
    if (wowValidation.suggestion) console.log(`    suggestion: ${wowValidation.suggestion}`);
  }

  if (plan.winScore < 80) {
    console.log(`  ⚠ Win score below 80 threshold — pipeline simplification active`);
  }

  if (dryRun) {
    const elapsed = Date.now() - executionTime;
    return {
      success: true,
      message: `Demo surface plan generated (score ${plan.winScore}/100)`,
      data: {
        plan: {
          winScore: plan.winScore,
          wowMoment: plan.wowMoment,
          executionSteps: plan.executionSteps.length,
          deployTarget: plan.deployTarget,
          winScoreBreakdown: plan.winScoreBreakdown,
          criticalPath: plan.criticalPath,
        },
      },
      metrics: { durationMs: elapsed, winScore: plan.winScore, steps: plan.executionSteps.length },
      traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
    };
  }

  console.log('  • Running Simulation Preview...');
  const simEngine = new HackathonSimulationEngine(seed + 14000);
  const simResult = simEngine.simulate({
    devpost: {
      specId: 'sim-' + createDeterministicUuid(seed, 0).slice(0, 8),
      title: parsed.title,
      problemStatement: parsed.problemStatement,
      judgingCriteria: parsed.judgingCriteria,
      techStackHints: parsed.recommendedStack,
      constraints: parsed.constraints,
      implicitGoals: [],
      submissionRequirements: parsed.submissionRequirements,
      rawText: parsed.rawText,
      source: 'text',
      parsedAt: new Date().toISOString(),
    },
    strategyMode: 'fast-win',
    seed,
  });
  ctx.simulationResult = simResult;
  console.log(`    predicted winner: "${simResult.winnerStrategy.name}"`);
  console.log(`    predicted judge score: ${simResult.finalJudgeVerdict.total}/100`);
  console.log(`    failures: ${simResult.failureTimeline.length}, repairs: ${simResult.repairTimeline.length}`);
  console.log(
    `    recommendation: ${simResult.finalJudgeVerdict.total >= 75 ? '✓ proceed' : '⚡ optimize before building'}`,
  );

  const elapsed = Date.now() - executionTime;

  const finalOutput = compiler.produceFinalOutput(plan, plan.deployTarget);
  ctx.finalDemoOutput = finalOutput;

  return {
    success: true,
    message: `Demo mode complete for "${parsed.title}" — predicted score ${simResult.finalJudgeVerdict.total}/100`,
    data: {
      demoSurfacePlan: {
        winScore: plan.winScore,
        wowMoment: plan.wowMoment,
        executionSteps: plan.executionSteps,
        deployTarget: plan.deployTarget,
        finalOutput,
      },
      simulation: {
        winner: simResult.winnerStrategy.name,
        predictedScore: simResult.finalJudgeVerdict.total,
        failures: simResult.failureTimeline.length,
        repairs: simResult.repairTimeline.length,
      },
    },
    metrics: { durationMs: elapsed, winScore: plan.winScore, predictedScore: simResult.finalJudgeVerdict.total },
    traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
  };
}

async function runFullPipeline(
  ctx: CLIContext,
  parsed: ParsedInput,
  seed: number,
  dryRun: boolean,
): Promise<CLIResult> {
  const phase12 = new Phase12Orchestrator(seed);
  ctx.phase12orchestrator = phase12;

  console.log('  • Initializing LLM providers...');
  let routerEngine: RouterEngine | null = null;
  try {
    const providerResult = initializeProviders();
    routerEngine = providerResult.router;
    console.log(`    ${getProviderInfo(providerResult.config)}`);
  } catch (err) {
    console.log(`    LLM providers unavailable — using templates: ${err instanceof Error ? err.message : String(err)}`);
  }

  console.log('  • Running strategy competition...');
  const strategyReport = await phase12.runProject({
    title: parsed.title,
    problemStatement: parsed.problemStatement,
    judgingCriteria: parsed.judgingCriteria,
    constraints: parsed.constraints,
    techStack: parsed.recommendedStack,
    preferredStack: parsed.recommendedStack,
  });
  console.log(`    winner: ${strategyReport.strategyCompetition.winner.name}`);
  console.log(`    candidates: ${strategyReport.strategyCompetition.candidates.length}`);
  console.log(`    predicted reward: ${(strategyReport.rewardPrediction.predicted * 100).toFixed(1)}%`);

  if (dryRun) {
    return {
      success: true,
      message: 'Dry run complete. Strategy selected, no execution performed.',
      data: {
        strategy: strategyReport.strategyCompetition.winner,
        predictedReward: strategyReport.rewardPrediction.predicted,
      },
      traceId: strategyReport.decisionTraces[0]?.traceId,
    };
  }

  const projectName = parsed.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const internetOrch = new InternetHackathonOrchestrator(ctx.workspaceRoot, ctx.stateDir, seed, routerEngine ?? undefined);
  ctx.orchestrator = internetOrch;

  internetOrch.setDevpostData(parsed);
  console.log('  • Extracting requirements...');
  const reqs = await internetOrch.extractRequirements(parsed);
  console.log(`    requirements: ${reqs.length}`);
  console.log('  • Building TaskGraph...');
  const executionPlan = await internetOrch.createExecutionPlan(parsed, reqs);
  console.log(`    tasks: ${executionPlan.taskGraph.getAllNodes().length}`);

  console.log('  • Executing pipeline...');
  const executionTime = Date.now();

  try {
    const result = await internetOrch.executeFullPipeline();
    const elapsed = Date.now() - executionTime;

    console.log(`\n  ${'='.repeat(50)}`);
    console.log(`  Pipeline complete in ${formatDuration(elapsed)}`);
    console.log(`  Phase: ${result.phase}`);
    console.log(`  URL: ${result.deployUrl ?? 'N/A'}`);
    console.log(`  Errors: ${result.errors.length}`);

    console.log('  • Running post-project learning cycle...');
    const learningOutput = await phase12.runPostProject({
      projectName,
      projectDescription: parsed.problemStatement,
      strategy: strategyReport.strategyCompetition.winner.plan,
      techStack: parsed.recommendedStack,
      judgeCriteria: parsed.judgingCriteria,
      constraints: parsed.constraints,
      uxResults: result.uxResults ?? [],
      deploySuccess: result.deployUrl !== null,
      taskCompletionRate: result.completionRate ?? 0.8,
      errors: result.errors,
      failurePatterns: result.failurePatterns ?? [],
      judgeScore: result.judgeScore ?? 0.7,
      demoAvailable: result.deployUrl !== null,
    });
    console.log(`    memory updated: ${learningOutput.memorySummary.totalProjects} projects`);

    return {
      success: true,
      message: `Pipeline completed for "${parsed.title}"`,
      data: {
        projectName,
        phase: result.phase,
        deployUrl: result.deployUrl,
        errors: result.errors.length,
        strategy: strategyReport.strategyCompetition.winner.name,
        predictedReward: strategyReport.rewardPrediction.predicted,
        memoryUpdated: learningOutput.memorySummary.totalProjects,
      },
      metrics: {
        durationMs: elapsed,
        taskCount: executionPlan.taskGraph.getAllNodes().length,
        errorCount: result.errors.length,
      },
      traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
    };
  } catch (err) {
    const elapsed = Date.now() - executionTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Pipeline failed after ${formatDuration(elapsed)}: ${msg}`);
    return {
      success: false,
      message: `Pipeline failed: ${msg}`,
      data: { projectName, phase: internetOrch.getPhase(), errors: [msg] },
      metrics: { durationMs: elapsed },
      traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
    };
  }
}

export interface ParsedInput {
  title: string;
  problemStatement: string;
  judgingCriteria: string[];
  constraints: string[];
  recommendedStack: string[];
  rawText: string;
  submissionRequirements: string[];
}

export async function parseInput(input: string): Promise<ParsedInput | null> {
  if (input.startsWith('http://') || input.startsWith('https://')) {
    if (input.includes('devpost.com')) {
      try {
        return await parseDevpostUrl(input);
      } catch {}
    }
    return {
      title: `Project from ${input}`,
      problemStatement: `Build a solution based on ${input}`,
      judgingCriteria: ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
      constraints: ['12 hour limit'],
      recommendedStack: ['React', 'Node.js', 'Vercel'],
      rawText: input,
      submissionRequirements: [],
    };
  }

  if (existsSync(input)) {
    try {
      const content = readFileSync(input, 'utf-8');
      return {
        title: path.basename(input, path.extname(input)),
        problemStatement: content.slice(0, 2000),
        judgingCriteria: ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
        constraints: ['12 hour limit'],
        recommendedStack: ['React', 'Node.js', 'Vercel'],
        rawText: content,
        submissionRequirements: [],
      };
    } catch {
      return null;
    }
  }

  return {
    title: input.length > 60 ? input.slice(0, 60) + '...' : input,
    problemStatement: input.slice(0, 2000),
    judgingCriteria: ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
    constraints: ['12 hour limit'],
    recommendedStack: ['React', 'Node.js', 'Vercel'],
    rawText: input,
    submissionRequirements: [],
  };
}
