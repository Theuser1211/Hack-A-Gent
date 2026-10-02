/**
 * ExecutionStateStore — owns and mutates ExecutionState.
 *
 * This is the single source of truth for an orchestrator's progress.
 * It exposes small, explicit transition methods (phase change, task
 * lifecycle, failure/retry recording, checkpointing) but contains no
 * domain/business logic. Components report outcomes here; the orchestrator
 * queries it for status, progress, and resume snapshots.
 */

import {
  createExecutionState,
  type Checkpoint,
  type ExecutionState,
  type FailureRecord,
  type OrchestratorPhase,
  type TaskState,
} from './types.js';

export class ExecutionStateStore {
  private state: ExecutionState;

  constructor(seed = 42) {
    this.state = createExecutionState(seed);
  }

  getState(): Readonly<ExecutionState> {
    return this.state;
  }

  setContext(key: string, value: unknown): void {
    this.state.context[key] = value;
    this.state.updatedAt = Date.now();
  }

  getContext<T = unknown>(key: string): T | undefined {
    return this.state.context[key] as T | undefined;
  }

  transitionPhase(phase: OrchestratorPhase): void {
    this.state.phase = phase;
    this.state.updatedAt = Date.now();
  }

  startTask(id: string, name: string): TaskState {
    const existing = this.state.tasks[id];
    const task: TaskState = {
      id,
      name,
      status: 'running',
      startedAt: existing?.startedAt ?? Date.now(),
      completedAt: null,
      durationMs: null,
      error: null,
      result: existing?.result ?? null,
    };
    this.state.tasks[id] = task;
    this.state.currentTaskId = id;
    this.state.updatedAt = Date.now();
    return task;
  }

  completeTask(id: string, result: unknown = null): TaskState {
    const task = this.requireTask(id);
    task.status = 'completed';
    task.completedAt = Date.now();
    task.durationMs = task.startedAt !== null ? Date.now() - task.startedAt : null;
    task.result = result;
    this.state.currentTaskId = null;
    this.recomputeProgress();
    this.state.updatedAt = Date.now();
    return task;
  }

  failTask(id: string, error: string): TaskState {
    const task = this.requireTask(id);
    task.status = 'failed';
    task.completedAt = Date.now();
    task.durationMs = task.startedAt !== null ? Date.now() - task.startedAt : null;
    task.error = error;
    this.state.currentTaskId = null;
    this.recomputeProgress();
    this.state.updatedAt = Date.now();
    return task;
  }

  skipTask(id: string): TaskState {
    const task = this.requireTask(id);
    task.status = 'skipped';
    this.state.updatedAt = Date.now();
    return task;
  }

  recordFailure(phase: OrchestratorPhase, error: string, taskId: string | null = null): FailureRecord {
    const record: FailureRecord = {
      taskId,
      phase,
      error,
      at: Date.now(),
      retries: this.state.retries,
    };
    this.state.failures.push(record);
    this.state.updatedAt = Date.now();
    return record;
  }

  recordRetry(): void {
    this.state.retries += 1;
    this.state.updatedAt = Date.now();
  }

  /**
   * Capture a checkpoint at the current phase. Returns the checkpoint so
   * callers can persist it (e.g. to disk for resume).
   */
  checkpoint(id: string, snapshot: unknown): Checkpoint {
    const cp: Checkpoint = {
      id,
      phase: this.state.phase,
      timestamp: Date.now(),
      snapshot,
    };
    this.state.checkpoints.push(cp);
    this.state.updatedAt = Date.now();
    return cp;
  }

  getLatestCheckpoint(): Checkpoint | null {
    return this.state.checkpoints.length > 0
      ? this.state.checkpoints[this.state.checkpoints.length - 1]!
      : null;
  }

  /** Replace the entire state (used when resuming from a snapshot). */
  hydrate(snapshot: ExecutionState): void {
    this.state = snapshot;
  }

  private requireTask(id: string): TaskState {
    const task = this.state.tasks[id];
    if (!task) {
      // Lazily register unknown tasks so callers can complete/fail directly.
      const created: TaskState = {
        id,
        name: id,
        status: 'pending',
        startedAt: Date.now(),
        completedAt: null,
        durationMs: null,
        error: null,
        result: null,
      };
      this.state.tasks[id] = created;
      return created;
    }
    return task;
  }

  private recomputeProgress(): void {
    const tasks = Object.values(this.state.tasks);
    if (tasks.length === 0) {
      this.state.progress = 0;
      return;
    }
    const done = tasks.filter((t) => t.status === 'completed' || t.status === 'skipped').length;
    this.state.progress = done / tasks.length;
  }
}
