import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import { DecisionLogger } from '../../benchmarks/decision-trace.js';
import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function explainCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const projectId = args.positional[0];

  if (!projectId && !ctx.phase12orchestrator) {
    return { success: false, message: 'Usage: hackagent explain <projectId>' };
  }

  const report = ctx.phase12orchestrator?.getLastReport();
  const decisionLog = ctx.phase12orchestrator?.getLastReport()?.decisionTraces ?? [];

  // Try loading state for more context
  let state: Record<string, unknown> | null = null;
  if (projectId) {
    const statePath = path.resolve(ctx.stateDir, `${projectId}.state.json`);
    if (existsSync(statePath)) {
      try {
        state = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
      } catch {}
    }
  }

  console.log(`\n  Explain / Debug Mode${projectId ? `: ${projectId}` : ''}`);
  console.log(`  ${'='.repeat(50)}\n`);

  // Decision trace summary
  console.log('  Decision Traces:');
  console.log(`  Total decisions: ${decisionLog.length}`);
  if (decisionLog.length > 0) {
    const byAgent = new Map<string, number>();
    for (const d of decisionLog) {
      byAgent.set(d.agentRole, (byAgent.get(d.agentRole) ?? 0) + 1);
    }
    console.log('  By agent:');
    for (const [agent, count] of byAgent) {
      console.log(`    • ${agent}: ${count} decisions`);
    }
    console.log();

    // Show last 5 decisions
    console.log('  Recent decisions:');
    for (const d of decisionLog.slice(-5)) {
      console.log(
        `    [${d.traceId.slice(0, 8)}] ${d.agentRole}: ${d.action} — confidence ${((d.confidence ?? 0) * 100).toFixed(0)}%`,
      );
    }
    console.log();
  }

  // Strategy selection reasoning
  if (report) {
    console.log('  Strategy Competition:');
    console.log(`  Winner: ${report.strategyCompetition.winner.name}`);
    console.log(`  Reason: ${report.strategyCompetition.selectionReason.slice(0, 120)}`);
    console.log(`  Candidates: ${report.strategyCompetition.candidates.map((c) => c.name).join(', ')}`);
    console.log();

    console.log('  Agent Leaderboard:');
    for (const agent of report.strategyCompetition.agentLeaderboard) {
      console.log(`    ${agent.variant.padEnd(20)} ${(agent.score * 100).toFixed(1)}% (${agent.wins} wins)`);
    }
    console.log();

    console.log('  Reward Prediction:');
    console.log(`  Predicted: ${(report.rewardPrediction.predicted * 100).toFixed(1)}%`);
    console.log(`  Actual: ${(report.rewardPrediction.actual * 100).toFixed(1)}%`);
    console.log(`  Error: ${(report.rewardPrediction.error * 100).toFixed(1)}%`);
    console.log();

    console.log('  Failure Patterns:');
    for (const fp of report.failurePatternReport.slice(0, 5)) {
      console.log(`    [${fp.category}] ${fp.description.slice(0, 80)} (x${fp.frequency})`);
    }
    console.log();
  }

  // Project state summary
  if (state) {
    console.log('  Project State:');
    console.log(`  Phase: ${state.phase as string}`);
    console.log(`  GitHub: ${(state.gitHub as unknown)?.repoUrl ?? 'N/A'}`);
    console.log(`  Deploy URL: ${(state.deployment as unknown)?.url ?? 'N/A'}`);
    console.log(`  Builds: ${(state.buildHistory as unknown[])?.length ?? 0}`);
    console.log(`  Errors: ${(state.errors as string[])?.length ?? 0}`);
    console.log();
  }

  // Root cause analysis
  console.log('  Root Cause Analysis:');
  if (report?.failurePatternReport.length ?? 0 > 0) {
    const topFailures = (report?.failurePatternReport ?? []).slice(0, 3);
    for (const fp of topFailures) {
      console.log(`  • ${fp.category}: ${fp.description.slice(0, 80)} — occurred ${fp.frequency} times`);
      console.log(`    Suggested: Check ${fp.category} patterns in memory`);
    }
  } else if (state) {
    const errors = (state.errors as string[]) ?? [];
    if (errors.length > 0) {
      for (const e of errors.slice(0, 3)) {
        console.log(`  • ${e.slice(0, 100)}`);
      }
    } else {
      console.log('  No errors detected. Pipeline is healthy.');
    }
  } else {
    console.log('  No execution data available.');
  }
  console.log();

  return {
    success: true,
    message: `Explain analysis for ${projectId ?? 'active session'}`,
    data: {
      projectId,
      decisionCount: decisionLog.length,
      strategyWinner: report?.strategyCompetition.winner.name,
      topFailures: report?.failurePatternReport.slice(0, 3),
    },
    traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
  };
}
