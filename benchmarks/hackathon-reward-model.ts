import type { CompanyProfile } from './company-spawner.js';
import type { CompanyResult } from './company-spawner.js';
import { DecisionLogger } from './decision-trace.js';
import { getSeededRandom, type RNG } from './determinism-kernel.js';

export interface RewardSignal {
  totalScore: number;
}

export interface TokenTransaction {
  transactionId: string;
  companyId: string;
  amount: number;
  type: 'reward' | 'penalty' | 'transfer' | 'fee';
  source: 'performance' | 'tool_cost' | 'resource_cost' | 'market_settlement';
  description: string;
  timestamp: string;
}

export interface BudgetBreakdown {
  performance: number;
  toolUsage: number;
  resourceAllocation: number;
  penalties: number;
  rewards: number;
  fees: number;
  remaining: number;
}

export interface ResourceAllocation {
  category: string;
  percentage: number;
  available: number;
  allocated: number;
  remaining: number;
}

export interface StrategyOutcome {
  strategyId: string;
  score: number;
  success: boolean;
}

export interface RewardModel {
  computeScore(execution: {
    toolCalls: number;
    simulationSteps: number;
    deployAttempts: number;
    repairCycles: number;
  }): number;
  toolCost(qualityScore: number, complexity: number): number;
  resourceCost(resourceType: string, quantity: number): number;
  performanceMultiplier(execution: CompanyResult): number;
  penaltyMultiplier(execution: CompanyResult): number;
  distributeTokens(companies: CompanyProfile[], execution: CompanyResult): TokenTransaction[];
  calculateBudget(company: CompanyProfile, execution: CompanyResult): BudgetBreakdown;
  computeReward(execution: CompanyResult): RewardSignal;
  recordOutcome(strategyId: string, outcome: StrategyOutcome): void;
  predictSuccess(strategyId: string, techStack?: string[], problemStatement?: string): { totalScore: number };
  getBestStrategy(): string | null;
  getRewardSummary(): { totalRewards: number; totalPenalties: number; bestStrategy: string | null };
}

export class HackathonRewardModel implements RewardModel {
  private readonly seed: number;
  private readonly rng: RNG;
  private readonly decisionLogger: DecisionLogger;
  private strategyHistory: Map<string, { totalScore: number; count: number; successes: number }> = new Map();

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 40000);
    this.decisionLogger = new DecisionLogger(seed + 9001);
  }

  computeScore(execution: {
    toolCalls: number;
    simulationSteps: number;
    deployAttempts: number;
    repairCycles: number;
  }): number {
    const weightTool = 0.3;
    const weightSteps = 0.2;
    const weightDeploys = 0.25;
    const weightRepairs = 0.2;

    let score = 0;
    if (execution.toolCalls > 0) {
      const toolRate = Math.min(100, execution.toolCalls) / 100;
      score += toolRate * weightTool;
    }

    if (execution.simulationSteps > 0) {
      const stepsRate = Math.min(50, execution.simulationSteps) / 50;
      score += stepsRate * weightSteps;
    }

    if (execution.deployAttempts > 0) {
      const deployRate = Math.min(20, execution.deployAttempts) / 20;
      score += deployRate * weightDeploys;
    }

    if (execution.repairCycles > 0) {
      const repairRate = Math.min(10, execution.repairCycles) / 10;
      score += repairRate * weightRepairs;
    }

    return Math.min(1.0, score);
  }

  toolCost(qualityScore: number, complexity: number): number {
    const baseCost = 0.05 + complexity * 0.1;
    const qualityFactor = 1 + (1 - qualityScore) * 0.5;
    return baseCost * qualityFactor;
  }

  resourceCost(resourceType: string, quantity: number): number {
    const costs: Record<string, number> = {
      compute: 0.1,
      storage: 0.05,
      bandwidth: 0.15,
      agent_time: 0.2,
      tool_license: 0.3,
    };

    const baseCost = costs[resourceType] ?? 0.1;
    const quantityFactor = 1 + Math.log10(quantity + 1) * 0.3;
    return baseCost * quantityFactor;
  }

  performanceMultiplier(execution: CompanyResult): number {
    const base = 1.0;
    const scoreFactor = execution.finalScore;
    const penaltyFactor = Math.max(0.1, 1 - execution.totalFailures * 0.1);
    const innovationBonus = execution.breakdown.wowFactor * 0.5;
    const reliabilityBonus = execution.breakdown.reliability * 0.3;

    return base * scoreFactor * penaltyFactor + innovationBonus + reliabilityBonus;
  }

  penaltyMultiplier(execution: CompanyResult): number {
    const penalty = execution.totalFailures * 0.15 + (execution.deployAttempts > 2 ? 0.2 : 0);
    return 1 + Math.min(0.8, penalty);
  }

  distributeTokens(companies: CompanyProfile[], execution: CompanyResult): TokenTransaction[] {
    const transactions: TokenTransaction[] = [];
    const totalScore = companies.reduce((sum, c) => sum + c.assignedStrategyTemplate.predictedScoreBonus, 0);

    for (const company of companies) {
      const scoreShare = company.assignedStrategyTemplate.predictedScoreBonus / Math.max(totalScore, 1);
      const performanceReward = scoreShare * 100;
      const qualityReward = execution.finalScore * 50;
      const penaltyDeduction = execution.totalFailures > 0 ? execution.totalFailures * 10 : 0;

      if (performanceReward > 0) {
        transactions.push({
          transactionId: `reward-${company.id}-${Date.now()}`,
          companyId: company.id,
          amount: performanceReward,
          type: 'reward',
          source: 'performance',
          description: `Performance reward based on strategy score share`,
          timestamp: new Date().toISOString(),
        });
      }

      if (penaltyDeduction > 0) {
        transactions.push({
          transactionId: `penalty-${company.id}-${Date.now()}`,
          companyId: company.id,
          amount: -penaltyDeduction,
          type: 'penalty',
          source: 'performance',
          description: `Penalty for failures and issues`,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return transactions;
  }

  calculateBudget(company: CompanyProfile, execution: CompanyResult): BudgetBreakdown {
    const toolCost = this.toolCost(company.assignedStrategyTemplate.uxPriority, company.riskTolerance);
    const agentCost = this.resourceCost('agent_time', 5);
    const deployCost = this.resourceCost('compute', execution.deployAttempts);

    const baseBudget = company.executionBudget.maxToolCalls * 0.1 + agentCost + deployCost;
    const performanceBonus = execution.finalScore * 20;
    const innovationBonus = execution.breakdown.wowFactor * 15;
    const reliabilityBonus = execution.breakdown.reliability * 10;

    const rewards = performanceBonus + innovationBonus + reliabilityBonus;
    const penalties = execution.totalFailures * 5 + (execution.deployAttempts > 2 ? 10 : 0);
    const fees = toolCost * 0.1;

    const remaining = baseBudget + rewards - penalties - fees;

    return {
      performance: rewards,
      toolUsage: toolCost,
      resourceAllocation: agentCost + deployCost,
      penalties,
      rewards,
      fees,
      remaining,
    };
  }

  computeReward(execution: CompanyResult): RewardSignal {
    const score = this.computeScore({
      toolCalls: execution.toolCallsUsed || 0,
      simulationSteps: execution.simulationScore || 0,
      deployAttempts: execution.deployAttempts || 0,
      repairCycles: execution.repairCycles || 0,
    });
    return { totalScore: score };
  }

  recordOutcome(strategyId: string, outcome: StrategyOutcome): void {
    const existing = this.strategyHistory.get(strategyId) || { totalScore: 0, count: 0, successes: 0 };
    existing.totalScore += outcome.score;
    existing.count += 1;
    if (outcome.success) existing.successes += 1;
    this.strategyHistory.set(strategyId, existing);
  }

  predictSuccess(strategyId: string, _techStack?: string[], _problemStatement?: string): { totalScore: number } {
    const history = this.strategyHistory.get(strategyId);
    if (!history || history.count === 0) return { totalScore: 50 };
    return { totalScore: history.totalScore / history.count };
  }

  getBestStrategy(): string | null {
    let best: string | null = null;
    let bestScore = -1;
    for (const [id, history] of this.strategyHistory.entries()) {
      const avgScore = history.totalScore / history.count;
      if (avgScore > bestScore) {
        bestScore = avgScore;
        best = id;
      }
    }
    return best;
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }

  getRewardSummary(): { totalRewards: number; totalPenalties: number; bestStrategy: string | null } {
    let totalRewards = 0;
    let totalPenalties = 0;
    for (const history of this.strategyHistory.values()) {
      totalRewards += history.successes;
      totalPenalties += history.count - history.successes;
    }
    return { totalRewards, totalPenalties, bestStrategy: this.getBestStrategy() };
  }
}
