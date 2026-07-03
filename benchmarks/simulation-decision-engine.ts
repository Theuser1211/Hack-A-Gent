import type { SimulationResult } from './hackathon-simulation-engine.js';
import type { JudgeVerdict } from './judge-simulator.js';

// ---- Types ----

export type ExecutionMode = 'full' | 'safe' | 'demo-only' | 'abort';

export interface ExecutionDecision {
  proceed: boolean;
  mode: ExecutionMode;
  reason: string;
  riskFlags: string[];
  suggestedBudget?: { maxSteps?: number; maxToolCalls?: number; maxDeployAttempts?: number; maxRepairCycles?: number };
}

export interface RiskFactor {
  name: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
}

// ---- Decision thresholds ----

const FULL_THRESHOLD = 80;
const SAFE_THRESHOLD = 60;
const DEMO_THRESHOLD = 40;
const MAX_FAILURE_VARIANCE = 0.3;
const MAX_REPAIR_DEPTH = 3;

// ---- Decision Engine ----

export class SimulationDecisionEngine {
  /**
   * Evaluate simulation result and return execution decision.
   *
   * Rules:
   *   score ÃƒÂ¢Ã¢â‚¬Â°Ã‚Â¥ 80  ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ FULL EXECUTION
   *   score 60ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“79 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ SAFE MODE (limited tools, reduced repair cycles)
   *   score 40ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“59 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ DEMO ONLY MODE
   *   score < 40  ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ABORT EXECUTION
   *
   * Risk factors adjust the mode downward:
   *   high failure variance     ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ downgrade one level
   *   unstable judge score      ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ downgrade one level
   *   high repair dependency    ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ downgrade one level
   *   tool execution overload   ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ downgrade one level
   */
  evaluate(simulationResult: SimulationResult): ExecutionDecision {
    const score = simulationResult.finalJudgeVerdict.total;
    const riskFlags: string[] = [];
    const riskFactors = this.assessRiskFactors(simulationResult);
    const baseMode = this.scoreToMode(score);

    // Apply risk factor downgrades
    let downgrades = 0;
    for (const factor of riskFactors) {
      if (factor.severity === 'critical') {
        riskFlags.push(`CRITICAL: ${factor.description}`);
        downgrades += 2;
      } else if (factor.severity === 'high') {
        riskFlags.push(`HIGH: ${factor.description}`);
        downgrades += 1;
      } else if (factor.severity === 'medium') {
        riskFlags.push(`MEDIUM: ${factor.description}`);
        downgrades += 0.5;
      } else {
        riskFlags.push(`LOW: ${factor.description}`);
      }
    }

    const finalMode = this.downgradeMode(baseMode, Math.floor(downgrades));
    const proceed = finalMode !== 'abort';

    // Build reason
    let reason = `Score ${score}/100 ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ${finalMode.toUpperCase()} mode`;
    if (downgrades > 0) {
      reason += ` (downgraded ${Math.floor(downgrades)} level(s) by ${riskFactors.length} risk factor(s))`;
    }

    const suggestedBudget = this.suggestBudget(finalMode);

    return { proceed, mode: finalMode, reason, riskFlags, suggestedBudget };
  }

  private scoreToMode(score: number): ExecutionMode {
    if (score >= FULL_THRESHOLD) return 'full';
    if (score >= SAFE_THRESHOLD) return 'safe';
    if (score >= DEMO_THRESHOLD) return 'demo-only';
    return 'abort';
  }

  private downgradeMode(mode: ExecutionMode, levels: number): ExecutionMode {
    const modes: ExecutionMode[] = ['full', 'safe', 'demo-only', 'abort'];
    const idx = modes.indexOf(mode);
    if (idx === -1) return mode;
    const newIdx = Math.min(modes.length - 1, idx + levels);
    return modes[newIdx]!;
  }

  private assessRiskFactors(simResult: SimulationResult): RiskFactor[] {
    const factors: RiskFactor[] = [];
    const scores = simResult.allScores;
    const failures = simResult.failureTimeline;
    const repairs = simResult.repairTimeline;

    // 1. Failure variance ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â check if failure count is highly variable across strategies
    if (scores.length >= 2) {
      const failureCounts = scores.map((s) => s.failureCount);
      const avg = failureCounts.reduce((a, b) => a + b, 0) / failureCounts.length;
      const variance = failureCounts.reduce((sum, c) => sum + Math.pow(c - avg, 2), 0) / failureCounts.length;
      const stdDev = Math.sqrt(variance);
      if (avg > 0 && stdDev / avg > MAX_FAILURE_VARIANCE) {
        factors.push({
          name: 'high_failure_variance',
          severity: 'high',
          description: `Failure variance ${((stdDev / avg) * 100).toFixed(0)}% across strategies`,
        });
      }
    }

    // 2. Judge score instability ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â check spread between predicted and judged
    if (scores.length >= 2) {
      const judgedScores = scores.map((s) => s.judgeVerdict.total);
      const predictedScores = scores.map((s) => s.predictedScore);
      const deltas = judgedScores.map((j, i) => Math.abs(j - (predictedScores[i] ?? 0)));
      const avgDelta = deltas.reduce((a, b) => a + b, 0) / deltas.length;
      if (avgDelta > 20) {
        factors.push({
          name: 'unstable_judge_score',
          severity: 'medium',
          description: `Average judge delta ${avgDelta.toFixed(0)} points`,
        });
      }
    }

    // 3. Repair dependency depth
    const repairsPerStrategy = new Map<string, number>();
    for (const r of repairs) {
      repairsPerStrategy.set(r.strategyId, (repairsPerStrategy.get(r.strategyId) ?? 0) + 1);
    }
    for (const [, count] of repairsPerStrategy) {
      if (count > MAX_REPAIR_DEPTH) {
        factors.push({
          name: 'high_repair_dependency',
          severity: 'high',
          description: `${count} repairs needed for a single strategy`,
        });
        break;
      }
    }

    // 4. Tool execution overload risk ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â based on total task count + failure density
    const totalFailures = failures.length;
    const totalStrategies = scores.length;
    const failureDensity = totalStrategies > 0 ? totalFailures / totalStrategies : 0;
    if (failureDensity > 3) {
      factors.push({
        name: 'tool_execution_overload',
        severity: 'medium',
        description: `${failureDensity.toFixed(1)} failures per strategy on average`,
      });
    }

    // 5. Critical crash presence
    const criticalCrashes = failures.filter((f) => f.severity === 'critical').length;
    if (criticalCrashes > 0) {
      factors.push({
        name: 'critical_crash_detected',
        severity: 'critical',
        description: `${criticalCrashes} critical crash(es) in simulation`,
      });
    }

    return factors;
  }

  private suggestBudget(mode: ExecutionMode): ExecutionDecision['suggestedBudget'] {
    switch (mode) {
      case 'full':
        return { maxSteps: 50, maxToolCalls: 30, maxDeployAttempts: 2, maxRepairCycles: 3 };
      case 'safe':
        return { maxSteps: 30, maxToolCalls: 15, maxDeployAttempts: 1, maxRepairCycles: 1 };
      case 'demo-only':
        return { maxSteps: 10, maxToolCalls: 5, maxDeployAttempts: 0, maxRepairCycles: 0 };
      case 'abort':
        return { maxSteps: 0, maxToolCalls: 0, maxDeployAttempts: 0, maxRepairCycles: 0 };
    }
  }
}
