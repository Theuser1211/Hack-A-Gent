import type { BenchmarkRunResult } from './benchmark-types.js';
import { deterministicNow } from './determinism-kernel.js';
import type { RepairRecord } from './hackathon-benchmark-runner.js';
import type { MutationMetadata } from './mutation-engine.js';
import type { MutationGene } from './mutation-genome.js';

export type ProtocolPhase =
  | 'generation'
  | 'mutation'
  | 'execution'
  | 'verification'
  | 'repair'
  | 'testing'
  | 'judging'
  | 'aggregation';

export interface PhaseMetadata {
  phase: ProtocolPhase;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  success: boolean;
  error: string | null;
  inputSnapshot: string;
  outputSnapshot: string;
  artifacts: string[];
}

export interface GenerationPhaseRecord {
  phase: 'generation';
  benchmarkId: string;
  architectureBlueprintId: string;
  repositoryId: string;
  moduleCount: number;
  fileCount: number;
  totalLineCount: number;
}

export interface MutationPhaseRecord {
  phase: 'mutation';
  selectedGenes: { geneId: string; type: string; utilityScore: number }[];
  appliedMutations: MutationMetadata[];
  mutationCount: number;
  diversityPressure: number;
  selectionStrategy: string;
  preMutationRepoSnapshot: string;
  postMutationRepoSnapshot: string;
}

export interface ExecutionPhaseRecord {
  phase: 'execution';
  agentId: string;
  modelProvider: string;
  modelName: string;
  promptStrategy: string;
  executionOrder: number;
  totalTokensUsed: number;
  durationMs: number;
}

export interface VerificationPhaseRecord {
  phase: 'verification';
  passed: boolean;
  errorCount: number;
  errorCategories: Record<string, number>;
  detectedMutationTypes: string[];
  verificationSummary: string;
}

export interface RepairPhaseRecord {
  phase: 'repair';
  attempts: RepairRecord[];
  totalAttempts: number;
  strategiesUsed: string[];
  finalSuccess: boolean;
}

export interface TestingPhaseRecord {
  phase: 'testing';
  passed: boolean;
  passedCount: number;
  failedCount: number;
  totalTests: number;
  testErrors: string[];
}

export interface JudgingPhaseRecord {
  phase: 'judging';
  score: number;
  verdict: string;
  passedThreshold: boolean;
  robustnessBreakdown: Record<string, number>;
  judgeReasoning: string;
}

export interface AggregationPhaseRecord {
  phase: 'aggregation';
  totalDurationMs: number;
  overallSuccess: boolean;
  metricsComputed: Record<string, number>;
  leaderboardSnapshot: string;
}

export type ProtocolPhaseRecord =
  | GenerationPhaseRecord
  | MutationPhaseRecord
  | ExecutionPhaseRecord
  | VerificationPhaseRecord
  | RepairPhaseRecord
  | TestingPhaseRecord
  | JudgingPhaseRecord
  | AggregationPhaseRecord;

export interface EvaluationRunRecord {
  experimentId: string;
  runId: string;
  specId: string;
  agentId: string;
  benchmarkId: string;
  masterSeed: number;
  startedAt: string;
  completedAt: string;
  totalDurationMs: number;
  phases: ProtocolPhaseRecord[];
  metadata: PhaseMetadata[];
  result: BenchmarkRunResult;
}

export function createPhaseMetadata(
  phase: ProtocolPhase,
  success: boolean,
  error: string | null,
  inputSnapshot: string,
  outputSnapshot: string,
  artifacts: string[],
): PhaseMetadata {
  const now = deterministicNow(0);
  return {
    phase,
    startedAt: now,
    completedAt: now,
    durationMs: 0,
    success,
    error,
    inputSnapshot,
    outputSnapshot,
    artifacts,
  };
}

export function validateProtocolOrder(phases: ProtocolPhase[]): boolean {
  const expectedOrder: ProtocolPhase[] = [
    'generation',
    'mutation',
    'execution',
    'verification',
    'repair',
    'testing',
    'judging',
    'aggregation',
  ];

  const filtered = phases.filter((p) => expectedOrder.includes(p));
  const ordered = filtered.filter((p, i) => {
    const expectedIdx = expectedOrder.indexOf(p);
    return i === 0 || expectedOrder.indexOf(filtered[i - 1]!) <= expectedIdx;
  });

  return ordered.length === filtered.length;
}

export function protocolPhaseDuration(phases: PhaseMetadata[]): Record<ProtocolPhase, number> {
  const durations: Record<string, number> = {};
  for (const meta of phases) {
    durations[meta.phase] = (durations[meta.phase] ?? 0) + meta.durationMs;
  }
  return durations as Record<ProtocolPhase, number>;
}
