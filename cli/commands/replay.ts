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
import { log, dim, error as showError } from '../output.js';

export async function replayCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const runId = args.positional[0];
  const stepByStep = args.flags.step === true || args.flags['step-by-step'] === true;

  if (!runId) {
    // List available replay snapshots
    const snapshotsDir = path.resolve(ctx.dataDir, 'snapshots');
    if (!existsSync(snapshotsDir)) {
      return { success: true, message: 'No replay snapshots found.', data: { snapshots: [] } };
    }
    const files = readdirSync(snapshotsDir).filter((f) => f.endsWith('.snapshot.json'));
    return {
      success: true,
      message: `${files.length} snapshots available`,
      data: { snapshots: files.map((f) => f.replace('.snapshot.json', '')) },
    };
  }

  const snapshotPath = path.resolve(ctx.dataDir, 'snapshots', `${runId}.snapshot.json`);
  if (!existsSync(snapshotPath)) {
    return { success: false, message: `No snapshot found for run: ${runId}. Check hackagent data/snapshots/` };
  }

  log(`Replaying Run: ${runId}`);
  dim('='.repeat(50));
  log('');

  let snapshot;
  try {
    snapshot = JSON.parse(readFileSync(snapshotPath, 'utf-8'));
  } catch {
    return { success: false, message: `Failed to parse snapshot: ${runId}` };
  }

  const rng = getSeededRandom(snapshot.masterSeed ?? ctx.seed);

  if (stepByStep) {
    log('Step-by-step replay enabled');
    log('');
    if (snapshot.mutationSequence) {
      for (let i = 0; i < snapshot.mutationSequence.length; i++) {
        const entry = snapshot.mutationSequence[i]!;
        log(`Step ${i + 1}: ${entry.mutationType} on ${entry.moduleTarget}${entry.fileTarget ? `/${entry.fileTarget}` : ''}`);
        log(`  Intensity: ${entry.intensity}`);
        log('');
      }
    }
    log(`Total steps: ${snapshot.mutationSequence?.length ?? 0}`);
  } else {
    try {
      const replayResult = replayMutationSequence(snapshot);
      log('Replay completed successfully');
      log(`Mutations applied: ${replayResult.mutationSequence.length}`);
      log(`Original modules: ${replayResult.originalRepository.modules.length}`);
      log(`Final modules: ${replayResult.finalRepository.modules.length}`);
      log('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      showError(`Replay error: ${msg}`);
      return {
        success: false,
        message: `Replay failed: ${msg}`,
        traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
      };
    }
  }

  const elapsed = Date.now() - ctx.startTime;
  return {
    success: true,
    message: `Replay ${stepByStep ? '(step-by-step) ' : ''}completed for ${runId}`,
    data: { runId, steps: snapshot.mutationSequence?.length ?? 0 },
    metrics: { durationMs: elapsed },
    traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
  };
}

function readdirSync(dir: string): string[] {
  try {
    return fsReaddirSync(dir);
  } catch {
    return [];
  }
}
