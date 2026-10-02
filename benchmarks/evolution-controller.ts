import type { LeaderboardEntry } from './agent-types.js';
import { ALL_MUTATION_TYPES } from './agent-types.js';
import type { Leaderboard } from './leaderboard.js';
import type { MutationDifficultyController } from './mutation-difficulty-controller.js';
import type { MutationType } from './mutation-engine.js';

export interface EvolutionDecision {
  targetMutationTypes: MutationType[];
  difficultyAdjustments: Record<MutationType, number>;
  hardClusterTargets: MutationType[];
  reasoning: string;
}

export class EvolutionController {
  private difficultyController: MutationDifficultyController;
  private leaderboard: Leaderboard;

  constructor(difficultyController: MutationDifficultyController, leaderboard: Leaderboard) {
    this.difficultyController = difficultyController;
    this.leaderboard = leaderboard;
  }

  computeEvolutionaryPressure(): EvolutionDecision {
    const entries = this.leaderboard.getTopAgents(3);
    const weakAgents = this.leaderboard.getAllEntries().slice(-3);

    const targetMutationTypes: MutationType[] = [];
    const difficultyAdjustments: Record<MutationType, number> = {};
    const hardClusterTargets: MutationType[] = [];
    const reasoningParts: string[] = [];

    for (const mt of ALL_MUTATION_TYPES) {
      const currentDifficulty = this.difficultyController.getDifficulty(mt);
      difficultyAdjustments[mt] = 1.0;

      const topAgentPerf = this.getAgentPerformanceForMutationType(entries, mt);
      const weakAgentPerf = this.getAgentPerformanceForMutationType(weakAgents, mt);

      if (topAgentPerf > 0.7 && weakAgentPerf > 0.5) {
        difficultyAdjustments[mt] = 1.3;
        targetMutationTypes.push(mt);
        reasoningParts.push(
          `${mt}: top agents handle well (${(topAgentPerf * 100).toFixed(0)}%), increasing difficulty`,
        );
      } else if (topAgentPerf > 0.8 && weakAgentPerf < 0.3) {
        difficultyAdjustments[mt] = 1.2;
        hardClusterTargets.push(mt);
        reasoningParts.push(
          `${mt}: hard cluster Ã¢â‚¬â€ top agents strong (${(topAgentPerf * 100).toFixed(0)}%) but weak agents struggle (${(weakAgentPerf * 100).toFixed(0)}%)`,
        );
      } else if (topAgentPerf < 0.4) {
        difficultyAdjustments[mt] = 0.7;
        reasoningParts.push(
          `${mt}: even top agents struggle (${(topAgentPerf * 100).toFixed(0)}%), decreasing difficulty`,
        );
      } else {
        reasoningParts.push(
          `${mt}: balanced performance (top ${(topAgentPerf * 100).toFixed(0)}%, weak ${(weakAgentPerf * 100).toFixed(0)}%)`,
        );
      }

      this.leaderboard.updateMutationSpecialization(mt, {
        agentPerformance: this.buildAgentPerformanceMap(mt),
        difficultyAdjustment: difficultyAdjustments[mt] ?? 1.0,
        vulnerabilityTrend: this.computeVulnerabilityTrend(mt),
      });
    }

    const reasoning =
      reasoningParts.length > 0
        ? reasoningParts.join('; ')
        : 'No significant evolutionary pressure detected Ã¢â‚¬â€ all mutation types in balanced range';

    return { targetMutationTypes, difficultyAdjustments, hardClusterTargets, reasoning };
  }

  applyEvolutionaryPressure(decision: EvolutionDecision): void {
    for (const [mt, adjustment] of Object.entries(decision.difficultyAdjustments)) {
      const currentDifficulty = this.difficultyController.getDifficulty(mt as MutationType);
      const newDifficulty = Math.max(0.1, Math.min(0.95, currentDifficulty * adjustment));
      this.difficultyController.overrideDifficulty(mt as MutationType, newDifficulty);
    }
  }

  identifyWeaknessesOfTopAgents(): MutationType[] {
    const topAgents = this.leaderboard.getTopAgents(3);
    const weaknesses = new Map<MutationType, number>();

    for (const mt of ALL_MUTATION_TYPES) {
      let totalPerf = 0;
      let count = 0;
      for (const entry of topAgents) {
        const specData = this.leaderboard.getMutationSpecialization(mt);
        const perf = specData?.agentPerformance[entry.agentId] ?? 0.5;
        totalPerf += perf;
        count++;
      }
      const avgPerf = count > 0 ? totalPerf / count : 0.5;
      weaknesses.set(mt, 1 - avgPerf);
    }

    return [...weaknesses.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([mt]) => mt);
  }

  introduceHardCluster(targetTypes: MutationType[]): void {
    for (const mt of targetTypes) {
      const current = this.difficultyController.getDifficulty(mt);
      this.difficultyController.overrideDifficulty(mt, Math.min(0.95, current + 0.15));
    }
  }

  private getAgentPerformanceForMutationType(entries: readonly LeaderboardEntry[], mutationType: MutationType): number {
    if (entries.length === 0) return 0.5;
    let totalPerf = 0;
    let count = 0;
    for (const entry of entries) {
      const specData = this.leaderboard.getMutationSpecialization(mutationType);
      const perf = specData?.agentPerformance[entry.agentId];
      if (perf !== undefined) {
        totalPerf += perf;
        count++;
      }
    }
    return count > 0 ? totalPerf / count : 0.5;
  }

  private buildAgentPerformanceMap(mutationType: MutationType): Record<string, number> {
    const allEntries = this.leaderboard.getAllEntries();
    const result: Record<string, number> = {};
    for (const entry of allEntries) {
      const specData = this.leaderboard.getMutationSpecialization(mutationType);
      if (specData?.agentPerformance[entry.agentId] !== undefined) {
        result[entry.agentId] = specData.agentPerformance[entry.agentId]!;
      }
    }
    return result;
  }

  private computeVulnerabilityTrend(mutationType: MutationType): 'increasing' | 'stable' | 'decreasing' {
    const specData = this.leaderboard.getMutationSpecialization(mutationType);
    if (!specData) return 'stable';
    const perfs = Object.values(specData.agentPerformance);
    if (perfs.length < 2) return 'stable';
    const avg = perfs.reduce((a, b) => a + b, 0) / perfs.length;
    if (avg < 0.3) return 'increasing';
    if (avg > 0.7) return 'decreasing';
    return 'stable';
  }
}
