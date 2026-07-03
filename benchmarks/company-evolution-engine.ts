import type { CompanyResult, CompanyProfile, CompanyStrategyType } from './company-spawner.js';
import { getSeededRandom, createDeterministicUuid, type RNG } from './determinism-kernel.js';

export interface EvolutionDelta {
  generationId: string;
  newBestPatterns: string[];
  deprecatedPatterns: string[];
  mutationsApplied: EvolutionMutationRecord[];
  strategyShifts: StrategyBiasShift[];
  expectedScoreImprovement: number;
}

export interface EvolutionMutationRecord {
  target: string;
  mutationType: 'strategy_bias_shift' | 'agent_role_reweighting' | 'tool_usage_optimization' | 'budget_reallocation';
  previousValue: string;
  newValue: string;
}

export interface StrategyBiasShift {
  companyId: string;
  from: CompanyStrategyType;
  to: CompanyStrategyType;
  reason: string;
}

export class CompanyEvolutionEngine {
  setEvolutionPressure(value: number): void {}

  private readonly seed: number;
  private readonly rng: RNG;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 28000);
  }

  evolve(companies: CompanyProfile[], results: CompanyResult[]): EvolutionDelta {
    const generationId = `company-gen-${createDeterministicUuid(this.seed, Date.now()).slice(0, 8)}`;

    const sorted = [...results].sort((a, b) => b.finalScore - a.finalScore);
    const top3 = sorted.slice(0, 3);
    const bottom3 = sorted.slice(-3);

    const newBestPatterns = this.extractBestPatterns(top3);
    const deprecatedPatterns = this.extractDeprecatedPatterns(bottom3);
    const mutationsApplied = this.computeMutations(top3, bottom3);
    const strategyShifts = this.computeStrategyShifts(top3, companies);

    const expectedScoreImprovement = this.estimateImprovement(newBestPatterns.length, mutationsApplied.length);

    return {
      generationId,
      newBestPatterns,
      deprecatedPatterns,
      mutationsApplied,
      strategyShifts,
      expectedScoreImprovement: Math.round(expectedScoreImprovement * 100) / 100,
    };
  }

  private extractBestPatterns(top3: CompanyResult[]): string[] {
    const patterns: string[] = [];

    const allStrengths = top3.flatMap((r) => r.strengths);
    const strengthCount = new Map<string, number>();
    for (const s of allStrengths) {
      strengthCount.set(s, (strengthCount.get(s) ?? 0) + 1);
    }

    for (const [strength, count] of strengthCount) {
      if (count >= 2) {
        patterns.push(`top companies share: ${strength}`);
      }
    }

    const strategyFreq = new Map<string, number>();
    for (const r of top3) {
      strategyFreq.set(r.strategyType, (strategyFreq.get(r.strategyType) ?? 0) + 1);
    }
    for (const [strat, count] of strategyFreq) {
      if (count >= 2) {
        patterns.push(`winning pattern: ${strat} strategy (${count}/${top3.length} top companies)`);
      }
    }

    const avgScore = top3.reduce((s, r) => s + r.finalScore, 0) / top3.length;
    if (avgScore > 75) patterns.push(`high score cluster: average ${Math.round(avgScore)}/100 among top companies`);

    const hasDeploy = top3.filter((r) => r.deployUrl !== null).length;
    if (hasDeploy >= 2) patterns.push('deployment reliability correlates with top performance');

    if (patterns.length === 0) patterns.push('no clear winning pattern yet Ã¢â‚¬â€ exploration phase');

    return patterns;
  }

  private extractDeprecatedPatterns(bottom3: CompanyResult[]): string[] {
    const patterns: string[] = [];

    const allFailures = bottom3.flatMap((r) => r.failureReasons);
    const failureCount = new Map<string, number>();
    for (const f of allFailures) {
      failureCount.set(f, (failureCount.get(f) ?? 0) + 1);
    }

    for (const [failure, count] of failureCount) {
      if (count >= 2) {
        patterns.push(`recurring failure: ${failure} (${count}/${bottom3.length} companies)`);
      }
    }

    const stratFail = new Map<string, number>();
    for (const r of bottom3) {
      stratFail.set(r.strategyType, (stratFail.get(r.strategyType) ?? 0) + 1);
    }
    for (const [strat, count] of stratFail) {
      if (count >= 2) {
        patterns.push(`underperforming strategy: ${strat}`);
      }
    }

    const avgRepairs = bottom3.reduce((s, r) => s + r.repairCycles, 0) / bottom3.length;
    if (avgRepairs > 2) patterns.push('excessive repair cycles correlate with low scores');

    if (patterns.length === 0) patterns.push('no clear failure pattern yet');

    return patterns;
  }

  private computeMutations(top3: CompanyResult[], bottom3: CompanyResult[]): EvolutionMutationRecord[] {
    const mutations: EvolutionMutationRecord[] = [];
    const applied = new Set<string>();

    for (const winner of top3) {
      if (applied.has(winner.companyId)) continue;
      applied.add(winner.companyId);

      if (this.rng.next() > 0.5) {
        mutations.push({
          target: winner.companyId,
          mutationType: 'strategy_bias_shift',
          previousValue: winner.strategyType,
          newValue:
            winner.strategyType === 'speed' ? 'balanced' : winner.strategyType === 'innovation' ? 'ux' : 'reliability',
        });
      }

      if (this.rng.next() > 0.6) {
        mutations.push({
          target: winner.companyId,
          mutationType: 'agent_role_reweighting',
          previousValue: 'default weighting',
          newValue: 'ux_agent_weight_increased',
        });
      }
    }

    for (const loser of bottom3) {
      if (applied.has(loser.companyId)) continue;
      applied.add(loser.companyId);

      if (this.rng.next() > 0.4) {
        mutations.push({
          target: loser.companyId,
          mutationType: 'tool_usage_optimization',
          previousValue: `${loser.toolCallsUsed} tool calls`,
          newValue: `${Math.max(1, Math.floor(loser.toolCallsUsed * 0.7))} tool calls (reduced)`,
        });
      }
    }

    if (mutations.length === 0) {
      mutations.push({
        target: 'global',
        mutationType: 'budget_reallocation',
        previousValue: 'default budget',
        newValue: 'reduced budget for exploration',
      });
    }

    return mutations;
  }

  private computeStrategyShifts(top3: CompanyResult[], companies: CompanyProfile[]): StrategyBiasShift[] {
    const shifts: StrategyBiasShift[] = [];
    const topStrategies = new Set(top3.map((r) => r.strategyType));

    for (const company of companies) {
      if (!topStrategies.has(company.strategyType) && this.rng.next() > 0.5) {
        const targetType = [...topStrategies][Math.floor(this.rng.next() * topStrategies.size)];
        if (targetType && targetType !== company.strategyType) {
          shifts.push({
            companyId: company.id,
            from: company.strategyType,
            to: targetType as CompanyStrategyType,
            reason: `Shifting toward winning strategy type ${targetType}`,
          });
        }
      }
    }

    return shifts;
  }

  private estimateImprovement(patternCount: number, mutationCount: number): number {
    const base = 2;
    const patternBonus = patternCount * 1.5;
    const mutationBonus = mutationCount * 1;
    const noise = this.rng.next() * 2;
    return base + patternBonus + mutationBonus + noise;
  }
}
