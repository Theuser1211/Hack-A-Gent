import type { EvolutionDelta } from './company-evolution-engine.js';
import type { CompanyStrategyType } from './company-spawner.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import type { StrategyTemplate } from './winning-strategy-templates.js';

export interface StrategyGenomeRecord {
  genomeId: string;
  strategyType: CompanyStrategyType | string;
  templateId: string;
  templateName: string;
  generation: number;
  createdAt: string;
  lastUsedAt: string;
  totalWins: number;
  totalRuns: number;
  averageScore: number;
  bestScore: number;
  winRate: number;
  mutationLineage: string[];
  performanceHistory: { runId: string; score: number; rank: number }[];
  tags: string[];
}

export interface GlobalGenomeSummary {
  totalGenomes: number;
  topStrategies: StrategyGenomeRecord[];
  mostMutated: StrategyGenomeRecord[];
  averageWinRate: number;
  dominantArchetypes: string[];
}

export class StrategyGenomeDatabase {
  initializeGenomeRecords(): void {}

  private readonly seed: number;
  private readonly rng: RNG;
  private records: Map<string, StrategyGenomeRecord> = new Map();
  private readonly storageKey = 'hackagent-genome-db';

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 31000);
    this.loadFromStorage();
  }

  getOrCreateGenome(template: StrategyTemplate, strategyType: CompanyStrategyType | string): StrategyGenomeRecord {
    const existing = [...this.records.values()].find(
      (r) => r.templateId === template.id && r.strategyType === strategyType,
    );
    if (existing) return existing;

    const record: StrategyGenomeRecord = {
      genomeId: `genome-${createDeterministicUuid(this.seed, this.records.size).slice(0, 8)}`,
      strategyType,
      templateId: template.id,
      templateName: template.name,
      generation: 0,
      createdAt: deterministicNow(this.seed),
      lastUsedAt: deterministicNow(this.seed),
      totalWins: 0,
      totalRuns: 0,
      averageScore: 0,
      bestScore: 0,
      winRate: 0,
      mutationLineage: [],
      performanceHistory: [],
      tags: [template.category, strategyType],
    };

    this.records.set(record.genomeId, record);
    this.persistToStorage();
    return record;
  }

  recordRun(genomeId: string, score: number, rank: number, isWin: boolean, runId: string): void {
    const record = this.records.get(genomeId);
    if (!record) return;

    record.totalRuns++;
    if (isWin) record.totalWins++;
    if (score > record.bestScore) record.bestScore = score;
    record.averageScore = (record.averageScore * (record.totalRuns - 1) + score) / record.totalRuns;
    record.winRate = record.totalWins / record.totalRuns;
    record.lastUsedAt = deterministicNow(this.seed);
    record.performanceHistory.push({ runId, score, rank });

    if (record.performanceHistory.length > 50) {
      record.performanceHistory = record.performanceHistory.slice(-50);
    }

    this.persistToStorage();
  }

  recordMutation(genomeId: string, mutationType: string): void {
    const record = this.records.get(genomeId);
    if (!record) return;
    record.mutationLineage.push(`${mutationType}@${deterministicNow(this.seed)}`);
    record.generation++;
    this.persistToStorage();
  }

  applyEvolutionDelta(delta: EvolutionDelta | null, templateMap: Map<string, StrategyTemplate>): void {
    if (!delta) return;

    for (const mutation of delta.mutationsApplied) {
      const matching = [...this.records.values()].find(
        (r) =>
          r.templateName.toLowerCase().includes(mutation.target.toLowerCase()) || r.genomeId.includes(mutation.target),
      );
      if (matching) {
        this.recordMutation(matching.genomeId, mutation.mutationType);
      }
    }

    for (const shift of delta.strategyShifts) {
      const matching = [...this.records.values()].find((r) => r.templateName.toLowerCase().includes(shift.from));
      if (matching) {
        matching.strategyType = shift.to;
        matching.tags.push(`shifted_from_${shift.from}`);
        this.persistToStorage();
      }
    }

    for (const pattern of delta.newBestPatterns) {
    }
  }

  getGenome(id: string): StrategyGenomeRecord | undefined {
    return this.records.get(id);
  }

  getAllGenomes(): StrategyGenomeRecord[] {
    return [...this.records.values()];
  }

  getTopGenomes(limit = 5): StrategyGenomeRecord[] {
    return [...this.records.values()]
      .filter((r) => r.totalRuns >= 1)
      .sort((a, b) => b.winRate - a.winRate || b.averageScore - a.averageScore)
      .slice(0, limit);
  }

  getMostMutatedGenomes(limit = 5): StrategyGenomeRecord[] {
    return [...this.records.values()]
      .sort((a, b) => b.mutationLineage.length - a.mutationLineage.length)
      .slice(0, limit);
  }

  getDominantArchetypes(): string[] {
    const winMap = new Map<string, { wins: number; runs: number }>();
    for (const record of this.records.values()) {
      const existing = winMap.get(record.strategyType) ?? { wins: 0, runs: 0 };
      existing.wins += record.totalWins;
      existing.runs += record.totalRuns;
      winMap.set(record.strategyType, existing);
    }

    return [...winMap.entries()]
      .filter(([, data]) => data.runs >= 2 && data.wins / data.runs > 0.3)
      .sort(([, a], [, b]) => b.wins - a.wins)
      .map(([type]) => type);
  }

  getSummary(): GlobalGenomeSummary {
    const all = this.getAllGenomes();
    const totalGenomes = all.length;
    const topStrategies = this.getTopGenomes(5);
    const mostMutated = this.getMostMutatedGenomes(5);
    const averageWinRate = totalGenomes > 0 ? all.reduce((s, r) => s + r.winRate, 0) / totalGenomes : 0;
    const dominantArchetypes = this.getDominantArchetypes();

    return { totalGenomes, topStrategies, mostMutated, averageWinRate, dominantArchetypes };
  }

  toJSON(): string {
    return JSON.stringify({ records: [...this.records.values()], summary: this.getSummary() }, null, 2);
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify({
        records: [...this.records.entries()].map(([id, r]) => [id, r]),
        updatedAt: deterministicNow(this.seed),
      });
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as any).localStorage.setItem(this.storageKey, data);
      }
    } catch { /* Optional localStorage persistence is best-effort. */ }
  }

  private loadFromStorage(): void {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        const raw = (globalThis as any).localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.records)) {
            for (const [id, record] of parsed.records) {
              this.records.set(id, record as StrategyGenomeRecord);
            }
          }
        }
      }
    } catch { /* Optional localStorage persistence is best-effort. */ }
  }
}
