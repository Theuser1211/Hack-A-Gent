import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';
import { type TaskGraph, type TaskCategory } from './task-graph.js';

export interface CapabilityMutation {
  id: string;
  type: 'add' | 'modify' | 'remove';
  target: string;
  reason: string;
  expectedImpact: string;
  simulatedSuccessRate: number;
  activated: boolean;
  timestamp: string;
}

export interface FailurePatternRecord {
  patternId: string;
  category: string;
  description: string;
  frequency: number;
  lastOccurrence: string;
  suggestedFix: string;
  fixedByMutation: string | null;
}

export interface StrategyPerformanceRecord {
  strategyId: string;
  strategyDescription: string;
  projectCount: number;
  successCount: number;
  avgScore: number;
  lastUsed: string;
}

export class CapabilityEvolutionEngine {
  private readonly seed: number;
  private readonly engineId: string;
  private readonly decisionLogger: DecisionLogger;
  private mutations: CapabilityMutation[] = [];
  private failurePatterns: FailurePatternRecord[] = [];
  private strategyPerformance: StrategyPerformanceRecord[] = [];
  private readonly learningMemory: Map<string, unknown> = new Map();

  constructor(seed = 42) {
    this.seed = seed;
    this.engineId = 'evo-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 6000);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getMutations(): CapabilityMutation[] {
    return [...this.mutations];
  }
  getFailurePatterns(): FailurePatternRecord[] {
    return [...this.failurePatterns];
  }
  getStrategyPerformance(): StrategyPerformanceRecord[] {
    return [...this.strategyPerformance];
  }

  trackFailure(taskGraph: TaskGraph): FailurePatternRecord[] {
    const newPatterns: FailurePatternRecord[] = [];
    const blocked = taskGraph.getNodesByStatus('blocked');

    for (const node of blocked) {
      const existing = this.failurePatterns.find((p) => p.description === node.error);
      if (existing) {
        existing.frequency++;
        existing.lastOccurrence = deterministicNow(this.seed + this.failurePatterns.length);
      } else if (node.error) {
        const pattern: FailurePatternRecord = {
          patternId: 'fp-' + createDeterministicUuid(this.seed, this.failurePatterns.length).slice(0, 8),
          category: node.category,
          description: node.error,
          frequency: 1,
          lastOccurrence: deterministicNow(this.seed + this.failurePatterns.length),
          suggestedFix: this.suggestFix(node.error, node.category),
          fixedByMutation: null,
        };
        this.failurePatterns.push(pattern);
        newPatterns.push(pattern);
      }
    }

    if (newPatterns.length > 0) {
      this.decisionLogger.log('debug', 'track_failure', `Tracked ${newPatterns.length} new failure patterns`, 0.7, [], {
        newPatterns: newPatterns.map((p) => p.description),
      });
    }

    return newPatterns;
  }

  private suggestFix(error: string, category: TaskCategory): string {
    const lower = error.toLowerCase();
    if (lower.includes('not found') || lower.includes('enoent'))
      return 'Check file paths and ensure dependencies are installed';
    if (lower.includes('timeout')) return 'Increase timeout or optimize slow operations';
    if (lower.includes('network') || lower.includes('fetch')) return 'Add retry logic with exponential backoff';
    if (lower.includes('build') || lower.includes('compile'))
      return 'Pin dependency versions and verify TypeScript config';
    if (category === 'deployment') return 'Verify deployment tokens and project configuration';
    if (category === 'testing') return 'Add fallback test generation for missing test files';
    return 'Review error and add defensive checks';
  }

  proposeMutation(failurePattern: FailurePatternRecord): CapabilityMutation {
    const rng = getSeededRandom(this.seed + this.mutations.length);
    const simulatedSuccess = 0.4 + rng.next() * 0.5;

    if (!this.failurePatterns.find((p) => p.patternId === failurePattern.patternId)) {
      this.failurePatterns.push({ ...failurePattern });
    }

    const mutation: CapabilityMutation = {
      id: 'mut-' + createDeterministicUuid(this.seed, this.mutations.length).slice(0, 8),
      type: 'add',
      target: `auto_fix_${failurePattern.category}`,
      reason: `Failure pattern "${failurePattern.description}" occurred ${failurePattern.frequency} time(s)`,
      expectedImpact: `Reduce ${failurePattern.category} failures by ${Math.round(simulatedSuccess * 100)}%`,
      simulatedSuccessRate: Math.round(simulatedSuccess * 100) / 100,
      activated: false,
      timestamp: deterministicNow(this.seed + this.mutations.length),
    };

    this.mutations.push(mutation);
    this.decisionLogger.log(
      'strategy',
      'propose_mutation',
      `Proposed ${mutation.type} ${mutation.target}: ${mutation.reason}`,
      mutation.simulatedSuccessRate,
      [],
      { mutationType: mutation.type, target: mutation.target, simulatedSuccessRate: mutation.simulatedSuccessRate },
    );

    return mutation;
  }

  simulateMutation(mutation: CapabilityMutation): { predictedImprovement: number; recommendation: string } {
    const rng = getSeededRandom(this.seed + this.mutations.indexOf(mutation) + 100);
    const baseImprovement = mutation.simulatedSuccessRate * 0.7;
    const randomness = (rng.next() - 0.5) * 0.2;
    const predicted = Math.max(0, Math.min(1, baseImprovement + randomness));

    const recommendation =
      predicted > 0.6
        ? `Strong candidate: predicted improvement of ${Math.round(predicted * 100)}%`
        : predicted > 0.3
          ? `Moderate potential: predicted improvement of ${Math.round(predicted * 100)}%`
          : `Low expected impact (${Math.round(predicted * 100)}%). Consider alternative approaches.`;

    return { predictedImprovement: Math.round(predicted * 100) / 100, recommendation };
  }

  activateMutation(mutationId: string): boolean {
    const mutation = this.mutations.find((m) => m.id === mutationId);
    if (!mutation || mutation.activated) return false;
    mutation.activated = true;

    this.decisionLogger.log('strategy', 'activate_mutation', `Activated ${mutation.type} ${mutation.target}`, 0.9, [], {
      mutationId,
      target: mutation.target,
    });

    const pattern = this.failurePatterns.find((p) => mutation.reason.includes(p.description));
    if (pattern) pattern.fixedByMutation = mutation.id;

    return true;
  }

  recordStrategyPerformance(strategy: string, success: boolean, score: number): void {
    const existing = this.strategyPerformance.find((s) => s.strategyDescription === strategy);
    if (existing) {
      existing.projectCount++;
      if (success) existing.successCount++;
      existing.avgScore =
        Math.round(((existing.avgScore * (existing.projectCount - 1) + score) / existing.projectCount) * 100) / 100;
      existing.lastUsed = deterministicNow(this.seed + this.strategyPerformance.length);
    } else {
      this.strategyPerformance.push({
        strategyId: 'strat-' + createDeterministicUuid(this.seed, this.strategyPerformance.length).slice(0, 8),
        strategyDescription: strategy.slice(0, 100),
        projectCount: 1,
        successCount: success ? 1 : 0,
        avgScore: score,
        lastUsed: deterministicNow(this.seed + this.strategyPerformance.length),
      });
    }
  }

  getBestStrategy(): StrategyPerformanceRecord | null {
    if (this.strategyPerformance.length === 0) return null;
    return this.strategyPerformance.reduce((best, curr) =>
      curr.avgScore > best.avgScore && curr.projectCount >= 2 ? curr : best,
    );
  }

  getLearningSummary(): {
    totalMutations: number;
    activatedMutations: number;
    trackedPatterns: number;
    topStrategies: string[];
    improvements: string[];
  } {
    const top = this.strategyPerformance.filter((s) => s.avgScore > 0.6).map((s) => s.strategyDescription);
    const improvements: string[] = [];
    for (const m of this.mutations.filter((m) => m.activated)) {
      improvements.push(`${m.type} ${m.target}: ${m.expectedImpact}`);
    }
    return {
      totalMutations: this.mutations.length,
      activatedMutations: this.mutations.filter((m) => m.activated).length,
      trackedPatterns: this.failurePatterns.length,
      topStrategies: top.slice(0, 3),
      improvements,
    };
  }
}
