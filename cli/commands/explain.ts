import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

import { DecisionLogger } from '../../benchmarks/decision-trace.js';
import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { log, dim } from '../output.js';

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

  log(`Explain / Debug Mode${projectId ? `: ${projectId}` : ''}`);
  dim('='.repeat(50));
  log('');

  // Decision trace summary
  log('Decision Traces:');
  if (decisionLog.length === 0) {
    const hasState = state !== null;
    log(`  No execution data available${hasState ? ' (decision traces not persisted in state file)' : ''}.`);
    log('  Run `hackagent run <input>` first to generate decision traces.\n');
  } else {
    log(`Total decisions: ${decisionLog.length}`);
    const byAgent = new Map<string, number>();
    for (const d of decisionLog) {
      byAgent.set(d.agentRole, (byAgent.get(d.agentRole) ?? 0) + 1);
    }
    log('By agent:');
    for (const [agent, count] of byAgent) {
      log(`  ${agent}: ${count} decisions`);
    }
    log('');

    // Show last 5 decisions
    log('Recent decisions:');
    for (const d of decisionLog.slice(-5)) {
      log(
        `[${d.traceId.slice(0, 8)}] ${d.agentRole}: ${d.action} — confidence N/A`,
      );
    }
    log('');
  }

  // Strategy selection reasoning
  if (report) {
    log('Strategy Competition:');
    log(`Winner: ${report.strategyCompetition.winner.name}`);
    log(`Reason: ${report.strategyCompetition.selectionReason.slice(0, 120)}`);
    log(`Candidates: ${report.strategyCompetition.candidates.map((c) => c.name).join(', ')}`);
    log('');

    log('Agent Leaderboard:');
    for (const agent of report.strategyCompetition.agentLeaderboard) {
      log(`  ${agent.variant.padEnd(20)} ${(agent.score * 100).toFixed(1)}% (${agent.wins} wins)`);
    }
    log('');

    log('Reward Prediction:');
    log(`Predicted: ${(report.rewardPrediction.predicted * 100).toFixed(1)}%`);
    log(`Actual: ${(report.rewardPrediction.actual * 100).toFixed(1)}%`);
    log(`Error: ${(report.rewardPrediction.error * 100).toFixed(1)}%`);
    log('');

    log('Failure Patterns:');
    for (const fp of report.failurePatternReport.slice(0, 5)) {
      log(`  [${fp.category}] ${fp.description.slice(0, 80)} (x${fp.frequency})`);
    }
    log('');
  }

  // Project state summary
  if (state) {
    const gh = state['gitHub'] as Record<string, unknown> | undefined;
    const dep = state['deployment'] as Record<string, unknown> | undefined;
    const builds = state['buildHistory'] as unknown[] | undefined;
    const errs = state['errors'] as string[] | undefined;
    log('Project State:');
    log(`Phase: ${String(state['phase'] ?? 'unknown')}`);
    log(`GitHub: ${gh?.['repoUrl'] ?? 'N/A'}`);
    log(`Deploy URL: ${dep?.['url'] ?? 'N/A'}`);
    log(`Builds: ${builds?.length ?? 0}`);
    log(`Errors: ${errs?.length ?? 0}`);
    log('');
  }

  // Root cause analysis
  log('Root Cause Analysis:');
  if (report?.failurePatternReport.length ?? 0 > 0) {
    const topFailures = (report?.failurePatternReport ?? []).slice(0, 3);
    for (const fp of topFailures) {
      log(`${fp.category}: ${fp.description.slice(0, 80)} — occurred ${fp.frequency} times`);
      log(`  Suggested: Check ${fp.category} patterns in memory`);
    }
  } else if (state) {
    const errors = (state['errors'] as string[] | undefined) ?? [];
    if (errors.length > 0) {
      for (const e of errors.slice(0, 3)) {
        log(`${e.slice(0, 100)}`);
      }
    } else {
      log('No errors detected. Pipeline is healthy.');
    }
  } else {
    log('No execution data available.');
  }
  log('');

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
