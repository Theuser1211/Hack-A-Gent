import type { Repository } from '../kernel/builders/repository-types.js';

import type { AgentConfig } from './agent-types.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import { deterministicNow } from './determinism-kernel.js';
import type { FinalEvaluationResult } from './evaluation-types.js';
import type {
  AgentExecutionTrace,
  RepairDecisionTrace,
  VerificationReasoningTrace,
  JudgeScoringTrace,
  MutationSelectionTrace,
} from './experiment-trace.js';
import type { MutationMetadata } from './mutation-engine.js';
import type { MutationGene } from './mutation-genome.js';

export type { FrozenMutationSequenceEntry, FrozenRepositoryState } from './evaluation-types.js';
import type { FrozenMutationSequenceEntry, FrozenRepositoryState } from './evaluation-types.js';

export interface FrozenAgentState {
  agentId: string;
  config: AgentConfig;
  specializationProfile: Record<string, number>;
}

export interface FrozenGenomeState {
  genes: Array<{
    id: string;
    type: string;
    generation: number;
    parentIds: string[];
    fitness: Record<string, number>;
    parameters: {
      operationSequence: string[];
      intensityRange: [number, number];
      targetCategories: string[];
      severityBias: string;
      combinatorialWeights: Record<string, number>;
    };
    sampleCount: number;
  }>;
}

export interface ExperimentSnapshot {
  snapshotId: string;
  createdAt: string;
  masterSeed: number;

  agents: FrozenAgentState[];
  mutationGenomeState: FrozenGenomeState;
  initialRepository: FrozenRepositoryState;
  mutationSequence: FrozenMutationSequenceEntry[];
  fullExecutionTrace: {
    agentTraces: AgentExecutionTrace[];
    repairDecisionTraces: RepairDecisionTrace[];
    verificationReasoningTraces: VerificationReasoningTrace[];
    judgeScoringTraces: JudgeScoringTrace[];
    mutationSelectionTraces: MutationSelectionTrace[];
  };
  phaseResults: BenchmarkRunResult['phases'];
  finalResults: FinalEvaluationResult;

  protocolVersion: string;
  mutationEngineVersion: string;
  judgeVersion: string;
  repairEngineVersion: string;

  reproducibilityHash: string;
}

export class ExperimentSnapshotBuilder {
  private data: Partial<ExperimentSnapshot> = {};

  setMasterSeed(seed: number): this {
    this.data.masterSeed = seed;
    return this;
  }

  setAgents(agents: FrozenAgentState[]): this {
    this.data.agents = agents;
    return this;
  }

  setGenomeState(genome: FrozenGenomeState): this {
    this.data.mutationGenomeState = genome;
    return this;
  }

  setInitialRepository(repo: FrozenRepositoryState): this {
    this.data.initialRepository = repo;
    return this;
  }

  setMutationSequence(seq: FrozenMutationSequenceEntry[]): this {
    this.data.mutationSequence = seq;
    return this;
  }

  setExecutionTrace(trace: ExperimentSnapshot['fullExecutionTrace']): this {
    this.data.fullExecutionTrace = trace;
    return this;
  }

  setPhaseResults(phases: BenchmarkRunResult['phases']): this {
    this.data.phaseResults = phases;
    return this;
  }

  setFinalResults(results: FinalEvaluationResult): this {
    this.data.finalResults = results;
    return this;
  }

  setVersions(versions: {
    protocolVersion: string;
    mutationEngineVersion: string;
    judgeVersion: string;
    repairEngineVersion: string;
  }): this {
    this.data.protocolVersion = versions.protocolVersion;
    this.data.mutationEngineVersion = versions.mutationEngineVersion;
    this.data.judgeVersion = versions.judgeVersion;
    this.data.repairEngineVersion = versions.repairEngineVersion;
    return this;
  }

  build(): ExperimentSnapshot {
    if (this.data.masterSeed === undefined) throw new Error('masterSeed is required');
    if (!this.data.finalResults) throw new Error('finalResults is required');

    const hashInput = JSON.stringify({
      seed: this.data.masterSeed,
      genome: this.data.mutationGenomeState,
      mutations: this.data.mutationSequence,
      results: this.data.finalResults,
    });

    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const chr = hashInput.charCodeAt(i);
      hash = (hash << 5) - hash + chr;
      hash |= 0;
    }
    const reproducibilityHash = Math.abs(hash).toString(16).padStart(8, '0');

    return {
      snapshotId: `snap-${this.data.masterSeed}-${reproducibilityHash}`,
      createdAt: deterministicNow(this.data.masterSeed),
      masterSeed: this.data.masterSeed,
      agents: this.data.agents ?? [],
      mutationGenomeState: this.data.mutationGenomeState ?? { genes: [] },
      initialRepository: this.data.initialRepository ?? { projectName: '', blueprintVersion: '', modules: [] },
      mutationSequence: this.data.mutationSequence ?? [],
      fullExecutionTrace: this.data.fullExecutionTrace ?? {
        agentTraces: [],
        repairDecisionTraces: [],
        verificationReasoningTraces: [],
        judgeScoringTraces: [],
        mutationSelectionTraces: [],
      },
      phaseResults: this.data.phaseResults ?? [],
      finalResults: this.data.finalResults,
      protocolVersion: this.data.protocolVersion ?? '0.0.0',
      mutationEngineVersion: this.data.mutationEngineVersion ?? '0.0.0',
      judgeVersion: this.data.judgeVersion ?? '0.0.0',
      repairEngineVersion: this.data.repairEngineVersion ?? '0.0.0',
      reproducibilityHash,
    };
  }
}

export function freezeRepository(repo: Repository): FrozenRepositoryState {
  return {
    projectName: repo.project_name,
    blueprintVersion: repo.blueprint_version,
    modules: repo.modules.map((m) => ({
      name: m.name,
      type: m.type,
      files: m.files.map((f) => ({ path: f.path, content: f.content })),
    })),
  };
}

export function freezeMutationSequence(seq: MutationMetadata[]): FrozenMutationSequenceEntry[] {
  return seq.map((m) => ({
    geneId: m.geneId ?? null,
    mutationType: m.type,
    operationSequence: [m.type],
    intensity: m.severity === 'critical' ? 0.9 : m.severity === 'high' ? 0.7 : m.severity === 'medium' ? 0.4 : 0.2,
    severity: m.severity,
    moduleTarget: m.moduleName,
    fileTarget: m.filePath ?? null,
  }));
}

export function freezeGenomeState(genome: {
  getAllGenes(): Array<{
    id: string;
    type: string;
    generation: number;
    parentIds: string[];
    fitness: Record<string, number>;
    parameters: {
      operationSequence: string[];
      intensityRange: [number, number];
      targetCategories: string[];
      severityBias: string;
      combinatorialWeights: Record<string, number>;
    };
    sampleCount: number;
  }>;
}): FrozenGenomeState {
  return { genes: genome.getAllGenes() };
}
