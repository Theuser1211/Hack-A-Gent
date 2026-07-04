import type { RNG } from './determinism-kernel.js';
import { getSeededRandom, getGlobalRNG, createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import type { MutationDifficultyController } from './mutation-difficulty-controller.js';
import type { MutationSeverity } from './mutation-engine.js';

export const BASE_OPERATION_TYPES: string[] = [
  'remove_file',
  'corrupt_content',
  'truncate_content',
  'drop_field',
  'duplicate_file',
  'break_module_type',
  'inject_syntax_error',
  'swap_dependency',
  'rename_symbol',
  'break_import_path',
  'corrupt_config_value',
  'delete_function_body',
  'add_dead_code',
  'comment_out_code',
  'change_return_type',
];

export interface MutationFitness {
  agent_differentiation_score: number;
  repair_difficulty_score: number;
  detection_variance_score: number;
  utility_score: number;
  ranking_separation_power: number;
  failure_pattern_consistency: number;
  repair_difficulty_variance: number;
  leaderboard_reshuffle_contribution: number;
}

export interface MutationGeneParams {
  operationSequence: string[];
  intensityRange: [number, number];
  targetCategories: string[];
  severityBias: MutationSeverity;
  combinatorialWeights: Record<string, number>;
}

export interface MutationGene {
  id: string;
  type: string;
  parentIds: string[];
  generation: number;
  createdAt: string;
  parameters: MutationGeneParams;
  fitness: MutationFitness;
  reproductionHistory: string[];
  performanceDrift: number[];
  sampleCount: number;
}

export interface MutationFitnessInput {
  agentId: string;
  detected: boolean;
  repaired: boolean;
  repairStrategyUsed: string;
  agentRobustnessScore: number;
  agentRank: number;
}

export class MutationGenome {
  private genes: Map<string, MutationGene> = new Map();
  private baseOperations: string[] = BASE_OPERATION_TYPES;
  private mutationCounter = 0;
  private rng: RNG;

  constructor(seed?: number) {
    this.rng = seed !== undefined ? getSeededRandom(seed) : getGlobalRNG();
    this.initializeSeedPopulation();
  }

  private createGeneId(type: string): string {
    return createDeterministicUuid(this.rng.nextInt(0, 1000000), ++this.mutationCounter);
  }

  private initializeSeedPopulation(): void {
    const seedTypes = [
      { type: 'remove_file', ops: ['remove_file'], cats: ['file_structure'] },
      { type: 'corrupt_content', ops: ['corrupt_content'], cats: ['content_distortion'] },
      { type: 'truncate_content', ops: ['truncate_content'], cats: ['content_distortion'] },
      { type: 'drop_field', ops: ['drop_field'], cats: ['schema_violation'] },
      { type: 'duplicate_file', ops: ['duplicate_file'], cats: ['file_structure'] },
      { type: 'break_module_type', ops: ['break_module_type'], cats: ['semantic_inconsistency'] },
      { type: 'inject_syntax', ops: ['inject_syntax_error'], cats: ['content_distortion'] },
      { type: 'swap_dependency', ops: ['swap_dependency'], cats: ['dependency_breakage'] },
      { type: 'rename_symbol', ops: ['rename_symbol'], cats: ['semantic_inconsistency'] },
      { type: 'corrupt_config', ops: ['corrupt_config_value'], cats: ['schema_violation'] },
      { type: 'comment_out', ops: ['comment_out_code'], cats: ['content_distortion'] },
    ];

    for (const seed of seedTypes) {
      const gene = this.createGene(seed.type, [], 0, {
        operationSequence: seed.ops,
        intensityRange: [0.3, 0.7],
        targetCategories: seed.cats,
        severityBias: 'medium',
        combinatorialWeights: {},
      });
      this.genes.set(gene.id, gene);
    }
  }

  private createGene(type: string, parentIds: string[], generation: number, params: MutationGeneParams): MutationGene {
    const id = this.createGeneId(type);
    return {
      id,
      type,
      parentIds,
      generation,
      createdAt: deterministicNow(this.rng.nextInt(0, 100000)),
      parameters: params,
      fitness: {
        agent_differentiation_score: 0.5,
        repair_difficulty_score: 0.5,
        detection_variance_score: 0.5,
        utility_score: 0.5,
        ranking_separation_power: 0.5,
        failure_pattern_consistency: 0.5,
        repair_difficulty_variance: 0.5,
        leaderboard_reshuffle_contribution: 0.5,
      },
      reproductionHistory: [],
      performanceDrift: [],
      sampleCount: 0,
    };
  }

  getAllGenes(): MutationGene[] {
    return [...this.genes.values()];
  }

  getGene(id: string): MutationGene | undefined {
    return this.genes.get(id);
  }

  getGenesByType(type: string): MutationGene[] {
    return [...this.genes.values()].filter((g) => g.type === type);
  }

  addGene(gene: MutationGene): void {
    this.genes.set(gene.id, gene);
  }

  removeGene(id: string): boolean {
    return this.genes.delete(id);
  }

  getPopulationCount(): number {
    return this.genes.size;
  }

  evolvePopulation(agentPerformance: Record<string, MutationFitnessInput[]>, evolutionRate: number): void {
    const allGenes = this.getAllGenes();
    if (allGenes.length === 0) return;

    const geneFitnessMap = new Map<string, number>();

    for (const gene of allGenes) {
      const agentResults = Object.values(agentPerformance).flatMap((r) => r);
      const relevantResults = agentResults.filter(() => true);

      if (relevantResults.length === 0) continue;

      const strongAgentResults = relevantResults.filter((r) => r.agentRobustnessScore >= 70);
      const weakAgentResults = relevantResults.filter((r) => r.agentRobustnessScore < 50);

      const strongDetectionRate =
        strongAgentResults.length > 0
          ? strongAgentResults.filter((r) => r.detected).length / strongAgentResults.length
          : 0.5;

      const weakDetectionRate =
        weakAgentResults.length > 0 ? weakAgentResults.filter((r) => r.detected).length / weakAgentResults.length : 0.5;

      const strongRepairRate =
        strongAgentResults.length > 0
          ? strongAgentResults.filter((r) => r.repaired).length / strongAgentResults.length
          : 0.5;

      const weakRepairRate =
        weakAgentResults.length > 0 ? weakAgentResults.filter((r) => r.repaired).length / weakAgentResults.length : 0.5;

      const differentiationScore = Math.abs(weakDetectionRate - strongDetectionRate);
      const repairDifficultyScore = 1 - (strongRepairRate + weakRepairRate) / 2;
      const detectionVariance = this.computeDetectionVariance(relevantResults);

      const totalRank = relevantResults.reduce((s, r) => s + r.agentRank, 0);
      const avgRank = relevantResults.length > 0 ? totalRank / relevantResults.length : 0;
      const rankingSeparationPower = 1 - avgRank / Math.max(1, relevantResults.length);

      const strategiesUsed = new Set(relevantResults.map((r) => r.repairStrategyUsed));
      const repairDifficultyVariance = strategiesUsed.size > 1 ? strategiesUsed.size / 5 : 0.1;

      const failurePatternConsistency =
        relevantResults.length > 0 ? relevantResults.filter((r) => !r.repaired).length / relevantResults.length : 0.5;

      const allDetected = relevantResults.filter((r) => r.detected).length;
      const allRepaired = relevantResults.filter((r) => r.repaired).length;
      const reshuffleContribution = allDetected > 0 ? 1 - allRepaired / allDetected : 0.5;

      const utilities = [
        differentiationScore * 0.25,
        repairDifficultyScore * 0.2,
        detectionVariance * 0.15,
        rankingSeparationPower * 0.2,
        repairDifficultyVariance * 0.1,
        reshuffleContribution * 0.1,
      ];
      const utilityScore = utilities.reduce((a, b) => a + b, 0);

      gene.fitness.agent_differentiation_score = this.ema(
        gene.fitness.agent_differentiation_score,
        differentiationScore,
        evolutionRate,
      );
      gene.fitness.repair_difficulty_score = this.ema(
        gene.fitness.repair_difficulty_score,
        repairDifficultyScore,
        evolutionRate,
      );
      gene.fitness.detection_variance_score = this.ema(
        gene.fitness.detection_variance_score,
        detectionVariance,
        evolutionRate,
      );
      gene.fitness.ranking_separation_power = this.ema(
        gene.fitness.ranking_separation_power,
        rankingSeparationPower,
        evolutionRate,
      );
      gene.fitness.failure_pattern_consistency = this.ema(
        gene.fitness.failure_pattern_consistency,
        failurePatternConsistency,
        evolutionRate,
      );
      gene.fitness.repair_difficulty_variance = this.ema(
        gene.fitness.repair_difficulty_variance,
        repairDifficultyVariance,
        evolutionRate,
      );
      gene.fitness.leaderboard_reshuffle_contribution = this.ema(
        gene.fitness.leaderboard_reshuffle_contribution,
        reshuffleContribution,
        evolutionRate,
      );
      gene.fitness.utility_score = this.ema(gene.fitness.utility_score, utilityScore, evolutionRate);

      gene.sampleCount += relevantResults.length;
      gene.performanceDrift.push(utilityScore);
      if (gene.performanceDrift.length > 10) {
        gene.performanceDrift.shift();
      }

      geneFitnessMap.set(gene.id, utilityScore);
    }
  }

  selectMutations(count: number, diversityPressure: number, difficultyBias: Record<string, number>): MutationGene[] {
    const allGenes = this.getAllGenes();
    if (allGenes.length === 0) return [];
    if (allGenes.length <= count) return allGenes;

    const scored = allGenes.map((gene) => {
      const baseScore = gene.fitness.utility_score;
      const difficultyBiasScore = difficultyBias[gene.type] ?? 0.5;
      const typeCount = allGenes.filter((g) => g.type === gene.type).length;
      const diversityPenalty = diversityPressure > 0 ? (typeCount / allGenes.length) * diversityPressure : 0;
      const finalScore = baseScore * 0.5 + difficultyBiasScore * 0.3 - diversityPenalty * 0.2;
      return { gene, score: finalScore };
    });

    scored.sort((a, b) => b.score - a.score);

    const selected: MutationGene[] = [];
    const usedTypes = new Set<string>();

    for (const item of scored) {
      if (selected.length >= count) break;

      if (!usedTypes.has(item.gene.type) || diversityPressure < 0.5) {
        selected.push(item.gene);
        usedTypes.add(item.gene.type);
      } else {
        const sameTypeCount = selected.filter((g) => g.type === item.gene.type).length;
        const maxPerType = Math.max(1, Math.ceil(count / usedTypes.size));
        if (sameTypeCount < maxPerType) {
          selected.push(item.gene);
        }
      }
    }

    return selected;
  }

  reproduceTopMutations(topGenes: MutationGene[], mutationRate: number): MutationGene[] {
    const offspring: MutationGene[] = [];
    if (topGenes.length < 2) return offspring;

    const sortedGenes = [...topGenes].sort((a, b) => b.fitness.utility_score - a.fitness.utility_score);

    const topPair = sortedGenes.slice(0, 2);
    if (topPair.length < 2) return offspring;

    for (let i = 0; i < topGenes.length; i++) {
      for (let j = i + 1; j < topGenes.length; j++) {
        const parentA = topGenes[i]!;
        const parentB = topGenes[j]!;

        const newType = this.hybridizeTypes(parentA.type, parentB.type);
        const combinedOps = this.crossoverOperations(
          parentA.parameters.operationSequence,
          parentB.parameters.operationSequence,
        );
        const mutatedOps = this.mutateOperations(combinedOps, mutationRate);
        const newCats = this.mergeCategories(parentA.parameters.targetCategories, parentB.parameters.targetCategories);
        const newWeights = this.crossoverWeights(
          parentA.parameters.combinatorialWeights,
          parentB.parameters.combinatorialWeights,
          mutationRate,
        );
        const newIntensity: [number, number] = [
          Math.max(
            0,
            Math.min(
              1,
              (parentA.parameters.intensityRange[0] + parentB.parameters.intensityRange[0]) / 2 +
                (this.rng.next() - 0.5) * mutationRate,
            ),
          ),
          Math.max(
            0,
            Math.min(
              1,
              (parentA.parameters.intensityRange[1] + parentB.parameters.intensityRange[1]) / 2 +
                (this.rng.next() - 0.5) * mutationRate,
            ),
          ),
        ];

        const severityOptions: MutationSeverity[] = ['low', 'medium', 'high', 'critical'];
        const aIdx = severityOptions.indexOf(parentA.parameters.severityBias);
        const bIdx = severityOptions.indexOf(parentB.parameters.severityBias);
        const midIdx = Math.round((aIdx + bIdx) / 2);
        const newSeverity = severityOptions[Math.max(0, Math.min(3, midIdx + (this.rng.next() > 0.7 ? 1 : 0)))]!;

        const childId = `hybrid-${parentA.type}-${parentB.type}-v${parentA.generation + 1}`;
        const child = this.createGene(
          childId,
          [parentA.id, parentB.id],
          Math.max(parentA.generation, parentB.generation) + 1,
          {
            operationSequence: mutatedOps,
            intensityRange: newIntensity,
            targetCategories: newCats,
            severityBias: newSeverity,
            combinatorialWeights: newWeights,
          },
        );

        child.reproductionHistory.push(`crossover:${parentA.id}+${parentB.id}@gen${child.generation}`);

        const existing = this.genes.get(child.id);
        if (!existing) {
          this.genes.set(child.id, child);
          offspring.push(child);
        }
      }
    }

    return offspring;
  }

  spawnNewVariants(topGenes: MutationGene[], mutationRate: number): MutationGene[] {
    const variants: MutationGene[] = [];
    const baseOps = this.baseOperations;

    for (const gene of topGenes) {
      if (this.rng.next() > mutationRate) continue;

      const extraOp = this.rng.pick(baseOps);
      const newOps = [...gene.parameters.operationSequence, extraOp];

      const type = `${gene.type}_variant_${this.rng.nextInt(0, 0xfffff).toString(36)}`;
      const child = this.createGene(type, [gene.id], gene.generation + 1, {
        operationSequence: newOps,
        intensityRange: [
          Math.max(0, gene.parameters.intensityRange[0] + (this.rng.next() - 0.5) * 0.2),
          Math.min(1, gene.parameters.intensityRange[1] + (this.rng.next() - 0.5) * 0.2),
        ],
        targetCategories: [...gene.parameters.targetCategories],
        severityBias: gene.parameters.severityBias,
        combinatorialWeights: { ...gene.parameters.combinatorialWeights },
      });

      child.reproductionHistory.push(`variant:drift@${gene.id}`);
      const existing = this.genes.get(child.id);
      if (!existing) {
        this.genes.set(child.id, child);
        variants.push(child);
      }
    }

    return variants;
  }

  cullWeakMutations(retentionThreshold: number): MutationGene[] {
    const culled: MutationGene[] = [];
    const allGenes = this.getAllGenes();

    for (const gene of allGenes) {
      if (gene.generation === 0 && gene.sampleCount < 3) continue;

      if (gene.fitness.utility_score < retentionThreshold && gene.sampleCount >= 2) {
        this.genes.delete(gene.id);
        culled.push(gene);
      }
    }

    return culled;
  }

  getDiversityIndex(): number {
    const allGenes = this.getAllGenes();
    if (allGenes.length === 0) return 0;

    const typeCounts = new Map<string, number>();
    for (const gene of allGenes) {
      typeCounts.set(gene.type, (typeCounts.get(gene.type) ?? 0) + 1);
    }

    const counts = [...typeCounts.values()];
    const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
    const variance = counts.reduce((s, c) => s + Math.pow(c - mean, 2), 0) / counts.length;
    const stdDev = Math.sqrt(variance);

    return Math.min(1, mean > 0 ? stdDev / mean : 0);
  }

  getSurvivalRate(generationMin: number): number {
    const allGenes = this.getAllGenes();
    const olderGenes = allGenes.filter((g) => g.generation >= generationMin);
    if (olderGenes.length === 0) return 0;
    const stillExisting = olderGenes.filter((g) => this.genes.has(g.id));
    return stillExisting.length / olderGenes.length;
  }

  getMutationFamilies(): Map<string, MutationGene[]> {
    const families = new Map<string, MutationGene[]>();
    const allGenes = this.getAllGenes();

    for (const gene of allGenes) {
      const baseType = gene.type.split('_variant_')[0]!.split('+')[0]!;
      if (!families.has(baseType)) {
        families.set(baseType, []);
      }
      families.get(baseType)!.push(gene);
    }

    return families;
  }

  findLineage(geneId: string): MutationGene[] {
    const lineage: MutationGene[] = [];
    const visited = new Set<string>();
    const queue = [geneId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);

      const gene = this.genes.get(id);
      if (!gene) continue;

      lineage.push(gene);
      for (const parentId of gene.parentIds) {
        if (!visited.has(parentId)) {
          queue.push(parentId);
        }
      }
    }

    return lineage.sort((a, b) => a.generation - b.generation);
  }

  getExtinctMutations(previousGeneIds: Set<string>): string[] {
    const extinct: string[] = [];
    for (const id of previousGeneIds) {
      if (!this.genes.has(id)) {
        extinct.push(id);
      }
    }
    return extinct;
  }

  private computeDetectionVariance(results: MutationFitnessInput[]): number {
    if (results.length < 2) return 0.5;
    const detected = results.filter((r) => r.detected).length;
    const rate = detected / results.length;
    return Math.abs(rate - 0.5) * 2;
  }

  private hybridizeTypes(typeA: string, typeB: string): string {
    const aParts = typeA.replace(/_\d+$/, '').split('_');
    const bParts = typeB.replace(/_\d+$/, '').split('_');
    const prefix = aParts.slice(0, Math.ceil(aParts.length / 2)).join('_');
    const suffix = bParts.slice(Math.floor(bParts.length / 2)).join('_');
    return `${prefix}_${suffix}_hybrid`;
  }

  private crossoverOperations(opsA: string[], opsB: string[]): string[] {
    const maxLen = Math.max(opsA.length, opsB.length);
    const result: string[] = [];
    for (let i = 0; i < maxLen; i++) {
      const fromA = this.rng.next() > 0.5;
      const op = fromA ? opsA[i] : opsB[i];
      if (op) result.push(op);
    }
    return result.length > 0 ? result : opsA;
  }

  private mutateOperations(ops: string[], rate: number): string[] {
    const result = [...ops];
    const allOps = this.baseOperations;

    for (let i = 0; i < result.length; i++) {
      if (this.rng.next() < rate) {
        result[i] = this.rng.pick(allOps);
      }
    }

    if (this.rng.next() < rate) {
      const newOp = this.rng.pick(allOps);
      const insertPos = this.rng.nextInt(0, result.length);
      result.splice(insertPos, 0, newOp);
    }

    if (result.length > 1 && this.rng.next() < rate) {
      const removePos = this.rng.nextInt(0, result.length - 1);
      result.splice(removePos, 1);
    }

    return result;
  }

  private mergeCategories(catsA: string[], catsB: string[]): string[] {
    const merged = new Set([...catsA, ...catsB]);
    if (this.rng.next() > 0.7) {
      const extras = [
        'file_structure',
        'content_distortion',
        'schema_violation',
        'dependency_breakage',
        'semantic_inconsistency',
      ];
      merged.add(this.rng.pick(extras));
    }
    return [...merged];
  }

  private crossoverWeights(
    weightsA: Record<string, number>,
    weightsB: Record<string, number>,
    mutationRate: number,
  ): Record<string, number> {
    const result: Record<string, number> = {};
    const allKeys = new Set([...Object.keys(weightsA), ...Object.keys(weightsB)]);

    for (const key of allKeys) {
      const a = weightsA[key] ?? 0;
      const b = weightsB[key] ?? 0;
      const chosen = this.rng.next() > 0.5 ? a : b;
      result[key] = Math.max(0, Math.min(1, chosen + (this.rng.next() - 0.5) * mutationRate));
    }

    return result;
  }

  private ema(prev: number, current: number, alpha: number): number {
    return alpha * current + (1 - alpha) * prev;
  }
}
