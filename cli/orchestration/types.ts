/**
 * Shared types for the production orchestration layer.
 *
 * These types describe the shape of execution state, phases, tasks, and
 * checkpoints that an orchestrator coordinates. They are deliberately
 * decoupled from any specific business logic so that individual components
 * (planner, builder, validator, etc.) can be orchestrated uniformly.
 *
 * Borrowed architecture ideas (OpenManus / Automaton): shared context,
 * execution state, task scheduling, checkpoints, and structured events.
 */

export type OrchestratorPhase =
  | 'idle'
  | 'parsing'
  | 'requirements'
  | 'decomposition'
  | 'building'
  | 'testing'
  | 'deploying'
  | 'live_testing'
  | 'repairing'
  | 'complete'
  | 'failed';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskState {
  id: string;
  name: string;
  status: TaskStatus;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error: string | null;
  /** Arbitrary result produced by the task, for downstream stages. */
  result: unknown | null;
}

export interface FailureRecord {
  taskId: string | null;
  phase: OrchestratorPhase;
  error: string;
  at: number;
  /** Number of retry attempts made for this failure. */
  retries: number;
}

export interface Checkpoint {
  id: string;
  phase: OrchestratorPhase;
  timestamp: number;
  /** Opaque snapshot the orchestrator can resume from. */
  snapshot: unknown;
}

/**
 * Lightweight, in-memory execution state.
 *
 * The orchestrator owns this state and exposes it for inspection, progress
 * reporting, and checkpoint/resume. It contains NO business logic — only
 * state and transitions.
 */
export interface ExecutionState {
  phase: OrchestratorPhase;
  startedAt: number;
  updatedAt: number;
  currentTaskId: string | null;
  tasks: Record<string, TaskState>;
  failures: FailureRecord[];
  retries: number;
  /** 0..1 progress estimate derived from completed tasks. */
  progress: number;
  checkpoints: Checkpoint[];
  /** Free-form context shared across stages. */
  context: Record<string, unknown>;
}

export function createExecutionState(seed = 42): ExecutionState {
  return {
    phase: 'idle',
    startedAt: Date.now(),
    updatedAt: Date.now(),
    currentTaskId: null,
    tasks: {},
    failures: [],
    retries: 0,
    progress: 0,
    checkpoints: [],
    context: { seed },
  };
}
