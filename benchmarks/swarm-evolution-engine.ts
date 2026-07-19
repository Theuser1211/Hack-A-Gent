import { getSeededRandom, deterministicNow, createDeterministicUuid, nextTraceCounter, type RNG } from './determinism-kernel.js';
import type { SwarmLeaderboardEntry, StrategySuccessRecord } from './swarm-leaderboard.js';
import type { StrategyTemplate, StrategyTemplateCategory } from './winning-strategy-templates.js';
import { WINNING_STRATEGIES } from './winning-strategy-templates.js';

export interface EvolutionResult {
  mutatedStrategies: StrategyTemplate[];
  discardedStrategies: string[];
  successPatterns: string[];
  generationId: string;
  appliedAt: string;
}

export class SwarmEvolutionEngine {
  private readonly seed: number;
  private readonly rng: RNG;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 17000);
  }

  evolve(
    allEntries: SwarmLeaderboardEntry[],
    strategySuccess: StrategySuccessRecord[],
    currentPool: StrategyTemplate[],
  ): EvolutionResult {
    const generationId = `gen-${createDeterministicUuid(this.seed, nextTraceCounter()).slice(0, 8)}`;

    const { kept, discarded } = this.applySelectionPressure(allEntries, currentPool, strategySuccess);

    const successPatterns = this.extractSuccessPatterns(strategySuccess, kept);

    const mutated = this.applyMutations(kept, successPatterns, strategySuccess);

    return {
      mutatedStrategies: mutated,
      discardedStrategies: discarded.map((s) => s.id),
      successPatterns,
      generationId,
      appliedAt: deterministicNow(this.seed),
    };
  }

  private applySelectionPressure(
    allEntries: SwarmLeaderboardEntry[],
    currentPool: StrategyTemplate[],
    strategySuccess: StrategySuccessRecord[],
  ): { kept: StrategyTemplate[]; discarded: StrategyTemplate[] } {
    const successMap = new Map<string, StrategySuccessRecord>();
    for (const record of strategySuccess) {
      successMap.set(record.strategyType, record);
    }

    const scored = currentPool.map((template) => {
      const success = successMap.get(template.category);
      const winRate = success && success.totalEntries > 0 ? success.totalWins / success.totalEntries : 0;
      const avgScore = success?.averageScore ?? 0;
      const totalEntries = success?.totalEntries ?? 0;
      const score = winRate * 100 + avgScore * 0.3 + totalEntries;
      return { template, score, category: template.category };
    });

    scored.sort((a, b) => b.score - a.score);

    const total = scored.length;
    const topCount = Math.max(1, Math.ceil(total * 0.2));
    const bottomCount = Math.max(1, Math.ceil(total * 0.4));
    const middleCount = total - topCount - bottomCount;

    const kept = new Map<string, StrategyTemplate>();
    const discarded: StrategyTemplate[] = [];

    // Top 20% Ã¢â‚¬â€ kept
    for (let i = 0; i < topCount && i < scored.length; i++) {
      const cat = scored[i]!.category;
      if (!kept.has(cat)) kept.set(cat, scored[i]!.template);
    }

    // Bottom 40% Ã¢â‚¬â€ discarded
    for (let i = scored.length - 1; i >= 0 && discarded.length < bottomCount; i--) {
      const cat = scored[i]!.category;
      if (!kept.has(cat)) {
        discarded.push(scored[i]!.template);
        scored.splice(i, 1);
      }
    }

    // Middle 40% Ã¢â‚¬â€ kept for mutation
    for (const item of scored) {
      if (!kept.has(item.category) && !discarded.includes(item.template)) {
        kept.set(item.category, item.template);
      }
    }

    return { kept: [...kept.values()], discarded };
  }

  private extractSuccessPatterns(
    strategySuccess: StrategySuccessRecord[],
    keptTemplates: StrategyTemplate[],
  ): string[] {
    const patterns: string[] = [];
    const keptCategories = new Set(keptTemplates.map((t) => t.category));

    const topTwo = strategySuccess
      .filter((s) => keptCategories.has(s.strategyType as StrategyTemplateCategory))
      .sort((a, b) => b.averageScore - a.averageScore)
      .slice(0, 2);

    if (topTwo.length > 0) {
      const top = topTwo[0]!;
      if (top.averageScore > 70) {
        patterns.push(`"${top.strategyType} strategy wins with avg score ${top.averageScore.toFixed(0)}"`);
      }
      if (top.totalWins > 2) {
        patterns.push(`${top.strategyType} dominates with ${top.totalWins} wins`);
      }
    }

    if (topTwo.length > 1) {
      const second = topTwo[1]!;
      if (second.averageScore > 65) {
        patterns.push(`"${second.strategyType} is a reliable second choice (avg ${second.averageScore.toFixed(0)})"`);
      }
    }

    const wowCandidates = strategySuccess
      .filter((s) => keptCategories.has(s.strategyType as StrategyTemplateCategory) && s.averageRankScore > 65)
      .sort((a, b) => b.averageRankScore - a.averageRankScore);

    if (wowCandidates.length > 0) {
      const wow = wowCandidates[0]!;
      if (wow.averageRankScore > 75) {
        patterns.push(`"${wow.strategyType} delivers highest wow factor (${wow.averageRankScore.toFixed(0)})"`);
      }
    }

    const consistent = strategySuccess
      .filter((s) => keptCategories.has(s.strategyType as StrategyTemplateCategory) && s.totalEntries >= 2)
      .sort((a, b) => b.averageRankScore - a.averageRankScore);

    if (consistent.length > 0) {
      const c = consistent[0]!;
      patterns.push(`"${c.strategyType} is most consistent across hackathons"`);
    }

    if (patterns.length === 0) {
      patterns.push('no dominant pattern detected Ã¢â‚¬â€ exploration phase');
    }

    return patterns;
  }

  private applyMutations(
    kept: StrategyTemplate[],
    successPatterns: string[],
    strategySuccess: StrategySuccessRecord[],
  ): StrategyTemplate[] {
    const mutated: StrategyTemplate[] = [];

    for (const template of kept) {
      const success = strategySuccess.find((s) => s.strategyType === template.category);

      if (success && success.averageScore > 75) {
        const boosted: StrategyTemplate = {
          ...template,
          predictedScoreBonus: Math.min(20, template.predictedScoreBonus + 3),
          id: `evolved-${template.id}-${this.rng.next().toString(36).slice(2, 5)}`,
          name: `Evolved ${template.name}`,
        };
        mutated.push(boosted);
        continue;
      }

      const mutationRoll = this.rng.next();
      let mutatedTemplate = { ...template };
      mutatedTemplate.id = `evolved-${template.id}-${this.rng.next().toString(36).slice(2, 5)}`;

      if (mutationRoll < 0.2) {
        // Increase UI focus weight
        mutatedTemplate = {
          ...mutatedTemplate,
          uxPriority: Math.min(10, (mutatedTemplate.uxPriority ?? 5) + 2),
          name: `UI-Enhanced ${template.name}`,
        };
      } else if (mutationRoll < 0.4) {
        // Reduce backend complexity
        mutatedTemplate = {
          ...mutatedTemplate,
          backendPriority: Math.max(1, (mutatedTemplate.backendPriority ?? 5) - 1),
          name: `Lightweight ${template.name}`,
        };
      } else if (mutationRoll < 0.6) {
        // Improve wow moment density
        mutatedTemplate = {
          ...mutatedTemplate,
          wowFactor: Math.min(1, template.wowFactor + 0.1),
          name: `Wow-Enhanced ${template.name}`,
        };
      } else if (mutationRoll < 0.8) {
        // Shorten execution graph
        mutatedTemplate = {
          ...mutatedTemplate,
          executionSteps: template.executionSteps.slice(0, Math.max(2, template.executionSteps.length - 1)),
          name: `Streamlined ${template.name}`,
        };
      } else {
        // Improve reliability weighting
        mutatedTemplate = {
          ...mutatedTemplate,
          riskLevel: Math.max(0.05, template.riskLevel - 0.05),
          name: `Reliable ${template.name}`,
        };
      }

      mutated.push(mutatedTemplate);
    }

    return mutated;
  }
}
