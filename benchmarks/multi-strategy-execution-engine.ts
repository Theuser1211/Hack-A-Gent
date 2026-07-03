import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, getSeededRandom } from './determinism-kernel.js';
import { type StrategyPlan } from './strategic-planner.js';
import type { TaskGraph } from './task-graph.js';
import { UXEvaluationAgent, type UXEvaluationResult } from './ux-evaluation-agent.js';

export type StrategyType =
  | 'mvp_fast'
  | 'balanced_default'
  | 'polish_ux'
  | 'innovation_experimental'
  | 'constraint_optimized';

export interface CompetingStrategy {
  strategyId: string;
  type: StrategyType;
  name: string;
  plan: StrategyPlan;
  simulationScore: number;
  uxScore: number;
  deployProbability: number;
  timeEstimateMs: number;
  riskScore: number;
  details: string;
}

export interface MultiStrategyResult {
  strategies: CompetingStrategy[];
  winner: CompetingStrategy;
  selectionReason: string;
  simulationDurationMs: number;
}

export class MultiStrategyExecutionEngine {
  private readonly seed: number;
  private readonly engineId: string;
  private readonly decisionLogger: DecisionLogger;
  private readonly uxAgent: UXEvaluationAgent;

  constructor(seed = 42) {
    this.seed = seed;
    this.engineId = 'strat-eng-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.decisionLogger = new DecisionLogger(seed + 9000);
    this.uxAgent = new UXEvaluationAgent(String(seed + 9001));
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }

  generateStrategies(basePlan: StrategyPlan, judgingCriteria: string[], constraints: string[]): CompetingStrategy[] {
    const rng = getSeededRandom(this.seed + basePlan.projectName.length);
    const strategies: CompetingStrategy[] = [];
    const types: StrategyType[] = [
      'mvp_fast',
      'balanced_default',
      'polish_ux',
      'innovation_experimental',
      'constraint_optimized',
    ];

    for (const type of types) {
      const plan = this.mutatePlan(basePlan, judgingCriteria, constraints);
      const id = 'strat-' + createDeterministicUuid(this.seed, strategies.length).slice(0, 8);
      const uxScore = this.simulateUX(type);
      const deployProb = this.simulateDeployProbability(type, constraints);
      const timeEstimate = this.estimateTime(type, plan.mvpScope.length);
      const riskScore = this.calculateRisk(type, constraints.length);

      const totalScore =
        Math.round(
          (uxScore * 0.3 + deployProb * 0.25 + (1 - riskScore) * 0.2 + plan.estimatedSuccessProbability * 0.25) * 100,
        ) / 100;

      strategies.push({
        strategyId: id,
        name: this.strategyName(type),
        plan: { ...plan, id },
        simulationScore: totalScore,
        uxScore,
        deployProbability: deployProb,
        timeEstimateMs: timeEstimate,
        riskScore,
        details: this.describeStrategy(type, uxScore, deployProb, riskScore),
      });
    }

    strategies.sort((a, b) => b.simulationScore - a.simulationScore);

    this.decisionLogger.log('strategy', 'strategies_generated', `Generated ${strategies.length} strategies`, 0.85, [], {
      types: strategies.map((s) => s.type),
      topScore: strategies[0]?.simulationScore,
    });

    return strategies;
  }

  selectWinner(strategies: CompetingStrategy[], preference?: StrategyType): MultiStrategyResult {
    const startTime = Date.now();
    let winner: CompetingStrategy;

    if (preference) {
      const preferred = strategies.find((s) => s.type === preference);
      winner = preferred ?? strategies[0]!;
    } else {
      winner = strategies[0]!;
    }

    const reason = `Selected "${winner.name}" (${winner.type}) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â score: ${(winner.simulationScore * 100).toFixed(1)}%, UX: ${(winner.uxScore * 100).toFixed(1)}%, Deploy prob: ${(winner.deployProbability * 100).toFixed(1)}%`;

    this.decisionLogger.log('strategy', 'strategy_selected', reason, winner.simulationScore, [], {
      winner: winner.type,
      score: winner.simulationScore,
      runnerUp: strategies[1]?.type,
    });

    return { strategies, winner, selectionReason: reason, simulationDurationMs: Date.now() - startTime };
  }

  private mutatePlan(base: StrategyPlan, type: StrategyType, criteria: string[], constraints: string[]): StrategyPlan {
    const plan = { ...base, mvpScope: [...base.mvpScope], wowFactors: [...base.wowFactors], risks: [...base.risks] };
    plan.competitionAnalysis = {
      ...base.competitionAnalysis,
      judgePriorities: [...base.competitionAnalysis.judgePriorities],
      differentiators: [...base.competitionAnalysis.differentiators],
      commonPitfalls: [...base.competitionAnalysis.commonPitfalls],
    };

    switch (type) {
      case 'mvp_fast':
        plan.mvpScope = plan.mvpScope.slice(0, Math.max(2, Math.floor(plan.mvpScope.length / 2)));
        plan.wowFactors = [];
        plan.winningStrategy = 'Ship the fastest working prototype';
        plan.estimatedSuccessProbability = 0.75;
        break;
      case 'balanced_default':
        plan.wowFactors.push('Clean UI', 'Working demo');
        plan.winningStrategy = 'Balance core features with solid UX';
        plan.estimatedSuccessProbability = 0.7;
        break;
      case 'polish_ux':
        plan.mvpScope = plan.mvpScope.slice(0, Math.max(3, Math.floor(plan.mvpScope.length * 0.7)));
        plan.wowFactors.push('Production-quality UI', 'Smooth animations', 'Responsive design', 'Accessibility');
        plan.winningStrategy = 'Win through exceptional UX and polish';
        plan.estimatedSuccessProbability = 0.65;
        break;
      case 'innovation_experimental':
        plan.mvpScope.push('Novel interaction', 'Experimental feature');
        plan.wowFactors.push('Cutting-edge approach', 'Novel architecture', 'Unique demo hook');
        plan.winningStrategy = 'Win through innovation and uniqueness';
        plan.estimatedSuccessProbability = 0.5;
        plan.risks.push({
          category: 'tech',
          description: 'Experimental features may not work',
          severity: 'high',
          probability: 0.4,
          mitigation: 'Have fallback plan',
        });
        break;
      case 'constraint_optimized':
        plan.mvpScope = plan.mvpScope.slice(0, Math.max(2, Math.floor(plan.mvpScope.length * 0.6)));
        plan.wowFactors = plan.wowFactors.slice(0, 1);
        plan.winningStrategy = `Optimized for constraints: ${constraints.slice(0, 2).join(', ')}`;
        plan.estimatedSuccessProbability = 0.8;
        break;
    }

    return plan;
  }

  private simulateUX(type: StrategyType): number {
    const rng = getSeededRandom(this.seed + 100);
    switch (type) {
      case 'polish_ux':
        return Math.round((0.75 + rng.next() * 0.2) * 100) / 100;
      case 'balanced_default':
        return Math.round((0.55 + rng.next() * 0.25) * 100) / 100;
      case 'mvp_fast':
        return Math.round((0.3 + rng.next() * 0.25) * 100) / 100;
      case 'innovation_experimental':
        return Math.round((0.4 + rng.next() * 0.3) * 100) / 100;
      case 'constraint_optimized':
        return Math.round((0.45 + rng.next() * 0.25) * 100) / 100;
    }
  }

  private simulateDeployProbability(type: StrategyType, constraints: string[]): number {
    const hasDeploy = constraints.some((c) => /deploy|live|production/i.test(c));
    switch (type) {
      case 'mvp_fast':
        return hasDeploy ? 0.85 : 0.7;
      case 'balanced_default':
        return hasDeploy ? 0.8 : 0.65;
      case 'polish_ux':
        return hasDeploy ? 0.75 : 0.6;
      case 'innovation_experimental':
        return hasDeploy ? 0.6 : 0.45;
      case 'constraint_optimized':
        return hasDeploy ? 0.9 : 0.75;
    }
  }

  private estimateTime(type: StrategyType, scopeSize: number): number {
    const baseTime = scopeSize * 30000;
    switch (type) {
      case 'mvp_fast':
        return Math.round(baseTime * 0.6);
      case 'balanced_default':
        return Math.round(baseTime * 1.0);
      case 'polish_ux':
        return Math.round(baseTime * 1.4);
      case 'innovation_experimental':
        return Math.round(baseTime * 1.5);
      case 'constraint_optimized':
        return Math.round(baseTime * 0.7);
    }
  }

  private calculateRisk(type: StrategyType, constraintCount: number): number {
    const rng = getSeededRandom(this.seed + 200);
    const baseRisk = constraintCount * 0.05;
    switch (type) {
      case 'mvp_fast':
        return Math.min(1, baseRisk + 0.1 + rng.next() * 0.1);
      case 'balanced_default':
        return Math.min(1, baseRisk + 0.2 + rng.next() * 0.1);
      case 'polish_ux':
        return Math.min(1, baseRisk + 0.3 + rng.next() * 0.15);
      case 'innovation_experimental':
        return Math.min(1, baseRisk + 0.5 + rng.next() * 0.2);
      case 'constraint_optimized':
        return Math.min(1, baseRisk + 0.15 + rng.next() * 0.1);
    }
  }

  private strategyName(type: StrategyType): string {
    const names: Record<StrategyType, string> = {
      mvp_fast: 'MVP Express',
      balanced_default: 'Balanced Build',
      polish_ux: 'UX Excellence',
      innovation_experimental: 'Innovation Edge',
      constraint_optimized: 'Constraint Master',
    };
    return names[type];
  }

  private describeStrategy(type: StrategyType, ux: number, dep: number, risk: number): string {
    return `[${this.strategyName(type)}] UX:${(ux * 100).toFixed(0)}% Deploy:${(dep * 100).toFixed(0)}% Risk:${(risk * 100).toFixed(0)}%`;
  }
}
