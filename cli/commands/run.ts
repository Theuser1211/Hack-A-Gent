import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid, deterministicNow, nextTraceCounter } from '../../benchmarks/determinism-kernel.js';
import { unknownField } from '../confidence.js';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';
import { evaluateProject, formatEvaluationResult } from '../../kernel/evaluation/real-evaluator.js';
import { recordFailure, updateRunStats, getPreventionStrategies, formatLearningSummary } from '../../kernel/learning/failure-tracker.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';
import { qualifyHackathon } from '../../kernel/qualification/hackathon-qualifier.js';
import { validateWithBrowser } from '../../kernel/validation/browser-validator.js';
import { formatDuration } from '../context.js';
import { parseDevpostUrl, normalizeUrl, WinningStrategyGenerator, HackathonPipelineOrchestrator } from '../devpost-parser.js';
import { CompetitionIntelligenceAgent } from '../agents/index.js';
import { DecisionStore } from '../decisions.js';
import { OrganizationalMemory } from '../learning/organizational-memory.js';
import { CheckpointStore } from '../orchestration/checkpoint-store.js';
import { formatError, printError } from '../errors.js';
import {
  log, success, error, warn, info, dim, labeled, divider, debug,
  pipelineHeader, pipelineFooter, stageStart, stageDone, stageFail,
  stageSkipped, stageRecovered, showReadiness,
  showCompletionScreen, showErrorSummary, color,
} from '../output.js';
import { SubmissionAssistant } from '../submission-assistant.js';
import { UserMemory } from '../user-memory.js';
import { initializeProviders } from '../provider-init.js';
import { resumeCommand } from './resume.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function runCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  if (args.flags.help === true) {
    return {
      success: true,
      message: `Usage: hackagent run <input> [options]

  Run the full hackathon pipeline.

  Arguments:
    <input>              Devpost URL, file path, or text spec

  Options:
    --seed <N>           Set deterministic seed (default: 42)
    --demo               Demo mode: compilation + simulation only
    --simulate-only      Simulation only: no execution/deploy
    --resume             Resume from saved snapshot
    --research           Use the experimental Phase12 research subsystem
    --json               Output raw JSON
    --quiet              Minimal output
    --verbose            Verbose logging
    --dry-run            Simulate without executing

  Examples:
    hackagent run https://devpost.com/software/example
    hackagent run spec.txt
    hackagent run "Build a chatbot"`,
    };
  }

  // --resume delegates to the same resume implementation as `hag resume`,
  // continuing an interrupted run from its saved state instead of restarting.
  // The project id may be given as a positional or as `--resume <id>`.
  if (args.flags.resume) {
    if (args.flags.resume === true && args.positional.length === 0) {
      return { success: false, message: 'Missing project ID for --resume. Usage: hackagent run --resume <project-id>' };
    }
    const resumeArgs: CLIArgs = args.positional.length > 0
      ? args
      : { ...args, positional: [String(args.flags.resume)] };
    return resumeCommand(ctx, resumeArgs);
  }

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

  // Qualification gate — check if this hackathon is viable before committing resources
  stageStart('Qualifying hackathon');
  const qualResult = qualifyHackathon({
    title: parsed.title,
    description: parsed.problemStatement,
    techStack: parsed.recommendedStack,
    judgingCriteria: parsed.judgingCriteria,
    constraints: parsed.constraints,
    sponsorAPIs: [], // Will be populated from Devpost if available
    deliverables: parsed.submissionRequirements,
  });
  stageDone('Qualifying hackathon', Date.now() - t0);

  const qualIcon = qualResult.status === 'SUPPORTED' ? '\u2713' :
                   qualResult.status === 'PARTIALLY_SUPPORTED' ? '\u25C9' : '\u2717';
  labeled('qualification', `${qualIcon} ${qualResult.status} (${Math.round(qualResult.confidence * 100)}%)`);

  if (qualResult.status === 'UNSUPPORTED') {
    const reasons = qualResult.unsupportedReasons.length > 0
      ? qualResult.unsupportedReasons.join('; ')
      : 'requirements are not supported';
    showErrorSummary({
      phase: 'Qualification',
      reason: `"${parsed.title}": ${reasons}`,
      fallback: qualResult.recommendedAction,
      fix: 'Consider a different hackathon or modify the project scope',
    });
    return {
      success: false,
      message: `Hackathon "${parsed.title}" is unsupported: ${qualResult.unsupportedRequirements.join(', ')}`,
      data: { qualification: qualResult },
    };
  }

  if (qualResult.partialRequirements.length > 0) {
    info(`Partial support: ${qualResult.partialRequirements.join(', ')} — using templates where needed`);
  }

  if (demoMode) {
    return runDemoSurfacePipeline(ctx, parsed, seed, dryRun);
  }

  return runFullPipeline(ctx, parsed, seed, dryRun, args);
}

async function runDemoSurfacePipeline(
  ctx: CLIContext,
  parsed: ParsedInput,
  seed: number,
  dryRun: boolean,
): Promise<CLIResult> {
  const executionTime = Date.now();

  stageStart('Demo Surface Compilation');
  const { DemoSurfaceCompiler } = await import('../../benchmarks/demo-surface-compiler.js');
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
      traceId: createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12),
    };
  }

  stageStart('Simulation Preview');
  const { HackathonSimulationEngine } = await import('../../benchmarks/hackathon-simulation-engine.js');
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

  const finalOutput = compiler.produceFinalOutput(plan, plan.deployTarget);
  ctx.finalDemoOutput = finalOutput;

  pipelineFooter();

  divider();
  showCompletionScreen({
    status: 'succeeded',
    project: `"${parsed.title}"`,
    duration: formatDuration(Date.now() - executionTime),
    details: [
      { label: 'Deploy Target', value: plan.deployTarget },
    ],
    nextSteps: [
      'Run `hag run <input>` for the full pipeline (build, test, deploy)',
    ],
  });

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
    traceId: createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12),
  };
}

async function runFullPipeline(
  ctx: CLIContext,
  parsed: ParsedInput,
  seed: number,
  dryRun: boolean,
  args: CLIArgs,
): Promise<CLIResult> {
  const t0 = Date.now();

  // Load user memory for recording preferences after run
  const userMemory = new UserMemory(ctx.dataDir);

  stageStart('Initializing LLM providers');
  let routerEngine: RouterEngine | null = null;
  try {
    const providerResult = initializeProviders();
    routerEngine = providerResult.router;
    // Record provider in user memory
    const providerName = providerResult.config?.provider;
    if (providerName) {
      userMemory.recordProvider(String(providerName));
    }
    stageDone('Initializing LLM providers', Date.now() - t0);
  } catch (err) {
    stageFail('Initializing LLM providers', `${Date.now() - t0}ms`);
    printError(formatError(err, 'LLM provider'));
    stageSkipped('LLM generation (no provider configured — using templates)');
  }

  // Generate the winning strategy from the competition analysis (production path).
  // --research runs the experimental Phase12 strategy-competition subsystem instead.
  const useResearch = args.flags.research === true || args.flags.experimental === true;
  let strategyReport: import('../../benchmarks/phase-12-orchestrator.js').Phase12Report | null = null;
  if (useResearch) {
    const { Phase12Orchestrator } = await import('../../benchmarks/phase-12-orchestrator.js');
    const phase12 = new Phase12Orchestrator(seed, ctx.memory);
    ctx.phase12orchestrator = phase12;
    stageStart('Running strategy competition (research)');
    strategyReport = await phase12.runProject({
      title: parsed.title,
      problemStatement: parsed.problemStatement,
      judgingCriteria: parsed.judgingCriteria,
      constraints: parsed.constraints,
      techStack: parsed.recommendedStack,
      preferredStack: parsed.recommendedStack,
    });
    stageDone('Running strategy competition (research)', Date.now() - t0);
    labeled('winner', strategyReport.strategyCompetition.winner.name);
    labeled('candidates', String(strategyReport.strategyCompetition.candidates.length));
  }

  stageStart('Generating winning strategy');
  const runId = createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12);
  const decisionStore = new DecisionStore(ctx.dataDir, runId);
  const memory = new OrganizationalMemory(ctx.dataDir);
  const checkpointStore = new CheckpointStore(ctx.dataDir);

  // M1 migration: Competition Intelligence now runs as a PipelineAgent.
  // The agent delegates to the same production engine, so the analysis is
  // behaviour-identical, but it also records autonomous decisions (Part 2)
  // and organizational learning (Part 4). Checkpoints enable recovery (Part 3).
  const intelligenceAgent = new CompetitionIntelligenceAgent();
  const intelResult = await intelligenceAgent.run({
    seed,
    inputs: { parsed, decisionStore, memory },
    scratch: {},
  });
  if (intelResult.status !== 'completed') {
    stageFail('Generating winning strategy', intelResult.summary);
    printError(formatError(new Error(intelResult.summary)));
    return { success: false, message: intelResult.summary };
  }
  const competitionAnalysis = (intelResult.output as { analysis: import('../pipeline/index.js').CompetitionAnalysis }).analysis;
  checkpointStore.saveState(runId, 'requirements', {
    phase: 'requirements',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    currentTaskId: 'competition-intelligence',
    tasks: {},
    failures: [],
    retries: 0,
    progress: 0.1,
    checkpoints: [],
    context: { analysisId: competitionAnalysis.analysisId },
  });
  const strategyGenerator = new WinningStrategyGenerator();
  const winningStrategy = strategyGenerator.generate(competitionAnalysis);
  stageDone('Winning strategy', Date.now() - t0);
  debug(`Strategy: ${winningStrategy.projectName}`);

  if (dryRun) {
    pipelineFooter();
    divider();
    success('Dry Run Complete');
    labeled('Project', `"${parsed.title}"`);
    labeled('Strategy', winningStrategy.projectName);
    labeled('Estimated Score', `${winningStrategy.estimatedJudgeScore}/100`);
    info('Next: run without --dry-run to execute the full pipeline.');
    log('');
    return {
      success: true,
      message: 'Dry run complete. Strategy selected, no execution performed.',
      data: {
        strategy: winningStrategy,
        predictedReward: undefined,
      },
      traceId: createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12),
    };
  }

  const projectName = parsed.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const internetOrch = new InternetHackathonOrchestrator(ctx.workspaceRoot, ctx.stateDir, seed, routerEngine ?? undefined);
  ctx.orchestrator = internetOrch;

  internetOrch.setDevpostData(parsed);

  stageStart('Planning project');
  const reqs = await internetOrch.extractRequirements(parsed);
  stageDone('Planning project', Date.now() - t0);

  stageStart('Generating code');
  const executionPlan = await internetOrch.createExecutionPlan(parsed, reqs);
  const taskCount = executionPlan.taskGraph.getAllNodes().length;
  // Pipeline execution happens within generation now

  const executionTime = Date.now();

  try {
    const result = await internetOrch.executeFullPipeline();
    const elapsed = Date.now() - executionTime;

    stageDone('Generating code', Date.now() - t0);

    const projectDir = path.resolve(ctx.workspaceRoot, projectName);

    stageStart('Validating project');
    const validation = await internetOrch.validateGeneratedProject(projectDir);

    if (!validation.valid) {
      stageFail('Validating project');
      log('');
      log('  Auto-repair:');

      const typecheckOk = internetOrch.typecheckAndRepair(projectDir);

      if (typecheckOk) {
        const revalidation = await internetOrch.validateGeneratedProject(projectDir);
        if (revalidation.valid) {
          validation.valid = true;
          const fixedCount = validation.errors.length;
          validation.errors = [];
          log(`  ${color('\u2713', 'green')} Fixed ${fixedCount} issue${fixedCount === 1 ? '' : 's'}`);
          stageRecovered('Validating project');
        } else {
          const fixedErrors = validation.errors.length;
          validation.errors = [...new Set([...validation.errors, ...revalidation.errors])];
          log(`  ${color('\u2713', 'green')} Fixed ${fixedErrors} issue${fixedErrors === 1 ? '' : 's'}`);
          log('');
          log('  Remaining blockers:');
          for (const err of revalidation.errors) {
            log(`  ${color('\u2022', 'red')} ${err}`);
          }
        }
      } else {
        log(`  ${color('\u2717', 'red')} Could not auto-repair`);
        log('');
        log('  Remaining blockers:');
        for (const err of validation.errors) {
          log(`  ${color('\u2022', 'red')} ${err}`);
        }
      }

      if (!validation.valid) {
        showCompletionScreen({
          status: 'failed',
          project: `"${parsed.title}"`,
          duration: formatDuration(Date.now() - t0),
          completedSteps: [
            'Hackathon parsed',
            'Project planned',
            'Code generated',
          ],
          blockedBy: validation.errors,
          details: [],
          nextSteps: [
            'Review the project with `hag explain <project-id>`',
            'Fix the remaining issues, then re-run `hag run`',
          ],
        });
        return {
          success: false,
          message: `Pipeline blocked by ${validation.errors.length} validation issue${validation.errors.length === 1 ? '' : 's'}`,
          data: { errors: validation.errors, validationChecks: validation.checks, projectName },
        };
      }
    } else {
      stageDone('Validating project', Date.now() - t0);
    }

    stageStart('Browser validation');
    await validateWithBrowser(projectDir, {
      port: 3099,
      timeout: 30000,
    });
    stageDone('Browser validation', Date.now() - t0);

    // Initialize the full pipeline orchestrator with pre-computed analysis and strategy
    const orchestrator = new HackathonPipelineOrchestrator(seed);
    orchestrator.init(competitionAnalysis, winningStrategy);

    // Post-project learning cycle — record real failures + update run stats.
    stageStart('Learning from build');
    if (useResearch && strategyReport) {
      // The experimental orchestrator is already initialized in the strategy stage.
      const learningOutput = await ctx.phase12orchestrator!.runPostProject({
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

    }
    updateRunStats(ctx.dataDir, validation.valid, result.judgeScore ?? 0);
    for (const err of result.errors) {
      recordFailure(ctx.dataDir, { errorType: 'unknown', errorMessage: err, projectName, phase: 'building' });
    }
    for (const err of validation.errors) {
      recordFailure(ctx.dataDir, { errorType: 'typescript', errorMessage: err, projectName, phase: 'testing' });
    }
    stageDone('Learning from build', Date.now() - t0);

    // Self-review, optimization, quality checks, report generation
    stageStart('Reviewing project');
    const finalReport = orchestrator.completePipeline({
      features: result.uxResults?.map(u => u.journeyName) ?? ['Project scaffold', 'Core features', 'Deployment'],
      errors: result.errors,
      deployUrl: result.deployUrl,
      taskCount,
      buildSuccess: validation.valid,
      testPassRate: result.completionRate ?? 0.8,
      durationMs: elapsed,
    });
    stageDone('Reviewing project', Date.now() - t0);

    // Run scaffolding generation (silent — only shows if files were actually needed)
    const generatedFiles = orchestrator.generateScaffolding(projectDir, args.flags.force === true);
    if (generatedFiles.length > 0) {
      debug(`Generated scaffolding: ${generatedFiles.map(g => g.file).join(', ')}`);
    }

    // Record pipeline benchmarks (silent)
    const benchmarkComparisons = orchestrator.benchmark(ctx.dataDir);

    // Real evaluation — analyze actual generated code
    stageStart('Evaluating project');
    const evalProjectDir = path.resolve(process.cwd(), projectName);
    let realEval = null;
    try {
      if (existsSync(evalProjectDir)) {
        realEval = evaluateProject(evalProjectDir);
        stageDone('Evaluating generated project');
        log(formatEvaluationResult(realEval));
      } else {
        stageDone('Evaluating generated project');
        info('Project directory not found — skipping real evaluation');
      }
    } catch (evalErr) {
      stageFail('Evaluating generated project');
      info(`Evaluation error: ${evalErr instanceof Error ? evalErr.message : String(evalErr)}`);
    }

    // Record run results for learning (single pass — uses real eval when available)
    const pipelineSuccess = realEval?.buildPasses ?? validation.valid;
    const pipelineScore = realEval?.totalScore ?? 0;
    updateRunStats(ctx.dataDir, pipelineSuccess, pipelineScore);

    // Submission readiness check
    stageStart('Checking submission');
    const submissionCheck = new SubmissionAssistant();
    const submissionReport = submissionCheck.assess({
      projectDir: existsSync(evalProjectDir) ? evalProjectDir : path.resolve(ctx.workspaceRoot, projectName),
      projectName,
      deployUrl: result.deployUrl,
      errors: result.errors,
      sponsorAPIs: competitionAnalysis.sponsorAPIs.map(s => s.name ?? String(s)),
      judgingCriteria: competitionAnalysis.judgingCriteria.map(c => c.name ?? String(c)),
      submissionRequirements: parsed.submissionRequirements,
      completedFeatures: result.uxResults?.map(u => u.journeyName) ?? [],
      pipelinePhase: result.phase,
    });
    stageDone('Checking submission');

    if (!submissionReport.ready) {
      showReadiness(submissionReport);
    }

    // Record run in user memory for future preference reuse
    userMemory.recordHackathon(projectName);
    userMemory.recordStack(winningStrategy.recommendedStack[0] ?? parsed.recommendedStack[0] ?? '');
    if (result.deployUrl && !result.deployUrl.includes('/mock/')) {
      userMemory.recordDeployTarget(result.deployUrl);
    }
    if (executionPlan.framework) {
      userMemory.recordFramework(executionPlan.framework);
    }

    const deployStatus = result.deployUrl ? result.deployUrl : 'not deployed';
    const hasRealDeploy = !!result.deployUrl && !result.deployUrl.includes('/mock/');

    const nextSteps: string[] = [];
    if (validation.valid) {
      nextSteps.push('Run `hag test <project-id>` to check the app in a browser');
    }
    if (!hasRealDeploy) {
      nextSteps.push('Deploy to Vercel/Netlify (set GITHUB_TOKEN and VERCEL_TOKEN in env)');
    }
    nextSteps.push('Review project directory and customize the code');
    nextSteps.push('Submit your project before the deadline');

    showCompletionScreen({
      status: validation.valid ? 'succeeded' : 'failed',
      project: `"${parsed.title}"`,
      duration: formatDuration(elapsed),
      completedSteps: [
        'Hackathon parsed',
        'Project planned',
        'Code generated',
        'Auto-repair attempted',
      ],
      blockedBy: validation.valid ? [] : validation.errors,
      details: [
        { label: 'Strategy', value: winningStrategy.projectName },
        ...(hasRealDeploy ? [{ label: 'Deploy', value: deployStatus }] : []),
        ...(!hasRealDeploy && result.deployUrl ? [{ label: 'Deploy', value: 'simulated (set tokens for real deploy)' }] : []),
      ],
      nextSteps,
    });

    // Persist decision traces + pipeline summary for explain/replay
    const tracesDir = path.resolve(ctx.dataDir, 'traces');
    if (!existsSync(tracesDir)) mkdirSync(tracesDir, { recursive: true });
    const traceId = createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12);
    try {
      writeFileSync(
        path.resolve(tracesDir, `${projectName}.trace.json`),
        JSON.stringify({
          runId: traceId,
          projectName,
          masterSeed: seed,
          timestamp: deterministicNow(seed),
          strategy: winningStrategy.projectName,
          phase: result.phase,
          deployUrl: result.deployUrl,
          errors: result.errors,
          taskCount,
          durationMs: elapsed,
          decisionTraces: useResearch && strategyReport ? strategyReport.decisionTraces : [],
          reviewScores: {
            innovation: finalReport.innovationScore,
            technicalDepth: finalReport.technicalDepthScore,
            feasibility: finalReport.feasibilityScore,
            presentation: finalReport.presentationScore,
            completeness: finalReport.completenessScore,
            maintainability: finalReport.maintainabilityScore,
            judgeAlignment: finalReport.judgeAlignmentScore,
          },
          qualityChecks: finalReport.qualityChecks.map(c => ({
            check: c.check,
            passed: c.passed,
            severity: c.severity,
          })),
          benchmarks: benchmarkComparisons.map(c => ({
            metric: c.metric,
            oldValue: c.oldValue,
            newValue: c.newValue,
            improvement: c.improvement,
          })),
        }, null, 2),
      );
    } catch (e) { dim(`Trace save error: ${e instanceof Error ? e.message : String(e)}`); }

    return {
      success: validation.valid,
      message: validation.valid
        ? `Pipeline completed for "${parsed.title}" — ${formatDuration(elapsed)}, ${taskCount} tasks`
        : `Pipeline failed for "${parsed.title}" — ${validation.errors.length} validation errors`,
      data: {
        projectName,
        phase: result.phase,
        deployUrl: result.deployUrl,
        errors: result.errors,
        validationErrors: validation.errors,
        validationChecks: validation.checks,
        strategy: winningStrategy.projectName,
        predictedReward: useResearch && strategyReport ? strategyReport.rewardPrediction.predicted : undefined,
        memoryUpdated: formatLearningSummary(ctx.dataDir).split('\n').find(l => l.includes('Total runs'))?.replace(/\D/g, '') ?? '0',
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
        realEvaluation: realEval ? {
          score: realEval.totalScore,
          maxScore: realEval.maxScore,
          buildPasses: realEval.buildPasses,
          hasTests: realEval.hasTests,
          typescriptFiles: realEval.typescriptFiles,
          componentCount: realEval.componentCount,
          dimensions: realEval.dimensions.map(d => ({
            name: d.name,
            score: d.score,
            maxScore: d.maxScore,
          })),
        } : null,
        futureImprovements: finalReport.futureImprovements,
        qualityChecks: finalReport.qualityChecks.map(c => ({
          check: c.check,
          passed: c.passed,
          severity: c.severity,
        })),
        benchmarks: benchmarkComparisons.map(c => ({
          metric: c.metric,
          improvement: c.improvement,
        })),
        learning: {
          preventionStrategies: 0,
          commonFailures: result.errors.length,
        },
      },
      metrics: {
        durationMs: elapsed,
        taskCount,
        errorCount: result.errors.length,
        judgeScorePrediction: finalReport.judgeScorePrediction,
      },
      traceId: createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12),
    };
} catch (err) {
     const elapsed = Date.now() - executionTime;
     const msg = err instanceof Error ? err.message : String(err);

     // Save execution snapshot for replay
     const snapshotsDir = path.resolve(ctx.dataDir, 'snapshots');
     if (!existsSync(snapshotsDir)) mkdirSync(snapshotsDir, { recursive: true });
     const traceId = createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12);
     try {
       writeFileSync(
         path.resolve(snapshotsDir, `run-${traceId}.snapshot.json`),
         JSON.stringify({
           runId: traceId,
           masterSeed: seed,
           timestamp: deterministicNow(seed),
           project: projectName,
           status: 'failed',
           error: msg,
           elapsedMs: elapsed,
         }, null, 2),
       );
    } catch (e) { dim(`Trace save error: ${e instanceof Error ? e.message : String(e)}`); }

     showErrorSummary({
       phase: 'Pipeline execution',
       reason: msg,
       fix: 'Run `hag doctor` to check provider status, then re-run with `hag run`',
     });
     return {
       success: false,
       message: `Pipeline failed: ${msg}`,
       data: { projectName, phase: internetOrch.getPhase(), errors: [msg] },
       metrics: { durationMs: elapsed },
       traceId: createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12),
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
  /** Confidence metadata — populated for Devpost URLs, unknown for other inputs. */
  confidence?: import('../pipeline/types.js').DevpostParseResult['confidence'];
}

function makeFallbackConfidence(): import('../pipeline/types.js').DevpostParseResult['confidence'] {
  return {
    title: unknownField(''),
    judgingCriteria: unknownField([]),
    deadlines: unknownField([]),
    sponsorAPIs: unknownField([]),
    organizer: unknownField(''),
    techStack: unknownField([]),
    restrictions: unknownField([]),
  };
}

export async function parseInput(input: string): Promise<ParsedInput | null> {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('No URL provided. Expected a web address like:\n  https://example.devpost.com');
  }

  // Try as Devpost URL — normalize bare hostname if needed
  const looksLikeDevpost = trimmed.includes('devpost.com');
  const hasScheme = /^https?:\/\//i.test(trimmed);
  const urlToTry = looksLikeDevpost && !hasScheme ? normalizeUrl(trimmed) : trimmed;

  if (urlToTry.includes('devpost.com')) {
    try {
      return await parseDevpostUrl(urlToTry);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to fetch Devpost URL: ${msg}`);
    }
  }

  // Non-Devpost URL — use as context
  if (/^https?:\/\//i.test(trimmed)) {
    return {
      title: `Project from ${input}`,
      problemStatement: `Build a solution based on ${input}`,
      judgingCriteria: ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
      constraints: ['12 hour limit'],
      recommendedStack: ['React', 'Node.js', 'Vercel'],
      rawText: input,
      submissionRequirements: [],
      confidence: makeFallbackConfidence(),
    };
  }

  const resolvedInput = path.resolve(input);
  if (resolvedInput.startsWith(path.resolve(process.cwd())) && existsSync(resolvedInput)) {
    try {
      const content = readFileSync(resolvedInput, 'utf-8');
      return {
        title: path.basename(input, path.extname(input)),
        problemStatement: content.slice(0, 2000),
        judgingCriteria: ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
        constraints: ['12 hour limit'],
        recommendedStack: ['React', 'Node.js', 'Vercel'],
        rawText: content,
        submissionRequirements: [],
        confidence: makeFallbackConfidence(),
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
    confidence: makeFallbackConfidence(),
  };
}
