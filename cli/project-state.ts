import { createDeterministicUuid, deterministicNow } from '../benchmarks/determinism-kernel.js';
import type { HackathonContext } from './hackathon-context.js';

export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked' | 'skipped';
export type RiskSeverity = 'critical' | 'high' | 'medium' | 'low';
export type Phase = 'planning' | 'building' | 'testing' | 'deploying' | 'submitting' | 'complete' | 'failed';

export interface ProjectTask {
  id: string;
  description: string;
  category: 'feature' | 'infrastructure' | 'sponsor_api' | 'testing' | 'deployment' | 'documentation' | 'polish';
  status: TaskStatus;
  priority: 'critical' | 'high' | 'medium' | 'low';
  valueScore: number;
  costScore: number;
  impactScore: number;
  dependencies: string[];
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  reason: string;
}

export interface Risk {
  id: string;
  description: string;
  severity: RiskSeverity;
  category: 'sponsor_api' | 'deployment' | 'scope' | 'time' | 'auth' | 'complexity';
  actionable: boolean;
  mitigation: string;
  detectedAt: number;
  resolved: boolean;
}

export interface Decision {
  id: string;
  type: 'feature_added' | 'feature_removed' | 'stack_changed' | 'architecture_changed' | 'risk_mitigated' | 'replanned' | 'task_skipped';
  description: string;
  reason: string;
  evidence: string;
  timestamp: number;
}

/**
 * Living project state that evolves during execution.
 * Every agent updates this state; subsequent agents consume it.
 * No duplicated work, no fabricated data.
 */
export class LivingProjectState {
  private readonly seed: number;
  readonly context: HackathonContext;

  tasks: ProjectTask[] = [];
  risks: Risk[] = [];
  decisions: Decision[] = [];
  phase: Phase = 'planning';
  startedAt: number;
  lastReplanAt: number;
  remainingHours: number;
  completedCount = 0;
  failedCount = 0;
  blockedCount = 0;

  constructor(context: HackathonContext, seed = 42) {
    this.seed = seed;
    this.context = context;
    this.startedAt = Date.parse(deterministicNow(seed));
    this.lastReplanAt = Date.parse(deterministicNow(seed));
    this.remainingHours = context.hoursRemaining;
  }

  /** Record a decision with traceable reasoning */
  recordDecision(type: Decision['type'], description: string, reason: string, evidence: string): Decision {
    const d: Decision = {
      id: 'dec-' + createDeterministicUuid(this.seed, this.decisions.length).slice(0, 8),
      type,
      description,
      reason,
      evidence,
      timestamp: Date.parse(deterministicNow(this.seed + this.decisions.length)),
    };
    this.decisions.push(d);
    return d;
  }

  /** Add a risk with actionable mitigation */
  addRisk(description: string, severity: RiskSeverity, category: Risk['category'], mitigation: string): Risk {
    const r: Risk = {
      id: 'risk-' + createDeterministicUuid(this.seed, this.risks.length).slice(0, 8),
      description,
      severity,
      category,
      actionable: true,
      mitigation,
      detectedAt: Date.parse(deterministicNow(this.seed + this.risks.length * 2)),
      resolved: false,
    };
    this.risks.push(r);
    return r;
  }

  /** Resolve a risk (e.g. after successful mitigation) */
  resolveRisk(riskId: string): void {
    const risk = this.risks.find(r => r.id === riskId);
    if (risk) risk.resolved = true;
  }

  /** Score a feature by value (judging alignment), cost (effort), and impact (sponsor eligibility) */
  scoreFeature(
    description: string,
    category: ProjectTask['category'],
    priority: ProjectTask['priority'],
  ): { value: number; cost: number; impact: number } {
    let value = 50;
    let cost = 50;
    let impact = 50;

    // Judging criteria alignment
    const lc = description.toLowerCase();
    for (const c of this.context.judgingCriteria) {
      if (lc.includes(c.name.toLowerCase())) {
        value += c.weight * 2;
      }
    }

    // Sponsor API features get high impact
    const isSponsor = this.context.sponsorPrizes.some(s =>
      lc.includes(s.sponsor.toLowerCase()),
    );
    if (isSponsor) {
      impact += 40;
      value += 20;
    }

    // Infrastructure is high cost but essential
    if (category === 'infrastructure') {
      cost += 20;
      value -= 10;
    }

    // Testing is medium cost, medium value
    if (category === 'testing') {
      cost += 10;
      value += 15;
    }

    // Deploy is essential for demo
    if (category === 'deployment') {
      value += 30;
      cost += 5;
    }

    // Documentation is low cost, medium value
    if (category === 'documentation') {
      cost -= 20;
      value += 10;
    }

    // Time pressure reduces cost tolerance
    if (this.remainingHours <= 3 && cost > 60) {
      value -= 30; // Expensive features aren't worth it on short timeline
    }

    return {
      value: Math.max(0, Math.min(100, value)),
      cost: Math.max(0, Math.min(100, cost)),
      impact: Math.max(0, Math.min(100, impact)),
    };
  }

  /** Add a task with auto-scored value/cost/impact */
  addTask(
    description: string,
    category: ProjectTask['category'],
    priority: ProjectTask['priority'],
    dependencies: string[] = [],
    reason = '',
  ): ProjectTask {
    const scores = this.scoreFeature(description, category, priority);
    const task: ProjectTask = {
      id: 'task-' + createDeterministicUuid(this.seed, this.tasks.length).slice(0, 8),
      description,
      category,
      status: 'pending',
      priority,
      valueScore: scores.value,
      costScore: scores.cost,
      impactScore: scores.impact,
      dependencies,
      startedAt: null,
      completedAt: null,
      error: null,
      reason: reason || `Addresses ${priority} priority ${category}`,
    };
    this.tasks.push(task);
    return task;
  }

  /** Get the highest-value pending task (respects dependencies) */
  getNextTask(): ProjectTask | null {
    const ready = this.tasks.filter(t =>
      t.status === 'pending' &&
      t.dependencies.every(depId => {
        const dep = this.tasks.find(t2 => t2.id === depId);
        return dep && dep.status === 'completed';
      }),
    );
    if (ready.length === 0) return null;
    // Sort by value/impact, accounting for time pressure
    return ready.sort((a, b) => {
      const aScore = a.valueScore * 0.5 + a.impactScore * 0.3 - a.costScore * 0.2;
      const bScore = b.valueScore * 0.5 + b.impactScore * 0.3 - b.costScore * 0.2;
      return bScore - aScore;
    })[0]!;
  }

  /** After a failure, decide whether to retry, skip, or re-plan */
  handleTaskFailure(taskId: string, error: string): 'retry' | 'skip' | 'replan' {
    const task = this.tasks.find(t => t.id === taskId);
    if (!task) return 'skip';

    task.status = 'failed';
    task.error = error;
    this.failedCount++;

    // Check if this is a critical task
    if (task.priority === 'critical') {
      this.recordDecision('replanned', `Critical task failed: ${task.description}`, error, `Task: ${taskId}`);
      return 'replan';
    }

    // Low-value tasks can be skipped under time pressure
    if (this.remainingHours <= 3 && task.valueScore < 40) {
      this.recordDecision('task_skipped', `Skipping low-value task: ${task.description}`,
        `Value ${task.valueScore} < 40, only ${this.remainingHours}h remaining`,
        `Task: ${taskId}`);
      return 'skip';
    }

    // High-value tasks should be retried
    if (task.valueScore >= 60) return 'retry';

    return 'skip';
  }

  /** Check if any conditions have changed that warrant replanning */
  shouldReplan(): { needed: boolean; reason: string } {
    const elapsed = Date.now() - this.lastReplanAt;
    const activeRisks = this.risks.filter(r => !r.resolved && r.severity === 'critical');
    const blocked = this.tasks.filter(t => t.status === 'blocked').length;
    const failed = this.failedCount;

    if (activeRisks.length > 0) {
      return { needed: true, reason: `${activeRisks.length} critical unresolved risk(s)` };
    }
    if (blocked > 2) {
      return { needed: true, reason: `${blocked} blocked task(s)` };
    }
    if (failed > 3) {
      return { needed: true, reason: `${failed} failed task(s)` };
    }
    // Replan every 5 minutes regardless (continuous improvement)
    if (elapsed > 300000) {
      return { needed: true, reason: 'Periodic replanning cycle' };
    }
    return { needed: false, reason: '' };
  }

  /** Drop low-value features when time is running out, protecting the MVP */
  pruneLowValueTasks(): ProjectTask[] {
    const pruned: ProjectTask[] = [];
    if (this.remainingHours <= 1) {
      // Extreme time pressure: keep only critical and high-priority tasks
      const toRemove = this.tasks.filter(t =>
        t.status === 'pending' &&
        t.priority !== 'critical' &&
        t.category !== 'deployment' &&
        t.category !== 'infrastructure',
      );
      for (const t of toRemove) {
        t.status = 'skipped';
        this.recordDecision('feature_removed', `Dropped: ${t.description}`,
          `Only ${this.remainingHours}h remaining, priority=${t.priority}, value=${t.valueScore}`,
          'Time pressure pruning');
        pruned.push(t);
      }
    } else if (this.remainingHours <= 3) {
      // Medium pressure: drop low-value pending tasks
      const toRemove = this.tasks.filter(t =>
        t.status === 'pending' &&
        t.valueScore < 40 &&
        t.category !== 'deployment',
      );
      for (const t of toRemove) {
        t.status = 'skipped';
        this.recordDecision('feature_removed', `Dropped low-value: ${t.description}`,
          `Value ${t.valueScore} < 40, ${this.remainingHours}h remaining`,
          'Value-based pruning');
        pruned.push(t);
      }
    }
    this.lastReplanAt = Date.now();
    return pruned;
  }

  /** Get a snapshot of the current state for explain/replay */
  getSnapshot(): Record<string, unknown> {
    return {
      phase: this.phase,
      remainingHours: this.remainingHours,
      completedCount: this.completedCount,
      failedCount: this.failedCount,
      blockedCount: this.blockedCount,
      tasks: this.tasks.map(t => ({
        id: t.id,
        description: t.description,
        status: t.status,
        valueScore: t.valueScore,
        costScore: t.costScore,
        impactScore: t.impactScore,
        error: t.error,
      })),
      risks: this.risks.map(r => ({
        id: r.id,
        description: r.description,
        severity: r.severity,
        resolved: r.resolved,
      })),
      decisions: this.decisions.map(d => ({
        type: d.type,
        description: d.description,
        reason: d.reason,
      })),
      startedAt: this.startedAt,
    };
  }
}
