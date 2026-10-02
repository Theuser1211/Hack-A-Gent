import { deterministicNow } from './determinism-kernel.js';

// ---- Types ----

export type ExecutionBudget = {
  maxSteps: number;
  maxToolCalls: number;
  maxDeployAttempts: number;
  maxRepairCycles: number;
  maxSimulationReplans: number;
  remaining?: { steps: number };
};

export interface BudgetUsage {
  steps: number;
  toolCalls: number;
  deployAttempts: number;
  repairCycles: number;
  simulationReplans: number;
}

export interface BudgetViolation {
  category: keyof BudgetUsage;
  limit: number;
  actual: number;
  timestamp: string;
  action: 'blocked' | 'degraded';
}

export interface ExecutionBudgetReport {
  budget: ExecutionBudget;
  usage: BudgetUsage;
  remaining: BudgetUsage;
  exceeded: boolean;
  violations: BudgetViolation[];
  degraded: boolean;
  summary: string;
}

export class ExecutionBudgetExceededError extends Error {
  constructor(
    message: string,
    public readonly violations: BudgetViolation[],
  ) {
    super(message);
    this.name = 'ExecutionBudgetExceededError';
  }
}

const DEFAULT_BUDGET: ExecutionBudget = {
  maxSteps: 50,
  maxToolCalls: 30,
  maxDeployAttempts: 2,
  maxRepairCycles: 3,
  maxSimulationReplans: 1,
};

// ---- Budget Manager ----

export class ExecutionBudgetManager {
  private readonly budget: ExecutionBudget;
  private usage: BudgetUsage;
  private violations: BudgetViolation[];
  private degraded: boolean;
  private readonly seed: number;

  constructor(seed: number = 42, budget?: Partial<ExecutionBudget>) {
    this.seed = seed;
    this.budget = { ...DEFAULT_BUDGET, ...budget };
    this.usage = { steps: 0, toolCalls: 0, deployAttempts: 0, repairCycles: 0, simulationReplans: 0 };
    this.violations = [];
    this.degraded = false;
  }

  getBudget(): ExecutionBudget {
    return { ...this.budget };
  }
  getUsage(): BudgetUsage {
    return { ...this.usage };
  }

  getRemaining(): BudgetUsage {
    return {
      steps: Math.max(0, this.budget.maxSteps - this.usage.steps),
      toolCalls: Math.max(0, this.budget.maxToolCalls - this.usage.toolCalls),
      deployAttempts: Math.max(0, this.budget.maxDeployAttempts - this.usage.deployAttempts),
      repairCycles: Math.max(0, this.budget.maxRepairCycles - this.usage.repairCycles),
      simulationReplans: Math.max(0, this.budget.maxSimulationReplans - this.usage.simulationReplans),
    };
  }

  // ---- Trackers ----

  recordStep(): void {
    this.usage.steps++;
  }

  recordToolCall(): void {
    this.usage.toolCalls++;
  }

  recordDeployAttempt(): void {
    this.usage.deployAttempts++;
  }

  recordRepairCycle(): void {
    this.usage.repairCycles++;
  }

  recordSimulationReplan(): void {
    this.usage.simulationReplans++;
  }

  // ---- Enforcement ----

  /**
   * Check if an action is within budget. If exceeded, record violation.
   * Throws ExecutionBudgetExceededError if action is blocked.
   * Returns true if allowed, false if degraded mode should be used instead.
   */
  private budgetKeyFor(
    action: keyof BudgetUsage,
  ): 'maxSteps' | 'maxToolCalls' | 'maxDeployAttempts' | 'maxRepairCycles' | 'maxSimulationReplans' {
    const map: Record<keyof BudgetUsage, keyof ExecutionBudget> = {
      steps: 'maxSteps',
      toolCalls: 'maxToolCalls',
      deployAttempts: 'maxDeployAttempts',
      repairCycles: 'maxRepairCycles',
      simulationReplans: 'maxSimulationReplans',
    };
    return map[action] as
      | 'maxSteps'
      | 'maxToolCalls'
      | 'maxDeployAttempts'
      | 'maxRepairCycles'
      | 'maxSimulationReplans';
  }

  checkAction(action: keyof BudgetUsage): { allowed: boolean; degraded: boolean } {
    const usageKey = action;
    const budgetKey = this.budgetKeyFor(action);
    const limit = this.budget[budgetKey];
    const current = this.usage[usageKey];

    if (current < limit) {
      return { allowed: true, degraded: false };
    }

    // Budget exceeded Ã¢â‚¬â€ check if we can degrade instead of block
    const extraAllowance = action === 'steps' ? 10 : action === 'repairCycles' ? 1 : 0;

    if (extraAllowance > 0 && current < limit + extraAllowance) {
      this.degraded = true;
      this.violations.push({
        category: action,
        limit,
        actual: current + 1,
        timestamp: deterministicNow(this.seed),
        action: 'degraded',
      });
      return { allowed: true, degraded: true };
    }

    // Block
    this.violations.push({
      category: action,
      limit,
      actual: current + 1,
      timestamp: deterministicNow(this.seed),
      action: 'blocked',
    });

    throw new ExecutionBudgetExceededError(`Budget exceeded: ${action} (${current + 1}/${limit})`, this.violations);
  }

  /**
   * Check all budgets at once. Returns report without throwing.
   */
  checkAll(): ExecutionBudgetReport {
    const violations: BudgetViolation[] = [];
    const categories: (keyof BudgetUsage)[] = [
      'steps',
      'toolCalls',
      'deployAttempts',
      'repairCycles',
      'simulationReplans',
    ];
    let exceeded = false;
    let degraded = false;

    for (const cat of categories) {
      const budgetKey = this.budgetKeyFor(cat);
      const limit = this.budget[budgetKey];
      const current = this.usage[cat];
      if (current > limit) {
        exceeded = true;
        violations.push({
          category: cat,
          limit,
          actual: current,
          timestamp: deterministicNow(this.seed),
          action: 'blocked',
        });
      } else if (current === limit) {
        degraded = true;
      }
    }

    const remaining = this.getRemaining();
    const totalRemaining =
      remaining.steps +
      remaining.toolCalls +
      remaining.deployAttempts +
      remaining.repairCycles +
      remaining.simulationReplans;
    const summary = exceeded
      ? `Budget exceeded: ${violations.length} violation(s). Degraded: ${degraded}`
      : degraded
        ? `Budget tight: some categories at limit. Degraded mode: ${degraded}`
        : `Budget OK: ${totalRemaining} units remaining`;

    return { budget: this.budget, usage: { ...this.usage }, remaining, exceeded, violations, degraded, summary };
  }

  /**
   * Reset all counters.
   */
  reset(): void {
    this.usage = { steps: 0, toolCalls: 0, deployAttempts: 0, repairCycles: 0, simulationReplans: 0 };
    this.violations = [];
    this.degraded = false;
  }

  isDegraded(): boolean {
    return this.degraded;
  }
  getViolations(): BudgetViolation[] {
    return [...this.violations];
  }
}
