import type { LeaderboardEntry } from './agent-types.js';
import type { Leaderboard } from './leaderboard.js';
import type { MutationDifficultyController } from './mutation-difficulty-controller.js';
import type { MutationType } from './mutation-engine.js';
import type { MutationGene, MutationFitnessInput } from './mutation-genome.js';
import { MutationGenome } from './mutation-genome.js';

export interface EvolutionDecision {
  topPerformingMutations: MutationGene[];
  weakMutations: MutationGene[];
  newMutations: MutationGene[];
  extinctMutations: string[];
  hardClusters: string[];
  reasoning: string;
}

export interface MutationEvolutionReport {
  topEvolvingFamilies: { familyName: string; geneCount: number; avgUtility: number; topType: string }[];
  newlyDiscoveredClasses: MutationGene[];
  extinctionEvents: string[];
  survivalCurves: { generation: number; survivalRate: number }[];
  agentSpecificVulnerabilities: Map<string, string[]>;
  mutationDiversityIndex: number;
  totalPopulation: number;
  averageUtilityScore: number;
}

export class MutationEvolutionController {
  private mutationGenome: MutationGenome;
  private difficultyController: MutationDifficultyController;
  private leaderboard: Leaderboard;
  private evolutionHistory: MutationEvolutionReport[] = [];
  private previousGeneIds: Set<string> = new Set();
  private generationCount = 0;
  private readonly retentionThreshold: number;

  constructor(
    mutationGenome: MutationGenome,
    difficultyController: MutationDifficultyController,
    leaderboard: Leaderboard,
    retentionThreshold = 0.2,
  ) {
    this.mutationGenome = mutationGenome;
    this.difficultyController = difficultyController;
    this.leaderboard = leaderboard;
    this.retentionThreshold = retentionThreshold;
  }

  computeEvolutionDecision(): EvolutionDecision {
    const allGenes = this.mutationGenome.getAllGenes();
    if (allGenes.length === 0) {
      return {
        topPerformingMutations: [],
        weakMutations: [],
        newMutations: [],
        extinctMutations: [],
        hardClusters: [],
        reasoning: 'No mutations available for evolution',
      };
    }

    const sortedGenes = [...allGenes].sort((a, b) => b.fitness.utility_score - a.fitness.utility_score);

    const topCount = Math.max(1, Math.floor(allGenes.length * 0.2));
    const topPerformingMutations = sortedGenes.slice(0, topCount);

    const weakCount = Math.max(1, Math.floor(allGenes.length * 0.3));
    const weakMutations = sortedGenes.slice(-weakCount);

    const extinctMutations = this.mutationGenome.getExtinctMutations(this.previousGeneIds);

    const newMutations = allGenes.filter((g) => !this.previousGeneIds.has(g.id));

    const hardClusters: string[] = [];
    const leaderboardEntries = this.leaderboard.getAllEntries();

    for (const gene of allGenes) {
      const agentPerformances: number[] = [];
      for (const entry of leaderboardEntries) {
        const specData = this.leaderboard.getMutationSpecialization(gene.type as MutationType);
        if (specData?.agentPerformance[entry.agentId] !== undefined) {
          agentPerformances.push(specData.agentPerformance[entry.agentId]!);
        }
      }

      if (agentPerformances.length > 1) {
        const avgPerformance = agentPerformances.reduce((a, b) => a + b, 0) / agentPerformances.length;
        const variance =
          agentPerformances.reduce((s, v) => s + Math.pow(v - avgPerformance, 2), 0) / agentPerformances.length;

        if (variance > 0.15 && avgPerformance < 0.4) {
          hardClusters.push(gene.type);
        }
      }
    }

    const reasoningParts: string[] = [];
    if (topPerformingMutations.length > 0) {
      reasoningParts.push(`Top ${topCount} mutations: ${topPerformingMutations.map((g) => g.id).join(', ')}`);
    }
    if (weakMutations.length > 0) {
      reasoningParts.push(`Weak ${weakCount} mutations: ${weakMutations.map((g) => g.id).join(', ')}`);
    }
    if (newMutations.length > 0) {
      reasoningParts.push(`Newly discovered: ${newMutations.map((g) => g.id).join(', ')}`);
    }
    if (extinctMutations.length > 0) {
      reasoningParts.push(`Extinct: ${extinctMutations.join(', ')}`);
    }
    if (hardClusters.length > 0) {
      reasoningParts.push(`Hard clusters: ${hardClusters.join(', ')}`);
    }

    return {
      topPerformingMutations,
      weakMutations,
      newMutations,
      extinctMutations,
      hardClusters,
      reasoning: reasoningParts.join('; ') || 'No significant evolutionary patterns detected',
    };
  }

  evolveMutations(agentPerformance: Record<string, MutationFitnessInput[]>, evolutionRate: number): EvolutionDecision {
    this.previousGeneIds = new Set(this.mutationGenome.getAllGenes().map((g) => g.id));

    this.mutationGenome.evolvePopulation(agentPerformance, evolutionRate);

    const decision = this.computeEvolutionDecision();

    this.applyDifficultyAdjustments(decision);

    const cullingRate = Math.max(0.05, this.retentionThreshold);
    const culled = this.mutationGenome.cullWeakMutations(cullingRate);
    if (culled.length > 0) {
      decision.extinctMutations.push(...culled.map((g) => g.id));
    }

    if (decision.topPerformingMutations.length >= 2) {
      const crossoverRate = 0.6 + evolutionRate * 0.3;
      const offspring = this.mutationGenome.reproduceTopMutations(decision.topPerformingMutations, crossoverRate);

      const variants = this.mutationGenome.spawnNewVariants(decision.topPerformingMutations, crossoverRate * 0.5);

      for (const child of [...offspring, ...variants]) {
        this.difficultyController.registerMutationType(child.type, child.parameters.intensityRange[0]);
      }
    }

    this.generationCount++;

    const nonWeakCount = this.mutationGenome.getAllGenes().length - decision.weakMutations.length;
    if (nonWeakCount < 3) {
      this.mutationGenome.reproduceTopMutations(decision.topPerformingMutations, 0.9);
    }

    const report = this.generateEvolutionReport();
    this.evolutionHistory.push(report);

    return decision;
  }

  private applyDifficultyAdjustments(decision: EvolutionDecision): void {
    for (const gene of decision.topPerformingMutations) {
      const currentDifficulty = this.difficultyController.getDifficulty(gene.type as MutationType);
      const newDifficulty = Math.min(0.95, currentDifficulty * 1.1);
      this.difficultyController.overrideDifficulty(gene.type as MutationType, newDifficulty);
    }

    for (const gene of decision.weakMutations) {
      const currentDifficulty = this.difficultyController.getDifficulty(gene.type as MutationType);
      const newDifficulty = Math.max(0.1, currentDifficulty * 0.85);
      this.difficultyController.overrideDifficulty(gene.type as MutationType, newDifficulty);
    }

    for (const clusterType of decision.hardClusters) {
      const currentDifficulty = this.difficultyController.getDifficulty(clusterType as MutationType);
      const newDifficulty = Math.min(0.95, currentDifficulty * 1.2);
      this.difficultyController.overrideDifficulty(clusterType as MutationType, newDifficulty);
    }
  }

  generateEvolutionReport(): MutationEvolutionReport {
    const allGenes = this.mutationGenome.getAllGenes();

    const families = this.mutationGenome.getMutationFamilies();
    const topEvolvingFamilies = [...families.entries()]
      .map(([familyName, genes]) => ({
        familyName,
        geneCount: genes.length,
        avgUtility: genes.reduce((s, g) => s + g.fitness.utility_score, 0) / genes.length,
        topType: genes.sort((a, b) => b.fitness.utility_score - a.fitness.utility_score)[0]?.type ?? familyName,
      }))
      .sort((a, b) => b.avgUtility - a.avgUtility)
      .slice(0, 10);

    const newlyDiscoveredClasses = allGenes.filter(
      (g) => g.generation >= this.generationCount - 1 && g.parentIds.length > 0,
    );

    const survivalCurves: { generation: number; survivalRate: number }[] = [];
    for (let gen = 0; gen <= this.generationCount; gen++) {
      const rate = this.mutationGenome.getSurvivalRate(gen);
      survivalCurves.push({ generation: gen, survivalRate: rate });
    }

    const extinctMutations = this.mutationGenome.getExtinctMutations(this.previousGeneIds);

    const agentVulnerabilities = new Map<string, string[]>();
    const leaderboardEntries = this.leaderboard.getAllEntries();
    for (const entry of leaderboardEntries) {
      const weaknesses: string[] = [];
      for (const gene of allGenes) {
        const specData = this.leaderboard.getMutationSpecialization(gene.type as MutationType);
        const perf = specData?.agentPerformance[entry.agentId];
        if (perf !== undefined && perf < 0.3) {
          weaknesses.push(gene.type);
        }
      }
      if (weaknesses.length > 0) {
        agentVulnerabilities.set(entry.agentId, weaknesses);
      }
    }

    const diversityIndex = this.mutationGenome.getDiversityIndex();
    const totalPopulation = allGenes.length;
    const averageUtilityScore =
      totalPopulation > 0 ? allGenes.reduce((s, g) => s + g.fitness.utility_score, 0) / totalPopulation : 0;

    return {
      topEvolvingFamilies,
      newlyDiscoveredClasses,
      extinctionEvents: extinctMutations,
      survivalCurves,
      agentSpecificVulnerabilities: agentVulnerabilities,
      mutationDiversityIndex: diversityIndex,
      totalPopulation,
      averageUtilityScore,
    };
  }

  getMutationGenome(): MutationGenome {
    return this.mutationGenome;
  }

  getEvolutionHistory(): readonly MutationEvolutionReport[] {
    return this.evolutionHistory;
  }

  getGenerationCount(): number {
    return this.generationCount;
  }

  getMutationDiversityIndex(): number {
    return this.mutationGenome.getDiversityIndex();
  }

  selectMutationsForBenchmark(count: number, diversityPressure: number): MutationGene[] {
    const difficultyStates = this.difficultyController.getAllStates();
    const difficultyBias: Record<string, number> = {};
    for (const state of difficultyStates) {
      difficultyBias[state.mutationType] = state.difficulty;
    }

    return this.mutationGenome.selectMutations(count, diversityPressure, difficultyBias);
  }
}
