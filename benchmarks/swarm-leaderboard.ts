import { deterministicNow } from './determinism-kernel.js';
import type { SwarmResult } from './hackathon-swarm-orchestrator.js';

export interface SwarmLeaderboardEntry {
  hackathonId: string;
  agentId: string;
  strategyType: string;
  strategyName: string;
  score: number;
  rankScore: number;
  rank: number;
  tags: string[];
  win: boolean;
  executedAt: string;
  seed: number;
}

export interface StrategySuccessRecord {
  strategyType: string;
  totalWins: number;
  totalEntries: number;
  averageScore: number;
  averageRankScore: number;
  failurePatterns: string[];
  tags: string[];
}

export interface CrossHackathonIntelligence {
  topStrategies: StrategySuccessRecord[];
  failurePatterns: { pattern: string; frequency: number; strategyTypes: string[] }[];
  highWowPatterns: { strategyType: string; averageWowScore: number; count: number }[];
  mostConsistentStrategies: StrategySuccessRecord[];
}

export class SwarmLeaderboard {
  private entries: SwarmLeaderboardEntry[] = [];
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
  }

  recordEntry(entry: {
    entryId: string;
    companyId: string;
    eventId: string;
    score: number;
    rank: number;
    timestamp: string;
    metadata: Record<string, unknown>;
  }): void {
    // Entry recorded via recordResult; this method is for external callers.
  }

  recordResult(result: SwarmResult): SwarmLeaderboardEntry[] {
    const recorded: SwarmLeaderboardEntry[] = [];

    for (const agent of result.agents) {
      const rank = result.rankedAgentIds.indexOf(agent.id) + 1;
      const entry: SwarmLeaderboardEntry = {
        hackathonId: result.hackathonId,
        agentId: agent.id,
        strategyType: agent.strategy.category,
        strategyName: agent.strategy.name,
        score: agent.finalScore ?? agent.simulationScore,
        rankScore: agent.rankScore ?? agent.simulationScore,
        rank,
        tags: [agent.strategy.category, `rank-${rank}`, rank === 1 ? 'winner' : 'participant'],
        win: rank === 1,
        executedAt: result.executedAt,
        seed: result.seed,
      };
      this.entries.push(entry);
      recorded.push(entry);
    }

    return recorded;
  }

  getAllEntries(): SwarmLeaderboardEntry[] {
    return [...this.entries];
  }

  getWinsByStrategy(): Map<string, number> {
    const wins = new Map<string, number>();
    for (const entry of this.entries) {
      if (entry.win) {
        wins.set(entry.strategyType, (wins.get(entry.strategyType) ?? 0) + 1);
      }
    }
    return wins;
  }

  getAverageScoreByStrategy(): Map<string, number> {
    const scores = new Map<string, { total: number; count: number }>();
    for (const entry of this.entries) {
      const record = scores.get(entry.strategyType) ?? { total: 0, count: 0 };
      record.total += entry.score;
      record.count++;
      scores.set(entry.strategyType, record);
    }
    const result = new Map<string, number>();
    for (const [type, record] of scores) {
      result.set(type, Math.round((record.total / record.count) * 100) / 100);
    }
    return result;
  }

  computeStrategySuccess(): StrategySuccessRecord[] {
    const strategyMap = new Map<string, StrategySuccessRecord>();

    for (const entry of this.entries) {
      const existing = strategyMap.get(entry.strategyType) ?? {
        strategyType: entry.strategyType,
        totalWins: 0,
        totalEntries: 0,
        averageScore: 0,
        averageRankScore: 0,
        failurePatterns: [],
        tags: [],
      };
      existing.totalEntries++;
      if (entry.win) existing.totalWins++;
      existing.averageScore =
        (existing.averageScore * (existing.totalEntries - 1) + entry.score) / existing.totalEntries;
      existing.averageRankScore =
        (existing.averageRankScore * (existing.totalEntries - 1) + entry.rankScore) / existing.totalEntries;
      if (entry.rank >= existing.totalEntries - 2) {
        existing.failurePatterns.push(`low_rank_${entry.rank}`);
      }
      if (!existing.tags.includes(entry.strategyType)) {
        existing.tags.push(entry.strategyType);
      }
      strategyMap.set(entry.strategyType, existing);
    }

    return [...strategyMap.values()].sort((a, b) => b.averageScore - a.averageScore);
  }

  getCrossHackathonIntelligence(): CrossHackathonIntelligence {
    const strategySuccess = this.computeStrategySuccess();
    const topStrategies = strategySuccess.slice(0, 5);

    const failurePatternMap = new Map<string, { pattern: string; frequency: number; strategyTypes: string[] }>();
    for (const entry of this.entries) {
      if (entry.rank > Math.ceil(this.entries.length / 2)) {
        const pattern = entry.tags.includes('winner') ? '' : `poor_performance_${entry.strategyType}`;
        if (pattern) {
          const existing = failurePatternMap.get(pattern) ?? { pattern, frequency: 0, strategyTypes: [] };
          existing.frequency++;
          if (!existing.strategyTypes.includes(entry.strategyType)) {
            existing.strategyTypes.push(entry.strategyType);
          }
          failurePatternMap.set(pattern, existing);
        }
      }
    }

    const highWowMap = new Map<string, { strategyType: string; totalWow: number; count: number }>();
    for (const entry of this.entries) {
      if (entry.rankScore > 70) {
        const existing = highWowMap.get(entry.strategyType) ?? {
          strategyType: entry.strategyType,
          totalWow: 0,
          count: 0,
        };
        existing.totalWow += entry.rankScore;
        existing.count++;
        highWowMap.set(entry.strategyType, existing);
      }
    }

    return {
      topStrategies,
      failurePatterns: [...failurePatternMap.values()].sort((a, b) => b.frequency - a.frequency),
      highWowPatterns: [...highWowMap.values()]
        .map((r) => ({
          strategyType: r.strategyType,
          averageWowScore: Math.round((r.totalWow / r.count) * 100) / 100,
          count: r.count,
        }))
        .sort((a, b) => b.averageWowScore - a.averageWowScore),
      mostConsistentStrategies: [...strategySuccess]
        .filter((s) => s.totalEntries >= 2)
        .sort((a, b) => b.averageRankScore - a.averageRankScore)
        .slice(0, 3),
    };
  }

  toJSON(): string {
    return JSON.stringify(
      {
        entries: this.entries,
        strategySuccess: this.computeStrategySuccess(),
        intelligence: this.getCrossHackathonIntelligence(),
      },
      null,
      2,
    );
  }
}
