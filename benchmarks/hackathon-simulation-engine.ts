import { createDeterministicUuid, deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';
import { JudgeSimulator, type JudgeVerdict } from './judge-simulator.js';
import { TaskGraph } from './task-graph.js';

// ---- Types ----

export type StrategyMode = 'fast-win' | 'balanced' | 'experimental';

export interface Strategy {
  name: string;
  id: string;
  executionPlan: string[];
  predictedScore: number;
  riskLevel: number;
  wowFactor: number;
  mode: StrategyMode;
  hasUI: boolean;
  hasWowMoment: boolean;
  mockAI: boolean;
  taskCount: number;
}

export interface StrategyScore {
  strategyId: string;
  strategyName: string;
  predictedScore: number;
  judgeVerdict: JudgeVerdict;
  executionCost: number;
  failureCount: number;
}

export interface FailureEvent {
  phase: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  strategyId: string;
}

export interface RepairEvent {
  cycle: number;
  target: string;
  action: string;
  success: boolean;
  strategyId: string;
}

export interface SimulationInput {
  devpost: ParsedHackathonSpec;
  strategyMode: StrategyMode;
  seed: number;
}

export interface SimulationResult {
  success: boolean;
  winnerStrategy: Strategy;
  allScores: StrategyScore[];
  failureTimeline: FailureEvent[];
  repairTimeline: RepairEvent[];
  finalJudgeVerdict: JudgeVerdict;
  totalExecutionMs: number;
}

// ---- Failure Injection Model ----

const FAILURE_RATES = { build: 0.1, deploy: 0.15, uiMismatch: 0.2, criticalCrash: 0.05 };

// ---- Hackathon Simulation Engine ----

export class HackathonSimulationEngine {
  private readonly seed: number;
  private readonly rng: RNG;
  private judgeSim: JudgeSimulator;

  constructor(seed: number) {
    this.seed = seed;
    this.rng = getSeededRandom(seed);
    this.judgeSim = new JudgeSimulator({ seed: seed + 100 });
  }

  // ---- Phase 1: Idea ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ Strategy ----

  generateStrategies(spec: ParsedHackathonSpec): Strategy[] {
    const title = spec.title;
    const criteria = spec.judgingCriteria;
    const techStack = spec.techStackHints;
    const hasAITopic =
      /ai|ml|intelligent|smart|learning/i.test(title) ||
      criteria.some((c) => /ai|ml/i.test(c)) ||
      techStack.some((t) => /ai|openai|gpt|tensorflow|pytorch|llm/i.test(t));
    const hasUITopic =
      /ui|ux|interface|dashboard|visual|frontend/i.test(title) || criteria.some((c) => /ux|ui|design|visual/i.test(c));

    const strategies: Strategy[] = [
      {
        name: 'UI-first wow strategy',
        id: 'strat-ui-wow-' + createDeterministicUuid(this.seed, 0).slice(0, 6),
        executionPlan: ['scaffold_ui', 'build_main_feature', 'add_wow_interaction', 'polish_ux', 'deploy'],
        predictedScore: 0,
        riskLevel: 0.25,
        wowFactor: 0.9,
        mode: 'fast-win',
        hasUI: true,
        hasWowMoment: true,
        mockAI: hasAITopic,
        taskCount: 5,
      },
      {
        name: 'infrastructure-heavy reliability strategy',
        id: 'strat-infra-' + createDeterministicUuid(this.seed, 1).slice(0, 6),
        executionPlan: [
          'scaffold_project',
          'build_backend_api',
          'setup_database',
          'add_authentication',
          'build_ui',
          'add_tests',
          'deploy',
        ],
        predictedScore: 0,
        riskLevel: 0.5,
        wowFactor: 0.4,
        mode: 'balanced',
        hasUI: true,
        hasWowMoment: false,
        mockAI: false,
        taskCount: 7,
      },
      {
        name: 'judge-alignment optimization strategy',
        id: 'strat-judge-' + createDeterministicUuid(this.seed, 2).slice(0, 6),
        executionPlan: [
          'analyze_judging_criteria',
          'build_judge_focused_feature',
          'add_wow_moment',
          'polish_narrative',
          'deploy',
        ],
        predictedScore: 0,
        riskLevel: 0.35,
        wowFactor: 0.75,
        mode: 'experimental',
        hasUI: true,
        hasWowMoment: true,
        mockAI: hasAITopic,
        taskCount: 5,
      },
    ];

    for (const s of strategies) {
      s.predictedScore = this.predictInitialScore(s, spec);
    }

    strategies.sort((a, b) => b.predictedScore - a.predictedScore);
    return strategies;
  }

  private predictInitialScore(strategy: Strategy, spec: ParsedHackathonSpec): number {
    let score = 50;
    if (strategy.wowFactor > 0.7) score += 15;
    if (strategy.hasUI) score += 10;
    if (strategy.mockAI) score += 8;
    if (strategy.riskLevel < 0.3) score += 7;
    if (strategy.taskCount <= 5) score += 5;
    if (strategy.mode === 'balanced') score += 3;
    const noise = Math.floor(this.rng.next() * 10);
    return Math.min(95, Math.max(20, score + noise));
  }

  // ---- Phase 2: Execution Simulation ----

  simulateExecution(strategies: Strategy[]): {
    failures: FailureEvent[];
    successfulTasks: Map<string, number>;
    deployUrls: Map<string, string>;
  } {
    const failures: FailureEvent[] = [];
    const successfulTasks = new Map<string, number>();
    const deployUrls = new Map<string, string>();

    for (const strategy of strategies) {
      let tasksDone = 0;

      for (const task of strategy.executionPlan) {
        if (this.failureCheck('build')) {
          failures.push({
            phase: 'build',
            description: `Build failed for ${task} in ${strategy.name}`,
            severity: 'high',
            strategyId: strategy.id,
          });
        } else {
          tasksDone++;
        }

        if (this.failureCheck('uiMismatch') && task.includes('ui')) {
          failures.push({
            phase: 'ui_mismatch',
            description: `UI mismatch in ${task} for ${strategy.name}`,
            severity: 'medium',
            strategyId: strategy.id,
          });
        }

        if (this.failureCheck('criticalCrash')) {
          failures.push({
            phase: 'runtime',
            description: `Critical runtime crash in ${strategy.name}`,
            severity: 'critical',
            strategyId: strategy.id,
          });
          break;
        }
      }

      successfulTasks.set(strategy.id, tasksDone);

      if (tasksDone >= strategy.executionPlan.length - 1 && !this.failureCheck('deploy')) {
        deployUrls.set(strategy.id, `https://${strategy.id}.vercel.app`);
      }
    }

    return { failures, successfulTasks, deployUrls };
  }

  private failureCheck(phase: keyof typeof FAILURE_RATES): boolean {
    return this.rng.next() < FAILURE_RATES[phase];
  }

  // ---- Phase 3: Judge Simulation ----

  judgeStrategy(strategy: Strategy, taskCount: number, failures: FailureEvent[]): JudgeVerdict {
    const strategyFailures = failures.filter((f) => f.strategyId === strategy.id);
    const criticalFailures = strategyFailures.filter((f) => f.severity === 'critical').length;
    const buildFailures = strategyFailures.filter((f) => f.phase === 'build').length;

    return this.judgeSim.evaluate({
      hasUI: strategy.hasUI,
      hasLiveDeploy: !strategyFailures.some((f) => f.phase === 'deploy'),
      hasWowMoment: strategy.hasWowMoment,
      buildSuccess: buildFailures === 0,
      deploySuccess: !strategyFailures.some((f) => f.phase === 'deploy'),
      testPassRate: taskCount / Math.max(strategy.taskCount, 1),
      crashFree: criticalFailures === 0,
      taskCompleteness: taskCount / Math.max(strategy.taskCount, 1),
      mockAI: strategy.mockAI,
    });
  }

  // ---- Phase 4: Repair Loop ----

  simulateRepairs(strategies: Strategy[], failures: FailureEvent[]): RepairEvent[] {
    const repairs: RepairEvent[] = [];
    const MAX_CYCLES = 3;

    for (const strategy of strategies) {
      const strategyFailures = failures.filter((f) => f.strategyId === strategy.id);
      let cycle = 0;

      for (const failure of strategyFailures) {
        if (cycle >= MAX_CYCLES) break;
        cycle++;

        const success = this.rng.next() > 0.4;
        repairs.push({
          cycle,
          target: failure.phase,
          action: failure.severity === 'critical' ? 'restart_affected_module' : 'retry_failed_task',
          success,
          strategyId: strategy.id,
        });

        if (!success && cycle < MAX_CYCLES) {
          cycle++;
          repairs.push({
            cycle,
            target: failure.phase,
            action: 'degraded_fallback',
            success: true,
            strategyId: strategy.id,
          });
        }
      }
    }

    return repairs;
  }

  // ---- Phase 5: Winner Selection ----

  selectWinner(scores: StrategyScore[]): StrategyScore {
    const sorted = [...scores].sort((a, b) => {
      const aScore = a.judgeVerdict.total;
      const bScore = b.judgeVerdict.total;
      if (bScore !== aScore) return bScore - aScore;
      return a.executionCost - b.executionCost;
    });
    return sorted[0]!;
  }

  // ---- Full Simulation ----

  simulate(input: SimulationInput): SimulationResult {
    const { devpost, strategyMode, seed } = input;
    this.judgeSim = new JudgeSimulator({ seed: seed + 100 });

    const strategies = this.generateStrategies(devpost);

    const preferredStrategy = strategies.find((s) => s.mode === strategyMode);
    const orderedStrategies = preferredStrategy
      ? [preferredStrategy, ...strategies.filter((s) => s.id !== preferredStrategy.id)]
      : strategies;

    const { failures, successfulTasks, deployUrls } = this.simulateExecution(orderedStrategies);

    const scores: StrategyScore[] = orderedStrategies.map((s) => {
      const tasksDone = successfulTasks.get(s.id) ?? 0;
      const verdict = this.judgeStrategy(s, tasksDone, failures);
      return {
        strategyId: s.id,
        strategyName: s.name,
        predictedScore: s.predictedScore,
        judgeVerdict: verdict,
        executionCost: s.taskCount * 1000,
        failureCount: failures.filter((f) => f.strategyId === s.id).length,
      };
    });

    const repairs = this.simulateRepairs(orderedStrategies, failures);

    const winner = this.selectWinner(scores);
    const winnerStrategy = orderedStrategies.find((s) => s.id === winner.strategyId)!;

    const startTime = deterministicNow(seed);
    const totalExecutionMs = 5000 + orderedStrategies.reduce((sum, s) => sum + s.taskCount * 1200, 0);

    return {
      success: winner.judgeVerdict.total >= 60,
      winnerStrategy,
      allScores: scores,
      failureTimeline: failures,
      repairTimeline: repairs,
      finalJudgeVerdict: winner.judgeVerdict,
      totalExecutionMs,
    };
  }

  // ---- Preview (before execution) ----

  preview(spec: ParsedHackathonSpec): {
    recommendedStrategy: Strategy;
    predictedScore: number;
    allStrategies: Strategy[];
    gateRecommended: 'proceed' | 'optimize';
  } {
    const strategies = this.generateStrategies(spec);
    const top = strategies[0]!;
    return {
      recommendedStrategy: top,
      predictedScore: top.predictedScore,
      allStrategies: strategies,
      gateRecommended: top.predictedScore >= 75 ? 'proceed' : 'optimize',
    };
  }
}
