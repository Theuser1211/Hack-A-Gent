import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import { type TaskNode, type TaskGraph } from './task-graph.js';
import type { ToolType } from './tool-executor.js';

export interface ToolNode {
  id: string;
  toolType: ToolType;
  action: string;
  params: Record<string, unknown>;
  dependsOn: string[];
  retryPolicy: RetryPolicy;
  status: 'pending' | 'running' | 'success' | 'failed' | 'skipped';
  result: unknown;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  performanceScore: number;
}

export interface RetryPolicy {
  maxRetries: number;
  backoffMs: number;
  retryOn: Array<'timeout' | 'network' | 'build' | 'deploy' | 'unknown'>;
}

export interface ToolConflict {
  sourceId: string;
  targetId: string;
  type: 'resource' | 'order' | 'dependency';
  description: string;
}

export class ToolExecutionGraph {
  private nodes: Map<string, ToolNode> = new Map();
  private readonly seed: number;
  private readonly graphId: string;
  private readonly decisionLogger: DecisionLogger;
  private executionHistory: Array<{ nodeId: string; durationMs: number; success: boolean }> = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.graphId = 'toolgraph-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 3000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getAllNodes(): ToolNode[] {
    return Array.from(this.nodes.values());
  }

  addNode(
    toolType: ToolType,
    action: string,
    params: Record<string, unknown> = {},
    dependsOn: string[] = [],
    retryPolicy?: Partial<RetryPolicy>,
  ): string {
    const id = 'tool-' + createDeterministicUuid(this.seed, this.nodes.size + 1).slice(0, 8);
    const node: ToolNode = {
      id,
      toolType,
      action,
      params,
      dependsOn,
      retryPolicy: {
        maxRetries: retryPolicy?.maxRetries ?? this.defaultRetries(toolType),
        backoffMs: retryPolicy?.backoffMs ?? 1000,
        retryOn: retryPolicy?.retryOn ?? ['timeout', 'network'],
      },
      status: 'pending',
      result: null,
      error: null,
      startedAt: null,
      completedAt: null,
      performanceScore: 0.5,
    };
    this.nodes.set(id, node);
    return id;
  }

  private defaultRetries(toolType: ToolType): number {
    switch (toolType) {
      case 'deploy':
        return 3;
      case 'github':
        return 2;
      case 'shell':
        return 1;
      case 'browser_test':
        return 2;
      case 'package':
        return 2;
      default:
        return 1;
    }
  }

  detectConflicts(taskGraph: TaskGraph): ToolConflict[] {
    const conflicts: ToolConflict[] = [];
    const allNodes = this.getAllNodes();

    for (let i = 0; i < allNodes.length; i++) {
      for (let j = i + 1; j < allNodes.length; j++) {
        const a = allNodes[i]!;
        const b = allNodes[j]!;

        if (
          (a.toolType === 'deploy' && b.toolType === 'scaffold') ||
          (a.toolType === 'scaffold' && b.toolType === 'deploy')
        ) {
          conflicts.push({
            sourceId: a.id,
            targetId: b.id,
            type: 'order',
            description: 'Build must complete before deploy',
          });
        }
        if (
          (a.toolType === 'browser_test' && b.toolType === 'deploy') ||
          (a.toolType === 'deploy' && b.toolType === 'browser_test')
        ) {
          conflicts.push({
            sourceId: a.id,
            targetId: b.id,
            type: 'dependency',
            description: 'Deploy must happen before browser test',
          });
        }
        if (
          (a.toolType === 'package' && b.toolType === 'package') ||
          (a.toolType === 'shell' && b.toolType === 'shell')
        ) {
          if (JSON.stringify(a.params) === JSON.stringify(b.params)) {
            conflicts.push({
              sourceId: a.id,
              targetId: b.id,
              type: 'resource',
              description: 'Concurrent shell/package operations on same dir',
            });
          }
        }
      }
    }

    for (const node of allNodes) {
      const missingDeps = node.dependsOn.filter((depId) => !this.nodes.has(depId));
      if (missingDeps.length > 0) {
        conflicts.push({
          sourceId: node.id,
          targetId: missingDeps[0]!,
          type: 'dependency',
          description: `Missing dependency: ${missingDeps.join(', ')}`,
        });
      }
    }

    return conflicts;
  }

  getReadyNodes(): ToolNode[] {
    return this.getAllNodes().filter((n) => {
      if (n.status !== 'pending') return false;
      return n.dependsOn.every((depId) => {
        const dep = this.nodes.get(depId);
        return dep && dep.status === 'success';
      });
    });
  }

  getExecutionPlan(): ToolNode[][] {
    const plan: ToolNode[][] = [];
    const remaining = new Set(
      this.getAllNodes()
        .filter((n) => n.status === 'pending')
        .map((n) => n.id),
    );

    while (remaining.size > 0) {
      const ready = Array.from(remaining).filter((id) => {
        const node = this.nodes.get(id)!;
        return node.dependsOn.every((depId) => !remaining.has(depId));
      });
      if (ready.length === 0) break;
      plan.push(ready.map((id) => this.nodes.get(id)!));
      ready.forEach((id) => remaining.delete(id));
    }

    return plan;
  }

  shouldRetry(nodeId: string): boolean {
    const node = this.nodes.get(nodeId);
    if (!node || node.status !== 'failed') return false;
    const retries = this.executionHistory.filter((h) => h.nodeId === nodeId).length;
    return retries < node.retryPolicy.maxRetries;
  }

  recordResult(nodeId: string, success: boolean, durationMs: number, result?: unknown, error?: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    this.executionHistory.push({ nodeId, durationMs, success });

    if (success) {
      node.status = 'success';
      node.result = result;
      node.error = null;
      node.completedAt = deterministicNow(this.seed + this.executionHistory.length);
      node.performanceScore = Math.min(1, node.performanceScore + 0.1);
    } else {
      node.status = 'failed';
      node.error = error ?? 'Unknown error';
      const retries = this.executionHistory.filter((h) => h.nodeId === nodeId).length;
      if (retries >= node.retryPolicy.maxRetries) {
        node.completedAt = deterministicNow(this.seed + this.executionHistory.length);
        node.performanceScore = Math.max(0, node.performanceScore - 0.2);
        this.decisionLogger.log(
          'debug',
          'tool_failure',
          `Tool ${nodeId} (${node.toolType}) failed after ${retries} retries: ${node.error}`,
          0.3,
          [],
          { nodeId, toolType: node.toolType, retries },
        );
      }
    }
  }

  markRunning(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.status = 'running';
      node.startedAt = deterministicNow(this.seed + this.executionHistory.length);
    }
  }

  getFailedNodes(): ToolNode[] {
    return this.getAllNodes().filter((n) => n.status === 'failed');
  }

  getFailurePropagationGraph(): Array<{ sourceId: string; failedDownstreamIds: string[] }> {
    const failed = this.getFailedNodes();
    const result: Array<{ sourceId: string; failedDownstreamIds: string[] }> = [];

    for (const f of failed) {
      const downstream = this.getAllNodes().filter(
        (n) => n.status === 'failed' && n.dependsOn.includes(f.id) && n.id !== f.id,
      );
      if (downstream.length > 0) {
        result.push({ sourceId: f.id, failedDownstreamIds: downstream.map((n) => n.id) });
      }
    }

    return result;
  }

  getPerformanceReport(): Array<{ toolType: ToolType; avgDurationMs: number; successRate: number; avgScore: number }> {
    const byType = new Map<ToolType, { durations: number[]; successes: number[]; scores: number[] }>();

    for (const node of this.getAllNodes()) {
      if (node.status === 'pending') continue;
      const records = byType.get(node.toolType) ?? { durations: [], successes: [], scores: [] };
      const hist = this.executionHistory.filter((h) => h.nodeId === node.id);
      if (hist.length > 0) {
        records.durations.push(hist.reduce((s, h) => s + h.durationMs, 0) / hist.length);
        records.successes.push(hist.some((h) => h.success) ? 1 : 0);
      }
      records.scores.push(node.performanceScore);
      byType.set(node.toolType, records);
    }

    return Array.from(byType.entries()).map(([toolType, data]) => ({
      toolType,
      avgDurationMs: Math.round(data.durations.reduce((a, b) => a + b, 0) / Math.max(data.durations.length, 1)),
      successRate: data.successes.reduce((a, b) => a + b, 0) / Math.max(data.successes.length, 1),
      avgScore: data.scores.reduce((a, b) => a + b, 0) / Math.max(data.scores.length, 1),
    }));
  }
}
