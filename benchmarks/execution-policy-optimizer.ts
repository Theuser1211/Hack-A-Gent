import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface ExecutionPolicy {
  policyId: string;
  toolRetryPolicy: Record<string, number>;
  repairHeuristics: { maxRepairAttempts: number; autoRollbackThreshold: number };
  browserTesting: { depth: 'basic' | 'standard' | 'deep'; journeyCount: number; timeoutPerStep: number };
  deploymentSafety: { requireApproval: boolean; stagingFirst: boolean; healthCheckRetries: number };
  parallelExecutionBudget: number;
  riskTolerance: number;
  version: number;
  updatedAt: string;
}

export interface PolicyChange {
  changeId: string;
  metric: string;
  previousValue: number;
  newValue: number;
  reason: string;
  timestamp: string;
}

export class ExecutionPolicyOptimizer {
  private readonly seed: number;
  private readonly optimizerId: string;
  private readonly decisionLogger: DecisionLogger;
  private policy: ExecutionPolicy;
  private changeLog: PolicyChange[] = [];
  private metricHistory: Array<{ metric: string; value: number; timestamp: string }> = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.optimizerId = 'policy-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 8300);
    this.policy = this.defaultPolicy();
  }

  private defaultPolicy(): ExecutionPolicy {
    return {
      policyId: 'policy-' + createDeterministicUuid(this.seed, 0).slice(0, 8),
      toolRetryPolicy: { deploy: 3, github: 2, shell: 1, browser_test: 2, package: 2, scaffold: 1, file: 1 },
      repairHeuristics: { maxRepairAttempts: 3, autoRollbackThreshold: 0.6 },
      browserTesting: { depth: 'standard', journeyCount: 4, timeoutPerStep: 10000 },
      deploymentSafety: { requireApproval: true, stagingFirst: false, healthCheckRetries: 3 },
      parallelExecutionBudget: 3,
      riskTolerance: 0.5,
      version: 1,
      updatedAt: deterministicNow(this.seed),
    };
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getPolicy(): ExecutionPolicy {
    return {
      ...this.policy,
      policyId: this.policy.policyId,
      version: this.policy.version,
      updatedAt: this.policy.updatedAt,
    };
  }
  getChangeLog(): PolicyChange[] {
    return [...this.changeLog];
  }

  updatePolicy(metric: string, result: number): PolicyChange | null {
    const rng = getSeededRandom(this.seed + this.changeLog.length);
    this.metricHistory.push({
      metric,
      value: result,
      timestamp: deterministicNow(this.seed + this.metricHistory.length),
    });

    const thresholds = this.getThresholds(metric);
    let change: PolicyChange | null = null;

    if (result < thresholds.low) {
      change = this.adjustPolicy(metric, 'decrease', `Low ${metric} (${result}), adjusting for improvement`, rng);
    } else if (result > thresholds.high) {
      change = this.adjustPolicy(metric, 'increase', `High ${metric} (${result}), reinforcing successful policy`, rng);
    }

    return change;
  }

  private getThresholds(metric: string): { low: number; high: number } {
    switch (metric) {
      case 'deploy_success':
        return { low: 0.5, high: 0.9 };
      case 'ux_score':
        return { low: 0.4, high: 0.85 };
      case 'build_success':
        return { low: 0.6, high: 0.95 };
      case 'test_pass_rate':
        return { low: 0.7, high: 0.95 };
      case 'reward_score':
        return { low: 0.3, high: 0.8 };
      default:
        return { low: 0.4, high: 0.8 };
    }
  }

  private adjustPolicy(
    metric: string,
    direction: 'increase' | 'decrease',
    reason: string,
    rng: ReturnType<typeof getSeededRandom>,
  ): PolicyChange {
    const oldPolicy = { ...this.policy };
    let field: string = metric;

    switch (metric) {
      case 'deploy_success': {
        const oldVal = this.policy.deploymentSafety.healthCheckRetries;
        this.policy.deploymentSafety.healthCheckRetries =
          direction === 'decrease' ? Math.max(1, oldVal + Math.ceil(rng.next() * 2)) : Math.max(1, oldVal - 1);
        field = 'deploymentSafety.healthCheckRetries';
        break;
      }
      case 'ux_score': {
        const depths: Array<'basic' | 'standard' | 'deep'> = ['basic', 'standard', 'deep'];
        const idx = depths.indexOf(this.policy.browserTesting.depth);
        this.policy.browserTesting.depth =
          direction === 'decrease' ? depths[Math.min(depths.length - 1, idx + 1)]! : depths[Math.max(0, idx - 1)]!;
        field = 'browserTesting.depth';
        break;
      }
      case 'build_success': {
        const oldVal = this.policy.toolRetryPolicy['shell'] ?? 1;
        this.policy.toolRetryPolicy['shell'] =
          direction === 'decrease' ? Math.min(5, oldVal + 1) : Math.max(0, oldVal - 1);
        field = 'toolRetryPolicy.shell';
        break;
      }
      case 'test_pass_rate': {
        const oldVal = this.policy.browserTesting.journeyCount;
        this.policy.browserTesting.journeyCount =
          direction === 'decrease' ? Math.min(10, oldVal + 1) : Math.max(1, oldVal - 1);
        field = 'browserTesting.journeyCount';
        break;
      }
      case 'reward_score': {
        const oldVal = this.policy.riskTolerance;
        this.policy.riskTolerance = direction === 'decrease' ? Math.min(1, oldVal + 0.1) : Math.max(0, oldVal - 0.1);
        this.policy.riskTolerance = Math.round(this.policy.riskTolerance * 100) / 100;
        field = 'riskTolerance';
        break;
      }
    }

    const change: PolicyChange = {
      changeId: 'pc-' + createDeterministicUuid(this.seed, this.changeLog.length).slice(0, 8),
      metric: field,
      previousValue: this.getFieldValue(oldPolicy, field),
      newValue: this.getFieldValue(this.policy, field),
      reason,
      timestamp: deterministicNow(this.seed + this.changeLog.length),
    };

    this.policy.version++;
    this.policy.updatedAt = deterministicNow(this.seed + this.policy.version);
    this.changeLog.push(change);

    this.decisionLogger.log(
      'strategy',
      'update_policy',
      `Policy change: ${field} â†’ ${change.newValue} (${direction})`,
      0.7,
      [],
      { metric, field, previousValue: change.previousValue, newValue: change.newValue },
    );

    return change;
  }

  private getFieldValue(policy: ExecutionPolicy, field: string): number {
    const parts = field.split('.');
    let val: unknown = policy;
    for (const p of parts) val = (val as Record<string, unknown>)?.[p];
    return typeof val === 'number' ? val : 0;
  }

  getOptimizedPolicy(): ExecutionPolicy {
    return this.getPolicy();
  }

  getMetricTrends(): Array<{
    metric: string;
    current: number;
    trend: 'improving' | 'declining' | 'stable';
    changeCount: number;
  }> {
    const changes = this.changeLog;
    const metrics = new Map<string, number[]>();
    for (const c of changes) {
      const arr = metrics.get(c.metric) ?? [];
      arr.push(c.newValue);
      metrics.set(c.metric, arr);
    }
    return Array.from(metrics.entries()).map(([m, vals]) => {
      const trend =
        vals.length >= 2
          ? vals[vals.length - 1]! > vals[0]!
            ? 'improving'
            : vals[vals.length - 1]! < vals[0]!
              ? 'declining'
              : 'stable'
          : 'stable';
      return { metric: m, current: vals[vals.length - 1]!, trend, changeCount: vals.length };
    });
  }
}
