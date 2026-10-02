import type { CompanyProfile, CompanyResult, CompanyStrategyType } from './company-spawner.js';
import { getSeededRandom, type RNG } from './determinism-kernel.js';
import type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';
import { type ExecutionBudget } from './execution-budget-manager.js';
import { HackathonSimulationEngine, type SimulationResult } from './hackathon-simulation-engine.js';
import { JudgeSimulator, type JudgeVerdict } from './judge-simulator.js';

export interface CompanyExecutionState {
  company: CompanyProfile;
  simulationResult: SimulationResult | null;
  judgeVerdict: JudgeVerdict | null;
  phase: 'interpret' | 'build' | 'deploy' | 'judge' | 'repair' | 'done' | 'pruned';
  deployUrl: string | null;
  repairCycles: number;
  deployAttempts: number;
  totalFailures: number;
  toolCallsUsed: number;
  result: CompanyResult | null;
}

export interface ExecutiveDecision {
  companyId: string;
  action: 'proceed' | 'prune' | 'boost_budget' | 'redirect';
  reason: string;
}

export class ExecutiveCompanyBrain {
  private readonly seed: number;
  private readonly rng: RNG;
  private readonly maxParallelCompanies = 5;
  private readonly maxDeployAttempts = 3;
  private readonly maxRepairCycles = 3;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 27000);
  }

  assignProjects(spec: ParsedHackathonSpec, companies: CompanyProfile[]): Map<string, ParsedHackathonSpec> {
    const assignments = new Map<string, ParsedHackathonSpec>();
    for (const company of companies) {
      assignments.set(company.id, spec);
    }
    return assignments;
  }

  selectWinners(states: CompanyExecutionState[]): CompanyExecutionState[] {
    const withScore = states
      .filter((s) => s.phase !== 'pruned' && s.result !== null)
      .sort((a, b) => (b.result?.finalScore ?? 0) - (a.result?.finalScore ?? 0));
    const top20Pct = Math.max(1, Math.ceil(withScore.length * 0.2));
    return withScore.slice(0, top20Pct);
  }

  pruneLosers(states: CompanyExecutionState[]): ExecutiveDecision[] {
    const decisions: ExecutiveDecision[] = [];
    const sorted = [...states]
      .filter((s) => s.phase !== 'pruned' && s.judgeVerdict !== null)
      .sort((a, b) => (b.judgeVerdict?.total ?? 0) - (a.judgeVerdict?.total ?? 0));

    if (sorted.length <= 2) return decisions;

    const medianIndex = Math.floor(sorted.length / 2);
    const bottomHalf = sorted.slice(medianIndex);

    for (const state of bottomHalf) {
      if (state.phase === 'pruned') continue;
      const score = state.judgeVerdict?.total ?? 0;
      if (score < sorted[0]!.judgeVerdict!.total * 0.6) {
        state.phase = 'pruned';
        decisions.push({
          companyId: state.company.id,
          action: 'prune',
          reason: `Score ${score} is <60% of leader (${sorted[0]!.judgeVerdict!.total})`,
        });
      }
    }

    return decisions;
  }

  pruneEarlyFailure(states: CompanyExecutionState[], phase: string): ExecutiveDecision[] {
    const decisions: ExecutiveDecision[] = [];
    const active = states.filter((s) => s.phase !== 'pruned');

    for (const state of active) {
      if (state.deployAttempts >= this.maxDeployAttempts && state.deployUrl === null) {
        state.phase = 'pruned';
        decisions.push({
          companyId: state.company.id,
          action: 'prune',
          reason: `Exceeded ${this.maxDeployAttempts} deploy attempts with no URL`,
        });
      }
      if (state.repairCycles >= this.maxRepairCycles && state.totalFailures > 3) {
        state.phase = 'pruned';
        decisions.push({
          companyId: state.company.id,
          action: 'prune',
          reason: `Exceeded ${this.maxRepairCycles} repair cycles with ${state.totalFailures} failures`,
        });
      }
    }

    return decisions;
  }

  reallocateBudget(winners: CompanyExecutionState[], losers: CompanyExecutionState[]): void {
    if (losers.length === 0) return;
    const freedBudget = losers.reduce((sum, l) => sum + (l.company.executionBudget.remaining?.steps ?? 0), 0);
    if (freedBudget <= 0 || winners.length === 0) return;

    const extraPerWinner = Math.floor(freedBudget / winners.length);
    for (const w of winners) {
      if (w.phase === 'pruned') continue;
      w.toolCallsUsed += extraPerWinner;
    }
  }

  simulateCompany(company: CompanyProfile, spec: ParsedHackathonSpec): CompanyExecutionState {
    const simEngine = new HackathonSimulationEngine(company.seed);
    const strategyMode = this.pickStrategyMode(company.strategyType);
    const simResult = simEngine.simulate({ devpost: spec, strategyMode, seed: company.seed });

    const state: CompanyExecutionState = {
      company,
      simulationResult: simResult,
      judgeVerdict: null,
      phase: 'interpret',
      deployUrl: null,
      repairCycles: 0,
      deployAttempts: 0,
      totalFailures: simResult.failureTimeline.length,
      toolCallsUsed: 0,
      result: null,
    };

    return state;
  }

  runBuildPhase(state: CompanyExecutionState): void {
    if (state.phase === 'pruned') return;
    state.phase = 'build';
    const sim = state.simulationResult;
    if (!sim) return;

    const buildFailures = sim.failureTimeline.filter((f) => f.phase === 'build').length;
    state.totalFailures += buildFailures;
    state.toolCallsUsed += sim.winnerStrategy.taskCount;
  }

  runDeployPhase(state: CompanyExecutionState, gatewayAvailable: boolean): void {
    if (state.phase === 'pruned') return;
    state.phase = 'deploy';
    state.deployAttempts++;

    const sim = state.simulationResult;
    const deployFailed = sim
      ? sim.failureTimeline.some((f) => f.phase === 'deploy' && f.strategyId === sim.winnerStrategy.id)
      : false;

    if (gatewayAvailable && !deployFailed) {
      state.deployUrl = `https://${state.company.id}.company.app`;
    } else {
      state.totalFailures++;
    }
  }

  runJudgePhase(state: CompanyExecutionState): void {
    if (state.phase === 'pruned') return;
    state.phase = 'judge';

    const sim = state.simulationResult;
    if (!sim) return;

    const judge = new JudgeSimulator({ seed: state.company.seed + 500 });
    const verdict = judge.evaluate({
      hasUI: sim.winnerStrategy.hasUI,
      hasLiveDeploy: state.deployUrl !== null,
      hasWowMoment: sim.winnerStrategy.hasWowMoment,
      buildSuccess: state.totalFailures === 0 || state.repairCycles > 0,
      deploySuccess: state.deployUrl !== null,
      testPassRate: sim.winnerStrategy.taskCount / Math.max(sim.winnerStrategy.taskCount, 1),
      crashFree: sim.failureTimeline.filter((f) => f.severity === 'critical').length === 0,
      taskCompleteness: 0.85,
      mockAI: sim.winnerStrategy.mockAI,
    });

    state.judgeVerdict = verdict;
  }

  runRepairLoop(state: CompanyExecutionState): void {
    if (state.phase === 'pruned') return;
    if (state.repairCycles >= this.maxRepairCycles) return;

    const sim = state.simulationResult;
    if (!sim) return;

    const criticalFailures = sim.failureTimeline.filter(
      (f) => f.severity === 'critical' && f.strategyId === sim.winnerStrategy.id,
    ).length;

    if (criticalFailures > 0 || state.deployUrl === null) {
      state.repairCycles++;
      state.totalFailures = Math.max(0, state.totalFailures - 1);

      if (state.repairCycles <= this.maxRepairCycles) {
        const judge = new JudgeSimulator({ seed: state.company.seed + 500 + state.repairCycles });
        const repairVerdict = judge.evaluate({
          hasUI: sim.winnerStrategy.hasUI,
          hasLiveDeploy: true,
          hasWowMoment: sim.winnerStrategy.hasWowMoment,
          buildSuccess: true,
          deploySuccess: true,
          testPassRate: 0.9,
          crashFree: true,
          taskCompleteness: 0.9,
          mockAI: sim.winnerStrategy.mockAI,
        });
        state.judgeVerdict = repairVerdict;
        state.deployUrl = `https://${state.company.id}.company.app`;
      }
    }
  }

  emitResult(state: CompanyExecutionState): CompanyResult {
    const sim = state.simulationResult;
    const score = state.judgeVerdict?.total ?? sim?.finalJudgeVerdict.total ?? 50;

    const strengths: string[] = [];
    const failureReasons: string[] = [];

    if (state.judgeVerdict?.breakdown.uxPolish && state.judgeVerdict.breakdown.uxPolish > 15) {
      strengths.push('strong UX polish');
    }
    if (state.judgeVerdict?.breakdown.innovation && state.judgeVerdict.breakdown.innovation > 15) {
      strengths.push('high innovation factor');
    }
    if (state.deployUrl) strengths.push('successful deployment');
    if (state.judgeVerdict?.wowMomentBonus && state.judgeVerdict.wowMomentBonus > 5) {
      strengths.push('wow moment bonus');
    }

    if (state.totalFailures > 3) failureReasons.push('high failure rate');
    if (state.deployAttempts > 2 && !state.deployUrl) failureReasons.push('deployment failed after multiple attempts');
    if (state.repairCycles > 2) failureReasons.push('excessive repair cycles');
    if (state.judgeVerdict?.passFail === 'fail') failureReasons.push('judge evaluation failed');

    const breakdown = {
      score,
      reliability: state.judgeVerdict?.breakdown.demoReliability ?? 10,
      wowFactor: (state.judgeVerdict?.breakdown.uxPolish ?? 10) * 2,
      innovation: state.judgeVerdict?.breakdown.innovation ?? 10,
    };

    const rankScore = score * 0.5 + breakdown.reliability * 2 + breakdown.wowFactor * 0.2 + breakdown.innovation * 0.1;

    state.result = {
      companyId: state.company.id,
      companyName: state.company.name,
      strategyType: state.company.strategyType,
      finalScore: score,
      breakdown,
      strengths,
      failureReasons,
      deployUrl: state.deployUrl,
      repairCycles: state.repairCycles,
      deployAttempts: state.deployAttempts,
      totalFailures: state.totalFailures,
      toolCallsUsed: state.toolCallsUsed,
      simulationScore: sim?.finalJudgeVerdict.total ?? 50,
      rankScore: Math.round(rankScore * 100) / 100,
      rank: 0,
      pruned: state.phase === 'pruned',
    };

    return state.result;
  }

  private pickStrategyMode(strategyType: CompanyStrategyType): 'fast-win' | 'balanced' | 'experimental' {
    switch (strategyType) {
      case 'speed':
        return 'fast-win';
      case 'reliability':
        return 'balanced';
      case 'innovation':
        return 'experimental';
      case 'ux':
        return 'fast-win';
      case 'balanced':
        return 'balanced';
    }
  }
}
