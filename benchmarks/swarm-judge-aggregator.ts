import type { SwarmResult } from './hackathon-swarm-orchestrator.js';
import type { JudgeVerdict } from './judge-simulator.js';

export interface AggregatedScore {
  agentId: string;
  strategyType: string;
  strategyName: string;
  normalizedScore: number;
  originalScore: number;
  reliability: number;
  wowFactorScore: number;
  simplicityBonus: number;
  rankScore: number;
  biasFlags: string[];
  rank: number;
}

export interface AggregationReport {
  scores: AggregatedScore[];
  winner: AggregatedScore;
  biasWarnings: string[];
  outlierSuppressed: string[];
  scoreSpread: number;
  averageScore: number;
  medianScore: number;
}

export class SwarmJudgeAggregator {
  aggregate(result: SwarmResult): AggregationReport {
    const agents = result.agents;
    const rawScores = agents.map((a) => a.finalScore ?? a.simulationScore);

    const mean = rawScores.reduce((s, v) => s + v, 0) / rawScores.length;
    const sorted = [...rawScores].sort((a, b) => a - b);
    const median =
      sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
        : sorted[Math.floor(sorted.length / 2)]!;

    const stdDev = Math.sqrt(rawScores.reduce((s, v) => s + (v - mean) ** 2, 0) / rawScores.length);

    const outlierSuppressed: string[] = [];
    const biasWarnings: string[] = [];

    const processed: AggregatedScore[] = agents.map((agent) => {
      const originalScore = agent.finalScore ?? agent.simulationScore;
      const reliability = agent.reliability ?? 0.5;
      const wowFactorScore = agent.wowFactorScore ?? 50;
      const simplicityBonus = agent.simplicityBonus ?? 5;

      const zScore = stdDev > 0 ? Math.abs(originalScore - mean) / stdDev : 0;
      let normalizedScore = originalScore;
      const biasFlags: string[] = [];

      if (zScore > 2.5) {
        normalizedScore = mean + Math.sign(originalScore - mean) * stdDev * 2;
        outlierSuppressed.push(
          `${agent.id}: suppressed from ${originalScore} to ${Math.round(normalizedScore)} (z=${zScore.toFixed(2)})`,
        );
        biasFlags.push('outlier_suppressed');
      }

      if (agent.strategy.riskLevel > 0.4 && originalScore > mean + stdDev) {
        biasFlags.push('high_risk_high_score_flag');
        biasWarnings.push(
          `${agent.id}: high-risk strategy (${agent.strategy.name}) scored above average Ã¢â‚¬â€ flagging for review`,
        );
      }

      if (zScore > 1.5 && zScore <= 2.5) {
        biasFlags.push('elevated_score');
      }

      if (agent.failureCount && agent.failureCount > 3 && originalScore > mean) {
        biasFlags.push('failure_count_mismatch');
        biasWarnings.push(
          `${agent.id}: ${agent.failureCount} failures but score ${originalScore} Ã¢â‚¬â€ possible bias amplification`,
        );
      }

      const rankScore =
        agent.rankScore ?? normalizedScore * 0.5 + reliability * 20 + wowFactorScore * 0.2 + simplicityBonus * 0.1;

      return {
        agentId: agent.id,
        strategyType: agent.strategy.category,
        strategyName: agent.strategy.name,
        normalizedScore: Math.round(normalizedScore * 100) / 100,
        originalScore: Math.round(originalScore * 100) / 100,
        reliability: Math.round(reliability * 100) / 100,
        wowFactorScore: Math.round(wowFactorScore * 100) / 100,
        simplicityBonus: Math.round(simplicityBonus * 100) / 100,
        rankScore: Math.round(rankScore * 100) / 100,
        biasFlags,
        rank: 0,
      };
    });

    processed.sort((a, b) => b.rankScore - a.rankScore);
    for (let i = 0; i < processed.length; i++) {
      processed[i]!.rank = i + 1;
    }

    const scoreSpread = processed.length > 0 ? processed[0]!.rankScore - processed[processed.length - 1]!.rankScore : 0;

    return {
      scores: processed,
      winner: processed[0]!,
      biasWarnings,
      outlierSuppressed,
      scoreSpread: Math.round(scoreSpread * 100) / 100,
      averageScore: Math.round(mean * 100) / 100,
      medianScore: Math.round(median * 100) / 100,
    };
  }
}
