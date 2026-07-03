import { createDeterministicUuid, deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import type { ParsedHackathonSpec } from './devpost-ingestion-layer.js';
import type { ExecutionBudget } from './execution-budget-manager.js';
import { ExecutionBudgetManager } from './execution-budget-manager.js';
import type { MutationGene } from './mutation-genome.js';
import { MutationGenome } from './mutation-genome.js';
import { WINNING_STRATEGIES } from './winning-strategy-templates.js';
import type { StrategyTemplate } from './winning-strategy-templates.js';

export type CompanyStrategyType = 'speed' | 'innovation' | 'reliability' | 'ux' | 'balanced';
export type CompanyAgentRole = 'ceo' | 'builder' | 'ux' | 'infra' | 'debug';

export interface CompanyAgentProfile {
  role: CompanyAgentRole;
  specializationBias: string[];
  capabilityScore: number;
}

export interface CompanyProfile {
  id: string;
  name: string;
  strategyType: CompanyStrategyType;
  riskTolerance: number;
  executionBudget: ExecutionBudget;
  specializationBias: string[];
  agents: CompanyAgentProfile[];
  assignedStrategyTemplate: StrategyTemplate;
  mutationGene: MutationGene;
  created: string;
  seed: number;
}

export interface CompanyResult {
  companyId: string;
  companyName: string;
  strategyType: CompanyStrategyType;
  finalScore: number;
  breakdown: { score: number; reliability: number; wowFactor: number; innovation: number };
  strengths: string[];
  failureReasons: string[];
  deployUrl: string | null;
  repairCycles: number;
  deployAttempts: number;
  totalFailures: number;
  toolCallsUsed: number;
  simulationScore: number;
  rankScore: number;
  rank: number;
  pruned: boolean;
}

export class CompanySpawner {
  private readonly seed: number;
  private readonly rng: RNG;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 25000);
  }

  spawnCompanies(spec: ParsedHackathonSpec, count: number = 5): CompanyProfile[] {
    const clamped = Math.min(7, Math.max(3, count));
    const companies: CompanyProfile[] = [];

    const usedCategories = new Set<string>();
    const pool = this.buildCompanyStrategyPool(spec, clamped);

    for (let i = 0; i < clamped; i++) {
      const template = pool[i] ?? pool[pool.length - 1]!;
      const companySeed = this.seed + 30000 + i * 1000;
      const companyRng = getSeededRandom(companySeed);
      const budget = new ExecutionBudgetManager(companySeed + 500).checkAll();
      const genome = new MutationGenome(companySeed + 600);
      const allGenes = genome.getAllGenes();

      const strategyType = this.strategyFromCategory(template.category);

      const agents: CompanyAgentProfile[] = [];
      const roleOrder: CompanyAgentRole[] = ['ceo', 'builder', 'ux', 'infra', 'debug'];
      for (const role of roleOrder) {
        agents.push({
          role,
          specializationBias: [template.category, role],
          capabilityScore: 0.5 + companyRng.next() * 0.4,
        });
      }

      const mutationGene =
        allGenes.length > 0
          ? allGenes[0]!
          : {
              id: `gene-company-${i}`,
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

      companies.push({
        id: `company-${createDeterministicUuid(companySeed, i).slice(0, 8)}`,
        name: `${this.capitalize(strategyType)} Corp`,
        strategyType,
        riskTolerance: template.riskLevel,
        executionBudget: budget.budget,
        specializationBias: [template.category, strategyType],
        agents,
        assignedStrategyTemplate: template,
        mutationGene,
        created: deterministicNow(this.seed),
        seed: companySeed,
      });

      usedCategories.add(template.category);
    }

    return companies;
  }

  private buildCompanyStrategyPool(spec: ParsedHackathonSpec, count: number): StrategyTemplate[] {
    const rng = getSeededRandom(this.seed + 26000);
    const pool: StrategyTemplate[] = [];
    const usedCats = new Set<string>();

    const catPriority = [
      'wow_first',
      'single_flow',
      'demo_safety',
      'perceived_intelligence',
      'narrative_driven',
    ] as const;
    const shuffled = [...catPriority].sort(() => rng.next() - 0.5);

    for (const cat of shuffled) {
      if (usedCats.has(cat)) continue;
      const matches = WINNING_STRATEGIES.filter((s) => s.category === cat);
      if (matches.length > 0) {
        pool.push(matches[Math.floor(rng.next() * matches.length)]!);
        usedCats.add(cat);
      }
    }

    while (pool.length < count) {
      const fallback = WINNING_STRATEGIES[Math.floor(rng.next() * WINNING_STRATEGIES.length)]!;
      if (!pool.includes(fallback)) pool.push(fallback);
    }

    return pool.slice(0, count);
  }

  private strategyFromCategory(cat: string): CompanyStrategyType {
    switch (cat) {
      case 'wow_first':
        return 'ux';
      case 'single_flow':
        return 'reliability';
      case 'demo_safety':
        return 'speed';
      case 'perceived_intelligence':
        return 'innovation';
      case 'narrative_driven':
        return 'balanced';
      default:
        return 'balanced';
    }
  }

  private capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
