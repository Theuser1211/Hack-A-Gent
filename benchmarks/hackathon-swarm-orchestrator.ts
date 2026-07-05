import { createDeterministicUuid, deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';
import { ExecutionBudgetManager, type ExecutionBudget } from './execution-budget-manager.js';
import {
  HackathonSimulationEngine,
  type SimulationResult,
  type Strategy,
  type StrategyMode,
  type RepairEvent,
} from './hackathon-simulation-engine.js';
import { JudgeSimulator, type JudgeVerdict } from './judge-simulator.js';
import { MutationGenome, type MutationGene } from './mutation-genome.js';
import {
  WINNING_STRATEGIES,
  type StrategyTemplate,
  type StrategyTemplateCategory,
} from './winning-strategy-templates.js';

export type CompetitionMode = 'fast' | 'balanced' | 'aggressive';
export type SwarmAgentRole = 'builder' | 'planner' | 'ux' | 'debug' | 'strategist';

export interface SwarmConfig {
  agentCount: number;
  seed: number;
  strategyPool: StrategyTemplate[];
  competitionMode: CompetitionMode;
}

export interface SwarmSubAgent {
  role: SwarmAgentRole;
  capabilityScore: number;
  specializationBias: string[];
}

export interface SwarmAgent {
  id: string;
  strategy: StrategyTemplate;
  executionBudget: ExecutionBudget;
  mutationProfile: MutationGene;
  subAgents: SwarmSubAgent[];
  simulationScore: number;
  simulationResult: SimulationResult | null;
  finalScore?: number;
  rankScore?: number;
  reliability?: number;
  wowFactorScore?: number;
  simplicityBonus?: number;
  failureCount?: number;
  repairCycles?: number;
  selectedStrategy?: Strategy;
  generationCreated: number;
}

export interface SwarmResult {
  hackathonId: string;
  hackathonTitle: string;
  agents: SwarmAgent[];
  rankedAgentIds: string[];
  winnerId: string;
  seed: number;
  executedAt: string;
  allScores: Map<string, JudgeVerdict>;
}

export interface SwarmGenerationRecord {
  generation: number;
  agents: SwarmAgent[];
  rankedAgentIds: string[];
  prunedAgentIds: string[];
  winnerId: string;
}

export interface SwarmCompetitionResult {
  hackathonId: string;
  hackathonTitle: string;
  generations: SwarmGenerationRecord[];
  finalWinnerId: string;
  finalLeaderboard: SwarmAgent[];
  seed: number;
  config: SwarmConfig;
  executedAt: string;
  generationCount: number;
  finalScoreDistribution: { score: number; count: number }[];
}

const STRATEGY_CATEGORY_MAP: StrategyTemplateCategory[] = [
  'wow_first',
  'single_flow',
  'demo_safety',
  'perceived_intelligence',
  'narrative_driven',
];

export class HackathonSwarmOrchestrator {
  private readonly config: SwarmConfig;
  private readonly rng: RNG;
  private readonly seed: number;

  constructor(config: Partial<SwarmConfig> = {}) {
    this.seed = config.seed ?? 42;
    this.config = {
      agentCount: Math.min(7, Math.max(5, config.agentCount ?? 5)),
      seed: this.seed,
      strategyPool: config.strategyPool ?? WINNING_STRATEGIES,
      competitionMode: config.competitionMode ?? 'balanced',
    };
    this.rng = getSeededRandom(this.seed + 9000);
  }

  spawnAgents(spec: ParsedHackathonSpec, generation: number = 0): SwarmAgent[] {
    const agents: SwarmAgent[] = [];
    const agentRng = getSeededRandom(this.seed + 9100 + generation * 100);

    const pool = this.buildAgentStrategyPool(spec);

    for (let i = 0; i < this.config.agentCount; i++) {
      const strategy = pool[i] ?? pool[pool.length - 1]!;
      const agentId = `agent-${createDeterministicUuid(this.seed, i + generation * 100).slice(0, 8)}`;
      const budgetManager = new ExecutionBudgetManager(this.seed + 10000 + i);
      const budget = budgetManager.checkAll();

      const genome = new MutationGenome(this.seed + 20000 + i + generation * 100);
      const allGenes = genome.getAllGenes();
      const profileGene: MutationGene =
        allGenes.length > 0
          ? allGenes[0]!
          : {
              id: `gene-${agentId}`,
              type: 'base',
              parentIds: [],
              generation: 0,
              createdAt: deterministicNow(this.seed),
              parameters: {
                operationSequence: [],
                intensityRange: [0.3, 0.7] as [number, number],
                targetCategories: ['frontend'],
                severityBias: 'medium' as const,
                combinatorialWeights: {},
              },
              fitness: {
                agent_differentiation_score: 0.5,
                repair_difficulty_score: 0.5,
                detection_variance_score: 0.5,
                utility_score: 0.5,
                ranking_separation_power: 0.5,
                failure_pattern_consistency: 0.5,
                repair_difficulty_variance: 0.5,
                leaderboard_reshuffle_contribution: 0.5,
              },
              reproductionHistory: [],
              performanceDrift: [],
              sampleCount: 0,
            };

      const subAgents: SwarmSubAgent[] = [
        {
          role: 'builder',
          capabilityScore: 0.5 + agentRng.next() * 0.4,
          specializationBias: [strategy.category, 'builder'],
        },
        {
          role: 'planner',
          capabilityScore: 0.5 + agentRng.next() * 0.4,
          specializationBias: [strategy.category, 'planner'],
        },
        {
          role: 'ux',
          capabilityScore: strategy.uxPriority >= 7 ? 0.7 + agentRng.next() * 0.3 : 0.4 + agentRng.next() * 0.4,
          specializationBias: [strategy.category, 'ux'],
        },
        {
          role: 'debug',
          capabilityScore: 0.5 + agentRng.next() * 0.4,
          specializationBias: [strategy.category, 'debug'],
        },
        {
          role: 'strategist',
          capabilityScore: 0.6 + agentRng.next() * 0.3,
          specializationBias: [strategy.category, 'strategist'],
        },
      ];

      const simScore = 40 + Math.floor(agentRng.next() * 55);

      agents.push({
        id: agentId,
        strategy,
        executionBudget: budget.budget,
        mutationProfile: profileGene,
        subAgents,
        simulationScore: simScore,
        simulationResult: null,
        generationCreated: generation,
      });
    }

    return agents;
  }

  private buildAgentStrategyPool(spec: ParsedHackathonSpec): StrategyTemplate[] {
    const pool: StrategyTemplate[] = [];
    const usedCategories = new Set<StrategyTemplateCategory>();
    const rng = getSeededRandom(this.seed + 9200);

    const hasAI =
      /ai|ml|intelligent|smart|learning|llm|gpt/i.test(spec.title) ||
      spec.judgingCriteria.some((c) => /ai|ml/i.test(c)) ||
      spec.techStackHints.some((t) => /ai|openai|gpt|tensorflow/i.test(t));

    const categoryOrder = [...STRATEGY_CATEGORY_MAP];
    const shuffled = rng.next() > 0.5 ? categoryOrder.reverse() : categoryOrder;

    for (const category of shuffled) {
      if (usedCategories.has(category)) continue;
      const strategies = this.config.strategyPool.filter((s) => s.category === category);
      if (strategies.length > 0) {
        const pick = strategies[Math.floor(rng.next() * strategies.length)]!;
        pool.push(pick);
        usedCategories.add(category);
      }
    }

    if (pool.length < this.config.agentCount) {
      const extras = this.config.strategyPool.filter((s) => !usedCategories.has(s.category));
      while (pool.length < this.config.agentCount && extras.length > 0) {
        const pick = extras[Math.floor(rng.next() * extras.length)]!;
        pool.push(pick);
      }
    }

    if (hasAI && rng.next() > 0.5) {
      const aiBoosted = this.config.strategyPool.find((s) => s.category === 'perceived_intelligence');
      if (aiBoosted && pool.includes(aiBoosted)) {
        const idx = pool.indexOf(aiBoosted);
        pool[idx] = {
          ...aiBoosted,
          uxPriority: Math.min(10, aiBoosted.uxPriority + 1),
          wowFactor: Math.min(1, aiBoosted.wowFactor + 0.05),
        };
      }
    }

    while (pool.length < this.config.agentCount) {
      const fallback = this.config.strategyPool[Math.floor(rng.next() * this.config.strategyPool.length)]!;
      pool.push(fallback);
    }

    return pool.slice(0, this.config.agentCount);
  }

  private mapTemplateToEngineStrategy(template: StrategyTemplate, seedOffset: number): Strategy {
    const rng = getSeededRandom(this.seed + seedOffset);
    const modes: StrategyMode[] = ['fast-win', 'balanced', 'experimental'];
    const mode = modes[Math.floor(rng.next() * modes.length)]!;

    return {
      name: template.name,
      id: template.id + '-' + createDeterministicUuid(this.seed, seedOffset).slice(0, 6),
      executionPlan: template.executionSteps,
      predictedScore: 50 + template.predictedScoreBonus,
      riskLevel: template.riskLevel,
      wowFactor: template.wowFactor,
      mode,
      hasUI: template.uxPriority >= 5,
      hasWowMoment: template.wowFactor >= 0.7,
      mockAI: template.category === 'perceived_intelligence',
      taskCount: template.executionSteps.length,
    };
  }

  private pickStrategyMode(competitionMode: CompetitionMode): StrategyMode {
    switch (competitionMode) {
      case 'fast':
        return 'fast-win';
      case 'balanced':
        return 'balanced';
      case 'aggressive':
        return 'experimental';
    }
  }

  simulateAgent(agent: SwarmAgent, spec: ParsedHackathonSpec, agentIndex: number): SwarmAgent {
    const simEngine = new HackathonSimulationEngine(this.seed + 10000 + agentIndex);
    const strategyMode = this.pickStrategyMode(this.config.competitionMode);
    const simResult = simEngine.simulate({ devpost: spec, strategyMode, seed: this.seed + agentIndex });

    const agentStrategy = this.mapTemplateToEngineStrategy(agent.strategy, agentIndex);

    const judge = new JudgeSimulator({ seed: this.seed + 15000 + agentIndex });
    const verdict = judge.evaluate({
      hasUI: agentStrategy.hasUI,
      hasLiveDeploy: true,
      hasWowMoment: agentStrategy.hasWowMoment,
      buildSuccess:
        simResult.failureTimeline.filter((f) => f.phase === 'build' && f.strategyId === simResult.winnerStrategy.id)
          .length === 0,
      deploySuccess:
        simResult.failureTimeline.filter((f) => f.phase === 'deploy' && f.strategyId === simResult.winnerStrategy.id)
          .length === 0,
      testPassRate: agentStrategy.taskCount / Math.max(agentStrategy.taskCount, 1),
      crashFree: simResult.failureTimeline.filter((f) => f.severity === 'critical').length === 0,
      taskCompleteness: 0, // Not measured in simulation
      mockAI: agentStrategy.mockAI,
    });

    const agentFailures = simResult.failureTimeline.filter((f) => f.strategyId === simResult.winnerStrategy.id).length;
    const agentRepairs = simResult.repairTimeline.filter((r) => r.strategyId === simResult.winnerStrategy.id).length;

    const reliability = Math.max(0, 1 - agentFailures / Math.max(agentStrategy.taskCount, 1));
    const wowFactorScore = agent.strategy.wowFactor * 100;
    const simplicityBonus = Math.max(0, 10 - agentStrategy.taskCount) * 2;

    return {
      ...agent,
      simulationScore: simResult.finalJudgeVerdict.total,
      simulationResult: simResult,
      finalScore: simResult.finalJudgeVerdict.total,
      reliability: Math.round(reliability * 100) / 100,
      wowFactorScore,
      simplicityBonus,
      failureCount: agentFailures,
      repairCycles: agentRepairs,
      selectedStrategy: agentStrategy,
    };
  }

  runCompetition(spec: ParsedHackathonSpec, maxGenerations: number = 3): SwarmCompetitionResult {
    const generations: SwarmGenerationRecord[] = [];
    let currentAgents: SwarmAgent[] = [];
    const allPrunedIds: Set<string> = new Set();

    for (let gen = 0; gen < Math.min(3, maxGenerations); gen++) {
      const genRng = getSeededRandom(this.seed + 10000 + gen * 1000);

      // Spawn fresh or mutate survivors
      if (gen === 0 || currentAgents.length < 2) {
        currentAgents = this.spawnAgents(spec, gen);
      } else {
        // Keep survivors, spawn replacements for pruned
        const kept = currentAgents.filter((a) => !allPrunedIds.has(a.id));
        const replacementCount = Math.max(0, this.config.agentCount - kept.length);
        const newAgents: SwarmAgent[] = [];

        for (let i = 0; i < replacementCount; i++) {
          const agentRng = getSeededRandom(this.seed + 20000 + gen * 100 + i);
          const pool = this.buildAgentStrategyPool(spec);
          const strategy = pool[i % pool.length]!;
          const agentId = `agent-${createDeterministicUuid(this.seed, i + gen * 1000).slice(0, 8)}`;

          const subAgents: SwarmSubAgent[] = [
            {
              role: 'builder',
              capabilityScore: 0.5 + agentRng.next() * 0.4,
              specializationBias: [strategy.category, 'builder'],
            },
            {
              role: 'planner',
              capabilityScore: 0.5 + agentRng.next() * 0.4,
              specializationBias: [strategy.category, 'planner'],
            },
            {
              role: 'ux',
              capabilityScore: strategy.uxPriority >= 7 ? 0.7 + agentRng.next() * 0.3 : 0.4 + agentRng.next() * 0.4,
              specializationBias: [strategy.category, 'ux'],
            },
            {
              role: 'debug',
              capabilityScore: 0.5 + agentRng.next() * 0.4,
              specializationBias: [strategy.category, 'debug'],
            },
            {
              role: 'strategist',
              capabilityScore: 0.6 + agentRng.next() * 0.3,
              specializationBias: [strategy.category, 'strategist'],
            },
          ];

          const freshGenome = new MutationGenome(this.seed + 40000 + gen * 100 + i);
          const freshGenes = freshGenome.getAllGenes();
          const replacementGene: MutationGene =
            freshGenes.length > 0
              ? freshGenes[0]!
              : {
                  id: `gene-${agentId}`,
                  type: 'base',
                  parentIds: [],
                  generation: 0,
                  createdAt: deterministicNow(this.seed),
                  parameters: {
                    operationSequence: [],
                    intensityRange: [0.3, 0.7] as [number, number],
                    targetCategories: ['frontend'],
                    severityBias: 'medium' as const,
                    combinatorialWeights: {},
                  },
                  fitness: {
                    agent_differentiation_score: 0.5,
                    repair_difficulty_score: 0.5,
                    detection_variance_score: 0.5,
                    utility_score: 0.5,
                    ranking_separation_power: 0.5,
                    failure_pattern_consistency: 0.5,
                    repair_difficulty_variance: 0.5,
                    leaderboard_reshuffle_contribution: 0.5,
                  },
                  reproductionHistory: [],
                  performanceDrift: [],
                  sampleCount: 0,
                };

          newAgents.push({
            id: agentId,
            strategy,
            executionBudget: new ExecutionBudgetManager(this.seed + 30000 + gen * 100 + i).checkAll().budget,
            mutationProfile: replacementGene,
            subAgents,
            simulationScore: 40 + Math.floor(agentRng.next() * 55),
            simulationResult: null,
            generationCreated: gen,
          });
        }

        currentAgents = [...kept, ...newAgents].slice(0, this.config.agentCount);
      }

      // Simulate all agents
      const evolvedAgents = currentAgents.map((agent, index) => this.simulateAgent(agent, spec, index + gen * 100));
      const ranked = this.rankAgents(evolvedAgents);
      const rankedIds = ranked.map((a) => a.id);
      const winnerId = rankedIds[0]!;

      // Prune bottom 50% after first generation
      const prunedIds: string[] = [];
      if (gen > 0) {
        const halfIdx = Math.ceil(ranked.length / 2);
        for (let i = halfIdx; i < ranked.length; i++) {
          const score = ranked[i]!.finalScore ?? ranked[i]!.simulationScore;
          const leaderScore = ranked[0]!.finalScore ?? ranked[0]!.simulationScore;
          if (score < leaderScore * 0.6) {
            prunedIds.push(ranked[i]!.id);
            allPrunedIds.add(ranked[i]!.id);
          }
        }
      }

      generations.push({
        generation: gen,
        agents: evolvedAgents,
        rankedAgentIds: rankedIds,
        prunedAgentIds: prunedIds,
        winnerId,
      });

      currentAgents = evolvedAgents;
    }

    const finalGen = generations[generations.length - 1]!;
    const finalWinner = finalGen.agents.find((a) => a.id === finalGen.winnerId);
    const finalLeaderboard = this.rankAgents(finalGen.agents);

    const scoreBuckets = new Map<number, number>();
    for (const a of finalLeaderboard) {
      const bucket = Math.floor((a.finalScore ?? a.simulationScore) / 10) * 10;
      scoreBuckets.set(bucket, (scoreBuckets.get(bucket) ?? 0) + 1);
    }
    const finalScoreDistribution = [...scoreBuckets.entries()]
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => a.score - b.score);

    return {
      hackathonId: spec.specId,
      hackathonTitle: spec.title,
      generations,
      finalWinnerId: finalGen.winnerId,
      finalLeaderboard,
      seed: this.seed,
      config: { ...this.config },
      executedAt: deterministicNow(this.seed),
      generationCount: generations.length,
      finalScoreDistribution,
    };
  }

  runSwarm(spec: ParsedHackathonSpec): SwarmResult {
    const agents = this.spawnAgents(spec);

    const evolvedAgents = agents.map((agent, index) => this.simulateAgent(agent, spec, index));

    const ranked = this.rankAgents(evolvedAgents);

    const rankedIds = ranked.map((a) => a.id);
    const winnerId = rankedIds[0] ?? rankedIds[0]!;

    const allScores = new Map<string, JudgeVerdict>();
    for (const agent of evolvedAgents) {
      if (agent.simulationResult) {
        allScores.set(agent.id, agent.simulationResult.finalJudgeVerdict);
      }
    }

    return {
      hackathonId: spec.specId,
      hackathonTitle: spec.title,
      agents: evolvedAgents,
      rankedAgentIds: rankedIds,
      winnerId,
      seed: this.seed,
      executedAt: deterministicNow(this.seed),
      allScores,
    };
  }

  rankAgents(agents: SwarmAgent[]): SwarmAgent[] {
    const withRankScores = agents.map((agent) => {
      const judgeScore = agent.finalScore ?? agent.simulationScore;
      const reliability = agent.reliability ?? 0.5;
      const wowFactorScore = agent.wowFactorScore ?? 50;
      const simplicityBonus = agent.simplicityBonus ?? 5;

      const rankScore = judgeScore * 0.5 + reliability * 20 + wowFactorScore * 0.2 + simplicityBonus * 0.1;

      return { ...agent, rankScore: Math.round(rankScore * 100) / 100 };
    });

    return withRankScores.sort((a, b) => (b.rankScore ?? 0) - (a.rankScore ?? 0));
  }
}
