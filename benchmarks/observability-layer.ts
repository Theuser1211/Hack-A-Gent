import { DecisionLogger, type DecisionTrace } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, nextTraceCounter } from './determinism-kernel.js';
import type { TaskGraphSnapshot } from './task-graph.js';
import type { ToolExecutionRecord, RuntimeState, DeploymentRecord, MutationRecord } from './unified-types.js';

export interface SystemTraceEntry {
  traceId: string;
  timestamp: string;
  category:
    | 'decision'
    | 'tool_call'
    | 'state_transition'
    | 'error'
    | 'repair'
    | 'deployment'
    | 'mutation'
    | 'memory'
    | 'checkpoint';
  message: string;
  data: Record<string, unknown>;
}

export interface FullExecutionReport {
  reportId: string;
  generatedAt: string;
  mode: string;
  durationMs: number;
  summary: {
    totalDecisions: number;
    totalToolCalls: number;
    totalErrors: number;
    totalRepairs: number;
    totalDeployments: number;
    tasksCompleted: number;
    tasksTotal: number;
  };
  decisionTraces: DecisionTrace[];
  toolExecutionLog: ToolExecutionRecord[];
  deploymentHistory: DeploymentRecord[];
  mutationHistory: MutationRecord[];
  stateSnapshots: RuntimeState[];
  systemTrace: SystemTraceEntry[];
  checkpointHistory: string[];
}

export class ObservabilityLayer {
  private readonly seed: number;
  private readonly layerId: string;
  private readonly decisionLogger: DecisionLogger;
  private traceLog: SystemTraceEntry[] = [];
  private stateSnapshots: RuntimeState[] = [];
  private checkpointHistory: string[] = [];
  private startTime = 0;

  constructor(seed = 42) {
    this.seed = seed;
    this.layerId = 'obs-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.decisionLogger = new DecisionLogger(seed + 4000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }

  start(): void {
    this.startTime = Date.now();
    this.trace('checkpoint', 'Observability layer started', { layerId: this.layerId });
  }

  trace(category: SystemTraceEntry['category'], message: string, data: Record<string, unknown> = {}): SystemTraceEntry {
    const entry: SystemTraceEntry = {
      traceId: 'trace-' + createDeterministicUuid(this.seed, this.traceLog.length).slice(0, 8),
      timestamp: deterministicNow(this.seed),
      category,
      message,
      data,
    };
    this.traceLog.push(entry);
    return entry;
  }

  recordDecision(decision: DecisionTrace): void {
    this.trace('decision', `Decision: ${decision.agentRole}/${decision.action}`, {
      decisionId: decision.decisionId,
      confidence: decision.confidence,
    });
  }

  recordToolCall(toolCall: ToolExecutionRecord): void {
    this.trace('tool_call', `Tool: ${toolCall.toolType}`, {
      callId: toolCall.recordId,
      success: toolCall.success,
      durationMs: toolCall.durationMs,
    });
  }

  recordStateSnapshot(state: RuntimeState): void {
    this.stateSnapshots.push({ ...state });
    this.trace('checkpoint', `State snapshot #${state.checkpointVersion}`, {
      version: state.checkpointVersion,
      mode: state.mode,
    });
    this.checkpointHistory.push(`v${state.checkpointVersion}`);
  }

  recordError(error: string, context: Record<string, unknown> = {}): void {
    this.trace('error', `Error: ${error.slice(0, 200)}`, context);
  }

  recordDeployment(deployment: DeploymentRecord): void {
    this.trace('deployment', `Deploy: ${deployment.target} -> ${deployment.url ?? 'failed'}`, {
      deploymentId: deployment.deploymentId,
      status: deployment.status,
    });
  }

  recordMutation(mutation: MutationRecord): void {
    this.trace('mutation', `Mutation: ${mutation.mutationType} on ${mutation.moduleTarget}`, {
      mutationId: mutation.mutationId,
      severity: mutation.severity,
    });
  }

  recordRepair(action: string, result: string): void {
    this.trace('repair', `Repair: ${action} -> ${result}`, { action, result });
  }

  recordMemoryUpdate(action: string, details: Record<string, unknown> = {}): void {
    this.trace('memory', `Memory: ${action}`, details);
  }

  getTrace(): SystemTraceEntry[] {
    return [...this.traceLog];
  }
  getTraceByCategory(category: SystemTraceEntry['category']): SystemTraceEntry[] {
    return this.traceLog.filter((t) => t.category === category);
  }
  getStateSnapshots(): RuntimeState[] {
    return [...this.stateSnapshots];
  }
  getCheckpointHistory(): string[] {
    return [...this.checkpointHistory];
  }
  getUptimeMs(): number {
    return this.startTime > 0 ? Date.now() - this.startTime : 0;
  }

  exportFullExecutionReport(
    mode: string,
    decisionTraces: DecisionTrace[],
    toolExecutionLog: ToolExecutionRecord[],
    deploymentHistory: DeploymentRecord[],
    mutationHistory: MutationRecord[],
    lastState: RuntimeState | null,
  ): FullExecutionReport {
    return {
      reportId: 'report-' + createDeterministicUuid(this.seed, nextTraceCounter()).slice(0, 8),
      generatedAt: deterministicNow(this.seed),
      mode,
      durationMs: this.getUptimeMs(),
      summary: {
        totalDecisions: decisionTraces.length,
        totalToolCalls: toolExecutionLog.length,
        totalErrors: this.traceLog.filter((t) => t.category === 'error').length,
        totalRepairs: this.traceLog.filter((t) => t.category === 'repair').length,
        totalDeployments: deploymentHistory.length,
        tasksCompleted: lastState?.currentExecutionPointer.completedSteps.length ?? 0,
        tasksTotal:
          (lastState?.currentExecutionPointer.completedSteps.length ?? 0) +
          (lastState?.currentExecutionPointer.blockedSteps.length ?? 0) +
          (lastState?.currentExecutionPointer.failedSteps.length ?? 0),
      },
      decisionTraces,
      toolExecutionLog,
      deploymentHistory,
      mutationHistory,
      stateSnapshots: this.stateSnapshots,
      systemTrace: this.traceLog,
      checkpointHistory: this.checkpointHistory,
    };
  }
}
