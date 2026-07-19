/**
 * Common Agent abstraction for the production pipeline.
 *
 * Every pipeline component (planner, builder, tester, repair, judge, reporter,
 * …) exposes the same lifecycle so the orchestrator can coordinate them
 * uniformly. This interface is intentionally broader than the existing kernel
 * `Agent` (which is task-execution oriented); it adds the explicit
 * plan / validate / report / cleanup stages described in the architecture plan.
 *
 * The existing orphaned agents under `agents/` can be adapted to this
 * interface over time without changing their internals. Where the kernel
 * `Agent.executeTask(task)` contract already exists, a thin adapter can map
 * `execute()` to `executeTask(...)`.
 */

import type { OrchestrationEmitter } from '../orchestration/events.js';

export type AgentStatus = 'uninitialized' | 'initialized' | 'running' | 'completed' | 'failed';

export interface AgentContext {
  /** Shared emitter for structured events/logging. */
  emitter?: OrchestrationEmitter;
  /** Deterministic seed for reproducible behaviour. */
  seed: number;
  /** Free-form inputs the agent needs (parsed spec, strategy, prior results…). */
  inputs: Record<string, unknown>;
  /** Scratch space shared across agent lifecycle calls. */
  scratch: Record<string, unknown>;
}

export interface AgentResult {
  status: AgentStatus;
  /** Primary output of the agent (typed by the concrete agent). */
  output: unknown;
  /** Human-readable summary for reporting. */
  summary: string;
  /** Structured artifacts (file paths, scores, metrics…). */
  artifacts: Record<string, unknown>;
}

export interface AgentManifestLight {
  id: string;
  name: string;
  description: string;
  /** Task categories this agent can handle. */
  accepts: string[];
}

/**
 * The common agent lifecycle. Concrete agents implement each stage; the base
 * class provides default no-op transitions and event emission.
 */
export interface PipelineAgent {
  readonly manifest: AgentManifestLight;

  initialize(ctx: AgentContext): Promise<void>;
  /** Decide what work to do and in what order. */
  plan(ctx: AgentContext): Promise<void>;
  /** Perform the work. */
  execute(ctx: AgentContext): Promise<AgentResult>;
  /** Verify the work meets acceptance criteria. */
  validate(ctx: AgentContext, result: AgentResult): Promise<boolean>;
  /** Summarize results for the orchestrator/report. */
  report(ctx: AgentContext, result: AgentResult): string;
  /** Release resources / temp state. */
  cleanup(ctx: AgentContext): Promise<void>;
}
