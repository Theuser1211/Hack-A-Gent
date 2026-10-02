import type { AgentConfig } from './agent-types.js';
import type { HackathonCategory } from './benchmark-types.js';
import { deterministicNow, getGlobalRNG, createDeterministicUuid } from './determinism-kernel.js';
import type { MutationType } from './mutation-engine.js';
import type { MutationGeneParams } from './mutation-genome.js';

export interface MutationConfig {
  initialPopulationSize: number;
  baseMutationTypes: string[];
  evolutionRate: number;
  crossoverRate: number;
  mutationRate: number;
  retentionThreshold: number;
  diversityPressure: number;
  intensityRange: [number, number];
  seedTypeDistribution: Record<string, number>;
  allowedBaseOperations: string[];
}

export interface AgentSpec {
  id: string;
  name: string;
  modelProvider: string;
  modelName: string;
  promptStrategy: string;
  reasoningArchitecture: string;
  config: AgentConfig;
}

export interface EvaluationProtocolSpec {
  phases: string[];
  maxRepairIterations: number;
  mutationSelectionStrategy: 'utility' | 'diversity' | 'difficulty_weighted' | 'random';
  judgeRequired: boolean;
  testingRequired: boolean;
  verificationRequired: boolean;
  includeRepairPhase: boolean;
  timeoutPerPhaseMs: number;
}

export interface MetricsSpec {
  primaryMetric: string;
  secondaryMetrics: string[];
  normalizationMethod: 'z_score' | 'min_max' | 'rank' | 'none';
  aggregationMethod: 'mean' | 'median' | 'weighted' | 'geometric_mean';
  confidenceInterval: number;
  includeRobustnessMetrics: boolean;
  includeEvolutionMetrics: boolean;
  includeDifferentiationMetrics: boolean;
}

export interface ReproducibilityConfig {
  masterSeed: number;
  deterministicMutationSelection: boolean;
  deterministicAgentOrder: boolean;
  deterministicCurriculum: boolean;
  deterministicEvaluationSampling: boolean;
  recordFullSnapshot: boolean;
}

export interface BenchmarkSpec {
  id: string;
  name: string;
  description: string;
  version: string;
  created_at: string;
  author?: string;

  benchmarkIds: string[];
  category: HackathonCategory;

  mutationConfig: MutationConfig;
  agents: AgentSpec[];
  evaluationProtocol: EvaluationProtocolSpec;
  metricsDefinition: MetricsSpec;
  reproducibility: ReproducibilityConfig;

  tags: string[];
  references: string[];
}

export function createDefaultMutationConfig(): MutationConfig {
  return {
    initialPopulationSize: 15,
    baseMutationTypes: [
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
    ],
    evolutionRate: 0.3,
    crossoverRate: 0.6,
    mutationRate: 0.2,
    retentionThreshold: 0.15,
    diversityPressure: 0.4,
    intensityRange: [0.3, 0.7],
    seedTypeDistribution: {},
    allowedBaseOperations: [
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
    ],
  };
}

export function createDefaultEvaluationProtocol(): EvaluationProtocolSpec {
  return {
    phases: ['generation', 'mutation', 'execution', 'verification', 'repair', 'testing', 'judging', 'aggregation'],
    maxRepairIterations: 2,
    mutationSelectionStrategy: 'utility',
    judgeRequired: true,
    testingRequired: false,
    verificationRequired: true,
    includeRepairPhase: true,
    timeoutPerPhaseMs: 300000,
  };
}

export function createDefaultMetricsSpec(): MetricsSpec {
  return {
    primaryMetric: 'robustness_score',
    secondaryMetrics: [
      'mutation_survival_rate',
      'repair_efficiency',
      'detection_accuracy',
      'mutation_differentiation_index',
      'agent_specialization_index',
      'mutation_evolution_velocity',
      'leaderboard_stability_index',
    ],
    normalizationMethod: 'min_max',
    aggregationMethod: 'mean',
    confidenceInterval: 0.95,
    includeRobustnessMetrics: true,
    includeEvolutionMetrics: true,
    includeDifferentiationMetrics: true,
  };
}

export function createDefaultReproducibilityConfig(seed?: number): ReproducibilityConfig {
  return {
    masterSeed: seed ?? 42,
    deterministicMutationSelection: true,
    deterministicAgentOrder: true,
    deterministicCurriculum: true,
    deterministicEvaluationSampling: true,
    recordFullSnapshot: true,
  };
}

export function createBenchmarkSpec(
  id: string,
  name: string,
  description: string,
  category: HackathonCategory,
  benchmarkIds: string[],
  agents: AgentSpec[],
  overrides?: Partial<{
    mutationConfig: Partial<MutationConfig>;
    evaluationProtocol: Partial<EvaluationProtocolSpec>;
    metricsDefinition: Partial<MetricsSpec>;
    reproducibility: Partial<ReproducibilityConfig>;
    version: string;
    tags: string[];
    references: string[];
  }>,
): BenchmarkSpec {
  return {
    id,
    name,
    description,
    version: overrides?.version ?? '1.0.0',
    created_at: deterministicNow(getGlobalRNG().nextInt(0, 100000)),
    benchmarkIds,
    category,
    mutationConfig: { ...createDefaultMutationConfig(), ...overrides?.mutationConfig },
    agents,
    evaluationProtocol: { ...createDefaultEvaluationProtocol(), ...overrides?.evaluationProtocol },
    metricsDefinition: { ...createDefaultMetricsSpec(), ...overrides?.metricsDefinition },
    reproducibility: { ...createDefaultReproducibilityConfig(), ...overrides?.reproducibility },
    tags: overrides?.tags ?? [],
    references: overrides?.references ?? [],
  };
}

export function specToExperimentId(spec: BenchmarkSpec, runNumber: number): string {
  const uuid = createDeterministicUuid(spec.reproducibility.masterSeed, runNumber);
  return `exp-${spec.id}-run-${runNumber}-${uuid.slice(0, 8)}`;
}
