import { deterministicNow } from './determinism-kernel.js';

// ---- Types ----

export type GuardSeverity = 'info' | 'warning' | 'critical';

export interface GuardEvent {
  rule: string;
  message: string;
  severity: GuardSeverity;
  timestamp: string;
  action: 'allowed' | 'stabilized' | 'blocked' | 'degraded';
}

export interface LoopDetectionResult {
  detected: boolean;
  taskName: string;
  repeatCount: number;
  threshold: number;
  action: 'none' | 'stabilize' | 'block';
}

export interface RepairSaturationResult {
  saturated: boolean;
  cycles: number;
  maxCycles: number;
  lastScoreImprovement: number;
  action: 'continue' | 'fail_fast' | 'stop';
}

export interface DeploymentProtectionResult {
  allowed: boolean;
  currentDeployCount: number;
  maxDeploys: number;
  requiresScoreImprovement: boolean;
  scoreDelta: number;
  action: 'allowed' | 'blocked' | 'conditional';
}

export interface DriftDetectionResult {
  drifted: boolean;
  simulatedScore: number;
  actualScore: number;
  driftPercent: number;
  thresholdPercent: number;
  action: 'none' | 'reduce_complexity' | 'abort';
}

export interface StabilityReport {
  loops: LoopDetectionResult[];
  repairSaturation: RepairSaturationResult | null;
  deploymentProtection: DeploymentProtectionResult | null;
  drift: DriftDetectionResult | null;
  events: GuardEvent[];
  stable: boolean;
  failFast: boolean;
}

// ---- Task History ----

interface TaskRecord {
  name: string;
  count: number;
  lastExecuted: string;
}

// ---- Stability Guard ----

const DEFAULT_LOOP_THRESHOLD = 3;
const DEFAULT_MAX_REPAIR_CYCLES = 3;
const DEFAULT_MAX_DEPLOYS = 2;
const DEFAULT_DRIFT_THRESHOLD_PERCENT = 25;

export class ExecutionStabilityGuard {
  private readonly seed: number;
  private readonly loopThreshold: number;
  private readonly maxRepairCycles: number;
  private readonly maxDeploys: number;
  private readonly driftThresholdPercent: number;

  private taskHistory: Map<string, TaskRecord>;
  private events: GuardEvent[];
  private repairCycles: number;
  private lastRepairScore: number;
  private deployCount: number;
  private lastDeployScore: number;
  private failFast: boolean;

  constructor(
    seed: number = 42,
    options?: { loopThreshold?: number; maxRepairCycles?: number; maxDeploys?: number; driftThresholdPercent?: number },
  ) {
    this.seed = seed;
    this.loopThreshold = options?.loopThreshold ?? DEFAULT_LOOP_THRESHOLD;
    this.maxRepairCycles = options?.maxRepairCycles ?? DEFAULT_MAX_REPAIR_CYCLES;
    this.maxDeploys = options?.maxDeploys ?? DEFAULT_MAX_DEPLOYS;
    this.driftThresholdPercent = options?.driftThresholdPercent ?? DEFAULT_DRIFT_THRESHOLD_PERCENT;

    this.taskHistory = new Map();
    this.events = [];
    this.repairCycles = 0;
    this.lastRepairScore = 0;
    this.deployCount = 0;
    this.lastDeployScore = 0;
    this.failFast = false;
  }

  // ---- 1. Loop Detection ----

  detectLoop(taskName: string): LoopDetectionResult {
    const existing = this.taskHistory.get(taskName);
    if (existing) {
      existing.count++;
      existing.lastExecuted = deterministicNow(this.seed);
    } else {
      this.taskHistory.set(taskName, { name: taskName, count: 1, lastExecuted: deterministicNow(this.seed) });
    }

    const record = this.taskHistory.get(taskName)!;
    const repeatCount = record.count;
    const detected = repeatCount > this.loopThreshold;

    let action: LoopDetectionResult['action'] = 'none';
    if (detected && repeatCount > this.loopThreshold + 1) {
      action = 'block';
      this.events.push({
        rule: 'loop_detection',
        message: `Task "${taskName}" repeated ${repeatCount} times (threshold ${this.loopThreshold})`,
        severity: 'critical',
        timestamp: deterministicNow(this.seed),
        action: 'blocked',
      });
    } else if (detected) {
      action = 'stabilize';
      this.events.push({
        rule: 'loop_detection',
        message: `Task "${taskName}" repeated ${repeatCount} times Ã¢â‚¬â€ stabilizing`,
        severity: 'warning',
        timestamp: deterministicNow(this.seed),
        action: 'stabilized',
      });
    }

    return { detected, taskName, repeatCount, threshold: this.loopThreshold, action };
  }

  // ---- 2. Repair Saturation Detection ----

  recordRepairCycle(scoreBefore: number, scoreAfter: number): RepairSaturationResult {
    this.repairCycles++;
    const scoreImprovement = scoreAfter - scoreBefore;
    if (scoreImprovement > this.lastRepairScore) {
      this.lastRepairScore = scoreImprovement;
    }

    const saturated =
      this.repairCycles > this.maxRepairCycles ||
      (this.repairCycles >= 2 && scoreImprovement <= 0 && this.lastRepairScore <= 0);

    let action: RepairSaturationResult['action'] = 'continue';
    if (saturated) {
      action = this.repairCycles > this.maxRepairCycles + 1 ? 'stop' : 'fail_fast';
      this.failFast = action === 'fail_fast' || action === 'stop';
      this.events.push({
        rule: 'repair_saturation',
        message: `Repair cycle ${this.repairCycles}/${this.maxRepairCycles}, score improvement ${scoreImprovement}`,
        severity: action === 'stop' ? 'critical' : 'warning',
        timestamp: deterministicNow(this.seed),
        action: (action as string) === 'continue' ? 'allowed' : action === 'fail_fast' ? 'degraded' : 'blocked',
      });
    }

    return {
      saturated,
      cycles: this.repairCycles,
      maxCycles: this.maxRepairCycles,
      lastScoreImprovement: this.lastRepairScore,
      action,
    };
  }

  // ---- 3. Deployment Protection ----

  recordDeploy(scoreBeforeDeploy: number): DeploymentProtectionResult {
    this.deployCount++;
    const requiresScoreImprovement = this.deployCount > 1;
    const scoreDelta = scoreBeforeDeploy - this.lastDeployScore;
    this.lastDeployScore = scoreBeforeDeploy;

    let allowed = this.deployCount <= this.maxDeploys;
    let action: DeploymentProtectionResult['action'] = 'allowed';

    if (this.deployCount > this.maxDeploys) {
      allowed = false;
      action = 'blocked';
      this.events.push({
        rule: 'deploy_protection',
        message: `Deploy ${this.deployCount}/${this.maxDeploys} Ã¢â‚¬â€ blocked`,
        severity: 'critical',
        timestamp: deterministicNow(this.seed),
        action: 'blocked',
      });
    } else if (requiresScoreImprovement && scoreDelta <= 0) {
      // Second deploy requires score improvement
      action = 'conditional';
      this.events.push({
        rule: 'deploy_protection',
        message: `Deploy ${this.deployCount}/${this.maxDeploys} Ã¢â‚¬â€ score did not improve (delta=${scoreDelta}). Conditional.`,
        severity: 'warning',
        timestamp: deterministicNow(this.seed),
        action: 'degraded',
      });
    }

    return {
      allowed,
      currentDeployCount: this.deployCount,
      maxDeploys: this.maxDeploys,
      requiresScoreImprovement,
      scoreDelta,
      action,
    };
  }

  // ---- 4. Drift Detection ----

  detectDrift(simulatedScore: number, actualScore: number): DriftDetectionResult {
    const driftPercent = simulatedScore > 0 ? (Math.abs(actualScore - simulatedScore) / simulatedScore) * 100 : 0;
    const drifted = driftPercent > this.driftThresholdPercent;

    let action: DriftDetectionResult['action'] = 'none';
    if (drifted && driftPercent > this.driftThresholdPercent + 15) {
      action = 'abort';
      this.events.push({
        rule: 'drift_detection',
        message: `Drift ${driftPercent.toFixed(1)}% exceeds threshold Ã¢â‚¬â€ aborting`,
        severity: 'critical',
        timestamp: deterministicNow(this.seed),
        action: 'blocked',
      });
    } else if (drifted) {
      action = 'reduce_complexity';
      this.events.push({
        rule: 'drift_detection',
        message: `Drift ${driftPercent.toFixed(1)}% Ã¢â‚¬â€ reducing complexity`,
        severity: 'warning',
        timestamp: deterministicNow(this.seed),
        action: 'degraded',
      });
    }

    return {
      drifted,
      simulatedScore,
      actualScore,
      driftPercent: Math.round(driftPercent * 100) / 100,
      thresholdPercent: this.driftThresholdPercent,
      action,
    };
  }

  // ---- Report ----

  getReport(): StabilityReport {
    const loops: LoopDetectionResult[] = [];
    for (const [, record] of this.taskHistory) {
      if (record.count > 1) {
        loops.push({
          detected: record.count > this.loopThreshold,
          taskName: record.name,
          repeatCount: record.count,
          threshold: this.loopThreshold,
          action: record.count > this.loopThreshold ? 'stabilize' : 'none',
        });
      }
    }

    return {
      loops,
      repairSaturation:
        this.repairCycles > 0
          ? {
              saturated: this.repairCycles > this.maxRepairCycles,
              cycles: this.repairCycles,
              maxCycles: this.maxRepairCycles,
              lastScoreImprovement: this.lastRepairScore,
              action: this.failFast ? 'fail_fast' : this.repairCycles > this.maxRepairCycles ? 'stop' : 'continue',
            }
          : null,
      deploymentProtection:
        this.deployCount > 0
          ? {
              allowed: this.deployCount <= this.maxDeploys,
              currentDeployCount: this.deployCount,
              maxDeploys: this.maxDeploys,
              requiresScoreImprovement: this.deployCount > 1,
              scoreDelta: this.lastDeployScore,
              action: this.deployCount <= this.maxDeploys ? 'allowed' : 'blocked',
            }
          : null,
      drift: null,
      events: [...this.events],
      stable: !this.failFast && this.events.filter((e) => e.severity === 'critical').length === 0,
      failFast: this.failFast,
    };
  }

  isFailFast(): boolean {
    return this.failFast;
  }
  reset(): void {
    this.taskHistory.clear();
    this.events = [];
    this.repairCycles = 0;
    this.lastRepairScore = 0;
    this.deployCount = 0;
    this.lastDeployScore = 0;
    this.failFast = false;
  }
}
