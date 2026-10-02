import { CompanyEvolutionEngine, type EvolutionDelta } from './company-evolution-engine.js';
import { CompanySpawner, type CompanyProfile, type CompanyResult } from './company-spawner.js';
import { ComplexityCollapseEngine, type ComplexityReport } from './complexity-collapse-map.js';
import { getSeededRandom, deterministicNow, type RNG } from './determinism-kernel.js';
import type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';
import {
  ExecutiveCompanyBrain,
  type CompanyExecutionState,
  type ExecutiveDecision,
} from './executive-company-brain.js';
import { HackathonSimulationEngine } from './hackathon-simulation-engine.js';
import { JudgeSimulator } from './judge-simulator.js';

export interface CompanyCompetitionConfig {
  companyCount: number;
  seed: number;
  fastMode: boolean;
  simulateOnly: boolean;
  gatewayAvailable: boolean;
}

export interface CompanyCompetitionResult {
  hackathonId: string;
  hackathonTitle: string;
  config: CompanyCompetitionConfig;
  companies: CompanyProfile[];
  results: CompanyResult[];
  winner: CompanyResult;
  prunedCompanies: string[];
  executiveDecisions: ExecutiveDecision[];
  evolutionDelta: EvolutionDelta | null;
  complexityReport: ComplexityReport | null;
  executedAt: string;
  finalScoreDistribution: { score: number; count: number }[];
}

export class HackathonCompanyOrchestrator {
  private readonly seed: number;
  private readonly rng: RNG;
  private readonly spawner: CompanySpawner;
  private readonly brain: ExecutiveCompanyBrain;
  private readonly evolution: CompanyEvolutionEngine;
  private readonly config: CompanyCompetitionConfig;

  constructor(config: Partial<CompanyCompetitionConfig> = {}) {
    this.seed = config.seed ?? 42;
    this.config = {
      companyCount: Math.min(7, Math.max(3, config.companyCount ?? 5)),
      seed: this.seed,
      fastMode: config.fastMode ?? false,
      simulateOnly: config.simulateOnly ?? false,
      gatewayAvailable: config.gatewayAvailable ?? false,
    };
    this.rng = getSeededRandom(this.seed + 29000);
    this.spawner = new CompanySpawner(this.seed);
    this.brain = new ExecutiveCompanyBrain(this.seed);
    this.evolution = new CompanyEvolutionEngine(this.seed);
  }

  runCompetition(spec: ParsedHackathonSpec): CompanyCompetitionResult {
    const hackathonId = spec.specId;
    const hackathonTitle = spec.title;
    const allExecutiveDecisions: ExecutiveDecision[] = [];

    // Ã¢â€â‚¬Ã¢â€â‚¬ Anti-Complexity Enforcement Ã¢â‚¬â€ Hard Limits Ã¢â€â‚¬Ã¢â€â‚¬
    const maxCompanies = Math.min(7, this.config.companyCount);
    const maxRepairLoops = 3;
    const maxAgentsPerCompany = 6;

    // Phase 1 Ã¢â‚¬â€ Spawn Companies (max 7)
    const companies = this.spawner.spawnCompanies(spec, maxCompanies);

    // Ã¢â€â‚¬Ã¢â€â‚¬ Hard Rule: no recursive company spawning Ã¢â€â‚¬Ã¢â€â‚¬
    if (companies.length > 7) {
      companies.length = 7;
    }

    // Phase 2 Ã¢â‚¬â€ Assign projects & simulate
    const assignments = this.brain.assignProjects(spec, companies);

    const states: CompanyExecutionState[] = companies.map((company) => {
      const devpostSpec = assignments.get(company.id)!;

      // Ã¢â€â‚¬Ã¢â€â‚¬ Hard Rule: max 6 agents per company Ã¢â€â‚¬Ã¢â€â‚¬
      if (company.agents.length > maxAgentsPerCompany) {
        company.agents.length = maxAgentsPerCompany;
      }

      return this.brain.simulateCompany(company, devpostSpec);
    });

    // Phase 3 Ã¢â‚¬â€ Build Phase + Complexity Collapse
    for (const state of states) {
      if (state.phase === 'pruned') continue;
      this.brain.runBuildPhase(state);

      // Anticomplexity: if complexity > threshold, merge/remove modules
      if (!this.config.fastMode) {
        const collapse = new ComplexityCollapseEngine(this.seed);
        const report = collapse.analyzeGraph();
        if (report.totalComplexityScore > 200) {
          const plan = collapse.generateReductionPlan();
          if (plan.removeOrMerge.length > 0) {
            state.toolCallsUsed = Math.max(1, state.toolCallsUsed - Math.ceil(plan.removeOrMerge.length / 2));
            state.company.agents = state.company.agents.slice(0, Math.min(state.company.agents.length, 4));
            allExecutiveDecisions.push({
              companyId: state.company.id,
              action: 'redirect',
              reason: `Complexity collapse: removed ${plan.removeOrMerge.length} modules, reduced to ${state.company.agents.length} agents`,
            });
          }
        }
      }
    }

    // Phase 4 Ã¢â‚¬â€ Prune early failures
    const earlyPrunes = this.brain.pruneEarlyFailure(states, 'build');
    allExecutiveDecisions.push(...earlyPrunes);

    const prunedCompanies = states.filter((s) => s.phase === 'pruned').map((s) => s.company.id);

    // Phase 5 Ã¢â‚¬â€ Deploy Phase (max 1 per cycle unless failure)
    for (const state of states) {
      if (state.phase === 'pruned') continue;
      const hadFailure = state.totalFailures > 0;
      this.brain.runDeployPhase(state, this.config.gatewayAvailable);
      if (!hadFailure && state.deployAttempts > 1) {
        allExecutiveDecisions.push({
          companyId: state.company.id,
          action: 'redirect',
          reason: 'Max 1 deploy per cycle without failure enforced',
        });
      }

      const deployPrunes = this.brain.pruneEarlyFailure(states, 'deploy');
      allExecutiveDecisions.push(...deployPrunes);
    }

    // Phase 6 Ã¢â‚¬â€ Judge Phase
    for (const state of states) {
      if (state.phase === 'pruned') continue;
      this.brain.runJudgePhase(state);

      const judgePrunes = this.brain.pruneLosers(states);
      allExecutiveDecisions.push(...judgePrunes);
    }

    // Phase 7 Ã¢â‚¬â€ Repair Loop (max 3)
    if (!this.config.fastMode) {
      for (let cycle = 0; cycle < maxRepairLoops; cycle++) {
        let anyRepaired = false;
        for (const state of states) {
          if (state.phase === 'pruned') continue;
          const beforeScore = state.judgeVerdict?.total ?? 0;
          this.brain.runRepairLoop(state);
          const afterScore = state.judgeVerdict?.total ?? 0;
          if (afterScore > beforeScore) anyRepaired = true;
        }
        const repairPrunes = this.brain.pruneEarlyFailure(states, 'repair');
        allExecutiveDecisions.push(...repairPrunes);

        // Ã¢â€â‚¬Ã¢â€â‚¬ Hard Rule: stop repairs if no improvement Ã¢â€â‚¬Ã¢â€â‚¬
        if (!anyRepaired) break;
      }
    }

    // Phase 8 Ã¢â‚¬â€ Emit Results
    const results: CompanyResult[] = [];
    for (const state of states) {
      const result = this.brain.emitResult(state);
      results.push(result);
    }

    // Rank them
    results.sort((a, b) => b.rankScore - a.rankScore);
    for (let i = 0; i < results.length; i++) {
      results[i]!.rank = i + 1;
    }

    const winner = results[0]!;

    // Phase 9 Ã¢â‚¬â€ Evolution
    const evolutionDelta = this.evolution.evolve(companies, results);

    // Phase 10 Ã¢â‚¬â€ Complexity check
    const complexityReport = new ComplexityCollapseEngine(this.seed).analyzeGraph();

    // Final pruning
    const finalPrunes = this.brain.pruneLosers(states);
    allExecutiveDecisions.push(...finalPrunes);

    // Compute final score distribution
    const scoreBuckets = new Map<number, number>();
    for (const r of results) {
      const bucket = Math.floor(r.finalScore / 10) * 10;
      scoreBuckets.set(bucket, (scoreBuckets.get(bucket) ?? 0) + 1);
    }
    const finalScoreDistribution = [...scoreBuckets.entries()]
      .map(([score, count]) => ({ score, count }))
      .sort((a, b) => a.score - b.score);

    return {
      hackathonId,
      hackathonTitle,
      config: this.config,
      companies,
      results,
      winner,
      prunedCompanies,
      executiveDecisions: allExecutiveDecisions,
      evolutionDelta,
      complexityReport,
      executedAt: deterministicNow(this.seed),
      finalScoreDistribution,
    };
  }
}
