import type { BuilderProvider } from '../kernel/builders/builder-provider.js';
import type { CodeRepairProvider } from '../kernel/builders/code-repair-provider.js';
import type { ArchitectProvider } from '../kernel/planning/architect-provider.js';
import type { PlanningProvider } from '../kernel/planning/planning-provider.js';

import type { AgentConfig } from './agent-types.js';
import type { BenchmarkJudge } from './benchmark-judge.js';
import type { AgentSpec } from './benchmark-specification.js';
import type { BenchmarkTester } from './benchmark-tester.js';

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'mock';
export type PromptStrategy = 'direct' | 'cot' | 'few_shot' | 'reflexion' | 'plan_then_code';
export type ReasoningArchitecture = 'single_pass' | 'iterative_refinement' | 'tree_of_thoughts' | 'self_critique';

export interface ModelAdapter {
  provider: ModelProvider;
  modelName: string;
  promptStrategy: PromptStrategy;
  reasoningArchitecture: ReasoningArchitecture;

  createBuilderProvider(): BuilderProvider;
  createPlannerProvider(): PlanningProvider;
  createArchitectProvider(): ArchitectProvider;
  createCodeRepairProvider(): CodeRepairProvider;
  createTestAgent?(): BenchmarkTester;
  createJudgePanel?(): BenchmarkJudge;

  getMetadata(): ModelAdapterMetadata;
}

export interface ModelAdapterMetadata {
  provider: ModelProvider;
  modelName: string;
  promptStrategy: PromptStrategy;
  reasoningArchitecture: ReasoningArchitecture;
  contextWindow: number;
  supportedFeatures: string[];
  averageLatencyMs: number;
  costPerToken: number;
}

export interface CrossModelComparisonConfig {
  adapters: ModelAdapter[];
  benchmarkIds: string[];
  mutationConfigPreset: string;
  repetitions: number;
  randomSeed: number;
}

export interface CrossModelResult {
  adapterId: string;
  agentSpec: AgentSpec;
  results: import('./benchmark-types.js').BenchmarkRunResult[];
  aggregatedMetrics: Record<string, number>;
}

export interface CrossModelReport {
  config: CrossModelComparisonConfig;
  results: CrossModelResult[];
  comparisons: {
    metricId: string;
    rankings: { adapterId: string; value: number; rank: number }[];
    bestAdapter: string;
    worstAdapter: string;
    spread: number;
  }[];
  overallRanking: { adapterId: string; totalScore: number; rank: number }[];
}

export class ModelAdapterRegistry {
  private adapters: Map<string, ModelAdapter> = new Map();

  register(name: string, adapter: ModelAdapter): void {
    this.adapters.set(name, adapter);
  }

  get(name: string): ModelAdapter | undefined {
    return this.adapters.get(name);
  }

  getAll(): ModelAdapter[] {
    return [...this.adapters.values()];
  }

  getByProvider(provider: ModelProvider): ModelAdapter[] {
    return this.getAll().filter((a) => a.provider === provider);
  }

  getByArchitecture(arch: ReasoningArchitecture): ModelAdapter[] {
    return this.getAll().filter((a) => a.reasoningArchitecture === arch);
  }
}

export function agentSpecFromModelAdapter(adapter: ModelAdapter, name?: string): AgentSpec {
  const id = `${adapter.provider}-${adapter.modelName}-${adapter.promptStrategy}`;
  return {
    id,
    name: name ?? id,
    modelProvider: adapter.provider,
    modelName: adapter.modelName,
    promptStrategy: adapter.promptStrategy,
    reasoningArchitecture: adapter.reasoningArchitecture,
    config: {
      name: name ?? id,
      builderProvider: adapter.createBuilderProvider(),
      adversarialMode: true,
      repairLimit: 2,
    },
  };
}

export function computeCrossModelRankings(results: CrossModelResult[]): CrossModelReport['comparisons'] {
  const allMetricIds = new Set<string>();
  for (const result of results) {
    for (const key of Object.keys(result.aggregatedMetrics)) {
      allMetricIds.add(key);
    }
  }

  const comparisons: CrossModelReport['comparisons'] = [];

  for (const metricId of allMetricIds) {
    const entries = results
      .filter((r) => r.aggregatedMetrics[metricId] !== undefined)
      .map((r) => ({ adapterId: r.adapterId, value: r.aggregatedMetrics[metricId]! }))
      .sort((a, b) => b.value - a.value);

    if (entries.length === 0) continue;

    const rankings = entries.map((e, i) => ({ ...e, rank: i + 1 }));

    comparisons.push({
      metricId,
      rankings,
      bestAdapter: entries[0]!.adapterId,
      worstAdapter: entries[entries.length - 1]!.adapterId,
      spread: entries.length > 1 ? entries[0]!.value - entries[entries.length - 1]!.value : 0,
    });
  }

  return comparisons;
}

export function computeOverallRanking(
  results: CrossModelResult[],
  comparisons: CrossModelReport['comparisons'],
): CrossModelReport['overallRanking'] {
  const scores = new Map<string, { total: number; count: number }>();

  for (const comp of comparisons) {
    for (const ranking of comp.rankings) {
      const existing = scores.get(ranking.adapterId) ?? { total: 0, count: 0 };
      existing.total += ranking.rank;
      existing.count++;
      scores.set(ranking.adapterId, existing);
    }
  }

  return [...scores.entries()]
    .map(([adapterId, { total, count }]) => ({ adapterId, totalScore: count > 0 ? total / count : 0, rank: 0 }))
    .sort((a, b) => a.totalScore - b.totalScore)
    .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
}
