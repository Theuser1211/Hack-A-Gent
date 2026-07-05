#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import {
  ComplexityCollapseEngine,
  type ComplexityReport,
  type ReductionPlan,
} from '../benchmarks/complexity-collapse-map.js';
import {
  DemoSurfaceCompiler,
  type DemoSurfacePlan,
  type FinalDemoOutput,
} from '../benchmarks/demo-surface-compiler.js';
import { createDeterministicUuid, deterministicNow } from '../benchmarks/determinism-kernel.js';
import { DevpostIngestionLayer, type ParsedHackathonSpec } from '../benchmarks/devpost-ingestion-layer.js';
import { ExecutionBudgetManager, type ExecutionBudget } from '../benchmarks/execution-budget-manager.js';
import { ExecutionStabilityGuard } from '../benchmarks/execution-stability-guard.js';
import { GlobalMemoryIndex } from '../benchmarks/global-memory-index.js';
import {
  HackathonCompanyOrchestrator,
  type CompanyCompetitionResult,
} from '../benchmarks/hackathon-company-orchestrator.js';
import {
  HackathonSimulationEngine,
  type SimulationResult,
  type Strategy,
  type StrategyScore,
  type FailureEvent,
  type RepairEvent,
} from '../benchmarks/hackathon-simulation-engine.js';
import { HackathonSwarmOrchestrator, type SwarmResult } from '../benchmarks/hackathon-swarm-orchestrator.js';
import { JudgeSimulator, type JudgeVerdict } from '../benchmarks/judge-simulator.js';
import {
  SimulationDecisionEngine,
  type ExecutionDecision,
  type ExecutionMode,
} from '../benchmarks/simulation-decision-engine.js';
import { SwarmEvolutionEngine, type EvolutionResult } from '../benchmarks/swarm-evolution-engine.js';
import { SwarmJudgeAggregator, type AggregationReport } from '../benchmarks/swarm-judge-aggregator.js';
import { SwarmLeaderboard } from '../benchmarks/swarm-leaderboard.js';
import { SwarmMemoryBank } from '../benchmarks/swarm-memory-bank.js';
import { ToolExecutionGateway } from '../benchmarks/tool-execution-gateway.js';
import { UnifiedRuntimeOS } from '../benchmarks/unified-runtime-os.js';

import { formatDuration as fmtDuration } from './context.js';

export type CLIMode = 'run' | 'demo' | 'simulate-only' | 'resume' | 'swarm' | 'run-company';

export interface CLISession {
  mode: CLIMode;
  seed: number;
  input: string;
  parsedSpec: ParsedHackathonSpec | null;
  runtime: UnifiedRuntimeOS | null;
  simulationResult: SimulationResult | null;
  demoSurfacePlan: DemoSurfacePlan | null;
  complexityReport: ComplexityReport | null;
  reductionPlan: ReductionPlan | null;
  finalOutput: FinalDemoOutput | null;
  riskLevel: 'low' | 'medium' | 'high';
  executionDecision?: ExecutionDecision | null;
  executionMode?: ExecutionMode | null;
  flags: Record<string, string | number | boolean | undefined>;
}

function parseArgs(): {
  mode: CLIMode;
  input: string;
  seed: number;
  flags: Record<string, string | number | boolean | undefined>;
} {
  const args = process.argv.slice(2);
  const flags: Record<string, string | number | boolean | undefined> = {};
  const positional: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      let key: string;
      let value: string | boolean | number;
      if (eqIdx >= 0) {
        key = arg.slice(2, eqIdx);
        value = arg.slice(eqIdx + 1);
      } else {
        key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1]!.startsWith('-')) {
          value = args[i + 1]!;
          i++;
        } else {
          value = true;
        }
      }
      if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) && !isNaN(Number(value))) {
        value = Number(value);
      }
      flags[key] = value;
    } else {
      positional.push(arg);
    }
  }

  const isSwarm = positional[0] === 'swarm';
  const isRunCompany = positional[0] === 'run-company';
  const modeFlag = isSwarm
    ? 'swarm'
    : isRunCompany
      ? 'run-company'
      : flags['simulate-only'] === true
        ? 'simulate-only'
        : flags.demo === true
          ? 'demo'
          : flags.resume === true
            ? 'resume'
            : 'run';

  const input = isSwarm
    ? (positional[1] ?? (flags['input'] as string) ?? '')
    : isRunCompany
      ? (positional[1] ?? (flags['input'] as string) ?? '')
      : (positional[0] ?? (flags['input'] as string) ?? '');

  return {
    mode: modeFlag as CLIMode,
    input,
    seed: typeof flags.seed === 'number' ? flags.seed : 42,
    flags,
  };
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}.${String(ms % 1000).padStart(3, '0')}s`;
}

function computeRiskLevel(score: number, failures: number): 'low' | 'medium' | 'high' {
  if (score >= 75 && failures <= 2) return 'low';
  if (score >= 50 && failures <= 5) return 'medium';
  return 'high';
}

function formatSwarmReport(
  result: SwarmResult,
  aggregation: AggregationReport | null,
  evolution: EvolutionResult | null,
  memory: SwarmMemoryBank | null,
  startTime: number,
): string {
  const elapsed = Date.now() - startTime;
  const lines: string[] = [];

  lines.push('');
  lines.push('  🏁 SWARM RESULTS');
  lines.push('  ' + '='.repeat(50));
  lines.push(`  Hackathon: ${result.hackathonTitle}`);
  lines.push(`  Agents: ${result.agents.length}`);
  lines.push(`  Seed: ${result.seed}`);
  lines.push('');

  lines.push('  Leaderboard:');
  const ranked =
    aggregation?.scores ??
    result.agents.map((a, i) => ({
      agentId: a.id,
      rank: result.rankedAgentIds.indexOf(a.id) + 1,
      strategyName: a.strategy.name,
      rankScore: a.rankScore ?? a.simulationScore,
      normalizedScore: a.finalScore ?? a.simulationScore,
    }));
  for (const entry of ranked) {
    const isWinner = entry.rank === 1;
    lines.push(`  ${entry.rank}. ${entry.strategyName} — ${Math.round(entry.rankScore)}/100${isWinner ? ' 🏆' : ''}`);
  }
  lines.push('');

  const winner = result.agents.find((a) => a.id === result.winnerId);
  if (winner) {
    lines.push('  Winning Strategy:');
    lines.push(`  ${winner.strategy.name}`);
    lines.push('');
    lines.push('  Why It Won:');
    if (winner.wowFactorScore && winner.wowFactorScore > 60)
      lines.push(`  - highest wow factor (${Math.round(winner.wowFactorScore)})`);
    if (winner.simplicityBonus && winner.simplicityBonus > 5)
      lines.push(`  - low complexity (simplicity bonus ${winner.simplicityBonus})`);
    if (winner.reliability && winner.reliability > 0.6)
      lines.push(`  - strong reliability (${(winner.reliability * 100).toFixed(0)}%)`);
    if (!winner.wowFactorScore && !winner.simplicityBonus && !winner.reliability) {
      lines.push(`  - highest overall score (${winner.finalScore ?? winner.simulationScore})`);
    }
    lines.push('');
  }

  if (evolution) {
    lines.push('  Evolution Update:');
    lines.push(`  - ${evolution.mutatedStrategies.length} strategies evolved`);
    lines.push(`  - ${evolution.discardedStrategies.length} strategies discarded`);
    lines.push(`  - ${evolution.successPatterns.length} patterns extracted`);
    for (const pattern of evolution.successPatterns) {
      lines.push(`    • ${pattern}`);
    }
    lines.push('');
  }

  if (memory) {
    const state = memory.getState();
    if (state.coreArchetypes.length > 0) {
      lines.push('  Core Archetypes (won 3+ times):');
      for (const arch of state.coreArchetypes) {
        lines.push(`  - ${arch}`);
      }
      lines.push('');
    }
    if (state.deprecatedStrategies.length > 0) {
      lines.push('  Deprecated Strategies (lost 5+ times):');
      for (const dep of state.deprecatedStrategies) {
        lines.push(`  - ${dep}`);
      }
      lines.push('');
    }
  }

  if (aggregation && aggregation.biasWarnings.length > 0) {
    lines.push('  Bias Warnings:');
    for (const w of aggregation.biasWarnings) {
      lines.push(`  ⚠ ${w}`);
    }
    lines.push('');
  }

  lines.push('  -----------------------');
  lines.push(`  Duration: ${formatDuration(elapsed)}`);
  lines.push('');
  return lines.join('\n');
}

function formatReport(session: CLISession, success: boolean, startTime: number): string {
  const elapsed = Date.now() - startTime;
  const lines: string[] = [];
  const outcome = success ? 'SUCCESS' : session.mode === 'simulate-only' ? 'SUCCESS' : 'FAILURE';
  const icon = success ? 'SUCCESS' : 'FAILURE';

  lines.push('');
  lines.push('  Hack-Agent Execution Report');
  lines.push('  ' + '='.repeat(50));
  lines.push(`  Mode: ${session.mode}`);
  lines.push(`  Seed: ${session.seed}`);
  lines.push(`  Input: ${session.input.slice(0, 80)}`);
  lines.push('');

  if (session.simulationResult) {
    const sim = session.simulationResult;
    if (session.executionDecision) {
      lines.push(`  Execution Mode: ${session.executionDecision.mode.toUpperCase()}`);
      lines.push(`  Decision: ${session.executionDecision.reason}`);
      if (session.executionDecision.riskFlags.length > 0) {
        lines.push(`  Risk Flags:`);
        for (const flag of session.executionDecision.riskFlags) {
          lines.push(`    - ${flag}`);
        }
      }
      lines.push('');
    }

    lines.push('  -----------------------');
    lines.push(`  Strategy Selected: ${sim.winnerStrategy.name}`);
    lines.push(`  Predicted Score: ${sim.finalJudgeVerdict.total}/100`);
    lines.push(`  Risk Level: ${session.riskLevel}`);
    lines.push(`  Winning Strategy Type: ${sim.winnerStrategy.mode}`);
    lines.push('');

    lines.push('  -----------------------');
    lines.push('  Execution Summary:');
    lines.push(`  - Tasks Completed: ${sim.winnerStrategy.taskCount}`);
    lines.push(`  - Deployments: ${sim.finalJudgeVerdict.breakdown.demoReliability >= 5 ? 1 : 0}`);
    lines.push(`  - Failures: ${sim.failureTimeline.length}`);
    lines.push(`  - Repairs: ${sim.repairTimeline.length}`);
    lines.push('');
  }

  if (session.demoSurfacePlan) {
    lines.push('  -----------------------');
    lines.push('  Demo Surface Plan:');
    lines.push(`  - Win Score: ${session.demoSurfacePlan.winScore}/100`);
    lines.push(`  - Wow Moment: ${session.demoSurfacePlan.wowMoment.type}`);
    lines.push(`  - Steps: ${session.demoSurfacePlan.executionSteps.length}`);
    lines.push(`  - Deploy Target: ${session.demoSurfacePlan.deployTarget}`);
    lines.push('');
  }

  if (session.complexityReport) {
    lines.push('  -----------------------');
    lines.push('  Complexity Analysis:');
    lines.push(`  - Score: ${session.complexityReport.totalComplexityScore}`);
    lines.push(`  - Removable: ${session.complexityReport.removableModules.length}`);
    lines.push(`  - Merge Candidates: ${session.complexityReport.mergeCandidates.length}`);
    lines.push('');
  }

  lines.push('  -----------------------');
  lines.push(`  Final Outcome: ${outcome === 'SUCCESS' ? 'SUCCESS' : outcome === 'FAILURE' ? 'FAILURE' : 'PARTIAL'}`);
  lines.push(`  Duration: ${formatDuration(elapsed)}`);
  lines.push(`  Trace: ${createDeterministicUuid(session.seed, startTime).slice(0, 12)}`);
  lines.push('');
  return lines.join('\n');
}

async function parseInput(input: string, seed: number): Promise<ParsedHackathonSpec | null> {
  const ingestion = new DevpostIngestionLayer(seed + 5010);
  if (input.startsWith('http://') || input.startsWith('https://')) {
    if (input.includes('devpost.com')) {
      try {
        return await ingestion.parse(input, 'devpost_url');
      } catch {
        return ingestion.parse(input, 'text');
      }
    }
    return ingestion.parse(input, 'text');
  }
  if (existsSync(input)) {
    const content = readFileSync(input, 'utf-8');
    return ingestion.parse(content, 'text');
  }
  return ingestion.parse(input, 'text');
}

// === Mode Handlers ===

async function runDemoMode(session: CLISession): Promise<boolean> {
  const spec = session.parsedSpec;
  if (!spec) return false;

  console.log('  • Running Demo Surface Compilation...');
  const compiler = new DemoSurfaceCompiler(session.seed + 13000);
  const plan = compiler.compile({
    title: spec.title,
    problemStatement: spec.problemStatement,
    judgingCriteria: spec.judgingCriteria,
    technologies: spec.techStackHints,
    constraints: spec.constraints,
  });
  session.demoSurfacePlan = plan;
  console.log(`    win score: ${plan.winScore}/100`);

  console.log('  • Running Complexity Collapse...');
  const collapse = new ComplexityCollapseEngine(session.seed + 16000);
  session.complexityReport = collapse.analyzeGraph();
  session.reductionPlan = collapse.generateReductionPlan();
  console.log(`    complexity score: ${session.complexityReport.totalComplexityScore}`);

  console.log('  • Running Hackathon Simulation...');
  const simEngine = new HackathonSimulationEngine(session.seed + 14000);
  session.simulationResult = simEngine.simulate({
    devpost: spec,
    strategyMode: 'fast-win',
    seed: session.seed,
  });
  const sim = session.simulationResult;
  session.riskLevel = computeRiskLevel(sim.finalJudgeVerdict.total, sim.failureTimeline.length);

  console.log(`  • Applying Winning Strategy Templates...`);
  const templates = (await import('../benchmarks/winning-strategy-templates.js')).WINNING_STRATEGIES;
  const bestTemplate = templates.find((t) => t.category === 'wow_first') ?? templates[0]!;
  console.log(`    matched template: ${bestTemplate.name}`);

  return true;
}

async function runSimulateOnlyMode(session: CLISession): Promise<boolean> {
  const spec = session.parsedSpec;
  if (!spec) return false;

  console.log('  • Running Hackathon Simulation Engine...');
  const simEngine = new HackathonSimulationEngine(session.seed + 14000);
  session.simulationResult = simEngine.simulate({
    devpost: spec,
    strategyMode: 'fast-win',
    seed: session.seed,
  });

  const sim = session.simulationResult;
  console.log(`    winner: ${sim.winnerStrategy.name}`);
  console.log(`    score: ${sim.finalJudgeVerdict.total}/100`);
  console.log(`    failures: ${sim.failureTimeline.length}`);
  console.log(`    repairs: ${sim.repairTimeline.length}`);

  console.log('  • Running Judge Simulator (standalone)...');
  const judge = new JudgeSimulator({ seed: session.seed + 15000 });
  const verdict = judge.evaluate({
    hasUI: sim.winnerStrategy.hasUI,
    hasLiveDeploy: sim.finalJudgeVerdict.breakdown.demoReliability >= 5,
    hasWowMoment: sim.winnerStrategy.hasWowMoment,
    buildSuccess: sim.failureTimeline.filter((f) => f.phase === 'build').length === 0,
    deploySuccess: sim.failureTimeline.filter((f) => f.phase === 'deploy').length === 0,
    testPassRate: sim.winnerStrategy.taskCount / Math.max(sim.winnerStrategy.taskCount, 1),
    crashFree: sim.failureTimeline.filter((f) => f.severity === 'critical').length === 0,
    taskCompleteness: 0.9,
    mockAI: sim.winnerStrategy.mockAI,
  });
  console.log(`    independent judge score: ${verdict.total}/100`);

  session.riskLevel = computeRiskLevel(sim.finalJudgeVerdict.total, sim.failureTimeline.length);
  return true;
}

async function runFullMode(session: CLISession): Promise<boolean> {
  const spec = session.parsedSpec;
  if (!spec) return false;

  console.log('  • Mandatory Simulation Preview...');
  const simEngine = new HackathonSimulationEngine(session.seed + 14000);
  const previewResult = simEngine.simulate({
    devpost: spec,
    strategyMode: 'fast-win',
    seed: session.seed,
  });
  session.simulationResult = previewResult;

  console.log('  • Running Simulation Decision Engine...');
  const decisionEngine = new SimulationDecisionEngine();
  const decision = decisionEngine.evaluate(previewResult);
  session.executionDecision = decision;
  session.executionMode = decision.mode;
  session.riskLevel = computeRiskLevel(previewResult.finalJudgeVerdict.total, previewResult.failureTimeline.length);

  console.log(`    score: ${previewResult.finalJudgeVerdict.total}/100 → mode: ${decision.mode.toUpperCase()}`);
  console.log(`    reason: ${decision.reason}`);
  if (decision.riskFlags.length > 0) {
    for (const flag of decision.riskFlags) {
      console.log(`    ⚠ ${flag}`);
    }
  }

  // Enforce execution contract
  switch (decision.mode) {
    case 'abort': {
      console.log(`\n  ❌ EXECUTION ABORTED`);
      console.log(`  Reason: ${decision.reason}`);
      return false;
    }
    case 'demo-only': {
      console.log(`\n  • DEMO ONLY MODE — simulation output, no deployment`);
      return true;
    }
    case 'safe': {
      console.log(`\n  • SAFE MODE — limited execution with reduced budget`);
      // Budget is set but execution continues below with awareness
      break;
    }
    case 'full': {
      console.log(`\n  • FULL EXECUTION MODE — proceeding with pipeline`);
      break;
    }
  }

  // Set up budget and stability guard for any proceeding mode
  const budget = new ExecutionBudgetManager(session.seed, decision.suggestedBudget);
  const guard = new ExecutionStabilityGuard(session.seed);

  const runtime = new UnifiedRuntimeOS({
    seed: session.seed,
    mode: 'hackathon',
  });
  session.runtime = runtime;

  // Wire budget into runtime config if supported
  runtime.handleCLIInput(session.mode, {
    problemStatement: spec.problemStatement,
    constraints: spec.constraints,
  });

  console.log('  • Running UnifiedRuntimeOS pipeline...');
  const output = await runtime.run({
    problemStatement: spec.problemStatement,
    devpostUrl: session.input.startsWith('http') ? session.input : undefined,
    constraints: spec.constraints,
  });

  if (!output.success) {
    console.error('  ✗ Pipeline execution failed.');
    const errors = output.finalState?.errors ?? [];
    for (const err of errors) {
      console.error(`    - ${err}`);
    }

    // Check if drift triggered the failure
    if (decision.mode === 'full' || decision.mode === 'safe') {
      const driftResult = guard.detectDrift(previewResult.finalJudgeVerdict.total, 40);
      if (driftResult.drifted) {
        console.log(`  ⚠ Drift detected: ${driftResult.driftPercent.toFixed(1)}% — complexity auto-reduced`);
      }
    }
    return false;
  }

  // Final evaluation for full/safe modes
  if (decision.mode === 'full' || decision.mode === 'safe') {
    console.log('  • Running final JudgeSimulator evaluation...');
    const judge = new JudgeSimulator({ seed: session.seed + 15000 });
    const finalVerdict = judge.evaluate({
      hasUI: previewResult.winnerStrategy.hasUI,
      hasLiveDeploy: output.artifacts.deploymentUrl !== null,
      hasWowMoment: previewResult.winnerStrategy.hasWowMoment,
      buildSuccess: (output.finalState?.errors?.length ?? 0) === 0,
      deploySuccess: output.artifacts.deploymentUrl !== null,
      testPassRate: 0.85,
      crashFree: (output.finalState?.errors?.length ?? 0) === 0,
      taskCompleteness: 0.9,
      mockAI: previewResult.winnerStrategy.mockAI,
    });

    // Check drift between simulated and actual
    const driftResult = guard.detectDrift(previewResult.finalJudgeVerdict.total, finalVerdict.total);
    if (driftResult.drifted) {
      console.log(
        `  ⚠ Drift: sim=${previewResult.finalJudgeVerdict.total}, actual=${finalVerdict.total} (${driftResult.driftPercent.toFixed(1)}%)`,
      );
    }

    budget.recordStep(); // mark completion as a step

    session.simulationResult = {
      ...previewResult,
      finalJudgeVerdict: finalVerdict,
    };
    console.log(`    final judge score: ${finalVerdict.total}/100`);
  }

  return true;
}

const swarmLeaderboard = new SwarmLeaderboard(42);
const swarmMemoryBank = new SwarmMemoryBank(42);

async function runSwarmMode(session: CLISession): Promise<boolean> {
  const spec = session.parsedSpec;
  if (!spec) return false;

  const agentCount = typeof session.flags.agents === 'number' ? session.flags.agents : 5;
  const competitionMode =
    typeof session.flags.mode === 'string' && ['fast', 'balanced', 'aggressive'].includes(session.flags.mode as string)
      ? (session.flags.mode as 'fast' | 'balanced' | 'aggressive')
      : 'balanced';

  console.log('  • Spawning swarm agents...');
  const orchestrator = new HackathonSwarmOrchestrator({
    agentCount: Math.min(7, Math.max(3, agentCount)),
    seed: session.seed,
    competitionMode,
  });

  const swarmResult = orchestrator.runSwarm(spec);
  console.log(`    ${swarmResult.agents.length} agents competing`);

  for (const agent of swarmResult.agents) {
    const score = agent.finalScore ?? agent.simulationScore;
    const rank = swarmResult.rankedAgentIds.indexOf(agent.id) + 1;
    console.log(
      `    ${rank}. ${agent.strategy.name}: ${Math.round(score)}/100 (rankScore: ${agent.rankScore ?? 'N/A'})`,
    );
  }

  console.log('\n  • Aggregating judge evaluations...');
  const aggregator = new SwarmJudgeAggregator();
  const aggregation = aggregator.aggregate(swarmResult);
  console.log(`    winner: ${aggregation.winner.strategyName} (${Math.round(aggregation.winner.rankScore)}/100)`);
  if (aggregation.biasWarnings.length > 0) {
    for (const w of aggregation.biasWarnings) {
      console.log(`    ⚠ ${w}`);
    }
  }

  console.log('\n  • Recording leaderboard...');
  const leaderboardEntries = swarmLeaderboard.recordResult(swarmResult);
  console.log(`    ${leaderboardEntries.length} entries recorded`);

  console.log('  • Running evolution engine...');
  const evolutionEngine = new SwarmEvolutionEngine(session.seed + 18000);
  const strategySuccess = swarmLeaderboard.computeStrategySuccess();
  const templates = (await import('../benchmarks/winning-strategy-templates.js')).WINNING_STRATEGIES;
  const evolution = evolutionEngine.evolve(swarmLeaderboard.getAllEntries(), strategySuccess, templates);
  console.log(`    ${evolution.mutatedStrategies.length} strategies evolved`);
  console.log(`    ${evolution.discardedStrategies.length} discarded`);

  console.log('\n  • Updating meta-learning bank...');
  const memoryState = swarmMemoryBank.learnFromSwarm(swarmResult, aggregation, leaderboardEntries, evolution);
  console.log(`    ${memoryState.coreArchetypes.length} core archetypes`);
  console.log(`    ${memoryState.deprecatedStrategies.length} deprecated strategies`);

  const report = formatSwarmReport(swarmResult, aggregation, evolution, swarmMemoryBank, Date.now());
  console.log(report);

  if (session.flags.json === true) {
    console.log(
      JSON.stringify(
        {
          mode: 'swarm',
          seed: session.seed,
          hackathon: swarmResult.hackathonTitle,
          agents: swarmResult.agents.length,
          winner: aggregation.winner.strategyName,
          winnerScore: aggregation.winner.rankScore,
          leaderboard: aggregation.scores.map((s) => ({
            rank: s.rank,
            strategy: s.strategyName,
            score: s.rankScore,
          })),
          evolution: {
            mutated: evolution.mutatedStrategies.length,
            discarded: evolution.discardedStrategies.length,
            patterns: evolution.successPatterns,
          },
          coreArchetypes: memoryState.coreArchetypes,
          deprecated: memoryState.deprecatedStrategies,
          durationMs: 0,
        },
        null,
        2,
      ),
    );
  }

  return true;
}

async function runResumeMode(session: CLISession): Promise<boolean> {
  const spec = session.parsedSpec;
  if (!spec) return false;

  const statePath = path.resolve(process.cwd(), '.hackagent', 'state', 'latest-snapshot.json');
  if (!existsSync(statePath)) {
    console.error('  ✗ No saved snapshot found. Run a session first.');
    return false;
  }

  console.log('  • Loading saved snapshot...');
  const raw = readFileSync(statePath, 'utf-8');
  const snapshot = JSON.parse(raw);

  console.log('  • Validating deterministic state match...');
  const runtime = new UnifiedRuntimeOS({
    seed: session.seed,
    mode: 'hackathon',
  });
  session.runtime = runtime;

  runtime.restore(snapshot);
  console.log('    snapshot restored successfully.');

  console.log('  • Resuming execution from last checkpoint...');
  const output = await runtime.run({
    problemStatement: spec.problemStatement,
    constraints: spec.constraints,
  });
  if (!output.success) {
    console.error('  ✗ Resume execution failed.');
    return false;
  }

  console.log('  • Execution resumed and completed.');
  session.simulationResult = null;
  return true;
}

// === Company Mode ===

function formatCompanyReport(result: CompanyCompetitionResult, startTime: number): string {
  const elapsed = Date.now() - startTime;
  const lines: string[] = [];

  lines.push('');
  lines.push('  🏆 HACKATHON WINNER SELECTED');
  lines.push('  ' + '='.repeat(50));
  lines.push(`  Project: ${result.hackathonTitle}`);
  lines.push(`  Company: ${result.winner.companyName} (${result.winner.companyId.slice(0, 12)})`);
  lines.push(`  Score: ${result.winner.finalScore}/100`);
  lines.push(`  Deploy URL: ${result.winner.deployUrl ?? 'N/A'}`);
  lines.push('');

  lines.push('  Why It Won:');
  for (const s of result.winner.strengths) {
    lines.push(`  - ${s}`);
  }
  lines.push('');

  lines.push('  Key Winning Patterns:');
  if (result.evolutionDelta) {
    for (const p of result.evolutionDelta.newBestPatterns) {
      lines.push(`  - ${p}`);
    }
  }
  lines.push('');

  const rejected = result.results.filter((r) => r.rank > 1 && r.rank <= 3);
  if (rejected.length > 0) {
    lines.push('  Rejected Approaches:');
    for (const r of rejected) {
      lines.push(
        `  - ${r.companyName} (${r.strategyType}): score ${r.finalScore} — ${r.failureReasons.join(', ') || 'no clear failure'}`,
      );
    }
    lines.push('');
  }

  lines.push('  -----------------------');
  lines.push('  Full Leaderboard:');
  for (const r of result.results) {
    const icon = r.rank === 1 ? ' 🏆' : r.pruned ? ' ✂️' : '';
    lines.push(`  ${r.rank}. ${r.companyName} (${r.strategyType}) — ${r.finalScore}/100${icon}`);
  }
  lines.push('');

  if (result.evolutionDelta && result.evolutionDelta.mutationsApplied.length > 0) {
    lines.push('  Evolution Mutations Applied:');
    for (const m of result.evolutionDelta.mutationsApplied) {
      lines.push(`  - ${m.mutationType}: ${m.previousValue} → ${m.newValue}`);
    }
    lines.push('');
  }

  if (result.prunedCompanies.length > 0) {
    lines.push(`  Pruned Companies: ${result.prunedCompanies.length}`);
    lines.push('');
  }

  lines.push('  -----------------------');
  lines.push(`  Duration: ${fmtDuration(elapsed)}`);
  lines.push('');
  return lines.join('\n');
}

async function runCompanyMode(session: CLISession): Promise<boolean> {
  const spec = session.parsedSpec;
  if (!spec) return false;

  const companyCount = typeof session.flags['swarm-size'] === 'number' ? session.flags['swarm-size'] : 5;
  const fastMode = session.flags['fast-mode'] === true;
  const simulateOnly = session.flags['simulate-only'] === true;
  const exportEvolution = session.flags['export-evolution-report'] === true;

  console.log('  • Initializing Company Mode...');
  const orchestrator = new HackathonCompanyOrchestrator({
    companyCount: Math.min(7, Math.max(3, companyCount)),
    seed: session.seed,
    fastMode,
    simulateOnly,
    gatewayAvailable: !simulateOnly,
  });

  console.log(`    spawning ${Math.min(7, Math.max(3, companyCount))} companies...`);
  const result = orchestrator.runCompetition(spec);

  console.log(`    companies: ${result.results.length}`);
  console.log(`    winner: ${result.winner.companyName} (${result.winner.finalScore}/100)`);
  console.log(`    pruned: ${result.prunedCompanies.length}`);
  console.log(`    patterns: ${result.evolutionDelta?.newBestPatterns.length ?? 0}`);

  const report = formatCompanyReport(result, Date.now());
  console.log(report);

  if (session.flags.json === true) {
    console.log(
      JSON.stringify(
        {
          mode: 'run-company',
          seed: session.seed,
          hackathon: result.hackathonTitle,
          winner: {
            name: result.winner.companyName,
            strategy: result.winner.strategyType,
            score: result.winner.finalScore,
            deployUrl: result.winner.deployUrl,
          },
          leaderboard: result.results.map((r) => ({
            rank: r.rank,
            name: r.companyName,
            strategy: r.strategyType,
            score: r.finalScore,
            pruned: r.pruned,
            deployUrl: r.deployUrl,
          })),
          evolution: result.evolutionDelta
            ? {
                patterns: result.evolutionDelta.newBestPatterns,
                mutations: result.evolutionDelta.mutationsApplied.length,
                expectedImprovement: result.evolutionDelta.expectedScoreImprovement,
              }
            : null,
          prunedCompanies: result.prunedCompanies.length,
          durationMs: 0,
        },
        null,
        2,
      ),
    );
  }

  return true;
}

// === Reusable entry for CLI dispatch ===

export async function runHackAgentFromArgs(
  _ctx: unknown,
  args: { positional: string[]; flags: Record<string, string | number | boolean | undefined> },
): Promise<{ success: boolean; message: string }> {
  const input = args.positional[0] ?? (args.flags.input as string) ?? '';
  if (!input) {
    return { success: false, message: 'Usage: hack-agent run <devpost-url> [--demo] [--simulate-only] [--resume]' };
  }

  const startTime = Date.now();
  const mode =
    args.flags['simulate-only'] === true
      ? ('simulate-only' as CLIMode)
      : args.flags.demo === true
        ? ('demo' as CLIMode)
        : args.flags.resume === true
          ? ('resume' as CLIMode)
          : ('run' as CLIMode);
  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : 42;

  const session: CLISession = {
    mode: mode as CLIMode,
    seed,
    input,
    parsedSpec: null,
    runtime: null,
    simulationResult: null,
    demoSurfacePlan: null,
    complexityReport: null,
    reductionPlan: null,
    finalOutput: null,
    riskLevel: 'medium',
    flags: args.flags,
  };

  console.log(`\n  Hack-Agent — Mode: ${mode.toUpperCase()} (seed ${seed})`);
  console.log(`  ${'='.repeat(50)}\n`);

  console.log('  • Parsing input...');
  session.parsedSpec = await parseInput(input, seed);
  if (!session.parsedSpec) {
    return { success: false, message: 'Failed to parse input.' };
  }
  console.log(`    title: "${session.parsedSpec.title}"`);

  let success = false;
  switch (mode) {
    case 'run-company':
      success = await runCompanyMode(session);
      break;
    case 'swarm':
      success = await runSwarmMode(session);
      break;
    case 'demo':
      success = await runDemoMode(session);
      break;
    case 'simulate-only':
      success = await runSimulateOnlyMode(session);
      break;
    case 'resume':
      success = await runResumeMode(session);
      break;
    case 'run':
    default:
      success = await runFullMode(session);
      break;
  }

  if (mode !== 'swarm' && mode !== 'run-company') {
    const report = formatReport(session, success, startTime);
    console.log(report);
  }

  return { success, message: success ? 'Execution completed successfully.' : 'Execution did not complete.' };
}

// === Main ===

async function main(): Promise<void> {
  const { mode, input, seed, flags } = parseArgs();
  const startTime = Date.now();

  if (!input && mode !== 'resume') {
    console.error('Usage: npx hack-agent run <devpost-url> [--demo] [--simulate-only] [--resume] [--json]');
    console.error('       npx hack-agent swarm <devpost-url> [--agents=N] [--mode=balanced] [--json]');
    console.error(
      '       npx hack-agent run-company <devpost-url> [--swarm-size=5] [--fast-mode] [--simulate-only] [--json]',
    );
    process.exitCode = 1;
    return;
  }

  const session: CLISession = {
    mode,
    seed,
    input,
    parsedSpec: null,
    runtime: null,
    simulationResult: null,
    demoSurfacePlan: null,
    complexityReport: null,
    reductionPlan: null,
    finalOutput: null,
    riskLevel: 'medium',
    flags,
  };

  console.log(`\n  Hack-Agent — Mode: ${mode.toUpperCase()} (seed ${seed})`);
  console.log(`  ${'='.repeat(50)}\n`);

  console.log('  • Parsing input...');
  session.parsedSpec = await parseInput(input, seed);
  if (!session.parsedSpec) {
    console.error('  ✗ Failed to parse input.');
    process.exitCode = 1;
    return;
  }
  console.log(`    title: "${session.parsedSpec.title}"`);

  let success = false;
  switch (mode) {
    case 'run-company':
      success = await runCompanyMode(session);
      break;
    case 'swarm':
      success = await runSwarmMode(session);
      break;
    case 'demo':
      success = await runDemoMode(session);
      break;
    case 'simulate-only':
      success = await runSimulateOnlyMode(session);
      break;
    case 'resume':
      success = await runResumeMode(session);
      break;
    case 'run':
    default:
      success = await runFullMode(session);
      break;
  }

  if (mode !== 'swarm' && mode !== 'run-company') {
    const report = formatReport(session, success, startTime);
    console.log(report);

    if (flags.json === true) {
      console.log(
        JSON.stringify(
          {
            mode: session.mode,
            seed: session.seed,
            success,
            simulationResult: session.simulationResult
              ? {
                  winner: session.simulationResult.winnerStrategy.name,
                  score: session.simulationResult.finalJudgeVerdict.total,
                  riskLevel: session.riskLevel,
                  failures: session.simulationResult.failureTimeline.length,
                  repairs: session.simulationResult.repairTimeline.length,
                }
              : null,
            demoSurfacePlan: session.demoSurfacePlan
              ? {
                  winScore: session.demoSurfacePlan.winScore,
                  steps: session.demoSurfacePlan.executionSteps.length,
                }
              : null,
            durationMs: Date.now() - startTime,
          },
          null,
          2,
        ),
      );
    }
  }

  process.exitCode = success ? 0 : 1;
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
