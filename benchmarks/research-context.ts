import type { BenchmarkSpec } from './benchmark-specification.js';
import type { MetricsSpec } from './benchmark-specification.js';
import type { EvaluationProtocolSpec } from './benchmark-specification.js';
import { createDefaultReproducibilityConfig } from './benchmark-specification.js';
import { createDefaultMetricsSpec } from './benchmark-specification.js';
import { createDefaultEvaluationProtocol } from './benchmark-specification.js';
import { getSeededRandom, deterministicShuffle as importedDeterministicShuffle } from './determinism-kernel.js';

export type ExecutionMode = 'research' | 'production';

export interface ResearchModeConfig {
  fullLoggingEnabled: boolean;
  fullTraceCapture: boolean;
  deterministicReplayRequired: boolean;
  mutationEvolutionEnabled: boolean;
  captureRepositorySnapshots: boolean;
  recordAllDecisions: boolean;
  exportDatasets: boolean;
}

export interface ProductionModeConfig {
  reducedLogging: boolean;
  optimizedExecution: boolean;
  mutationEvolutionFreeze: boolean;
  skipDatasetExport: boolean;
  skipFullTrace: boolean;
  parallelExecution: boolean;
}

export interface ResearchContext {
  mode: ExecutionMode;
  researchConfig: ResearchModeConfig;
  productionConfig: ProductionModeConfig;

  currentSpec: BenchmarkSpec | null;
  experimentId: string | null;
  outputDirectory: string;
  seed: number;
}

export function createResearchContext(seed?: number, outputDir?: string): ResearchContext {
  return {
    mode: 'research',
    researchConfig: {
      fullLoggingEnabled: true,
      fullTraceCapture: true,
      deterministicReplayRequired: true,
      mutationEvolutionEnabled: true,
      captureRepositorySnapshots: true,
      recordAllDecisions: true,
      exportDatasets: true,
    },
    productionConfig: {
      reducedLogging: true,
      optimizedExecution: true,
      mutationEvolutionFreeze: false,
      skipDatasetExport: true,
      skipFullTrace: true,
      parallelExecution: true,
    },
    currentSpec: null,
    experimentId: null,
    outputDirectory: outputDir ?? './benchmark-results',
    seed: seed ?? 42,
  };
}

export function createProductionContext(seed?: number, outputDir?: string): ResearchContext {
  return {
    mode: 'production',
    researchConfig: {
      fullLoggingEnabled: false,
      fullTraceCapture: false,
      deterministicReplayRequired: false,
      mutationEvolutionEnabled: true,
      captureRepositorySnapshots: false,
      recordAllDecisions: false,
      exportDatasets: false,
    },
    productionConfig: {
      reducedLogging: true,
      optimizedExecution: true,
      mutationEvolutionFreeze: false,
      skipDatasetExport: true,
      skipFullTrace: true,
      parallelExecution: true,
    },
    currentSpec: null,
    experimentId: null,
    outputDirectory: outputDir ?? './benchmark-results',
    seed: seed ?? 42,
  };
}

export function switchToResearchMode(context: ResearchContext): void {
  context.mode = 'research';
  context.researchConfig = {
    fullLoggingEnabled: true,
    fullTraceCapture: true,
    deterministicReplayRequired: true,
    mutationEvolutionEnabled: true,
    captureRepositorySnapshots: true,
    recordAllDecisions: true,
    exportDatasets: true,
  };
}

export function switchToProductionMode(context: ResearchContext): void {
  context.mode = 'production';
  context.productionConfig = {
    reducedLogging: true,
    optimizedExecution: true,
    mutationEvolutionFreeze: false,
    skipDatasetExport: true,
    skipFullTrace: true,
    parallelExecution: true,
  };
}

export function configureFromSpec(context: ResearchContext, spec: BenchmarkSpec): void {
  context.currentSpec = spec;
  context.seed = spec.reproducibility.masterSeed;

  if (spec.reproducibility.recordFullSnapshot) {
    context.researchConfig.captureRepositorySnapshots = true;
    context.researchConfig.recordAllDecisions = true;
  }
}

export function createSeedFromSpec(spec: BenchmarkSpec, additionalSeed?: number): number {
  const base = spec.reproducibility.masterSeed;
  return additionalSeed !== undefined ? base + additionalSeed : base;
}

export function deterministicShuffle<T>(items: T[], seed: number): T[] {
  return getSeededRandom(seed).shuffle(items);
}

export function seededRandom(seed: number): () => number {
  const rng = getSeededRandom(seed);
  return () => rng.next();
}
