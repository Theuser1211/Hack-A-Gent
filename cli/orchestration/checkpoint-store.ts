/**
 * Checkpoint Store (Part 3 — Execution Recovery).
 *
 * Provides durable, restartable execution. The orchestration layer produces
 * `ExecutionState` snapshots; this store persists them to disk so an
 * interrupted run (crash, network drop, Ctrl+C, provider outage) can be
 * resumed, rolled back to a prior checkpoint, or partially rerun.
 *
 * Each checkpoint is a self-contained JSON file keyed by run id + phase. The
 * store is append-friendly and never mutates a already-written checkpoint.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import type { Checkpoint, ExecutionState } from '../orchestration/types.js';

export interface PersistedCheckpoint extends Checkpoint {
  runId: string;
  /** Set when this checkpoint is superseded by a later one. */
  supersededBy?: string;
}

function checkpointDir(dataDir: string): string {
  return path.resolve(dataDir, 'checkpoints');
}

export class CheckpointStore {
  private readonly dir: string;

  constructor(private readonly dataDir: string) {
    this.dir = checkpointDir(dataDir);
  }

  /** Save a checkpoint. Returns its on-disk id. */
  save(runId: string, checkpoint: Checkpoint): string {
    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    const file = path.resolve(this.dir, `${runId}-${checkpoint.phase}.json`);
    const persisted: PersistedCheckpoint = { ...checkpoint, runId };
    writeFileSync(file, JSON.stringify(persisted, null, 2), 'utf-8');
    return file;
  }

  /** Persist a full execution state under a phase key. */
  saveState(runId: string, phase: ExecutionState['phase'], state: ExecutionState): string {
    const checkpoint: Checkpoint = {
      id: `${runId}-${phase}`,
      phase,
      timestamp: Date.now(),
      snapshot: state,
    };
    return this.save(runId, checkpoint);
  }

  /** Load the latest checkpoint for a run (highest phase progression). */
  loadLatest(runId: string): PersistedCheckpoint | null {
    const files = this.listFiles(runId);
    if (files.length === 0) return null;
    let latest: PersistedCheckpoint | null = null;
    for (const f of files) {
      const cp = JSON.parse(readFileSync(f, 'utf-8')) as PersistedCheckpoint;
      if (!latest || cp.timestamp > latest.timestamp) latest = cp;
    }
    return latest;
  }

  /** Load a checkpoint for a specific phase. */
  loadPhase(runId: string, phase: ExecutionState['phase']): PersistedCheckpoint | null {
    const file = path.resolve(this.dir, `${runId}-${phase}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf-8')) as PersistedCheckpoint;
  }

  /** Restore an `ExecutionState` from the latest checkpoint. */
  resumeState(runId: string): ExecutionState | null {
    const cp = this.loadLatest(runId);
    if (!cp) return null;
    const snap = cp.snapshot as ExecutionState;
    return snap && typeof snap === 'object' && 'phase' in snap ? snap : null;
  }

  listFiles(runId: string): string[] {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.startsWith(runId + '-') && f.endsWith('.json'))
      .map((f) => path.resolve(this.dir, f));
  }

  hasCheckpoint(runId: string): boolean {
    return this.listFiles(runId).length > 0;
  }
}
