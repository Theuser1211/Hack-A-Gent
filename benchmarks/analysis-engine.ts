import type { Agent } from './agent-types.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import { deterministicNow } from './determinism-kernel.js';
import type { MetricDefinition } from './metrics-definition.js';
import type { MutationGene } from './mutation-genome.js';

export interface DifficultyDistribution {
  mutationType: string;
  meanDifficulty: number;
  medianDifficulty: number;
  stdDev: number;
  min: number;
  max: number;
  sampleCount: number;
}

export interface AgentCluster {
  clusterId: number;
  agentIds: string[];
  centroid: Record<string, number>;
  size: number;
  dominantStrength: string;
  dominantWeakness: string;
}

export interface RobustnessCorrelationMatrix {
  metricIds: string[];
  correlations: Record<string, Record<string, number>>;
}

export interface FailureModeTaxonomy {
  failureCategories: {
    category: string;
    frequency: number;
    percentage: number;
    commonMutations: string[];
    avgRobustnessImpact: number;
  }[];
}

export interface MutationImpactVariance {
  mutationType: string;
  impactVariance: number;
  meanImpact: number;
  maxImpact: number;
  minImpact: number;
  impactByAgentType: Record<string, number>;
}

export interface EvolutionaryDrift {
  metricName: string;
  generationsAnalyzed: number;
  driftTrend: 'increasing' | 'stable' | 'decreasing' | 'cyclical';
  driftMagnitude: number;
  driftAcceleration: number;
}

export interface AnalysisReport {
  difficultyDistributions: DifficultyDistribution[];
  agentClusters: AgentCluster[];
  robustnessCorrelations: RobustnessCorrelationMatrix;
  failureTaxonomy: FailureModeTaxonomy;
  mutationImpactVariance: MutationImpactVariance[];
  evolutionaryDrift: EvolutionaryDrift[];
  generatedAt: string;
}

export class AnalysisEngine {
  computeDifficultyDistributions(genes: MutationGene[], results: BenchmarkRunResult[]): DifficultyDistribution[] {
    const typeStats = new Map<string, number[]>();

    for (const result of results) {
      for (const [type, stat] of Object.entries(result.per_mutation_type_stats)) {
        if (!typeStats.has(type)) typeStats.set(type, []);
        const difficulty = stat.applied > 0 ? (stat.detected - stat.repaired) / stat.applied : 0.5;
        typeStats.get(type)!.push(difficulty);
      }
    }

    return [...typeStats.entries()]
      .map(([type, difficulties]) => {
        const sorted = [...difficulties].sort((a, b) => a - b);
        const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
        const median =
          sorted.length > 0
            ? sorted.length % 2 === 0
              ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
              : sorted[Math.floor(sorted.length / 2)]!
            : 0;
        const variance = sorted.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / sorted.length;

        return {
          mutationType: type,
          meanDifficulty: mean,
          medianDifficulty: median,
          stdDev: Math.sqrt(variance),
          min: sorted[0] ?? 0,
          max: sorted[sorted.length - 1] ?? 0,
          sampleCount: sorted.length,
        };
      })
      .sort((a, b) => b.meanDifficulty - a.meanDifficulty);
  }

  computeAgentClusters(agents: Agent[], results: BenchmarkRunResult[], nClusters: number = 3): AgentCluster[] {
    const agentMetrics = new Map<string, number[]>();

    for (const agent of agents) {
      const agentResults = results.filter((r) => r.agent_id === agent.id);
      const robustnessScores = agentResults.map((r) => r.robustness_score);
      if (robustnessScores.length > 0) {
        agentMetrics.set(agent.id, robustnessScores);
      }
    }

    if (agentMetrics.size === 0) return [];

    const entries = [...agentMetrics.entries()].map(([id, scores]) => ({
      id,
      avgRobustness: scores.reduce((s, v) => s + v, 0) / scores.length,
      variance:
        scores.reduce((s, v) => s + Math.pow(v - scores.reduce((a, b) => a + b, 0) / scores.length, 2), 0) /
        scores.length,
    }));

    const sorted = [...entries].sort((a, b) => b.avgRobustness - a.avgRobustness);
    const clusterSize = Math.max(1, Math.ceil(sorted.length / nClusters));

    const clusters: AgentCluster[] = [];
    for (let i = 0; i < nClusters && i * clusterSize < sorted.length; i++) {
      const slice = sorted.slice(i * clusterSize, (i + 1) * clusterSize);
      const clusterId = i + 1;
      clusters.push({
        clusterId,
        agentIds: slice.map((s) => s.id),
        centroid: {
          avgRobustness: slice.reduce((s, e) => s + e.avgRobustness, 0) / slice.length,
          avgVariance: slice.reduce((s, e) => s + e.variance, 0) / slice.length,
        },
        size: slice.length,
        dominantStrength: i === 0 ? 'high_robustness' : i === nClusters - 1 ? 'low_robustness' : 'medium_robustness',
        dominantWeakness:
          i === 0 ? 'overconfidence' : i === nClusters - 1 ? 'mutation_susceptibility' : 'inconsistency',
      });
    }

    return clusters;
  }

  computeRobustnessCorrelations(results: BenchmarkRunResult[], metricIds: string[]): RobustnessCorrelationMatrix {
    const metricValues = new Map<string, number[]>();

    for (const metricId of metricIds) {
      const values = results.map((r) => {
        switch (metricId) {
          case 'robustness_score':
            return r.robustness_score;
          case 'detection_rate':
            return r.detection_rate * 100;
          case 'repair_success_rate':
            return r.repair_success_rate * 100;
          case 'mutation_survival_rate':
            return r.survived_mutation ? 100 : 0;
          default:
            return 0;
        }
      });
      metricValues.set(metricId, values);
    }

    const correlations: Record<string, Record<string, number>> = {};

    for (const a of metricIds) {
      correlations[a] = {};
      const valsA = metricValues.get(a) ?? [];
      for (const b of metricIds) {
        const valsB = metricValues.get(b) ?? [];
        correlations[a]![b] = this.pearsonCorrelation(valsA, valsB);
      }
    }

    return { metricIds: [...metricIds], correlations };
  }

  computeFailureTaxonomy(results: BenchmarkRunResult[]): FailureModeTaxonomy {
    const categoryCounts = new Map<string, number>();
    const categoryMutations = new Map<string, Set<string>>();
    const categoryRobustness = new Map<string, number[]>();

    for (const result of results) {
      if (result.overall_success) continue;

      for (const phase of result.phases) {
        if (!phase.success && phase.error) {
          const cat = this.classifyFailureMode(phase.error);
          categoryCounts.set(cat, (categoryCounts.get(cat) ?? 0) + 1);
          if (!categoryMutations.has(cat)) categoryMutations.set(cat, new Set());
          for (const mt of Object.keys(result.per_mutation_type_stats)) {
            categoryMutations.get(cat)!.add(mt);
          }
          if (!categoryRobustness.has(cat)) categoryRobustness.set(cat, []);
          categoryRobustness.get(cat)!.push(result.robustness_score);
        }
      }
    }

    const totalFailures = [...categoryCounts.values()].reduce((s, v) => s + v, 0);

    const failureCategories = [...categoryCounts.entries()]
      .map(([category, frequency]) => {
        const robustnessScores = categoryRobustness.get(category) ?? [];
        const avgImpact =
          robustnessScores.length > 0 ? robustnessScores.reduce((s, v) => s + v, 0) / robustnessScores.length : 0;

        return {
          category,
          frequency,
          percentage: totalFailures > 0 ? (frequency / totalFailures) * 100 : 0,
          commonMutations: [...(categoryMutations.get(category) ?? [])],
          avgRobustnessImpact: 100 - avgImpact,
        };
      })
      .sort((a, b) => b.frequency - a.frequency);

    return { failureCategories };
  }

  computeMutationImpactVariance(genes: MutationGene[], results: BenchmarkRunResult[]): MutationImpactVariance[] {
    const impactByType = new Map<string, number[]>();
    const impactByAgent = new Map<string, Map<string, number>>();

    for (const result of results) {
      for (const [type, stat] of Object.entries(result.per_mutation_type_stats)) {
        if (stat.applied === 0) continue;

        const impact = stat.detected > 0 ? (stat.detected - stat.repaired) / stat.detected : 0;

        if (!impactByType.has(type)) impactByType.set(type, []);
        impactByType.get(type)!.push(impact);

        if (!impactByAgent.has(result.agent_id)) {
          impactByAgent.set(result.agent_id, new Map());
        }
        impactByAgent.get(result.agent_id)!.set(type, impact);
      }
    }

    return [...impactByType.entries()].map(([type, impacts]) => {
      const mean = impacts.reduce((s, v) => s + v, 0) / impacts.length;
      const variance = impacts.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / impacts.length;
      const agentImpacts: Record<string, number> = {};
      for (const [agentId, typeMap] of impactByAgent) {
        const val = typeMap.get(type);
        if (val !== undefined) agentImpacts[agentId] = val;
      }

      return {
        mutationType: type,
        impactVariance: variance,
        meanImpact: mean,
        maxImpact: Math.max(...impacts),
        minImpact: Math.min(...impacts),
        impactByAgentType: agentImpacts,
      };
    });
  }

  computeEvolutionaryDrift(genes: MutationGene[], metricName: string = 'utility_score'): EvolutionaryDrift {
    const generationalData = new Map<number, number[]>();

    for (const gene of genes) {
      const gen = gene.generation;
      if (!generationalData.has(gen)) generationalData.set(gen, []);
      const value = (gene.fitness as unknown as Record<string, number>)[metricName] ?? 0;
      generationalData.get(gen)!.push(value);
    }

    const generations = [...generationalData.keys()].sort((a, b) => a - b);
    const means = generations.map((g) => {
      const vals = generationalData.get(g)!;
      return vals.reduce((s, v) => s + v, 0) / vals.length;
    });

    if (means.length < 3) {
      return {
        metricName,
        generationsAnalyzed: means.length,
        driftTrend: 'stable',
        driftMagnitude: 0,
        driftAcceleration: 0,
      };
    }

    const slope = this.linearRegression(means);
    let trend: EvolutionaryDrift['driftTrend'] = 'stable';
    if (slope > 0.05) trend = 'increasing';
    else if (slope < -0.05) trend = 'decreasing';
    else trend = 'stable';

    const firstHalf = means.slice(0, Math.floor(means.length / 2));
    const secondHalf = means.slice(Math.floor(means.length / 2));
    const firstMean = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const acceleration = secondMean - firstMean;

    return {
      metricName,
      generationsAnalyzed: means.length,
      driftTrend: trend,
      driftMagnitude: Math.abs(slope),
      driftAcceleration: acceleration,
    };
  }

  generateAnalysisReport(genes: MutationGene[], agents: Agent[], results: BenchmarkRunResult[]): AnalysisReport {
    return {
      difficultyDistributions: this.computeDifficultyDistributions(genes, results),
      agentClusters: this.computeAgentClusters(agents, results),
      robustnessCorrelations: this.computeRobustnessCorrelations(results, [
        'robustness_score',
        'detection_rate',
        'repair_success_rate',
        'mutation_survival_rate',
      ]),
      failureTaxonomy: this.computeFailureTaxonomy(results),
      mutationImpactVariance: this.computeMutationImpactVariance(genes, results),
      evolutionaryDrift: [
        this.computeEvolutionaryDrift(genes, 'utility_score'),
        this.computeEvolutionaryDrift(genes, 'agent_differentiation_score'),
        this.computeEvolutionaryDrift(genes, 'repair_difficulty_score'),
      ],
      generatedAt: deterministicNow(0),
    };
  }

  private classifyFailureMode(errorMessage: string): string {
    if (errorMessage.includes('build') || errorMessage.includes('verification')) return 'build_failure';
    if (errorMessage.includes('test') || errorMessage.includes('test')) return 'test_failure';
    if (errorMessage.includes('mutation') || errorMessage.includes('corrupt')) return 'mutation_damage';
    if (errorMessage.includes('repair') || errorMessage.includes('fix')) return 'repair_failure';
    if (errorMessage.includes('judge') || errorMessage.includes('score')) return 'quality_failure';
    if (errorMessage.includes('timeout') || errorMessage.includes('time')) return 'timeout';
    if (errorMessage.includes('token') || errorMessage.includes('limit')) return 'resource_exhaustion';
    return 'unknown';
  }

  private pearsonCorrelation(x: number[], y: number[]): number {
    const n = Math.min(x.length, y.length);
    if (n < 3) return 0;

    const meanX = x.slice(0, n).reduce((s, v) => s + v, 0) / n;
    const meanY = y.slice(0, n).reduce((s, v) => s + v, 0) / n;

    let numerator = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i]! - meanX;
      const dy = y[i]! - meanY;
      numerator += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? 0 : Math.max(-1, Math.min(1, numerator / denom));
  }

  private linearRegression(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;

    const indices = values.map((_, i) => i);
    const meanX = (n - 1) / 2;
    const meanY = values.reduce((s, v) => s + v, 0) / n;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      const dx = i - meanX;
      const dy = values[i]! - meanY;
      numerator += dx * dy;
      denominator += dx * dx;
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }
}
