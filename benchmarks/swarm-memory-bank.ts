import { getSeededRandom, deterministicNow } from './determinism-kernel.js';
import type { SwarmResult } from './hackathon-swarm-orchestrator.js';
import type { EvolutionResult } from './swarm-evolution-engine.js';
import type { AggregationReport } from './swarm-judge-aggregator.js';
import type { SwarmLeaderboardEntry } from './swarm-leaderboard.js';

export interface WinningStrategyRecord {
  strategyType: string;
  strategyName: string;
  winCount: number;
  totalRuns: number;
  winRate: number;
  averageScore: number;
  firstWonAt: string;
  lastWonAt: string;
}

export interface FailurePatternRecord {
  pattern: string;
  frequency: number;
  affectedStrategyTypes: string[];
  firstSeen: string;
  lastSeen: string;
}

export interface JudgeBiasRecord {
  bias: string;
  frequency: number;
  associatedStrategies: string[];
}

export interface ExecutionInefficiencyRecord {
  pattern: string;
  agentCount: number;
  totalFailures: number;
  totalRepairs: number;
}

export interface MetaLearningState {
  coreArchetypes: string[];
  deprecatedStrategies: string[];
  winningStrategies: WinningStrategyRecord[];
  failurePatterns: FailurePatternRecord[];
  judgeBiases: JudgeBiasRecord[];
  executionInefficiencies: ExecutionInefficiencyRecord[];
  lastMetaUpdate: string;
}

export class SwarmMemoryBank {
  private readonly seed: number;
  private state: MetaLearningState;

  constructor(seed = 42) {
    this.seed = seed;
    this.state = {
      coreArchetypes: [],
      deprecatedStrategies: [],
      winningStrategies: [],
      failurePatterns: [],
      judgeBiases: [],
      executionInefficiencies: [],
      lastMetaUpdate: deterministicNow(seed),
    };
  }

  learnFromSwarm(
    result: SwarmResult,
    aggregation: AggregationReport,
    leaderboardEntries: SwarmLeaderboardEntry[],
    evolutionResult: EvolutionResult | null,
  ): MetaLearningState {
    this.updateWinningStrategies(leaderboardEntries);
    this.updateFailurePatterns(result);
    this.updateJudgeBiases(aggregation);
    this.updateExecutionInefficiencies(result);
    this.learnFromEvolution(evolutionResult);
    this.applyMetaLearningRules();
    this.state.lastMetaUpdate = deterministicNow(this.seed);

    return { ...this.state };
  }

  private updateWinningStrategies(entries: SwarmLeaderboardEntry[]): void {
    for (const entry of entries) {
      if (!entry.win) continue;

      const existing = this.state.winningStrategies.find((w) => w.strategyType === entry.strategyType);

      if (existing) {
        existing.winCount++;
        existing.totalRuns++;
        existing.winRate = existing.winCount / existing.totalRuns;
        existing.averageScore = (existing.averageScore * (existing.totalRuns - 1) + entry.score) / existing.totalRuns;
        existing.lastWonAt = entry.executedAt;
      } else {
        this.state.winningStrategies.push({
          strategyType: entry.strategyType,
          strategyName: entry.strategyName,
          winCount: 1,
          totalRuns: 1,
          winRate: 1,
          averageScore: entry.score,
          firstWonAt: entry.executedAt,
          lastWonAt: entry.executedAt,
        });
      }
    }
  }

  private updateFailurePatterns(result: SwarmResult): void {
    for (const agent of result.agents) {
      const failures = agent.failureCount ?? 0;
      if (failures <= 0) continue;

      const key = `high_failures_${agent.strategy.category}`;
      const existing = this.state.failurePatterns.find((f) => f.pattern === key);

      if (existing) {
        existing.frequency++;
        existing.lastSeen = result.executedAt;
        if (!existing.affectedStrategyTypes.includes(agent.strategy.category)) {
          existing.affectedStrategyTypes.push(agent.strategy.category);
        }
      } else {
        this.state.failurePatterns.push({
          pattern: key,
          frequency: 1,
          affectedStrategyTypes: [agent.strategy.category],
          firstSeen: result.executedAt,
          lastSeen: result.executedAt,
        });
      }
    }
  }

  private updateJudgeBiases(aggregation: AggregationReport): void {
    for (const score of aggregation.scores) {
      for (const flag of score.biasFlags) {
        const existing = this.state.judgeBiases.find((b) => b.bias === flag);
        if (existing) {
          existing.frequency++;
          if (!existing.associatedStrategies.includes(score.strategyType)) {
            existing.associatedStrategies.push(score.strategyType);
          }
        } else {
          this.state.judgeBiases.push({ bias: flag, frequency: 1, associatedStrategies: [score.strategyType] });
        }
      }
    }
  }

  private updateExecutionInefficiencies(result: SwarmResult): void {
    for (const agent of result.agents) {
      const failures = agent.failureCount ?? 0;
      const repairs = agent.repairCycles ?? 0;

      if (failures > 2 || repairs > 2) {
        const pattern = failures > repairs ? 'failure_heavy' : 'repair_heavy';
        const existing = this.state.executionInefficiencies.find((e) => e.pattern === pattern);
        if (existing) {
          existing.agentCount++;
          existing.totalFailures += failures;
          existing.totalRepairs += repairs;
        } else {
          this.state.executionInefficiencies.push({
            pattern,
            agentCount: 1,
            totalFailures: failures,
            totalRepairs: repairs,
          });
        }
      }
    }
  }

  private learnFromEvolution(evolutionResult: EvolutionResult | null): void {
    if (!evolutionResult) return;

    for (const pattern of evolutionResult.successPatterns) {
      const existing = this.state.failurePatterns.find((f) => f.pattern === `success_${pattern.slice(0, 40)}`);
      if (existing) {
        existing.frequency++;
      } else {
        this.state.failurePatterns.push({
          pattern: `success_${pattern.slice(0, 40)}`,
          frequency: 1,
          affectedStrategyTypes: [],
          firstSeen: evolutionResult.appliedAt,
          lastSeen: evolutionResult.appliedAt,
        });
      }
    }
  }

  private applyMetaLearningRules(): void {
    const rng = getSeededRandom(this.seed + this.state.winningStrategies.length);

    for (const winning of this.state.winningStrategies) {
      if (winning.winCount >= 3 && !this.state.coreArchetypes.includes(winning.strategyType)) {
        this.state.coreArchetypes.push(winning.strategyType);
      }
    }

    for (const failure of this.state.failurePatterns) {
      if (failure.frequency >= 5 && !this.state.deprecatedStrategies.includes(failure.pattern)) {
        const r = rng.next();
        if (r > 0.5 && failure.affectedStrategyTypes.length > 0) {
          const depCandidate = failure.affectedStrategyTypes[0]!;
          if (!this.state.deprecatedStrategies.includes(depCandidate)) {
            this.state.deprecatedStrategies.push(depCandidate);
          }
        }
      }
    }
  }

  getState(): MetaLearningState {
    return { ...this.state };
  }

  getCoreArchetypes(): string[] {
    return [...this.state.coreArchetypes];
  }

  getDeprecatedStrategies(): string[] {
    return [...this.state.deprecatedStrategies];
  }

  toJSON(): string {
    return JSON.stringify(this.state, null, 2);
  }
}
