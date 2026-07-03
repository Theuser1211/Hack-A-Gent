import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, getSeededRandom } from './determinism-kernel.js';
import type { ExecutionPolicy } from './execution-policy-optimizer.js';
import { HackathonRewardModel } from './hackathon-reward-model.js';
import { OrganizationalMemoryBank } from './organizational-memory-bank.js';
import type { StrategyPlan } from './strategic-planner.js';
import type { StrategyCandidate } from './strategy-simulation-engine.js';
import { StrategySimulationEngine } from './strategy-simulation-engine.js';

export type AgentVariant = 'conservative' | 'aggressive' | 'balanced' | 'memory_driven' | 'innovation_focused';

export interface InternalAgent {
  agentId: string;
  variant: AgentVariant;
  specialization: 'planner' | 'executor' | 'ux_specialist' | 'deployment_engineer';
  riskProfile: number;
  innovationBias: number;
  memoryWeight: number;
  score: number;
  wins: number;
}

export interface CompetitionRound {
  roundId: string;
  agents: InternalAgent[];
  candidates: StrategyCandidate[];
  winner: StrategyCandidate;
  selectionReason: string;
  agentScores: Array<{ agentId: string; variant: string; score: number; rank: number }>;
}

export class MultiAgentCompetition {
  private readonly seed: number;
  private readonly competitionId: string;
  private readonly decisionLogger: DecisionLogger;
  private agents: InternalAgent[] = [];
  private rounds: CompetitionRound[] = [];
  private readonly simulationEngine: StrategySimulationEngine;

  constructor(seed = 42) {
    this.seed = seed;
    this.competitionId = 'comp-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 8500);
    this.simulationEngine = new StrategySimulationEngine(seed + 1);
    this.initializeAgents();
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getAgents(): InternalAgent[] {
    return [...this.agents];
  }
  getRounds(): CompetitionRound[] {
    return [...this.rounds];
  }

  private initializeAgents(): void {
    const rng = getSeededRandom(this.seed);
    const variants: Array<{
      variant: AgentVariant;
      specialization: InternalAgent['specialization'];
      riskProfile: number;
      innovationBias: number;
      memoryWeight: number;
    }> = [
      {
        variant: 'conservative',
        specialization: 'deployment_engineer',
        riskProfile: 0.2,
        innovationBias: 0.1,
        memoryWeight: 0.8,
      },
      { variant: 'aggressive', specialization: 'planner', riskProfile: 0.8, innovationBias: 0.7, memoryWeight: 0.3 },
      { variant: 'balanced', specialization: 'executor', riskProfile: 0.5, innovationBias: 0.4, memoryWeight: 0.5 },
      {
        variant: 'memory_driven',
        specialization: 'ux_specialist',
        riskProfile: 0.3,
        innovationBias: 0.2,
        memoryWeight: 0.95,
      },
      {
        variant: 'innovation_focused',
        specialization: 'planner',
        riskProfile: 0.7,
        innovationBias: 0.9,
        memoryWeight: 0.2,
      },
    ];

    for (const v of variants) {
      this.agents.push({
        agentId: 'agent-' + createDeterministicUuid(this.seed, this.agents.length).slice(0, 8),
        variant: v.variant,
        specialization: v.specialization,
        riskProfile: v.riskProfile,
        innovationBias: v.innovationBias,
        memoryWeight: v.memoryWeight,
        score: 0.5 + rng.next() * 0.3,
        wins: 0,
      });
    }
  }

  runCompetitionRound(
    basePlan: StrategyPlan,
    memory: OrganizationalMemoryBank,
    rewardModel: HackathonRewardModel,
    policy?: ExecutionPolicy,
  ): CompetitionRound {
    const rng = getSeededRandom(this.seed + this.rounds.length);
    const roundId = 'round-' + createDeterministicUuid(this.seed, this.rounds.length).slice(0, 8);

    const candidates: StrategyCandidate[] = [];
    for (const agent of this.agents) {
      const agentPlan = this.adaptPlan(basePlan, agent);
      const candidatesFromAgent = this.simulationEngine.generateCandidates(agentPlan, memory, rewardModel, policy, 1);
      if (candidatesFromAgent.length > 0) {
        const adjusted = candidatesFromAgent[0]!;
        adjusted.expectedReward =
          Math.round(Math.min(1, adjusted.expectedReward * (0.8 + agent.memoryWeight * 0.2)) * 100) / 100;
        candidates.push(adjusted);
      }
    }

    const competitionResult = this.simulationEngine.selectWinner(candidates, policy?.riskTolerance ?? 0.5);

    const agentScores = this.agents.map((agent) => {
      const matchIdx = candidates.findIndex((c) => c.name.toLowerCase().includes(agent.variant.replace(/_/g, '-')));
      const score =
        matchIdx >= 0
          ? competitionResult.winner.strategyId === candidates[matchIdx]!.strategyId
            ? 0.9 + rng.next() * 0.1
            : 0.3 + rng.next() * 0.3
          : 0.2 + rng.next() * 0.2;
      return { agentId: agent.agentId, variant: agent.variant, score: Math.round(score * 100) / 100, rank: 0 };
    });

    agentScores.sort((a, b) => b.score - a.score);
    agentScores.forEach((as, i) => {
      as.rank = i + 1;
    });

    for (const aScore of agentScores) {
      const agent = this.agents.find((a) => a.agentId === aScore.agentId);
      if (agent) {
        agent.score = (agent.score + aScore.score) / 2;
        if (aScore.rank === 1) agent.wins++;
      }
    }

    const round: CompetitionRound = {
      roundId,
      agents: this.agents.map((a) => ({ ...a })),
      candidates,
      winner: competitionResult.winner,
      selectionReason: competitionResult.selectionReason,
      agentScores,
    };

    this.rounds.push(round);
    this.decisionLogger.log(
      'strategy',
      'competition_round',
      `Round ${this.rounds.length}: Winner="${competitionResult.winner.name}"`,
      0.85,
      candidates.map((c) => c.name),
      { agentScores: agentScores.map((a) => ({ variant: a.variant, score: a.score, rank: a.rank })) },
    );

    return round;
  }

  private adaptPlan(basePlan: StrategyPlan, agent: InternalAgent): StrategyPlan {
    const adapted = {
      ...basePlan,
      mvpScope: [...basePlan.mvpScope],
      wowFactors: [...basePlan.wowFactors],
      risks: basePlan.risks.map((r) => ({ ...r })),
    };
    if (agent.riskProfile < 0.3) {
      adapted.mvpScope = adapted.mvpScope.slice(0, Math.max(4, adapted.mvpScope.length - 2));
      adapted.wowFactors = [];
    }
    if (agent.innovationBias > 0.7) {
      adapted.wowFactors.push('Novel experimental feature', 'Cutting-edge integration');
      adapted.estimatedSuccessProbability = Math.min(1, adapted.estimatedSuccessProbability * 1.1);
    }
    if (agent.memoryWeight > 0.8) {
      adapted.winningStrategy = 'Follow proven patterns from organizational memory';
      adapted.estimatedSuccessProbability = Math.min(1, adapted.estimatedSuccessProbability * 0.9 + 0.15);
    }
    return adapted;
  }

  getLeaderboard(): Array<{ variant: AgentVariant; score: number; wins: number; specialization: string }> {
    return this.agents
      .map((a) => ({
        variant: a.variant,
        score: Math.round(a.score * 100) / 100,
        wins: a.wins,
        specialization: a.specialization,
      }))
      .sort((a, b) => b.score - a.score);
  }
}
