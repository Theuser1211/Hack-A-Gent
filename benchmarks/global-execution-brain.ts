import { DecisionLogger, type AgentRole } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';
import { type TaskGraph, type TaskNode, type TaskCategory } from './task-graph.js';

export type ReplanReason =
  | 'failure'
  | 'bottleneck'
  | 'user_feedback'
  | 'deployment_issue'
  | 'time_pressure'
  | 'scope_change';

export interface ReplanAction {
  id: string;
  reason: ReplanReason;
  description: string;
  affectedTaskIds: string[];
  priorityChanges: Array<{ taskId: string; oldPriority: number; newPriority: number }>;
  skippedTasks: string[];
  addedTasks: string[];
  timestamp: string;
}

export interface BottleneckReport {
  category: TaskCategory | null;
  blockedCount: number;
  estimatedUnblockTime: number;
  criticalPath: string[];
  suggestion: string;
}

export interface CostEstimate {
  taskId: string;
  estimatedTimeMs: number;
  apiCalls: number;
  complexity: 'low' | 'medium' | 'high';
  riskFactor: number;
}

export class GlobalExecutionBrain {
  private readonly seed: number;
  private readonly brainId: string;
  private readonly decisionLogger: DecisionLogger;
  private replanHistory: ReplanAction[] = [];
  private taskPriorities: Map<string, number> = new Map();
  private taskCosts: Map<string, CostEstimate> = new Map();
  private performanceHistory: Array<{ taskId: string; durationMs: number; success: boolean; timestamp: string }> = [];
  private isPaused = false;
  private parallelBudget = 3;

  constructor(seed = 42) {
    this.seed = seed;
    this.brainId = 'brain-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 2000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getReplanHistory(): ReplanAction[] {
    return [...this.replanHistory];
  }
  isExecutionPaused(): boolean {
    return this.isPaused;
  }

  setParallelBudget(budget: number): void {
    this.parallelBudget = Math.max(1, budget);
  }

  estimateCost(task: TaskNode): CostEstimate {
    const rng = getSeededRandom(this.seed + task.description.length);
    const complexity: CostEstimate['complexity'] =
      task.category === 'infra'
        ? 'low'
        : task.category === 'deployment'
          ? 'medium'
          : task.category === 'testing'
            ? 'medium'
            : task.category === 'frontend' || task.category === 'backend'
              ? 'high'
              : 'medium';

    const timeMap = { low: 500, medium: 2000, high: 5000 };
    const apiMap = { low: 0, medium: 2, high: 5 };
    const baseTime = timeMap[complexity];
    const jitter = rng.next() * baseTime * 0.2;

    const cost: CostEstimate = {
      taskId: task.id,
      estimatedTimeMs: Math.round(baseTime + jitter),
      apiCalls: apiMap[complexity] + (task.category === 'deployment' ? 3 : 0),
      complexity,
      riskFactor: task.dependencies.length > 3 ? 0.3 : task.dependencies.length > 1 ? 0.15 : 0.05,
    };

    this.taskCosts.set(task.id, cost);
    return cost;
  }

  recordPerformance(taskId: string, durationMs: number, success: boolean): void {
    this.performanceHistory.push({
      taskId,
      durationMs,
      success,
      timestamp: deterministicNow(this.seed + this.performanceHistory.length),
    });
    const cost = this.taskCosts.get(taskId);
    if (cost && durationMs > 0) {
      const ratio = durationMs / cost.estimatedTimeMs;
      if (ratio > 3) cost.riskFactor = Math.min(1, cost.riskFactor * 1.5);
    }
  }

  detectBottlenecks(taskGraph: TaskGraph): BottleneckReport[] {
    const reports: BottleneckReport[] = [];
    const all = taskGraph.getAllNodes();
    const running = all.filter((n) => n.status === 'running');
    const blocked = all.filter((n) => n.status === 'blocked');
    const pending = all.filter((n) => n.status === 'pending');

    const categories: TaskCategory[] = [
      'frontend',
      'backend',
      'infra',
      'testing',
      'deployment',
      'planning',
      'integration',
    ];
    for (const cat of categories) {
      const catPending = pending.filter((n) => n.category === cat);
      const catBlocked = blocked.filter((n) => n.category === cat);
      if (catPending.length > 2 || catBlocked.length > 0) {
        const deps = new Set<string>();
        for (const n of catPending) n.dependencies.forEach((d) => deps.add(d));
        reports.push({
          category: cat,
          blockedCount: catBlocked.length + catPending.length,
          estimatedUnblockTime: catPending.length * 1000,
          criticalPath: Array.from(deps).slice(0, 5),
          suggestion:
            catBlocked.length > 0
              ? `Unblock ${cat} tasks by resolving blocked dependencies`
              : `Parallelize ${cat} tasks across ${this.parallelBudget} workers`,
        });
      }
    }

    if (running.length >= this.parallelBudget && pending.length > 0) {
      reports.push({
        category: null,
        blockedCount: pending.length,
        estimatedUnblockTime: running.length * 1500,
        criticalPath: running.map((n) => n.id),
        suggestion: `Parallel budget exhausted (${running.length}/${this.parallelBudget}). Wait for running tasks.`,
      });
    }

    return reports;
  }

  reprioritize(taskGraph: TaskGraph, reason: ReplanReason): ReplanAction {
    const rng = getSeededRandom(this.seed + this.replanHistory.length);
    const pending = taskGraph.getNodesByStatus('pending');
    const affected: string[] = [];
    const changes: ReplanAction['priorityChanges'] = [];

    for (const task of pending) {
      const oldPriority = this.taskPriorities.get(task.id) ?? 0.5;
      let adjustment = 0;

      if (reason === 'failure') {
        if (task.category === 'testing') adjustment += 0.3;
        if (task.dependencies.length > 2) adjustment += 0.2;
      }
      if (reason === 'deployment_issue') {
        if (task.category === 'deployment') adjustment += 0.4;
        if (task.category === 'testing') adjustment += 0.2;
      }
      if (reason === 'time_pressure') {
        if (task.category === 'frontend' || task.category === 'backend') adjustment += 0.15;
        if (task.dependencies.length === 0) adjustment += 0.25;
      }
      if (reason === 'bottleneck') {
        if (task.category === taskGraph.getLargestUnprocessedCategory()) adjustment += 0.2;
      }

      const newPriority = Math.min(1, Math.max(0, oldPriority + adjustment + (rng.next() - 0.5) * 0.1));
      this.taskPriorities.set(task.id, newPriority);
      if (Math.abs(newPriority - oldPriority) > 0.05) {
        changes.push({
          taskId: task.id,
          oldPriority: Math.round(oldPriority * 100) / 100,
          newPriority: Math.round(newPriority * 100) / 100,
        });
        affected.push(task.id);
      }
    }

    const skippedTasks: string[] = [];
    const addedTasks: string[] = [];

    const action: ReplanAction = {
      id: 'replan-' + createDeterministicUuid(this.seed, this.replanHistory.length).slice(0, 8),
      reason,
      description: `Reprioritized ${changes.length} tasks due to ${reason}`,
      affectedTaskIds: affected,
      priorityChanges: changes,
      skippedTasks,
      addedTasks,
      timestamp: deterministicNow(this.seed + this.replanHistory.length),
    };

    this.replanHistory.push(action);
    this.decisionLogger.log('strategy', 'reprioritize', action.description, 0.75, affected, { reason });
    return action;
  }

  getNextOptimalTasks(taskGraph: TaskGraph): TaskNode[] {
    const ready = taskGraph.getReadyNodes();
    if (ready.length === 0) return [];

    const scored = ready.map((task) => {
      const cost = this.taskCosts.get(task.id) ?? this.estimateCost(task);
      const priority = this.taskPriorities.get(task.id) ?? 0.5;
      const depCount = task.dependencies.length;
      const efficiency = priority / Math.max(cost.estimatedTimeMs, 1);
      return { task, score: efficiency * 10000 + (depCount === 0 ? 50 : 0) + priority * 20 };
    });

    scored.sort((a, b) => b.score - a.score);
    const budget = Math.min(this.parallelBudget, scored.length);

    this.decisionLogger.log(
      'strategy',
      'select_tasks',
      `Selected ${budget} of ${ready.length} ready tasks`,
      0.85,
      scored.slice(0, budget).map((s) => s.task.id),
    );

    return scored.slice(0, budget).map((s) => s.task);
  }

  pauseCriticalPath(): void {
    this.isPaused = true;
    this.decisionLogger.log('strategy', 'pause_critical_path', 'Paused execution for critical path analysis', 0.9);
  }

  resumeOptimizedPath(): void {
    this.isPaused = false;
    this.decisionLogger.log('strategy', 'resume_optimized_path', 'Resumed execution with optimized path', 0.9);
  }
}
