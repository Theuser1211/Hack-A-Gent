import type { BuilderProvider } from '../kernel/builders/builder-provider.js';

import type {
  Agent,
  AgentConfig,
  AgentSpecializationProfile,
  MutationSpecializationEntry,
  LeaderboardEntry,
  EvolutionaryHistoryPoint,
} from './agent-types.js';
import { ALL_MUTATION_TYPES } from './agent-types.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import { deterministicNow, createDeterministicUuid, getGlobalRNG } from './determinism-kernel.js';
import type { MutationType } from './mutation-engine.js';

export class AgentRegistry {
  private agents: Map<string, Agent> = new Map();

  registerAgent(config: AgentConfig): Agent {
    const agentId = this.generateAgentId(config.name);
    const now = deterministicNow(getGlobalRNG().nextInt(0, 100000));
    const agent: Agent = {
      id: agentId,
      config,
      specializationProfile: this.createInitialSpecializationProfile(agentId),
      benchmarkHistory: [],
      evolutionaryHistory: [],
      createdAt: now,
      lastUpdated: now,
    };
    this.agents.set(agentId, agent);
    return agent;
  }

  registerAgentWithId(id: string, config: AgentConfig): Agent {
    const now = deterministicNow(getGlobalRNG().nextInt(0, 100000));
    const agent: Agent = {
      id,
      config,
      specializationProfile: this.createInitialSpecializationProfile(id),
      benchmarkHistory: [],
      evolutionaryHistory: [],
      createdAt: now,
      lastUpdated: now,
    };
    this.agents.set(id, agent);
    return agent;
  }

  getAgent(agentId: string): Agent | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): Agent[] {
    return Array.from(this.agents.values());
  }

  removeAgent(agentId: string): boolean {
    return this.agents.delete(agentId);
  }

  addBenchmarkResult(agentId: string, benchmarkResult: BenchmarkRunResult): void {
    const agent = this.agents.get(agentId);
    if (!agent) return;

    agent.benchmarkHistory.push(benchmarkResult);
    agent.lastUpdated = deterministicNow(getGlobalRNG().nextInt(0, 100000));
    this.updateSpecializationFromResult(agent, benchmarkResult);
    this.appendEvolutionaryHistoryPoint(agent, benchmarkResult);
  }

  getLeaderboardEntries(): LeaderboardEntry[] {
    const entries: LeaderboardEntry[] = [];
    for (const agent of this.agents.values()) {
      entries.push(this.computeLeaderboardEntry(agent));
    }
    return entries
      .sort((a, b) => b.averageRobustnessScore - a.averageRobustnessScore)
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
  }

  private generateAgentId(name: string): string {
    const uuid = createDeterministicUuid(getGlobalRNG().nextInt(0, 100000), this.agents.size + 1);
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 12);
    return `agent-${slug}-${uuid.slice(0, 8)}`;
  }

  private createInitialSpecializationProfile(agentId: string): AgentSpecializationProfile {
    const perMutationType: Record<MutationType, MutationSpecializationEntry> = {} as Record<
      MutationType,
      MutationSpecializationEntry
    >;
    for (const mt of ALL_MUTATION_TYPES) {
      perMutationType[mt] = { successRate: 0.5, failureRate: 0.5, adaptationScore: 0, runCount: 0 };
    }
    return {
      agentId,
      perMutationType,
      adaptationSpeed: 0.5,
      resilienceFactor: 0.5,
      dominantMutationTypes: [],
      vulnerableMutationTypes: [],
      strongestMutationType: null,
      mostVulnerableMutationType: null,
    };
  }

  private updateSpecializationFromResult(agent: Agent, result: BenchmarkRunResult): void {
    const profile = agent.specializationProfile;

    for (const mt of ALL_MUTATION_TYPES) {
      const stat = result.per_mutation_type_stats[mt];
      const entry = profile.perMutationType[mt];
      if (!stat || !entry) continue;

      const detected = stat.detected;
      const applied = stat.applied;
      const repaired = stat.repaired;

      if (applied > 0) {
        const newSuccessRate = repaired / applied;
        const newFailureRate = (detected - repaired) / applied;
        entry.successRate = entry.runCount === 0 ? newSuccessRate : entry.successRate * 0.7 + newSuccessRate * 0.3;
        entry.failureRate = entry.runCount === 0 ? newFailureRate : entry.failureRate * 0.7 + newFailureRate * 0.3;
        entry.adaptationScore = this.computeAdaptationScore(entry);
      }
      entry.runCount++;
    }

    const ranked = ALL_MUTATION_TYPES.map((mt) => ({
      mt,
      score: profile.perMutationType[mt]?.successRate ?? 0.5,
    })).sort((a, b) => b.score - a.score);

    profile.dominantMutationTypes = ranked.slice(0, 3).map((r) => r.mt);
    profile.vulnerableMutationTypes = ranked.slice(-3).map((r) => r.mt);
    profile.strongestMutationType = ranked[0]?.mt ?? null;
    profile.mostVulnerableMutationType = ranked[ranked.length - 1]?.mt ?? null;

    const scores = ALL_MUTATION_TYPES.map((mt) => profile.perMutationType[mt]?.successRate ?? 0.5);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    profile.resilienceFactor = mean;
    profile.adaptationSpeed = this.computeOverallAdaptationSpeed(profile);
  }

  private computeAdaptationScore(entry: MutationSpecializationEntry): number {
    if (entry.runCount < 2) return 0;
    const improvement = entry.successRate - 0.5;
    return Math.max(0, Math.min(1, improvement * 2));
  }

  private computeOverallAdaptationSpeed(profile: AgentSpecializationProfile): number {
    const entries = Object.values(profile.perMutationType);
    const withRuns = entries.filter((e) => e.runCount >= 2);
    if (withRuns.length === 0) return 0.5;
    const avgAdaptation = withRuns.reduce((s, e) => s + e.adaptationScore, 0) / withRuns.length;
    return Math.max(0, Math.min(1, avgAdaptation));
  }

  private appendEvolutionaryHistoryPoint(agent: Agent, result: BenchmarkRunResult): void {
    const perMutationTypePerformance: Record<string, number> = {};
    for (const mt of ALL_MUTATION_TYPES) {
      const stat = result.per_mutation_type_stats[mt];
      perMutationTypePerformance[mt] = stat && stat.applied > 0 ? stat.repaired / stat.applied : 0.5;
    }

    const point: EvolutionaryHistoryPoint = {
      timestamp: result.completed_at,
      robustnessScore: result.robustness_score,
      rank: 0,
      bdi: result.benchmark_difficulty_index,
      globalDifficulty: result.global_difficulty,
      perMutationTypePerformance,
    };
    agent.evolutionaryHistory.push(point);
  }

  private computeLeaderboardEntry(agent: Agent): LeaderboardEntry {
    const history = agent.benchmarkHistory;
    const n = history.length;

    const averageRobustnessScore = n > 0 ? history.reduce((s, r) => s + r.robustness_score, 0) / n : 0;

    const totalMutationsApplied = history.reduce((s, r) => s + r.mutations_applied, 0);
    const survivedCount = history.filter((r) => r.survived_mutation).length;
    const mutationSurvivalRate = totalMutationsApplied > 0 ? survivedCount / n : 0;

    const totalRepairIterations = history.reduce((s, r) => s + r.repair_iterations, 0);
    const repairEfficiency =
      totalRepairIterations > 0 && n > 0 ? history.filter((r) => r.overall_success).length / totalRepairIterations : 0;

    const specializationScore = this.computeSpecializationScore(agent.specializationProfile);

    const lastRunAt = n > 0 ? history[n - 1]!.completed_at : agent.createdAt;

    return {
      agentId: agent.id,
      name: agent.config.name,
      averageRobustnessScore,
      mutationSurvivalRate,
      repairEfficiency,
      specializationScore,
      totalBenchmarksRun: n,
      rank: 0,
      lastRunAt,
      strongestMutationType: agent.specializationProfile.strongestMutationType,
      mostVulnerableMutationType: agent.specializationProfile.mostVulnerableMutationType,
    };
  }

  computeSpecializationScore(profile: AgentSpecializationProfile): number {
    const scores = ALL_MUTATION_TYPES.map((mt) => profile.perMutationType[mt]?.successRate ?? 0.5);
    if (scores.length === 0) return 0;

    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
    const cv = mean > 0 ? Math.sqrt(variance) / mean : 0;

    const maxScore = Math.max(...scores);
    const dominance = maxScore > 0.5 ? (maxScore - 0.5) * 2 : 0;

    const maxAdaptation = Math.max(
      ...ALL_MUTATION_TYPES.map((mt) => profile.perMutationType[mt]?.adaptationScore ?? 0),
    );

    const specializationScore = cv * 0.4 + dominance * 0.3 + (1 - maxAdaptation) * 0.3;
    return Math.max(0, Math.min(1, specializationScore));
  }
}
