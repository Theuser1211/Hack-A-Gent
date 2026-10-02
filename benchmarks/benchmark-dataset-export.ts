import type { LeaderboardEntry } from './agent-types.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import { deterministicNow } from './determinism-kernel.js';
import type { EvaluationRunRecord } from './evaluation-protocol.js';
import type { ExperimentTrace } from './experiment-trace.js';
import type { RepairRecord } from './hackathon-benchmark-runner.js';
import type { MutationMetadata } from './mutation-engine.js';
import type { MutationGene } from './mutation-genome.js';

export type ExportFormat = 'json' | 'jsonl' | 'parquet_logical';

export interface ExportColumn {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
}

export interface ExportSchema {
  name: string;
  description: string;
  columns: ExportColumn[];
  version: string;
}

export interface MutationDatasetExport {
  schema: ExportSchema;
  mutations: {
    geneId: string;
    type: string;
    generation: number;
    parentIds: string[];
    fitness: Record<string, number>;
    operationSequence: string[];
    intensityRange: [number, number];
    targetCategories: string[];
    sampleCount: number;
    performanceDrift: number[];
  }[];
}

export interface CorruptedRepositoryExport {
  schema: ExportSchema;
  repositories: {
    runId: string;
    agentId: string;
    benchmarkId: string;
    preMutationModules: number;
    preMutationFiles: number;
    mutations: MutationMetadata[];
    postMutationModules: number;
    postMutationFiles: number;
    fileChanges: { path: string; originalSize: number; mutatedSize: number; corruptionType: string }[];
  }[];
}

export interface RepairTraceExport {
  schema: ExportSchema;
  repairs: RepairRecord[];
}

export interface AgentOutputExport {
  schema: ExportSchema;
  outputs: BenchmarkRunResult[];
}

export interface EvaluationLogExport {
  schema: ExportSchema;
  traces: ExperimentTrace[];
  runs: EvaluationRunRecord[];
}

export interface LeaderboardHistoryExport {
  schema: ExportSchema;
  snapshots: { timestamp: string; entries: LeaderboardEntry[] }[];
}

export interface CompleteBenchmarkDataset {
  metadata: {
    exportedAt: string;
    benchmarkSuiteName: string;
    version: string;
    format: ExportFormat;
    totalRuns: number;
    totalAgents: number;
    totalMutations: number;
  };
  mutationDataset: MutationDatasetExport;
  corruptedRepositories: CorruptedRepositoryExport;
  repairTraces: RepairTraceExport;
  agentOutputs: AgentOutputExport;
  evaluationLogs: EvaluationLogExport;
  leaderboardHistory: LeaderboardHistoryExport;
}

export const MUTATION_DATASET_SCHEMA: ExportSchema = {
  name: 'mutation_dataset',
  description: 'Evolving mutation population data including fitness metrics and lineage',
  version: '1.0.0',
  columns: [
    { name: 'geneId', type: 'string', description: 'Unique mutation gene identifier' },
    { name: 'type', type: 'string', description: 'Mutation, type name' },
    { name: 'generation', type: 'number', description: 'Evolution generation number' },
    { name: 'parentIds', type: 'array', description: 'Parent mutation gene IDs' },
    {
      name: 'fitness',
      type: 'object',
      description: 'Fitness metrics: differentiation, repair difficulty, detection variance, utility',
    },
    { name: 'operationSequence', type: 'array', description: 'Sequence of base operations' },
    { name: 'targetCategories', type: 'array', description: 'Target corruption categories' },
    { name: 'sampleCount', type: 'number', description: 'Number of evaluation samples' },
    { name: 'performanceDrift', type: 'array', description: 'Utility score history over time' },
  ],
};

export const CORRUPTED_REPO_SCHEMA: ExportSchema = {
  name: 'corrupted_repositories',
  description: 'Repository states before and after mutation application',
  version: '1.0.0',
  columns: [
    { name: 'runId', type: 'string', description: 'Benchmark run identifier' },
    { name: 'agentId', type: 'string', description: 'Agent identifier' },
    { name: 'benchmarkId', type: 'string', description: 'Benchmark identifier' },
    { name: 'preMutationModules', type: 'number', description: 'Module count before mutation' },
    { name: 'preMutationFiles', type: 'number', description: 'File count before mutation' },
    { name: 'mutations', type: 'array', description: 'Applied mutation metadata' },
    { name: 'fileChanges', type: 'array', description: 'Per-file corruption details' },
  ],
};

export const REPAIR_TRACE_SCHEMA: ExportSchema = {
  name: 'repair_traces',
  description: 'Detailed repair attempt logs including strategies and outcomes',
  version: '1.0.0',
  columns: [
    { name: 'attempt', type: 'number', description: 'Repair attempt number' },
    { name: 'strategy', type: 'string', description: 'Repair strategy used' },
    { name: 'modulesRegenerated', type: 'array', description: 'Modules fully regenerated' },
    { name: 'filesRepaired', type: 'array', description: 'Files patched' },
    { name: 'success', type: 'boolean', description: 'Whether repair succeeded' },
  ],
};

export const AGENT_OUTPUT_SCHEMA: ExportSchema = {
  name: 'agent_outputs',
  description: 'Full benchmark run results for all agents',
  version: '1.0.0',
  columns: [
    { name: 'agentId', type: 'string', description: 'Agent identifier' },
    { name: 'benchmarkId', type: 'string', description: 'Benchmark identifier' },
    { name: 'overallSuccess', type: 'boolean', description: 'Whether benchmark passed' },
    { name: 'robustnessScore', type: 'number', description: 'Computed robustness score' },
    { name: 'judgeScore', type: 'number', description: 'Judge evaluation score' },
    { name: 'detectionRate', type: 'number', description: 'Mutation detection rate' },
    { name: 'repairRate', type: 'number', description: 'Mutation repair rate' },
  ],
};

export const EVALUATION_LOG_SCHEMA: ExportSchema = {
  name: 'evaluation_logs',
  description: 'Full experiment traces including decision graphs',
  version: '1.0.0',
  columns: [
    { name: 'experimentId', type: 'string', description: 'Experiment identifier' },
    { name: 'runId', type: 'string', description: 'Run identifier' },
    { name: 'eventLog', type: 'array', description: 'Chronological event log' },
    { name: 'mutationSelection', type: 'array', description: 'Mutation selection traces' },
    { name: 'repairTraces', type: 'array', description: 'Repair decision traces' },
  ],
};

export const LEADERBOARD_HISTORY_SCHEMA: ExportSchema = {
  name: 'leaderboard_history',
  description: 'Historical leaderboard snapshots for tracking ranking changes',
  version: '1.0.0',
  columns: [
    { name: 'timestamp', type: 'string', description: 'Snapshot timestamp' },
    { name: 'rank', type: 'number', description: 'Agent rank' },
    { name: 'agentId', type: 'string', description: 'Agent identifier' },
    { name: 'robustnessScore', type: 'number', description: 'Average robustness score' },
  ],
};

export function exportMutationDataset(genes: MutationGene[]): MutationDatasetExport {
  return {
    schema: MUTATION_DATASET_SCHEMA,
    mutations: genes.map((g) => ({
      geneId: g.id,
      type: g.type,
      generation: g.generation,
      parentIds: g.parentIds,
      fitness: { ...g.fitness },
      operationSequence: g.parameters.operationSequence,
      intensityRange: g.parameters.intensityRange,
      targetCategories: g.parameters.targetCategories,
      sampleCount: g.sampleCount,
      performanceDrift: g.performanceDrift,
    })),
  };
}

export function exportCompleteDataset(
  genes: MutationGene[],
  results: BenchmarkRunResult[],
  traces: ExperimentTrace[],
  leaderboardSnapshots: { timestamp: string; entries: LeaderboardEntry[] }[],
  runRecords: EvaluationRunRecord[],
): CompleteBenchmarkDataset {
  return {
    metadata: {
      exportedAt: deterministicNow(0),
      benchmarkSuiteName: 'Hack-A-Gent Benchmark Suite',
      version: '2.0.0',
      format: 'json',
      totalRuns: results.length,
      totalAgents: new Set(results.map((r) => r.agent_id)).size,
      totalMutations: genes.length,
    },
    mutationDataset: exportMutationDataset(genes),
    corruptedRepositories: { schema: CORRUPTED_REPO_SCHEMA, repositories: [] },
    repairTraces: { schema: REPAIR_TRACE_SCHEMA, repairs: [] },
    agentOutputs: { schema: AGENT_OUTPUT_SCHEMA, outputs: results },
    evaluationLogs: { schema: EVALUATION_LOG_SCHEMA, traces, runs: runRecords },
    leaderboardHistory: { schema: LEADERBOARD_HISTORY_SCHEMA, snapshots: leaderboardSnapshots },
  };
}

export function serializeDatasetJson(dataset: CompleteBenchmarkDataset): string {
  return JSON.stringify(dataset, null, 2);
}
