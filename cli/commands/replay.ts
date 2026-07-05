import { readFileSync, existsSync, readdirSync as fsReaddirSync } from 'node:fs';
import * as path from 'node:path';

import { getSeededRandom, createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { ExperimentSnapshotBuilder } from '../../benchmarks/experiment-snapshot.js';
import {
  replayMutationSequence,
  compareResults,
  validateDeterministicEquality,
} from '../../benchmarks/replay-engine.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { log, dim, error as showError, labeled } from '../output.js';

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
}

export async function replayCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const runId = args.positional[0];
  const stepByStep = args.flags.step === true || args.flags['step-by-step'] === true;

  if (!runId) {
    // List available replay snapshots AND traces
    const snapshotsDir = path.resolve(ctx.dataDir, 'snapshots');
    const tracesDir = path.resolve(ctx.dataDir, 'traces');
    const snapshotFiles = existsSync(snapshotsDir)
      ? fsReaddirSync(snapshotsDir).filter((f) => f.endsWith('.snapshot.json'))
      : [];
    const traceFiles = existsSync(tracesDir)
      ? fsReaddirSync(tracesDir).filter((f) => f.endsWith('.trace.json'))
      : [];
    const items = [
      ...snapshotFiles.map(f => ({ type: 'snapshot', name: f.replace('.snapshot.json', '') })),
      ...traceFiles.map(f => ({ type: 'trace', name: f.replace('.trace.json', '') })),
    ];
    if (items.length === 0) {
      return { success: true, message: 'No replay data found.', data: { snapshots: [], traces: [] } };
    }
    return {
      success: true,
      message: `${items.length} replay items available (${snapshotFiles.length} snapshots, ${traceFiles.length} traces)`,
      data: { items, snapshots: snapshotFiles.map(f => f.replace('.snapshot.json', '')), traces: traceFiles.map(f => f.replace('.trace.json', '')) },
    };
  }

  // Try loading trace data first (richer context)
  const tracesDir = path.resolve(ctx.dataDir, 'traces');
  let trace: PersistedTrace | null = null;
  if (existsSync(tracesDir)) {
    const exactPath = path.resolve(tracesDir, `${runId}.trace.json`);
    if (existsSync(exactPath)) {
      try { trace = JSON.parse(readFileSync(exactPath, 'utf-8')) as PersistedTrace; } catch (e) { dim(`Trace parse error: ${e instanceof Error ? e.message : String(e)}`); }
    } else {
      const traceFiles = fsReaddirSync(tracesDir).filter(f => f.endsWith('.trace.json'));
      for (const f of traceFiles) {
        try {
          const data = JSON.parse(readFileSync(path.resolve(tracesDir, f), 'utf-8')) as PersistedTrace;
          if (data.runId === runId || data.projectName === runId || f.startsWith(runId)) {
            trace = data;
            break;
          }
        } catch { /* skip malformed trace files */ }
      }
    }
  }

  // Try loading snapshot data
  const snapshotPath = path.resolve(ctx.dataDir, 'snapshots', `${runId}.snapshot.json`);
  let snapshot: Record<string, unknown> | null = null;
  if (existsSync(snapshotPath)) {
    try { snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8')); } catch (e) { dim(`Snapshot parse error: ${e instanceof Error ? e.message : String(e)}`); }
  }

  if (!trace && !snapshot) {
    return { success: false, message: `No replay data found for: ${runId}. Run \`hag replay\` to list available items.` };
  }

  log(`Replaying Run: ${runId}`);
  dim('='.repeat(50));
  log('');

  // Show trace summary
  if (trace) {
    labeled('Project', trace.projectName);
    labeled('Strategy', trace.strategy);
    labeled('Phase', trace.phase);
    labeled('Deploy', trace.deployUrl ?? 'not deployed');
    labeled('Tasks', String(trace.taskCount));
    labeled('Errors', String(trace.errors.length));
    labeled('Duration', `${(trace.durationMs / 1000).toFixed(1)}s`);
    labeled('Seed', String(trace.masterSeed));
    labeled('Timestamp', trace.timestamp);
    log('');

    if (trace.decisionTraces.length > 0) {
      log(`Decision Traces: ${trace.decisionTraces.length} recorded`);
      const recent = trace.decisionTraces.slice(-5) as import('../../benchmarks/decision-trace.js').DecisionTrace[];
      for (const d of recent) {
        log(`  [${d.traceId?.slice(0, 8) ?? '?'}] ${d.agentRole}: ${d.action}`);
      }
      log('');
    }

    if (trace.errors.length > 0) {
      log('Errors:');
      for (const e of trace.errors.slice(0, 5)) {
        log(`  - ${e.slice(0, 100)}`);
      }
      log('');
    }

    const scores = trace.reviewScores;
    if (scores) {
      log('Review Scores:');
      labeled('Innovation', `${scores.innovation}/25`);
      labeled('Technical Depth', `${scores.technicalDepth}/20`);
      labeled('Feasibility', `${scores.feasibility}/15`);
      labeled('Presentation', `${scores.presentation}/15`);
      labeled('Completeness', `${scores.completeness}/15`);
      labeled('Maintainability', `${scores.maintainability}/10`);
      labeled('Judge Alignment', `${scores.judgeAlignment}/5`);
      log('');
    }
  }

  // Replay mutation sequence if snapshot available
  if (snapshot) {
    const rng = getSeededRandom((snapshot.masterSeed as number) ?? ctx.seed);

    if (stepByStep) {
      log('Step-by-step replay enabled');
      log('');
      if (snapshot.mutationSequence) {
        for (let i = 0; i < (snapshot.mutationSequence as unknown[]).length; i++) {
          const entry = (snapshot.mutationSequence as Record<string, unknown>[])[i]!;
          log(`Step ${i + 1}: ${entry.mutationType} on ${entry.moduleTarget}${entry.fileTarget ? `/${entry.fileTarget}` : ''}`);
          log(`  Intensity: ${entry.intensity}`);
          log('');
        }
      }
      log(`Total steps: ${(snapshot.mutationSequence as unknown[])?.length ?? 0}`);
    } else {
      try {
        const replayResult = replayMutationSequence(snapshot as unknown as Parameters<typeof replayMutationSequence>[0]);
        log('Mutation replay completed successfully');
        log(`Mutations applied: ${replayResult.mutationSequence.length}`);
        log(`Original modules: ${replayResult.originalRepository.modules.length}`);
        log(`Final modules: ${replayResult.finalRepository.modules.length}`);
        log('');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        showError(`Mutation replay error: ${msg}`);
      }
    }
  }

  const elapsed = Date.now() - ctx.startTime;
  return {
    success: true,
    message: `Replay completed for ${runId}`,
    data: { runId, hasTrace: !!trace, hasSnapshot: !!snapshot },
    metrics: { durationMs: elapsed },
    traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
  };
}
