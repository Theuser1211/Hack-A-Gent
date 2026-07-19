/**
 * Pipeline orchestrator abstraction.
 *
 * The orchestrator coordinates work: it knows the current phase, the current
 * task, the task graph, failures, retries, progress, and checkpoints. It does
 * NOT contain business logic — individual components (planner, builder, tester,
 * etc.) perform the actual work and report outcomes back to the state store.
 *
 * This mirrors the OpenManus / Automaton orchestration model: a thin
 * coordinator over shared state + events, with components as pluggable units.
 */

import { ExecutionStateStore } from './execution-state.js';
import {
  OrchestrationEmitter,
  type OrchestratorEvent,
  type OrchestratorEventHandler,
  type OrchestratorEventType,
} from './events.js';
import type { ExecutionState, OrchestratorPhase } from './types.js';

export interface PipelineOrchestrator {
  /** Begin coordinated execution. */
  run(): Promise<void>;
  getPhase(): OrchestratorPhase;
  getState(): Readonly<ExecutionState>;
  /** Subscribe to orchestration events (phase/task/failure/checkpoint/log). */
  on(type: OrchestratorEventType | '*', handler: OrchestratorEventHandler): () => void;
  /** Capture a resume point. */
  checkpoint(id: string, snapshot: unknown): void;
  /** Restore from a previously captured snapshot. */
  resume(snapshot: ExecutionState): void;
}

/**
 * Base class providing the shared coordination substrate.
 *
 * Subclasses implement `run()` and call the protected helpers
 * (`beginPhase`, `withTask`, `recordFailure`, `captureCheckpoint`) to drive
 * state transitions and emit events. This keeps all orchestration bookkeeping
 * in one place and free of domain logic.
 */
export abstract class BaseOrchestrator implements PipelineOrchestrator {
  protected readonly state: ExecutionStateStore;
  protected readonly events: OrchestrationEmitter;

  constructor(seed = 42, emitter: OrchestrationEmitter = new OrchestrationEmitter()) {
    this.state = new ExecutionStateStore(seed);
    this.events = emitter;
  }

  abstract run(): Promise<void>;

  getPhase(): OrchestratorPhase {
    return this.state.getState().phase;
  }

  getState(): Readonly<ExecutionState> {
    return this.state.getState();
  }

  on(type: OrchestratorEventType | '*', handler: OrchestratorEventHandler): () => void {
    return this.events.on(type, handler);
  }

  checkpoint(id: string, snapshot: unknown): void {
    const cp = this.state.checkpoint(id, snapshot);
    void this.events.emit({ type: 'checkpoint.captured', phase: cp.phase, message: `checkpoint ${id}` });
  }

  resume(snapshot: ExecutionState): void {
    this.state.hydrate(snapshot);
  }

  protected async beginPhase(phase: OrchestratorPhase): Promise<void> {
    this.state.transitionPhase(phase);
    await this.events.emit({ type: 'phase.started', phase });
  }

  protected async endPhase(phase: OrchestratorPhase, failed = false): Promise<void> {
    await this.events.emit({
      type: failed ? 'phase.failed' : 'phase.completed',
      phase,
    });
  }

  /**
   * Run a unit of work as a tracked task. Failures are recorded and rethrown
   * after emitting a failure event, so the orchestrator keeps an accurate
   * state without swallowing errors.
   */
  protected async withTask<T>(
    id: string,
    name: string,
    work: () => Promise<T>,
  ): Promise<T> {
    this.state.startTask(id, name);
    await this.events.emit({ type: 'task.started', taskId: id, message: name });
    try {
      const result = await work();
      this.state.completeTask(id, result);
      await this.events.emit({ type: 'task.completed', taskId: id, payload: { result } });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.state.failTask(id, message);
      this.state.recordFailure(this.state.getState().phase, message, id);
      await this.events.emit({ type: 'task.failed', taskId: id, message });
      await this.events.emit({ type: 'failure.recorded', phase: this.state.getState().phase, message, taskId: id });
      throw err;
    }
  }

  protected recordFailure(error: string): void {
    this.state.recordFailure(this.state.getState().phase, error);
    void this.events.emit({ type: 'failure.recorded', phase: this.state.getState().phase, message: error });
  }

  protected emit(event: OrchestratorEvent): Promise<void> {
    return this.events.emit(event);
  }

  protected get emitter(): OrchestrationEmitter {
    return this.events;
  }
}
