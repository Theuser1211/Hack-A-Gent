import type { MutationMetrics } from './benchmark-judge.js';

export interface PerMutationTypeMetrics {
  mutationType: string;
  applied: number;
  detected: number;
  repaired: number;
  detectionRate: number;
  repairRate: number;
  survivalRate: number;
}

export interface FinalEvaluationResult {
  robustnessScore: number;
  repairEfficiency: number;
  mutationSurvivalRate: number;
  detectionAccuracy: number;
  leaderboardRank: number;

  correctnessScore: number;
  mutationRecoveryRate: number;

  perMutationTypeMetrics: PerMutationTypeMetrics[];
  aggregateMutationMetrics: MutationMetrics;

  canonicalScore: number;
  verdict: 'pass' | 'fail';
  reasoning: string;
}

export interface FrozenMutationSequenceEntry {
  geneId: string | null;
  mutationType: string;
  operationSequence: string[];
  intensity: number;
  severity: string;
  moduleTarget: string;
  fileTarget: string | null;
}

export interface FrozenRepositoryState {
  projectName: string;
  blueprintVersion: string;
  modules: Array<{ name: string; type: string; files: Array<{ path: string; content: string }> }>;
}
