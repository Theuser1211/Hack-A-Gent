import type { BuilderProvider } from '../kernel/builders/builder-provider.js';

import type { BenchmarkRunResult } from './benchmark-types.js';
import type { MutationType } from './mutation-engine.js';

export const ALL_MUTATION_TYPES: MutationType[] = [
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

export interface AgentConfig {
  name: string;
  builderProvider: BuilderProvider;
  adversarialMode?: boolean;
  mutationCount?: number;
  repairLimit?: number;
}

export interface MutationSpecializationEntry {
  successRate: number;
  failureRate: number;
  adaptationScore: number;
  runCount: number;
}

export interface AgentSpecializationProfile {
  agentId: string;
  perMutationType: Record<MutationType, MutationSpecializationEntry>;
  adaptationSpeed: number;
  resilienceFactor: number;
  dominantMutationTypes: MutationType[];
  vulnerableMutationTypes: MutationType[];
  strongestMutationType: MutationType | null;
  mostVulnerableMutationType: MutationType | null;
}

export interface EvolutionaryHistoryPoint {
  timestamp: string;
  robustnessScore: number;
  rank: number;
  bdi: number;
  globalDifficulty: number;
  perMutationTypePerformance: Record<string, number>;
}

export interface Agent {
  id: string;
  config: AgentConfig;
  specializationProfile: AgentSpecializationProfile;
  benchmarkHistory: BenchmarkRunResult[];
  evolutionaryHistory: EvolutionaryHistoryPoint[];
  createdAt: string;
  lastUpdated: string;
}

export interface LeaderboardEntry {
  agentId: string;
  name: string;
  averageRobustnessScore: number;
  mutationSurvivalRate: number;
  repairEfficiency: number;
  specializationScore: number;
  totalBenchmarksRun: number;
  rank: number;
  lastRunAt: string;
  strongestMutationType: MutationType | null;
  mostVulnerableMutationType: MutationType | null;
}

export interface EvolutionMetrics {
  topPerformers: LeaderboardEntry[];
  averageBenchmarksPerAgent: number;
  mutationDifficultyTrend: 'increasing' | 'stable' | 'decreasing';
  specializationDiversity: number;
  adaptationRate: number;
  hardMutationClusters: MutationType[];
}

export interface MutationSpecializationData {
  mutationType: MutationType;
  agentPerformance: Record<string, number>;
  difficultyAdjustment: number;
  vulnerabilityTrend: 'increasing' | 'stable' | 'decreasing';
}
