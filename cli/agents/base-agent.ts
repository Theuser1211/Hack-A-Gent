/**
 * BaseAgent — shared lifecycle implementation for pipeline agents.
 *
 * Provides default transitions (initialize → plan → execute → validate →
 * report → cleanup), structured logging via the shared emitter, and a
 * status flag. Concrete agents override the stages they care about; the
 * base class guarantees consistent, observable behaviour.
 */

import { logEvent } from '../orchestration/events.js';
import type { AgentContext, AgentManifestLight, AgentResult, AgentStatus, PipelineAgent } from './types.js';

export abstract class BaseAgent implements PipelineAgent {
  abstract readonly manifest: AgentManifestLight;

  protected status: AgentStatus = 'uninitialized';

  async initialize(ctx: AgentContext): Promise<void> {
    this.status = 'initialized';
    if (ctx.emitter) {
      logEvent(ctx.emitter, 'info', `[${this.manifest.id}] initialized`, { agent: this.manifest.id });
      await ctx.emitter.emit({ type: 'agent.initialized', agentId: this.manifest.id });
    }
  }

  async plan(_ctx: AgentContext): Promise<void> {
    // Default: no planning. Subclasses override.
  }

  abstract execute(ctx: AgentContext): Promise<AgentResult>;

  async validate(_ctx: AgentContext, _result: AgentResult): Promise<boolean> {
    // Default: assume valid. Subclasses override with real checks.
    return true;
  }

  report(_ctx: AgentContext, result: AgentResult): string {
    return result.summary;
  }

  async cleanup(ctx: AgentContext): Promise<void> {
    this.status = 'completed';
    if (ctx.emitter) {
      await ctx.emitter.emit({ type: 'agent.completed', agentId: this.manifest.id });
    }
  }

  /** Convenience runner that executes the full lifecycle in order. */
  async run(ctx: AgentContext): Promise<AgentResult> {
    try {
      await this.initialize(ctx);
      await this.plan(ctx);
      this.status = 'running';
      const result = await this.execute(ctx);
      const ok = await this.validate(ctx, result);
      this.status = ok ? 'completed' : 'failed';
      if (ctx.emitter) {
        logEvent(ctx.emitter, ok ? 'info' : 'warn', `[${this.manifest.id}] ${ok ? 'completed' : 'validation failed'}`, {
          agent: this.manifest.id,
          status: this.status,
        });
      }
      // Produce the agent's report (side-effects: learning, decisions, traces).
      this.report(ctx, result);
      await this.cleanup(ctx);
      return result;
    } catch (err) {
      this.status = 'failed';
      const message = err instanceof Error ? err.message : String(err);
      if (ctx.emitter) {
        logEvent(ctx.emitter, 'error', `[${this.manifest.id}] failed: ${message}`, { agent: this.manifest.id });
      }
      throw err;
    }
  }

  getStatus(): AgentStatus {
    return this.status;
  }
}
