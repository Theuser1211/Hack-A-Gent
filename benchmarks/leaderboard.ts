import { mkdirSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import type { LeaderboardEntry, EvolutionMetrics, MutationSpecializationData } from './agent-types.js';
import { ALL_MUTATION_TYPES } from './agent-types.js';
import type { MutationType } from './mutation-engine.js';

export class Leaderboard {
  private entries: LeaderboardEntry[] = [];
  private readonly storagePath: string;
  private mutationSpecializations: Map<MutationType, MutationSpecializationData> = new Map();

  constructor(storagePath?: string) {
    this.storagePath = storagePath ?? path.join(process.cwd(), 'benchmark-results', 'leaderboard.json');
    this.initializeMutationSpecializations();
    this.load();
  }

  private initializeMutationSpecializations(): void {
    for (const mt of ALL_MUTATION_TYPES) {
      this.mutationSpecializations.set(mt, {
        mutationType: mt,
        agentPerformance: {},
        difficultyAdjustment: 1.0,
        vulnerabilityTrend: 'stable',
      });
    }
  }

  updateLeaderboard(agentEntries: LeaderboardEntry[]): void {
    this.entries = agentEntries
      .sort((a, b) => {
        const diff = b.averageRobustnessScore - a.averageRobustnessScore;
        if (diff !== 0) return diff;
        return a.agentId.localeCompare(b.agentId);
      })
      .map((entry, idx) => ({ ...entry, rank: idx + 1 }));
    this.save();
  }

  updateAfterAgentRun(agentId: string, entry: LeaderboardEntry): void {
    const existingIdx = this.entries.findIndex((e) => e.agentId === agentId);
    if (existingIdx >= 0) {
      this.entries[existingIdx] = entry;
    } else {
      this.entries.push(entry);
    }
    this.entries
      .sort((a, b) => {
        const diff = b.averageRobustnessScore - a.averageRobustnessScore;
        if (diff !== 0) return diff;
        return a.agentId.localeCompare(b.agentId);
      })
      .forEach((e, idx) => {
        e.rank = idx + 1;
      });
    this.save();
  }

  getTopAgents(limit: number = 10): LeaderboardEntry[] {
    return [...this.entries]
      .sort((a, b) => {
        const diff = b.averageRobustnessScore - a.averageRobustnessScore;
        if (diff !== 0) return diff;
        return a.agentId.localeCompare(b.agentId);
      })
      .slice(0, limit);
  }

  getAgentRank(agentId: string): number {
    const entry = this.entries.find((e) => e.agentId === agentId);
    return entry?.rank ?? -1;
  }

  getAgentEntry(agentId: string): LeaderboardEntry | undefined {
    return this.entries.find((e) => e.agentId === agentId);
  }

  getAllEntries(): readonly LeaderboardEntry[] {
    return this.entries;
  }

  updateMutationSpecialization(mutationType: MutationType, data: Partial<MutationSpecializationData>): void {
    const existing = this.mutationSpecializations.get(mutationType);
    if (existing) {
      this.mutationSpecializations.set(mutationType, { ...existing, ...data });
    }
  }

  getMutationSpecialization(mutationType: MutationType): MutationSpecializationData | undefined {
    return this.mutationSpecializations.get(mutationType);
  }

  getSpecializationDiversity(): number {
    if (this.entries.length < 2) return 0;
    const scores = this.entries.map((e) => e.specializationScore);
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / scores.length;
    return Math.min(1, Math.sqrt(variance));
  }

  getEvolutionMetrics(): EvolutionMetrics {
    const topPerformers = this.getTopAgents(5);
    const totalBenchmarks = this.entries.reduce((s, e) => s + e.totalBenchmarksRun, 0);
    const averageBenchmarksPerAgent = this.entries.length > 0 ? totalBenchmarks / this.entries.length : 0;

    const mutationDifficultyTrend = this.aggregateDifficultyTrend();

    const hardMutationClusters = this.identifyHardMutationClusters();

    return {
      topPerformers,
      averageBenchmarksPerAgent,
      mutationDifficultyTrend,
      specializationDiversity: this.getSpecializationDiversity(),
      adaptationRate: this.calculateAdaptationRate(),
      hardMutationClusters,
    };
  }

  renderLeaderboardTable(): string {
    const lines: string[] = [];
    lines.push(
      '| Rank | Agent | Robustness | Survival Rate | Repair Eff. | Specialization | Strongest Type | Weakest Type | Benchmarks |',
    );
    lines.push(
      '|-----:|-------|----------:|--------------:|-----------:|--------------:|---------------|--------------|----------:|',
    );
    for (const entry of this.entries) {
      const strongest = entry.strongestMutationType ?? 'N/A';
      const weakest = entry.mostVulnerableMutationType ?? 'N/A';
      lines.push(
        `| ${entry.rank} | ${entry.name} | ${entry.averageRobustnessScore.toFixed(1)} | ${(entry.mutationSurvivalRate * 100).toFixed(0)}% | ${entry.repairEfficiency.toFixed(2)} | ${entry.specializationScore.toFixed(2)} | ${strongest} | ${weakest} | ${entry.totalBenchmarksRun} |`,
      );
    }
    return lines.join('\n');
  }

  private aggregateDifficultyTrend(): 'increasing' | 'stable' | 'decreasing' {
    let increasing = 0;
    let decreasing = 0;
    for (const [, data] of this.mutationSpecializations) {
      if (data.vulnerabilityTrend === 'increasing') increasing++;
      if (data.vulnerabilityTrend === 'decreasing') decreasing++;
    }
    if (increasing > decreasing + 2) return 'increasing';
    if (decreasing > increasing + 2) return 'decreasing';
    return 'stable';
  }

  private identifyHardMutationClusters(): MutationType[] {
    const hard: MutationType[] = [];
    for (const [mt, data] of this.mutationSpecializations) {
      const performances = Object.values(data.agentPerformance);
      if (performances.length === 0) continue;
      const avgPerformance = performances.reduce((a, b) => a + b, 0) / performances.length;
      if (avgPerformance < 0.3) {
        hard.push(mt);
      }
    }
    return hard;
  }

  private calculateAdaptationRate(): number {
    if (this.entries.length === 0) return 0;
    const rates = this.entries.map((e) => {
      const baseScore = e.averageRobustnessScore;
      return baseScore / 100;
    });
    return Math.max(0, Math.min(1, rates.reduce((a, b) => a + b, 0) / rates.length));
  }

  private save(): void {
    try {
      const dir = path.dirname(this.storagePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      const data = { entries: this.entries, mutationSpecializations: Object.fromEntries(this.mutationSpecializations) };
      writeFileSync(this.storagePath, JSON.stringify(data, null, 2), 'utf-8');
    } catch {
      // best effort
    }
  }

  private load(): void {
    try {
      if (existsSync(this.storagePath)) {
        const raw = readFileSync(this.storagePath, 'utf-8');
        const data = JSON.parse(raw) as {
          entries?: LeaderboardEntry[];
          mutationSpecializations?: Record<string, MutationSpecializationData>;
        };
        if (data.entries) {
          this.entries = data.entries;
        }
        if (data.mutationSpecializations) {
          for (const [key, val] of Object.entries(data.mutationSpecializations)) {
            this.mutationSpecializations.set(key as MutationType, val);
          }
        }
      }
    } catch {
      this.entries = [];
    }
  }
}
