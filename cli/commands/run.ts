import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
import { parseDevpostUrl, CompetitionIntelligence, WinningStrategyGenerator, HackathonPipelineOrchestrator } from '../devpost-parser.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { initializeProviders, getProviderInfo } from '../provider-init.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';
import {
  header, log, success, error, warn, info, dim, labeled, step, divider, Spinner,
  pipelineHeader, pipelineFooter, stageStart, stageDone, stageFail,
} from '../output.js';
import { formatError, printError } from '../errors.js';

export async function runCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const input = args.positional[0];
  if (!input) {
    printError(formatError(new Error('Usage: hackagent run <input> (devpost URL, file path, or text spec)')));
    return { success: false, message: 'Usage: hackagent run <input> (devpost URL, file path, or text spec)' };
  }

  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const dryRun = args.flags['dry-run'] === true || ctx.dryRun;
  const demoMode = args.flags.demo === true;

  pipelineHeader(demoMode ? 'Demo Surface Pipeline' : 'Full Pipeline');

  const t0 = Date.now();

  stageStart('Parsing input');
  let parsed: ParsedInput | null;
  try {
    parsed = await parseInput(input);
  } catch (err) {
    stageFail('Parsing input');
    const suggestion = formatError(err, 'Input parsing');
    printError(suggestion);
    return { success: false, message: suggestion.what };
  }
  if (!parsed) {
    stageFail('Parsing input', 'Cannot parse input');
    printError(formatError(new Error('Cannot parse input'), `Input: ${input}`));
    return { success: false, message: `Cannot parse input: ${input}` };
  }
  stageDone('Parsing input', Date.now() - t0);
  labeled('title', `"${parsed.title}"`);

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

  stageStart('Demo Surface Compilation');
  const compiler = new DemoSurfaceCompiler(seed + 13000);
  const plan = compiler.compile({
    title: parsed.title,
    problemStatement: parsed.problemStatement,
    judgingCriteria: parsed.judgingCriteria,
    technologies: parsed.recommendedStack,
    constraints: parsed.constraints,
  });
  ctx.demoSurfacePlan = plan;
  stageDone('Demo Surface Compilation', Date.now() - executionTime);
  labeled('win score', `${plan.winScore}/100`);
  labeled('wow moment', `${plan.wowMoment.type} (${plan.wowMoment.description.slice(0, 60)})`);
  labeled('steps', String(plan.executionSteps.length));

  if (dryRun) {
    pipelineFooter();
    divider();
    success('Demo Surface Plan (dry run)');
    labeled('Project', `"${parsed.title}"`);
    labeled('Win Score', `${plan.winScore}/100`);
    labeled('Steps', String(plan.executionSteps.length));
    labeled('Target', plan.deployTarget);
    info('Next: run `hag run <input>` without --dry-run to execute.');
    log('');
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
      metrics: { durationMs: Date.now() - executionTime, winScore: plan.winScore, steps: plan.executionSteps.length },
      traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
    };
  }

  stageStart('Simulation Preview');
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
  stageDone('Simulation Preview', Date.now() - executionTime);
  labeled('predicted winner', `"${simResult.winnerStrategy.name}"`);
  labeled('predicted score', `${simResult.finalJudgeVerdict.total}/100`);

  const finalOutput = compiler.produceFinalOutput(plan, plan.deployTarget);
  ctx.finalDemoOutput = finalOutput;

  pipelineFooter();

  divider();
  success('Demo Mode Complete');
  labeled('Project', `"${parsed.title}"`);
  labeled('Win Score', `${plan.winScore}/100`);
  labeled('Predicted Score', `${simResult.finalJudgeVerdict.total}/100`);
  labeled('Sim Failures', String(simResult.failureTimeline.length));
  labeled('Sim Repairs', String(simResult.repairTimeline.length));
  info('Next: run `hag run <input>` for the full pipeline.');
  log('');

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
    metrics: { durationMs: Date.now() - executionTime, winScore: plan.winScore, predictedScore: simResult.finalJudgeVerdict.total },
    traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
  };
}

async function runFullPipeline(
  ctx: CLIContext,
  parsed: ParsedInput,
  seed: number,
  dryRun: boolean,
): Promise<CLIResult> {
  const t0 = Date.now();
  const phase12 = new Phase12Orchestrator(seed, ctx.memory);
  ctx.phase12orchestrator = phase12;

  stageStart('Initializing LLM providers');
  let routerEngine: RouterEngine | null = null;
  try {
    const providerResult = initializeProviders();
    routerEngine = providerResult.router;
    stageDone('Initializing LLM providers', Date.now() - t0);
  } catch (err) {
    stageDone('Initializing LLM providers', Date.now() - t0);
    printError(formatError(err, 'LLM provider'));
    warn('Falling back to template-based generation (no LLM).\n');
  }

  stageStart('Running strategy competition');
  const strategyReport = await phase12.runProject({
    title: parsed.title,
    problemStatement: parsed.problemStatement,
    judgingCriteria: parsed.judgingCriteria,
    constraints: parsed.constraints,
    techStack: parsed.recommendedStack,
    preferredStack: parsed.recommendedStack,
  });
  stageDone('Running strategy competition', Date.now() - t0);
  labeled('winner', strategyReport.strategyCompetition.winner.name);
  labeled('candidates', String(strategyReport.strategyCompetition.candidates.length));
  labeled('predicted reward', `${(strategyReport.rewardPrediction.predicted * 100).toFixed(1)}%`);

  if (dryRun) {
    pipelineFooter();
    divider();
    success('Dry Run Complete');
    labeled('Project', `"${parsed.title}"`);
    labeled('Winner', strategyReport.strategyCompetition.winner.name);
    labeled('Candidates', String(strategyReport.strategyCompetition.candidates.length));
    labeled('Predicted Reward', `${(strategyReport.rewardPrediction.predicted * 100).toFixed(1)}%`);
    info('Next: run without --dry-run to execute the full pipeline.');
    log('');
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

  stageStart('Extracting requirements');
  const reqs = await internetOrch.extractRequirements(parsed);
  stageDone('Extracting requirements', Date.now() - t0);
  labeled('requirements', String(reqs.length));

  stageStart('Building TaskGraph');
  const executionPlan = await internetOrch.createExecutionPlan(parsed, reqs);
  const taskCount = executionPlan.taskGraph.getAllNodes().length;
  stageDone('Building TaskGraph', Date.now() - t0);
  labeled('tasks', String(taskCount));

  stageStart('Executing pipeline');

  const executionTime = Date.now();

  try {
    const result = await internetOrch.executeFullPipeline();
    const elapsed = Date.now() - executionTime;

    stageDone('Executing pipeline', Date.now() - t0);
    divider();

    stageStart('Running competition intelligence analysis');
    const intelligence = new CompetitionIntelligence();
    const competitionAnalysis = intelligence.analyze(parsed);
    stageDone('Competition intelligence', Date.now() - t0);
    labeled('criteria', String(competitionAnalysis.judgingCriteria.length));
    labeled('sponsor APIs', String(competitionAnalysis.sponsorAPIs.length));

    stageStart('Generating winning strategy');
    const strategyGenerator = new WinningStrategyGenerator();
    const winningStrategy = strategyGenerator.generate(competitionAnalysis);
    stageDone('Winning strategy', Date.now() - t0);
    labeled('estimated score', `${winningStrategy.estimatedJudgeScore}/100`);
    labeled('differentiators', String(winningStrategy.differentiators.length));

    // Initialize the full pipeline orchestrator with pre-computed analysis and strategy
    const orchestrator = new HackathonPipelineOrchestrator(seed);
    orchestrator.init(competitionAnalysis, winningStrategy);

  stageStart('Running post-project learning cycle');
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
    stageDone('Post-project learning', Date.now() - t0);
    info(`Memory: ${learningOutput.memorySummary.totalProjects} projects`);

    // Run the new pipeline stages: self-review, optimization, quality, report
    stageStart('Running self-review & optimization');
    const finalReport = orchestrator.completePipeline({
      features: result.uxResults?.map(u => u.journeyName) ?? ['Project scaffold', 'Core features', 'Deployment'],
      errors: result.errors,
      deployUrl: result.deployUrl,
      taskCount,
      buildSuccess: result.errors.length === 0,
      testPassRate: result.completionRate ?? 0.8,
      durationMs: elapsed,
    });
    stageDone('Self-review & optimization', Date.now() - t0);
    labeled('overall score', `${finalReport.judgeScorePrediction}/100`);
    labeled('review scores', `${finalReport.innovationScore}/${finalReport.technicalDepthScore}/${finalReport.feasibilityScore}/${finalReport.presentationScore}/${finalReport.completenessScore}/${finalReport.maintainabilityScore}/${finalReport.judgeAlignmentScore}`);
    labeled('improvements', String(finalReport.futureImprovements.length));

    pipelineFooter();

    const deployStatus = result.deployUrl ? result.deployUrl : 'not deployed';
    divider();
    success('Pipeline Complete');
    labeled('Project', `"${parsed.title}"`);
    labeled('Strategy', strategyReport.strategyCompetition.winner.name);
    labeled('Duration', formatDuration(elapsed));
    labeled('Tasks', String(taskCount));
    labeled('Errors', String(result.errors.length));
    labeled('Deploy', deployStatus);
    if (result.errors.length === 0) {
      info('Next: run `hag test <project-id>` to run browser tests');
    } else {
      info('Next: run `hag explain <project-id>` to review errors');
    }
    log('');

    return {
      success: true,
      message: `Pipeline completed for "${parsed.title}" — ${formatDuration(elapsed)}, ${taskCount} tasks`,
      data: {
        projectName,
        phase: result.phase,
        deployUrl: result.deployUrl,
        errors: result.errors.length,
        strategy: strategyReport.strategyCompetition.winner.name,
        predictedReward: strategyReport.rewardPrediction.predicted,
        memoryUpdated: learningOutput.memorySummary.totalProjects,
        competitionAnalysis: {
          criteriaCount: competitionAnalysis.judgingCriteria.length,
          sponsorAPIs: competitionAnalysis.sponsorAPIs.length,
          theme: competitionAnalysis.challenge.theme,
        },
        winningStrategy: {
          projectName: winningStrategy.projectName,
          estimatedScore: winningStrategy.estimatedJudgeScore,
          targetedCriteria: winningStrategy.targetedCriteria.map(c => c.name),
        },
        reviewScores: {
          innovation: finalReport.innovationScore,
          technicalDepth: finalReport.technicalDepthScore,
          feasibility: finalReport.feasibilityScore,
          presentation: finalReport.presentationScore,
          completeness: finalReport.completenessScore,
          maintainability: finalReport.maintainabilityScore,
          judgeAlignment: finalReport.judgeAlignmentScore,
          overall: finalReport.judgeScorePrediction,
        },
        futureImprovements: finalReport.futureImprovements,
      },
      metrics: {
        durationMs: elapsed,
        taskCount,
        errorCount: result.errors.length,
        judgeScorePrediction: finalReport.judgeScorePrediction,
      },
      traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
    };
} catch (err) {
     const elapsed = Date.now() - executionTime;
     const msg = err instanceof Error ? err.message : String(err);

     // Save execution snapshot for replay
     const snapshotsDir = path.resolve(ctx.dataDir, 'snapshots');
     if (!existsSync(snapshotsDir)) mkdirSync(snapshotsDir, { recursive: true });
     const traceId = createDeterministicUuid(seed, Date.now()).slice(0, 12);
     try {
       writeFileSync(
         path.resolve(snapshotsDir, `run-${traceId}.snapshot.json`),
         JSON.stringify({
           runId: traceId,
           masterSeed: seed,
           timestamp: new Date().toISOString(),
           project: projectName,
           status: 'failed',
           error: msg,
           elapsedMs: elapsed,
         }, null, 2),
       );
     } catch {}

     stageFail('Pipeline execution', msg);
     pipelineFooter();
     divider();
     printError(formatError(err, 'Pipeline'));
     info('Next: run `hag doctor` to check provider status.');
     log('');
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
      } catch (err) {
        throw new Error(`Failed to fetch Devpost URL: ${err instanceof Error ? err.message : String(err)}. Ensure the URL is a valid Devpost software page.`);
      }
    }
    // Non-Devpost URL — use as context
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
      throw new Error(`Cannot read file: ${input}. Check that the file exists and is readable.`);
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
