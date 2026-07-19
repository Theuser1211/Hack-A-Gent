import { readFileSync, existsSync, readdirSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid, nextTraceCounter } from '../../benchmarks/determinism-kernel.js';
import { log, dim, warn, info, labeled } from '../output.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

interface PersistedTrace {
  runId: string;
  projectName: string;
  masterSeed: number;
  timestamp: string;
  strategy: string;
  phase: string;
  deployUrl: string | null;
  errors: string[];
  taskCount: number;
  durationMs: number;
  decisionTraces: unknown[];
  reviewScores: Record<string, number>;
  qualityChecks?: Array<{ check: string; passed: boolean; severity: string }>;
  benchmarks?: Array<{ metric: string; improvement: string }>;
}

export async function explainCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const projectId = args.positional[0];

  if (!projectId && !ctx.phase12orchestrator) {
    return { success: false, message: 'Usage: hackagent explain <projectId>' };
  }

  // Try to load persisted trace from disk
  let persistedTrace: PersistedTrace | null = null;
  const tracesDir = path.resolve(ctx.dataDir, 'traces');
  if (projectId && existsSync(tracesDir)) {
    if (projectId.includes('..')) {
      return { success: false, message: 'Invalid projectId: ".." not allowed.' };
    }
    const exactPath = path.resolve(tracesDir, `${projectId}.trace.json`);
    if (existsSync(exactPath)) {
      try { persistedTrace = JSON.parse(readFileSync(exactPath, 'utf-8')) as PersistedTrace; } catch (e) { dim(`Trace parse error: ${e instanceof Error ? e.message : String(e)}`); }
    } else {
      // Search for trace files matching the project name (case-insensitive, kebab-case normalized)
      let traceFiles: string[];
      try { traceFiles = readdirSync(tracesDir).filter(f => f.endsWith('.trace.json')); } catch { traceFiles = []; }
      const searchLower = projectId.toLowerCase();
      const searchKebab = projectId.toLowerCase().replace(/\s+/g, '-');
      for (const f of traceFiles) {
        try {
          const data = JSON.parse(readFileSync(path.resolve(tracesDir, f), 'utf-8')) as PersistedTrace;
          const fname = f.replace('.trace.json', '').toLowerCase();
          if (data.projectName?.toLowerCase() === searchLower || fname === searchKebab || fname.startsWith(searchKebab)) {
            persistedTrace = data;
            break;
          }
        } catch { /* skip malformed trace files */ }
      }
    }
  }

  const report = ctx.phase12orchestrator?.getLastReport();
  const inSessionDecisions = report?.decisionTraces ?? [];
  const persistedDecisions = (persistedTrace?.decisionTraces ?? []) as Array<{ traceId?: string; agentRole?: string; action?: string }>;
  const decisionLog = inSessionDecisions.length > 0 ? inSessionDecisions : persistedDecisions;

  // Try loading state for more context
  let state: Record<string, unknown> | null = null;
  if (projectId) {
    const statePath = path.resolve(ctx.stateDir, `${projectId}.state.json`);
    if (existsSync(statePath)) {
      try {
        state = JSON.parse(readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
      } catch { /* state file may be corrupt — continue without it */ }
    }
  }

  log(`Explain / Debug Mode${projectId ? `: ${projectId}` : ''}`);
  dim('='.repeat(50));
  log('');

  // Decision trace summary
  log('Decision Traces:');
  if (decisionLog.length === 0) {
    const hasState = state !== null;
    log(`  No execution data available${hasState ? ' (decision traces are not persisted in the state file)' : ''}.`);
    log('  Run `hackagent run <input>` first, then `hackagent explain <project-id>`.\n');
  } else {
    log(`Total decisions: ${decisionLog.length}`);
    const byAgent = new Map<string, number>();
    for (const d of decisionLog) {
      const role = (d as { agentRole?: string }).agentRole ?? 'unknown';
      byAgent.set(role, (byAgent.get(role) ?? 0) + 1);
    }
    log('By agent:');
    for (const [agent, count] of byAgent) {
      log(`  ${agent}: ${count} decisions`);
    }
    log('');

    log('Recent decisions:');
    for (const d of decisionLog.slice(-5)) {
      const dd = d as { traceId?: string; agentRole?: string; action?: string };
      const id = (dd.traceId ?? '').slice(0, 8);
      log(`  [${id || '--------'}] ${dd.agentRole ?? '?'}: ${dd.action ?? '?'}`);
    }
    log('');
  }

  // Persisted trace summary (from disk) — this is the source of truth for a
  // completed run and contains only real, measured values.
  if (persistedTrace) {
    log('Pipeline Run Summary (from saved trace):');
    labeled('Strategy', persistedTrace.strategy);
    labeled('Phase', persistedTrace.phase);
    labeled('Deploy', persistedTrace.deployUrl ?? 'not deployed');
    labeled('Tasks', String(persistedTrace.taskCount));
    labeled('Errors', String(persistedTrace.errors.length));
    labeled('Duration', `${(persistedTrace.durationMs / 1000).toFixed(1)}s`);
    labeled('Timestamp', persistedTrace.timestamp);
    log('');
    if (persistedTrace.errors.length > 0) {
      log('Errors:');
      for (const e of persistedTrace.errors.slice(0, 10)) {
        log(`  - ${e.slice(0, 140)}`);
      }
      log('');
    }
    const scores = persistedTrace.reviewScores;
    if (scores && Object.keys(scores).length > 0) {
      log('Self-Review Scores (0–100 scale):');
      labeled('Innovation', String(scores.innovation ?? 'n/a'));
      labeled('Technical Depth', String(scores.technicalDepth ?? 'n/a'));
      labeled('Feasibility', String(scores.feasibility ?? 'n/a'));
      labeled('Presentation', String(scores.presentation ?? 'n/a'));
      labeled('Completeness', String(scores.completeness ?? 'n/a'));
      labeled('Maintainability', String(scores.maintainability ?? 'n/a'));
      labeled('Judge Alignment', String(scores.judgeAlignment ?? 'n/a'));
      log('');
    }
    const checks = persistedTrace.qualityChecks;
    if (checks && checks.length > 0) {
      const passed = checks.filter(c => c.passed).length;
      log(`Quality Checks: ${passed}/${checks.length} passed`);
      for (const c of checks.filter(c => !c.passed).slice(0, 8)) {
        warn(`  ✗ ${c.check} (${c.severity})`);
      }
      log('');
    }
    const benchmarks = persistedTrace.benchmarks;
    if (benchmarks && benchmarks.length > 0) {
      log('Pipeline Benchmarks:');
      for (const b of benchmarks.slice(0, 8)) {
        info(`  ${b.metric}: ${b.improvement}`);
      }
      log('');
    }
  } else if (!projectId) {
    log('No saved trace found for this session. Run a pipeline first, then use `hackagent explain <project-id>`.\n');
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

  // Root cause analysis — driven by real errors, not simulated patterns.
  log('Root Cause Analysis:');
  const realErrors = persistedTrace?.errors ?? (state ? ((state['errors'] as string[] | undefined) ?? []) : []);
  if (realErrors.length > 0) {
    for (const e of realErrors.slice(0, 5)) {
      log(`  ${e.slice(0, 140)}`);
    }
    log('  Suggested: re-run `hackagent run <input>` after fixing the above, or inspect the generated project directly.');
  } else if (persistedTrace || state) {
    log('No errors recorded. Pipeline reached a healthy state.');
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
      strategyWinner: persistedTrace?.strategy ?? report?.strategyCompetition.winner.name,
      errors: realErrors.slice(0, 5),
    },
    traceId: createDeterministicUuid(ctx.seed, 0).slice(0, 12),
  };
}
