/**
 * Orchestration event emitter.
 *
 * Provides structured, typed event emission for the orchestration layer.
 * Events are the primary mechanism for decoupling the orchestrator from the
 * components it coordinates (borrowed from OpenManus / Automaton event-driven
 * design): stages and agents emit events; the CLI, logs, and tracer subscribe.
 *
 * The emitter is intentionally lightweight and in-memory. For durable,
 * replayable events, forward emitted envelopes to `kernel/events/EventBus`.
 */

import type { OrchestratorPhase, TaskStatus } from './types.js';

export type OrchestratorEventType =
  | 'phase.started'
  | 'phase.completed'
  | 'phase.failed'
  | 'task.started'
  | 'task.completed'
  | 'task.failed'
  | 'task.skipped'
  | 'failure.recorded'
  | 'retry.attempted'
  | 'checkpoint.captured'
  | 'agent.initialized'
  | 'agent.completed'
  | 'log';

export interface OrchestratorEvent {
  type: OrchestratorEventType;
  timestamp?: number;
  phase?: OrchestratorPhase;
  taskId?: string;
  agentId?: string;
  level?: 'debug' | 'info' | 'warn' | 'error';
  message?: string;
  payload?: Record<string, unknown>;
}

export type OrchestratorEventHandler = (event: OrchestratorEvent) => void | Promise<void>;

export class OrchestrationEmitter {
  private handlers = new Map<OrchestratorEventType | '*', Set<OrchestratorEventHandler>>();
  private history: OrchestratorEvent[] = [];

  on(type: OrchestratorEventType | '*', handler: OrchestratorEventHandler): () => void {
    const set = this.handlers.get(type) ?? new Set();
    set.add(handler);
    this.handlers.set(type, set);
    return () => set.delete(handler);
  }

  async emit(event: OrchestratorEvent): Promise<void> {
    const full: OrchestratorEvent = { timestamp: Date.now(), ...event };
    this.history.push(full);
    const specific = this.handlers.get(full.type);
    const wildcard = this.handlers.get('*');
    const targets = [...(specific ? [...specific] : []), ...(wildcard ? [...wildcard] : [])];
    await Promise.allSettled(targets.map((h) => h(full)));
  }

  emitSync(event: OrchestratorEvent): void {
    const full: OrchestratorEvent = { timestamp: Date.now(), ...event };
    this.history.push(full);
    const specific = this.handlers.get(full.type);
    const wildcard = this.handlers.get('*');
    for (const h of [...(specific ? [...specific] : []), ...(wildcard ? [...wildcard] : [])]) {
      void h(full);
    }
  }

  getHistory(): readonly OrchestratorEvent[] {
    return this.history;
  }

  clear(): void {
    this.handlers.clear();
    this.history = [];
  }
}

/** Convenience helpers mirroring the structured-logging style used elsewhere. */
export function logEvent(
  emitter: OrchestrationEmitter,
  level: NonNullable<OrchestratorEvent['level']>,
  message: string,
  extra?: Record<string, unknown>,
): void {
  emitter.emitSync({ type: 'log', level, message, payload: extra });
}

export type { OrchestratorPhase, TaskStatus };
