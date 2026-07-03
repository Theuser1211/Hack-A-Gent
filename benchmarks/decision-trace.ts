import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export type AgentRole = 'planner' | 'builder' | 'debug' | 'deployment' | 'ux' | 'strategy';

export interface DecisionTrace {
  decisionId: string;
  traceId: string;
  agentRole: string;
  agent: AgentRole;
  action: string;
  reason: string;
  confidence: number;
  alternatives: string[];
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface AgentMemory {
  role: AgentRole;
  scoringFn: (input: Record<string, unknown>) => number;
  memoryBuffer: Array<{ event: string; outcome: 'success' | 'failure'; timestamp: string }>;
  failurePatterns: string[];
}

export class DecisionLogger {
  private decisions: DecisionTrace[] = [];
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
  }

  log(
    agent: AgentRole,
    action: string,
    reason: string,
    confidence: number,
    alternatives: string[] = [],
    metadata?: Record<string, unknown>,
  ): DecisionTrace {
    const traceId = 'trace-' + createDeterministicUuid(this.seed, this.decisions.length).slice(0, 8);
    const trace: DecisionTrace = {
      decisionId: 'dec-' + createDeterministicUuid(this.seed, this.decisions.length).slice(0, 8),
      traceId,
      agentRole: agent,
      agent,
      action,
      reason,
      confidence,
      alternatives,
      timestamp: deterministicNow(this.seed + this.decisions.length),
      metadata,
    };
    this.decisions.push(trace);
    return trace;
  }

  getAll(): DecisionTrace[] {
    return [...this.decisions];
  }

  getByAgent(agent: AgentRole): DecisionTrace[] {
    return this.decisions.filter((d) => d.agent === agent);
  }

  getByAction(action: string): DecisionTrace[] {
    return this.decisions.filter((d) => d.action === action);
  }

  getRecent(count = 10): DecisionTrace[] {
    return this.decisions.slice(-count);
  }

  getFailureDecisions(): DecisionTrace[] {
    return this.decisions.filter((d) => d.confidence < 0.5);
  }

  getSummary(): { total: number; byAgent: Record<string, number>; avgConfidence: number } {
    const byAgent: Record<string, number> = {};
    let totalConf = 0;
    for (const d of this.decisions) {
      byAgent[d.agent] = (byAgent[d.agent] ?? 0) + 1;
      totalConf += d.confidence;
    }
    return {
      total: this.decisions.length,
      byAgent,
      avgConfidence: this.decisions.length > 0 ? totalConf / this.decisions.length : 0,
    };
  }
}
