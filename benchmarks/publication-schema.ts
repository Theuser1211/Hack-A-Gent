import type { FrozenMutationSequenceEntry, FrozenRepositoryState } from './experiment-snapshot.js';
import type { MutationGene } from './mutation-genome.js';

export const CURRENT_PROTOCOL_VERSION = '1.0.0';
export const CURRENT_MUTATION_ENGINE_VERSION = '1.0.0';
export const CURRENT_JUDGE_VERSION = '1.0.0';
export const CURRENT_REPAIR_ENGINE_VERSION = '1.0.0';

export interface EvaluationRunMetadata {
  experimentId: string;
  runId: string;
  benchmarkId: string;
  benchmarkName: string;
  benchmarkCategory: string;
  agentId: string;
  agentName: string;
  modelProvider: string;
  modelName: string;
  promptStrategy: string;
  reasoningArchitecture: string;
  masterSeed: number;
}

export interface VersionStamps {
  protocolVersion: string;
  mutationEngineVersion: string;
  judgeVersion: string;
  repairEngineVersion: string;
}

export interface MetricRecord {
  robustnessScore: number;
  repairEfficiency: number;
  mutationSurvivalRate: number;
  detectionAccuracy: number;
  leaderboardRank: number;
  correctnessScore: number;
  mutationRecoveryRate: number;
}

export interface PerMutationTypeMetrics {
  mutationType: string;
  applied: number;
  detected: number;
  repaired: number;
  detectionRate: number;
  repairRate: number;
  survivalRate: number;
}

export interface PublicationExperimentOutput {
  metadata: EvaluationRunMetadata;
  versions: VersionStamps;
  metrics: MetricRecord;
  perMutationTypeMetrics: PerMutationTypeMetrics[];
  mutationSequence: FrozenMutationSequenceEntry[];
  initialRepositoryHash: string;
  finalRepositoryHash: string;
  protocolPhases: string[];
  totalDurationMs: number;
  totalTokensUsed: number;
  errors: string[];
  reproducibilityHash: string;
}

export function computeRepositoryHash(repo: FrozenRepositoryState): string {
  const input = JSON.stringify(repo);
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const chr = input.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export function buildPublicationOutput(
  metadata: EvaluationRunMetadata,
  versions: VersionStamps,
  metrics: MetricRecord,
  perTypeMetrics: PerMutationTypeMetrics[],
  mutationSequence: FrozenMutationSequenceEntry[],
  initialRepo: FrozenRepositoryState,
  finalRepo: FrozenRepositoryState,
  phases: string[],
  durationMs: number,
  tokens: number,
  errors: string[],
): PublicationExperimentOutput {
  const hashInput = JSON.stringify({ metadata, metrics, mutationSequence });
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const chr = hashInput.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }

  return {
    metadata,
    versions,
    metrics,
    perMutationTypeMetrics: perTypeMetrics,
    mutationSequence,
    initialRepositoryHash: computeRepositoryHash(initialRepo),
    finalRepositoryHash: computeRepositoryHash(finalRepo),
    protocolPhases: phases,
    totalDurationMs: durationMs,
    totalTokensUsed: tokens,
    errors,
    reproducibilityHash: Math.abs(hash).toString(16).padStart(8, '0'),
  };
}
