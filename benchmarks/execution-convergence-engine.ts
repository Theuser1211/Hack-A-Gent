import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid } from './determinism-kernel.js';
import type { TaskGraph } from './task-graph.js';

export interface ConvergenceCriteria {
  deploymentStable: boolean;
  uiFlowComplete: boolean;
  testSuitePassThreshold: number;
  minUxScore: number;
  maxCriticalTasks: number;
  minTaskCompletionRate: number;
}

export interface ConvergenceReport {
  converged: boolean;
  criteria: Record<string, { met: boolean; current: number; threshold: number | boolean }>;
  score: number;
  recommendedAction: 'continue' | 'converge_early' | 'force_converge' | 'rollback' | 'continue_with_repairs';
  rollbackCandidate: string | null;
  details: string;
}

export class ExecutionConvergenceEngine {
  private readonly seed: number;
  private readonly engineId: string;
  private readonly decisionLogger: DecisionLogger;
  private bestStateId: string | null = null;
  private bestScore = 0;
  private convergenceHistory: ConvergenceReport[] = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.engineId = 'conv-eng-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.decisionLogger = new DecisionLogger(seed + 7000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getConvergenceHistory(): ConvergenceReport[] {
    return [...this.convergenceHistory];
  }
  getBestScore(): number {
    return this.bestScore;
  }
  getBestStateId(): string | null {
    return this.bestStateId;
  }

  getDefaultCriteria(): ConvergenceCriteria {
    return {
      deploymentStable: true,
      uiFlowComplete: true,
      testSuitePassThreshold: 0.8,
      minUxScore: 0.6,
      maxCriticalTasks: 0,
      minTaskCompletionRate: 0.9,
    };
  }

  evaluateConvergence(
    taskGraph: TaskGraph,
    uxScore: number,
    testPassRate: number,
    deploymentLive: boolean,
    criteria?: Partial<ConvergenceCriteria>,
  ): ConvergenceReport {
    const c = { ...this.getDefaultCriteria(), ...criteria };
    const progress = taskGraph.getProgress();
    const taskCompletionRate = progress.total > 0 ? progress.done / progress.total : 1;
    const uiTasks = taskGraph.getNodesByCategory('frontend');
    const uiDone = uiTasks.filter((n) => n.status === 'done').length;
    const uiComplete = uiTasks.length > 0 ? uiDone / uiTasks.length : 1;
    const criticalTasks = taskGraph
      .getAllNodes()
      .filter((n) => n.status === 'blocked' || n.status === 'pending').length;

    const results: Record<string, { met: boolean; current: number; threshold: number | boolean }> = {
      deploymentStable: {
        met: deploymentLive === c.deploymentStable,
        current: deploymentLive ? 1 : 0,
        threshold: c.deploymentStable,
      },
      uiFlowComplete: {
        met: uiComplete >= uiTasks.length * 0.8 || uiDone === uiTasks.length,
        current: Math.round(uiComplete * 100) / 100,
        threshold: true,
      },
      testPassRate: {
        met: testPassRate >= c.testSuitePassThreshold,
        current: Math.round(testPassRate * 100) / 100,
        threshold: Math.round(c.testSuitePassThreshold * 100) / 100,
      },
      uxScore: {
        met: uxScore >= c.minUxScore,
        current: Math.round(uxScore * 100) / 100,
        threshold: Math.round(c.minUxScore * 100) / 100,
      },
      taskCompletion: {
        met: taskCompletionRate >= c.minTaskCompletionRate,
        current: Math.round(taskCompletionRate * 100) / 100,
        threshold: Math.round(c.minTaskCompletionRate * 100) / 100,
      },
      criticalTasks: {
        met: criticalTasks <= c.maxCriticalTasks,
        current: criticalTasks,
        threshold: c.maxCriticalTasks,
      },
    };

    const metCount = Object.values(results).filter((r) => r.met).length;
    const totalCount = Object.values(results).length;
    const score = Math.round((metCount / totalCount) * 100) / 100;

    let recommendedAction: ConvergenceReport['recommendedAction'] = 'continue';
    if (score >= 1) recommendedAction = 'converge_early';
    else if (score >= 0.83 && testPassRate >= c.testSuitePassThreshold) recommendedAction = 'force_converge';
    else if (progress.blocked > 0 && score < 0.5) recommendedAction = 'continue_with_repairs';
    else if (this.bestScore > 0 && score < this.bestScore - 0.3) recommendedAction = 'rollback';

    if (score > this.bestScore) {
      this.bestScore = score;
      this.bestStateId = 'best-' + createDeterministicUuid(this.seed, this.convergenceHistory.length).slice(0, 8);
    }

    const report: ConvergenceReport = {
      converged: score >= 0.83,
      criteria: results,
      score,
      recommendedAction,
      rollbackCandidate: recommendedAction === 'rollback' ? this.bestStateId : null,
      details: `Convergence score: ${(score * 100).toFixed(0)}%, Action: ${recommendedAction}, Best: ${(this.bestScore * 100).toFixed(0)}%`,
    };

    this.convergenceHistory.push(report);
    this.decisionLogger.log('planner', 'convergence_eval', report.details, score, [], {
      converged: report.converged,
      score,
      recommendedAction,
      taskCompletion: taskCompletionRate,
    });

    return report;
  }

  shouldEarlyStop(report: ConvergenceReport): boolean {
    return report.converged && report.recommendedAction === 'converge_early';
  }

  shouldForceConverge(report: ConvergenceReport): boolean {
    return report.recommendedAction === 'force_converge';
  }

  shouldRollback(report: ConvergenceReport): boolean {
    return report.recommendedAction === 'rollback';
  }
}
