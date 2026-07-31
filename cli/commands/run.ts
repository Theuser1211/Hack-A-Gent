import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
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
import { generateQuestions, runInterview } from '../interview/index.js';
import type { InterviewResult } from '../interview/types.js';
import { adaptStrategyToGeneration, buildCodeGenContext } from '../pipeline/strategy-adapter.js';
import { validateRuntime } from '../pipeline/runtime-validation.js';
import { validateChallenge, type ChallengeValidationResult } from '../pipeline/challenge-validation.js';
import { validateStageInput } from '../pipeline/stage-guards.js';
import { planImprovements } from '../improvement/improvement-planner.js';
import { executeImprovement } from '../improvement/improvement-executor.js';
import type { JudgeResult, ImprovementAction } from '../improvement/improvement-types.js';
import { ImprovementInstrumentor, printImprovementSummary, computeProjectHash } from '../improvement/improvement-instrumentor.js';
import { generatePackage } from '../submission/package-generator.js';
import { checkReadiness } from '../submission/readiness-check.js';
import type { PipelineContext } from '../pipeline/types.js';
import { CompetitionIntelligenceAgent } from '../agents/index.js';
import { DecisionStore } from '../decisions.js';
import { OrganizationalMemory } from '../learning/organizational-memory.js';
import { CheckpointStore } from '../orchestration/checkpoint-store.js';
import { formatError, printError } from '../errors.js';
import {
  log, success, error, warn, info, dim, labeled, divider, debug,
  pipelineHeader, pipelineFooter, stageStart, stageDone, stageFail,
  stageSkipped, stageRecovered,
  showCompletionScreen, showErrorSummary, color,
} from '../output.js';

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
    --resume             Resume from saved snapshot
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

  // Pre-validation: reject invalid input before any LLM calls
  const { validateInput } = await import('../validation/input-validator.js');
  const inputValidation = validateInput(input);
  if (!inputValidation.valid) {
    stageFail('Input Validation');
    const errorMsg = inputValidation.error ?? `Invalid input: ${input}`;
    showErrorSummary({
      phase: 'Input Validation',
      reason: errorMsg,
      fix: 'Provide a valid Devpost URL, MLH URL, or hackathon page URL',
    });
    return { success: false, message: errorMsg };
  }
  labeled('input', `${inputValidation.urlType} (${inputValidation.state})`);

  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const dryRun = args.flags['dry-run'] === true || ctx.dryRun;

  pipelineHeader('Full Pipeline');

  const t0 = Date.now();

  stageStart('Challenge Analysis');
  let parsed: ParsedInput | null;
  try {
    parsed = await parseInput(input);
  } catch (err) {
    stageFail('Challenge Analysis');
    const suggestion = formatError(err, 'Input parsing');
    printError(suggestion);
    return { success: false, message: suggestion.what };
  }
  if (!parsed) {
    stageFail('Challenge Analysis', 'Cannot parse input');
    printError(formatError(new Error('Cannot parse input'), `Input: ${input}`));
    return { success: false, message: `Cannot parse input: ${input}` };
  }
  stageDone('Challenge Analysis', Date.now() - t0);
  labeled('title', `"${parsed.title}"`);

  // Qualification gate — internal check before committing resources
  const qualResult = qualifyHackathon({
    title: parsed.title,
    description: parsed.problemStatement,
    techStack: parsed.recommendedStack,
    judgingCriteria: parsed.judgingCriteria,
    constraints: parsed.constraints,
    sponsorAPIs: [],
    deliverables: parsed.submissionRequirements,
  });

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

  // Challenge Validation — verify parsed data comes from proper HTML sections
  const validation = parsed.rawText
    ? validateChallenge(parsed.rawText, parsed as Parameters<typeof validateChallenge>[1])
    : null;
  if (validation) {
    stageStart('Challenge Validation');
    for (const check of validation.checks) {
      if (check.passed) {
        debug(`${color('\u2713', 'green')} ${check.message}`);
      } else {
        warn(`${color('\u2717', 'red')} ${check.message}`);
      }
    }
    if (!validation.valid) {
      warn('Some validation checks failed — review warnings above. Pipeline continuing with best-effort.');
    }
    stageDone('Challenge Validation', Date.now() - t0);
  }

  return runFullPipeline(ctx, parsed, seed, dryRun, args, qualResult.status);
}

function walkImprovementFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string): void {
    try {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = path.join(d, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) results.push(full);
      }
    } catch { /* skip */ }
  }
  if (existsSync(dir)) walk(dir);
  return results;
}

async function runFullPipeline(
  ctx: CLIContext,
  parsed: ParsedInput,
  seed: number,
  dryRun: boolean,
  args: CLIArgs,
  qualificationStatus: string,
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

  stageStart('Winning Strategy');
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
    stageFail('Winning Strategy', intelResult.summary);
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
  // Run interactive interview to collect user preferences (only when LLM is online)
  let interviewResult: InterviewResult | null = null;
  if (routerEngine) {
    stageStart('Dynamic Interview');
    try {
      const questions = generateQuestions(competitionAnalysis);
      if (questions.length > 0) {
        interviewResult = await runInterview(questions, undefined, competitionAnalysis);
        if (interviewResult.autoGeneratedIdea) {
          dim(`Auto-generated idea: ${interviewResult.autoGeneratedIdea.slice(0, 80)}...`);
        }
      }
    } catch (err) {
      warn(`Interview skipped: ${err instanceof Error ? err.message : String(err)}`);
    }
    stageDone('Dynamic Interview', Date.now() - t0);
  }

  const strategyGenerator = new WinningStrategyGenerator();
  const winningStrategy = strategyGenerator.generate(competitionAnalysis, interviewResult ?? undefined);
  stageDone('Winning strategy', Date.now() - t0);
  debug(`Strategy: ${winningStrategy.projectName}`);

  // Build and inject code generation context from enriched strategy
  const codeGenCtx = buildCodeGenContext(competitionAnalysis, winningStrategy);

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
  internetOrch.setStrategyContext(codeGenCtx);
  internetOrch.setGenerationInput(adaptStrategyToGeneration(winningStrategy, interviewResult?.optimizationBudget));

  const reqs = await internetOrch.extractRequirements(parsed);

  // Pipeline guard: validate inputs before generation
  const genGuard = validateStageInput('ProjectGeneration', {
    projectName,
    title: parsed.title,
    qualification: qualificationStatus,
  });
  if (!genGuard.valid) {
    stageFail('Project Generation', genGuard.error);
    return { success: false, message: genGuard.error ?? 'Validation failed' };
  }

  stageStart('Project Generation');
  const executionPlan = await internetOrch.createExecutionPlan(parsed, reqs);
  const taskCount = executionPlan.taskGraph.getAllNodes().length;
  // Pipeline execution happens within generation now

  const executionTime = Date.now();

  try {
    const result = await internetOrch.executeFullPipeline();
    const elapsed = Date.now() - executionTime;

    stageDone('Project Generation', Date.now() - t0);

    const projectDir = path.resolve(ctx.workspaceRoot, projectName);

    // Auto Repair — attempt to fix TypeScript build errors
    stageStart('Auto Repair');
    let buildValid = true;
    const validation = await internetOrch.validateGeneratedProject(projectDir);
    if (!validation.valid) {
      log('');
      log('  Auto-repair:');
      const typecheckOk = internetOrch.typecheckAndRepair(projectDir);
      if (typecheckOk) {
        const revalidation = await internetOrch.validateGeneratedProject(projectDir);
        if (revalidation.valid) {
          const fixedCount = validation.errors.length;
          validation.valid = true;
          validation.errors = [];
          log(`  ${color('\u2713', 'green')} Fixed ${fixedCount} issue${fixedCount === 1 ? '' : 's'}`);
          stageDone('Auto Repair', Date.now() - t0);
        } else {
          const fixedErrors = validation.errors.length;
          validation.errors = [...new Set([...validation.errors, ...revalidation.errors])];
          log(`  ${color('\u2713', 'green')} Fixed ${fixedErrors} issue${fixedErrors === 1 ? '' : 's'}`);
          log('');
          log('  Remaining blockers:');
          for (const err of revalidation.errors) {
            log(`  ${color('\u2022', 'red')} ${err}`);
          }
          buildValid = false;
          stageFail('Auto Repair');
        }
      } else {
        log(`  ${color('\u2717', 'red')} Could not auto-repair`);
        log('');
        log('  Remaining blockers:');
        for (const err of validation.errors) {
          log(`  ${color('\u2022', 'red')} ${err}`);
        }
        buildValid = false;
        stageFail('Auto Repair');
      }

      if (!buildValid) {
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
          message: `Pipeline blocked by ${validation.errors.length} build issue${validation.errors.length === 1 ? '' : 's'}`,
          data: { errors: validation.errors, validationChecks: validation.checks, projectName },
        };
      }
    } else {
      stageDone('Auto Repair', Date.now() - t0);
    }

    // Runtime Validation — detect framework, start server, verify health
    stageStart('Runtime Validation');
    const rtResult = await validateRuntime(projectDir);
    if (rtResult.healthOk) {
      stageDone('Runtime Validation', Date.now() - t0);
    } else {
      warn(`Runtime validation: ${rtResult.error ?? 'unknown error'}`);
      stageDone('Runtime Validation', Date.now() - t0);
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

    // Post-project learning cycle — record failures + update run stats (internal)
    updateRunStats(ctx.dataDir, validation.valid, result.judgeScore ?? 0);
    for (const err of result.errors) {
      recordFailure(ctx.dataDir, { errorType: 'unknown', errorMessage: err, projectName, phase: 'building' });
    }
    for (const err of validation.errors) {
      recordFailure(ctx.dataDir, { errorType: 'typescript', errorMessage: err, projectName, phase: 'testing' });
    }

    // Self-review, optimization, quality checks, report generation
    stageStart('Internal Judge');
    const finalReport = orchestrator.completePipeline({
      features: result.uxResults?.map(u => u.journeyName) ?? ['Project scaffold', 'Core features', 'Deployment'],
      errors: result.errors,
      deployUrl: result.deployUrl,
      taskCount,
      buildSuccess: validation.valid,
      testPassRate: result.completionRate ?? 0.8,
      durationMs: elapsed,
    });
    stageDone('Internal Judge', Date.now() - t0);

    // Run scaffolding generation (silent — only shows if files were actually needed)
    const generatedFiles = orchestrator.generateScaffolding(projectDir, args.flags.force === true);
    if (generatedFiles.length > 0) {
      debug(`Generated scaffolding: ${generatedFiles.map(g => g.file).join(', ')}`);
    }

    // Record pipeline benchmarks (silent)
    const benchmarkComparisons = orchestrator.benchmark(ctx.dataDir);

    // Real evaluation — analyze actual generated code (silent, integrated into judge)
    const evalProjectDir = path.resolve(process.cwd(), projectName);
    let realEval = null;
    try {
      if (existsSync(evalProjectDir)) {
        realEval = evaluateProject(evalProjectDir);
      }
    } catch { /* evaluation is non-critical */ }

    // Pipeline guard: validate improvement pass inputs
    const improveGuard = validateStageInput('ImprovementPass', {
      projectName,
      currentScore: finalReport.judgeScorePrediction,
    });
    if (!improveGuard.valid) {
      warn(`Improvement Pass skipped: ${improveGuard.error}`);
    }

    // Improvement pass — feedback loop: Judge → Plan → Execute → Re-Judge
    const remainingMs = Date.now() - t0;
    stageStart('Improvement Pass');
    log('');
    dim('Improvement Pass');

    const improveStartMs = Date.now();
    const improveBudgetMs = Math.min(12 * 60 * 1000, Math.max(30_000, 600_000 - remainingMs));
    const ITER_BUDGET_MS = 3 * 60 * 1000;
    const MAX_ITERATIONS = 2;
    let initialJudgeScore = finalReport.judgeScorePrediction;
    let currentScore = initialJudgeScore;
    let improvedAction: ImprovementAction | null = null;
    const iterationScores: number[] = [];
    const instrumentor = new ImprovementInstrumentor(improveBudgetMs, ITER_BUDGET_MS);
    let lastBuildHash: string | null = null;
    let stopReason = 'completed';

    if (improveBudgetMs < 30_000) {
      debug(`Skipped Improvement Pass — only ${Math.round(improveBudgetMs / 1000)}s remaining`);
      stageDone('Improvement Pass', Date.now() - t0);
      stageSkipped('Improvement Pass');
    } else {
      try {
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          if (instrumentor.ranOutOfTime) {
            stopReason = 'time budget exhausted';
            break;
          }

          instrumentor.startIteration(iter + 1, currentScore);
          dim(`  Iteration ${iter + 1} / ${MAX_ITERATIONS}`);

          instrumentor.startSubStage('Generate critique');
          const actions = planImprovements({
            scores: {
              innovation: finalReport.innovationScore,
              technicalDepth: finalReport.technicalDepthScore,
              feasibility: finalReport.feasibilityScore,
              presentation: finalReport.presentationScore,
              completeness: finalReport.completenessScore,
              maintainability: finalReport.maintainabilityScore,
              judgeAlignment: finalReport.judgeAlignmentScore,
              overall: currentScore,
            },
            strengths: [],
            weaknesses: finalReport.knownWeaknesses,
          }, evalProjectDir);
          const sorted = actions.sort((a, b) => {
            const pOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
            return (pOrder[a.priority] ?? 99) - (pOrder[b.priority] ?? 99);
          });
          const action = sorted[0];
          if (!action) {
            instrumentor.endSubStage('skipped');
            instrumentor.skipSubStage('Generate fixes');
            instrumentor.skipSubStage('Apply patches');
            instrumentor.skipSubStage('Build');
            instrumentor.skipSubStage('Judge');
            log(`  Score improvement........0`);
            log(`  Decision: stop: no actions`);
            instrumentor.endIteration(currentScore, 'converged', 'no actions planned');
            break;
          }
          instrumentor.endSubStage();

          if (instrumentor.iterRanOutOfTime) {
            instrumentor.skipSubStage('Generate fixes');
            instrumentor.skipSubStage('Apply patches');
            instrumentor.skipSubStage('Build');
            instrumentor.skipSubStage('Judge');
            log(`  Score improvement........0`);
            log(`  Decision: stop: time budget exhausted`);
            instrumentor.endIteration(currentScore, 'timeout', 'iteration budget exhausted');
            break;
          }

          instrumentor.startSubStage('Generate fixes');
          const preSnapshot = new Map<string, string>();
          try {
            const files = walkImprovementFiles(evalProjectDir);
            for (const f of files) {
              try { preSnapshot.set(f, readFileSync(f, 'utf-8')); } catch { /* skip */ }
            }
          } catch { /* snapshot failed */ }
          const ok = await executeImprovement(action, evalProjectDir);
          if (!ok) {
            instrumentor.endSubStage('failed');
            instrumentor.skipSubStage('Apply patches');
            instrumentor.skipSubStage('Build');
            instrumentor.skipSubStage('Judge');
            log(`  Score improvement........0`);
            log(`  Decision: stop: execution failed`);
            instrumentor.endIteration(currentScore, 'failed', 'execution failed');
            continue;
          }
          instrumentor.endSubStage();

          if (instrumentor.iterRanOutOfTime) {
            instrumentor.skipSubStage('Apply patches');
            instrumentor.skipSubStage('Build');
            instrumentor.skipSubStage('Judge');
            log(`  Score improvement........0`);
            log(`  Decision: stop: time budget exhausted`);
            instrumentor.endIteration(currentScore, 'timeout', 'iteration budget exhausted');
            break;
          }

          instrumentor.startSubStage('Apply patches');
          let regressionsReverted = 0;
          const targetAbs = path.resolve(evalProjectDir, action.target);
          for (const [snapFile, snapContent] of preSnapshot) {
            if (snapFile === targetAbs) continue;
            try {
              const current = readFileSync(snapFile, 'utf-8');
              if (current !== snapContent) {
                writeFileSync(snapFile, snapContent, 'utf-8');
                regressionsReverted++;
              }
            } catch { /* skip */ }
          }
          instrumentor.endSubStage();

          if (instrumentor.iterRanOutOfTime) {
            instrumentor.skipSubStage('Build');
            instrumentor.skipSubStage('Judge');
            log(`  Score improvement........0`);
            log(`  Decision: stop: time budget exhausted`);
            instrumentor.endIteration(currentScore, 'timeout', 'iteration budget exhausted');
            break;
          }

          instrumentor.startSubStage('Build');
          const currentHash = computeProjectHash(evalProjectDir);
          let buildFailed = false;
          if (currentHash === lastBuildHash) {
            debug(`Build skipped — unchanged project hash ${currentHash}`);
          } else {
            try {
              const tscPath = path.join(evalProjectDir, 'node_modules', '.bin', 'tsc');
              if (existsSync(tscPath)) {
                const { execSync } = await import('node:child_process');
                execSync(`"${tscPath}" --noEmit 2>&1`, { cwd: evalProjectDir, stdio: 'pipe', timeout: 90_000, windowsHide: true });
              } else {
                debug(`TypeScript not found in project — skipping typecheck regression guard`);
              }
              lastBuildHash = currentHash;
            } catch {
              buildFailed = true;
              const snapContent = preSnapshot.get(targetAbs);
              if (snapContent !== undefined) {
                try { writeFileSync(targetAbs, snapContent, 'utf-8'); } catch { /* skip */ }
              }
            }
          }
          instrumentor.endSubStage(buildFailed ? 'failed' : 'completed');

          if (buildFailed) {
            instrumentor.skipSubStage('Judge');
            log(`  Score improvement........0`);
            log(`  Decision: stop: build failed`);
            instrumentor.endIteration(currentScore, 'failed', 'build failed after improvement');
            continue;
          }

          if (instrumentor.iterRanOutOfTime) {
            instrumentor.skipSubStage('Judge');
            log(`  Score improvement........0`);
            log(`  Decision: stop: time budget exhausted`);
            instrumentor.endIteration(currentScore, 'timeout', 'iteration budget exhausted');
            break;
          }

          instrumentor.startSubStage('Judge');
          const increase = action.expectedScoreIncrease;
          const projected = Math.min(100, currentScore + increase);
          currentScore = projected;
          iterationScores.push(currentScore);
          instrumentor.endSubStage();

          const scoreDelta = iterationScores.length >= 2 ? currentScore - iterationScores[iterationScores.length - 2]! : increase;
          const scoreStr = scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`;
          log(`  Score improvement........${scoreStr}`);
          improvedAction = action;

          const decision = instrumentor.shouldStop(scoreDelta, iter);
          const reasonMap: Record<string, string> = {
            continue: 'improving',
            converged: scoreDelta <= 0 && iter > 0 ? `plateau detected (delta ${scoreDelta})` : 'time budget exhausted',
            max_iterations: 'max iterations reached',
            timeout: 'time budget exhausted',
            failed: 'build failed',
          };
          stopReason = reasonMap[decision] ?? 'completed';
          const decisionStr = decision === 'continue' ? 'continue' : `stop: ${stopReason}`;
          log(`  Decision: ${decisionStr}`);
          instrumentor.endIteration(currentScore, decision, stopReason);

          if (decision !== 'continue') break;
        }
      } catch (improveErr) {
        stopReason = `error: ${improveErr instanceof Error ? improveErr.message : String(improveErr)}`;
        warn(`Improvement pass error: ${improveErr instanceof Error ? improveErr.message : String(improveErr)}`);
      }

      const improveTotalMs = Date.now() - improveStartMs;
      stageDone('Improvement Pass', Date.now() - t0);
      const improveSummary = instrumentor.buildSummary(initialJudgeScore, currentScore, stopReason);
      printImprovementSummary(improveSummary);
    }

    // Record run results for learning (single pass — uses real eval when available)
    const pipelineSuccess = realEval?.buildPasses ?? validation.valid;
    const pipelineScore = realEval?.totalScore ?? 0;
    updateRunStats(ctx.dataDir, pipelineSuccess, pipelineScore);

    // Submission package — generate submission docs + run readiness check
    stageStart('Submission Package');
    let generatedFiles2: Array<{ file: string; path: string }> = [];
    try {
      const pkgContext: PipelineContext = {
        seed,
        startedAt: t0,
        stages: {},
        analysis: competitionAnalysis,
        strategy: winningStrategy,
        executionResult: {
          features: result.uxResults?.map(u => u.journeyName) ?? ['Project scaffold', 'Core features', 'Deployment'],
          errors: result.errors,
          deployUrl: result.deployUrl,
          taskCount,
          buildSuccess: validation.valid,
          testPassRate: result.completionRate ?? 0.8,
          criteriaCount: competitionAnalysis.judgingCriteria.length,
          featureCount: result.uxResults?.length ?? 0,
          errorCount: result.errors.length,
          durationMs: elapsed,
        },
        reviewFeedback: null,
        feedbackConverged: true,
        feedbackIterations: 1,
        qualityChecks: finalReport.qualityChecks,
        report: finalReport,
      };
      const pkgResult = generatePackage(evalProjectDir, pkgContext);
      generatedFiles2 = pkgResult.files;
      for (const f of pkgResult.files) {
        debug(`Generated ${f.file} (${f.contentLength} bytes)`);
      }
      const readiness = checkReadiness(evalProjectDir);
      for (const c of readiness.checks) {
        if (c.status === 'fail') {
          warn(`${c.name}: ${c.message}`);
        } else if (c.status === 'warn') {
          info(`${c.name}: ${c.message}`);
        }
      }
      stageDone('Submission Package', Date.now() - t0);
    } catch (pkgErr) {
      stageDone('Submission Package', Date.now() - t0);
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
          decisionTraces: [],
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
        predictedReward: undefined,
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
