import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';
import type { ExecutionPolicy } from './execution-policy-optimizer.js';
import { HackathonRewardModel } from './hackathon-reward-model.js';
import { OrganizationalMemoryBank, type ProjectSnapshot } from './organizational-memory-bank.js';
import type { StrategyPlan } from './strategic-planner.js';
import { StrategicPlanner } from './strategic-planner.js';

export interface StrategyCandidate {
  strategyId: string;
  name: string;
  plan: StrategyPlan;
  expectedReward: number;
  riskScore: number;
  resourceCost: number;
  noveltyFactor: number;
  reliabilityScore: number;
  simulationDetails: {
    estimatedBuildTime: number;
    estimatedApiCalls: number;
    deploymentComplexity: 'low' | 'medium' | 'high';
    riskFactors: string[];
  };
}

export interface CompetitionResult {
  winner: StrategyCandidate;
  candidates: StrategyCandidate[];
  selectionReason: string;
  runnerUp: StrategyCandidate | null;
  simulatedAt: string;
}

export class StrategySimulationEngine {
  private readonly seed: number;
  private readonly engineId: string;
  private readonly decisionLogger: DecisionLogger;
  private competitionHistory: CompetitionResult[] = [];

  constructor(seed = 42) {
    this.seed = seed;
    this.engineId = 'sim-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 8200);
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getCompetitionHistory(): CompetitionResult[] {
    return [...this.competitionHistory];
  }

  generateCandidates(
    basePlan: StrategyPlan,
    memory: OrganizationalMemoryBank,
    rewardModel: HackathonRewardModel,
    policy?: ExecutionPolicy,
    count = 4,
  ): StrategyCandidate[] {
    const rng = getSeededRandom(this.seed + basePlan.projectName.length);
    const candidates: StrategyCandidate[] = [];
    const similar = memory.querySimilarProjects(basePlan.projectName + ' ' + basePlan.winningStrategy, 2);

    const templates = [
      {
        name: 'MVP-First',
        modifier: (p: StrategyPlan) => ({
          ...p,
          mvpScope: p.mvpScope.slice(0, Math.max(4, p.mvpScope.length - 2)),
          wowFactors: p.wowFactors.slice(0, 1),
          winningStrategy: 'Ship fast, polish later',
        }),
      },
      {
        name: 'Polish-Forward',
        modifier: (p: StrategyPlan) => ({
          ...p,
          wowFactors: [...p.wowFactors, 'Demo-ready UI', 'Polished animations'],
          mvpScope: [...p.mvpScope, 'Responsive design'],
          winningStrategy: 'Win on UX polish and presentation',
        }),
      },
      {
        name: 'Feature-Max',
        modifier: (p: StrategyPlan) => ({
          ...p,
          mvpScope: [...p.mvpScope, 'Advanced features', 'Real-time updates'],
          wowFactors: [...p.wowFactors, 'Novel architecture'],
          winningStrategy: 'Win on technical complexity',
        }),
      },
      {
        name: 'Memory-Guided',
        modifier: (p: StrategyPlan) => {
          if (similar.snapshots.length === 0) return p;
          const best = similar.snapshots.reduce((a, b) => (a.overallScore > b.overallScore ? a : b));
          return {
            ...p,
            winningStrategy: `Follow winning pattern: ${best.strategy.winningStrategy}`,
            mvpScope: [...new Set([...p.mvpScope, ...best.strategy.mvpScope])],
          };
        },
      },
      {
        name: 'Conservative',
        modifier: (p: StrategyPlan) => ({
          ...p,
          mvpScope: p.mvpScope.slice(0, 5),
          wowFactors: [],
          risks: p.risks.map((r) => ({ ...r, severity: r.severity === 'critical' ? ('high' as const) : r.severity })),
          winningStrategy: 'Minimize risk, guarantee delivery',
        }),
      },
      {
        name: 'Bold-Innovation',
        modifier: (p: StrategyPlan) => ({
          ...p,
          mvpScope: [...p.mvpScope, 'Novel AI integration', 'Experimental feature'],
          wowFactors: [...p.wowFactors, 'Cutting-edge approach', 'Novel interaction model'],
          winningStrategy: 'Win through innovation and novelty',
        }),
      },
      {
        name: 'Judge-Aligned',
        modifier: (p: StrategyPlan) => ({
          ...p,
          mvpScope:
            p.competitionAnalysis.judgePriorities.length > 0
              ? [...p.competitionAnalysis.judgePriorities.map((c) => `Address: ${c}`), ...p.mvpScope]
              : p.mvpScope,
          winningStrategy: 'Directly address every judging criterion',
        }),
      },
    ];

    const selectedTemplates = rng.shuffle(templates).slice(0, count);

    for (const template of selectedTemplates) {
      const modifiedPlan = template.modifier(basePlan);
      modifiedPlan.id = 'candidate-' + createDeterministicUuid(this.seed, candidates.length).slice(0, 8);
      modifiedPlan.estimatedSuccessProbability =
        Math.round((basePlan.estimatedSuccessProbability + (rng.next() - 0.5) * 0.3) * 100) / 100;

      const predicted = rewardModel.predictSuccess(template.name, [], modifiedPlan.winningStrategy);
      const riskScore = Math.round((0.1 + rng.next() * 0.6) * 100) / 100;
      const noveltyFactor =
        Math.round((template.name === 'Bold-Innovation' ? 0.7 + rng.next() * 0.2 : 0.1 + rng.next() * 0.3) * 100) / 100;
      const reliabilityScore = Math.round((1 - riskScore + noveltyFactor * 0.3) * 100) / 100;

      candidates.push({
        strategyId: modifiedPlan.id,
        name: template.name,
        plan: modifiedPlan,
        expectedReward: predicted.totalScore,
        riskScore,
        resourceCost:
          Math.round((modifiedPlan.mvpScope.length * 0.15 + modifiedPlan.wowFactors.length * 0.2) * 100) / 100,
        noveltyFactor,
        reliabilityScore,
        simulationDetails: {
          estimatedBuildTime: modifiedPlan.mvpScope.length * 1000 + modifiedPlan.wowFactors.length * 2000,
          estimatedApiCalls: modifiedPlan.mvpScope.length * 2,
          deploymentComplexity: modifiedPlan.techStack?.some((s) => s.includes('docker') || s.includes('k8s'))
            ? 'high'
            : 'medium',
          riskFactors: modifiedPlan.risks
            .filter((r) => r.severity === 'critical' || r.severity === 'high')
            .map((r) => r.description),
        },
      });
    }

    this.decisionLogger.log(
      'strategy',
      'generate_candidates',
      `Generated ${candidates.length} strategy candidates`,
      0.85,
      candidates.map((c) => c.name),
    );
    return candidates;
  }

  selectWinner(candidates: StrategyCandidate[], riskTolerance = 0.5): CompetitionResult {
    const rng = getSeededRandom(this.seed + candidates.length);
    const scored = candidates.map((c) => {
      const rewardScore = c.expectedReward * 0.4;
      const riskPenalty = c.riskScore > riskTolerance ? (c.riskScore - riskTolerance) * 0.3 : 0;
      const noveltyBonus = c.noveltyFactor * 0.15;
      const reliabilityScore = c.reliabilityScore * 0.15;
      const costPenalty = c.resourceCost * 0.1;
      const total = Math.max(0, rewardScore - riskPenalty + noveltyBonus + reliabilityScore - costPenalty);
      return { candidate: c, score: Math.round(total * 100) / 100 };
    });

    scored.sort((a, b) => b.score - a.score);
    const winner = scored[0]!;
    const runnerUp = scored.length > 1 ? scored[1]! : null;

    const reasons: string[] = [];
    reasons.push(`Highest composite score: ${winner.score}`);
    if (winner.candidate.expectedReward > (runnerUp?.candidate.expectedReward ?? 0))
      reasons.push('Best expected reward');
    if (winner.candidate.riskScore <= riskTolerance) reasons.push('Within risk tolerance');
    if (winner.candidate.noveltyFactor > 0.5) reasons.push('Novel approach with high upside');

    const result: CompetitionResult = {
      winner: winner.candidate,
      candidates,
      selectionReason: reasons.join('; '),
      runnerUp: runnerUp?.candidate ?? null,
      simulatedAt: deterministicNow(this.seed + this.competitionHistory.length),
    };

    this.competitionHistory.push(result);
    this.decisionLogger.log(
      'strategy',
      'select_winner',
      `Winner: "${winner.candidate.name}" (score: ${winner.score})`,
      winner.score,
      candidates.map((c) => c.name),
      { winnerScore: winner.score, riskTolerance },
    );
    return result;
  }

  runCompetition(
    basePlan: StrategyPlan,
    memory: OrganizationalMemoryBank,
    rewardModel: HackathonRewardModel,
    policy?: ExecutionPolicy,
    candidateCount = 4,
    riskTolerance = 0.5,
  ): CompetitionResult {
    const candidates = this.generateCandidates(basePlan, memory, rewardModel, policy, candidateCount);
    return this.selectWinner(candidates, riskTolerance);
  }
}
