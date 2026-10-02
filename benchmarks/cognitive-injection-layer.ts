import type { EvolutionDelta } from './company-evolution-engine.js';
import type { CompanyProfile } from './company-spawner.js';
import type { CompanyResult } from './company-spawner.js';
import { deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';
import type { CompanyExecutionState } from './executive-company-brain.js';
import type { HackathonEvent } from './global-hackathon-world.js';
import type { WorldStateSnapshot } from './global-hackathon-world.js';
import type { ProjectSnapshot } from './organizational-memory-bank.js';
import type { StrategyGenomeRecord } from './strategy-genome-database.js';
import type { GlobalGenomeSummary } from './strategy-genome-database.js';

export interface CognitiveBias {
  strategyBias: Record<string, number>;
  agentBias: Record<string, number>;
  judgeBias: Record<string, number>;
  mutationBias: Record<string, number>;
  resourceBias: Record<string, number>;
}

export interface CognitiveContext {
  memory: ProjectSnapshot[];
  genome: StrategyGenomeRecord[];
  globalStats: GlobalGenomeSummary;
  worldState: WorldStateSnapshot;
  performance: CompanyResult[];
  failureHistory: unknown[];
  globalTrends: unknown[];
  systemLoad: number;
  currentEvent: HackathonEvent;
}

export interface InjectionResult {
  companyBias: Partial<CompanyProfile>;
  agentBias: Partial<CompanyExecutionState>;
  judgeBias: number;
  mutationBias: Partial<EvolutionDelta>;
  resourceBias: Partial<{ toolCost: number; resourceAllocation: number }>[];
  injectedAt: string;
}

export class CognitiveInjectionLayer {
  private readonly seed: number;
  private readonly rng: RNG;
  private readonly injectionHistory: InjectionResult[] = [];
  private readonly memoryIndex: Map<string, number> = new Map();
  private readonly genomeIndex: Map<string, number> = new Map();
  private readonly storageKey = 'hackagent-cognitive-injections';

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 45000);
    this.loadFromStorage();
  }

  injectCognitiveSignals(context: CognitiveContext, executionState: CompanyExecutionState): InjectionResult {
    const bias: CognitiveBias = this.calculateCognitiveBias(context);
    const result: InjectionResult = {
      companyBias: this.applyStrategyBias(context, bias.strategyBias, executionState),
      agentBias: this.applyAgentBias(context, bias.agentBias, executionState),
      judgeBias: this.applyJudgeBias(context, bias.judgeBias, executionState),
      mutationBias: this.applyMutationBias(context, bias.mutationBias, executionState),
      resourceBias: this.applyResourceBias(context, bias.resourceBias, executionState),
      injectedAt: deterministicNow(this.seed),
    };

    this.injectionHistory.push(result);
    this.persistToStorage();
    return result;
  }

  private calculateCognitiveBias(context: CognitiveContext): CognitiveBias {
    const weightMemory = 0.3;
    const weightGenome = 0.25;
    const weightTrends = 0.2;
    const weightFailures = 0.15;
    const weightSystem = 0.1;

    const strategyMemory = this.analyzeMemory(context.memory, 'strategy');
    const strategyGenome = this.analyzeGenome(context.genome, 'strategy');
    const strategyTrends = this.analyzeTrends(context.globalTrends, 'strategy');
    const strategyFailures = this.analyzeFailures(context.failureHistory, 'strategy');
    const strategySystem = this.analyzeSystem(context.systemLoad);

    const agentMemory = this.analyzeMemory(context.memory, 'agent');
    const agentGenome = this.analyzeGenome(context.genome, 'agent');
    const agentTrends = this.analyzeTrends(context.globalTrends, 'agent');
    const agentFailures = this.analyzeFailures(context.failureHistory, 'agent');
    const agentSystem = this.analyzeSystem(context.systemLoad);

    const judgeMemory = this.analyzeMemory(context.memory, 'judge');
    const judgeGenome = this.analyzeGenome(context.genome, 'judge');
    const judgeTrends = this.analyzeTrends(context.globalTrends, 'judge');
    const judgeFailures = this.analyzeFailures(context.failureHistory, 'judge');
    const judgeSystem = this.analyzeSystem(context.systemLoad);

    const mutationMemory = this.analyzeMemory(context.memory, 'mutation');
    const mutationGenome = this.analyzeGenome(context.genome, 'mutation');
    const mutationTrends = this.analyzeTrends(context.globalTrends, 'mutation');
    const mutationFailures = this.analyzeFailures(context.failureHistory, 'mutation');
    const mutationSystem = this.analyzeSystem(context.systemLoad);

    const resourceMemory = this.analyzeMemory(context.memory, 'resource');
    const resourceGenome = this.analyzeGenome(context.genome, 'resource');
    const resourceTrends = this.analyzeTrends(context.globalTrends, 'resource');
    const resourceFailures = this.analyzeFailures(context.failureHistory, 'resource');
    const resourceSystem = this.analyzeSystem(context.systemLoad);

    return {
      strategyBias: {
        wow_first: this.combineBiases(strategyMemory, strategyGenome, strategyTrends, strategyFailures, strategySystem),
        single_flow: this.combineBiases(
          strategyMemory,
          strategyGenome,
          strategyTrends,
          strategyFailures,
          strategySystem,
        ),
        demo_safety: this.combineBiases(
          strategyMemory,
          strategyGenome,
          strategyTrends,
          strategyFailures,
          strategySystem,
        ),
        perceived_intelligence: this.combineBiases(
          strategyMemory,
          strategyGenome,
          strategyTrends,
          strategyFailures,
          strategySystem,
        ),
        narrative_driven: this.combineBiases(
          strategyMemory,
          strategyGenome,
          strategyTrends,
          strategyFailures,
          strategySystem,
        ),
      },
      agentBias: {
        ceo: this.combineBiases(agentMemory, agentGenome, agentTrends, agentFailures, agentSystem),
        builder: this.combineBiases(agentMemory, agentGenome, agentTrends, agentFailures, agentSystem),
        ux: this.combineBiases(agentMemory, agentGenome, agentTrends, agentFailures, agentSystem),
        infra: this.combineBiases(agentMemory, agentGenome, agentTrends, agentFailures, agentSystem),
        debug: this.combineBiases(agentMemory, agentGenome, agentTrends, agentFailures, agentSystem),
      },
      judgeBias: { judge: this.combineJudgeBiases(judgeMemory, judgeGenome, judgeTrends, judgeFailures, judgeSystem) },
      mutationBias: {
        mutation: this.combineMutationBiases(
          mutationMemory,
          mutationGenome,
          mutationTrends,
          mutationFailures,
          mutationSystem,
        ),
      },
      resourceBias: {
        resource: this.combineResourceBiases(
          resourceMemory,
          resourceGenome,
          resourceTrends,
          resourceFailures,
          resourceSystem,
        ),
      },
    };
  }

  private analyzeMemory(memory: ProjectSnapshot[], category: string): number {
    if (memory.length === 0) return 0.5;

    const normalized = memory.map((snap) => {
      if (category === 'strategy') return (snap as any).strategy?.successScore ?? 0.5;
      if (category === 'agent') return snap.deploySuccess ? 1.0 : 0.0;
      if (category === 'judge') return snap.overallScore / 100;
      if (category === 'mutation') return snap.mutations.length || 0;
      if (category === 'resource') return (snap as any).toolCallsUsed ?? 0;
      return 0.5;
    });

    return normalized.reduce((a, b) => a + b, 0) / normalized.length;
  }

  private analyzeGenome(genome: StrategyGenomeRecord[], category: string): number {
    if (genome.length === 0) return 0.5;

    const normalized = genome.map((record) => {
      if (category === 'strategy') return record.averageScore;
      if (category === 'agent') return record.winRate;
      if (category === 'judge') return record.averageScore * 0.8;
      if (category === 'mutation') return record.generation / 10;
      if (category === 'resource') return record.averageScore * 0.9;
      return 0.5;
    });

    return normalized.reduce((a, b) => a + b, 0) / normalized.length;
  }

  private analyzeTrends(trends: unknown[], category: string): number {
    if (trends.length === 0) return 0.5;

    const categoryValues = (trends as any[]).filter((t: any) => t.category === category).map((t: any) => t.value || 0.5);
    if (categoryValues.length === 0) return 0.5;

    return categoryValues.reduce((a, b) => a + b, 0) / categoryValues.length;
  }

  private analyzeFailures(failures: unknown[], category: string): number {
    if (failures.length === 0) return 0.0;

    const failuresInCategory = (failures as any[]).filter((f: any) => f.category === category);
    return Math.min(1.0, failuresInCategory.length / 20);
  }

  private analyzeSystem(systemLoad: number): number {
    return systemLoad / 3.0;
  }

  private combineBiases(...biases: number[]): number {
    return biases.reduce((a, b) => a + b, 0) / biases.length;
  }

  private combineJudgeBiases(memory: number, genome: number, trends: number, failures: number, system: number): number {
    return memory * 0.3 + genome * 0.3 + trends * 0.2 + failures * 0.1 + system * 0.1;
  }

  private combineMutationBiases(
    memory: number,
    genome: number,
    trends: number,
    failures: number,
    system: number,
  ): number {
    return memory * 0.4 + genome * 0.3 + trends * 0.2 + failures * 0.1;
  }

  private combineResourceBiases(
    memory: number,
    genome: number,
    trends: number,
    failures: number,
    system: number,
  ): number {
    return memory * 0.25 + genome * 0.25 + trends * 0.25 + failures * 0.15 + system * 0.1;
  }

  private applyStrategyBias(
    context: CognitiveContext,
    strategyBias: Record<string, number>,
    executionState: CompanyExecutionState,
  ): Partial<CompanyProfile> {
    const injectedProfile: Partial<CompanyProfile> = {};

    for (const [strategy, bias] of Object.entries(strategyBias)) {
      if (bias > 0.7) {
        injectedProfile.strategyType = strategy as CompanyProfile['strategyType'];
        break;
      }
    }

    if (context.worldState.activeCompanies > 5 && context.worldState.averageScore < 0.5) {
      injectedProfile.strategyType = 'balanced';
    }

    return injectedProfile;
  }

  private applyAgentBias(
    context: CognitiveContext,
    agentBias: Record<string, number>,
    executionState: CompanyExecutionState,
  ): Partial<CompanyExecutionState> {
    const injectedState: Partial<CompanyExecutionState> = {};

    const topRole = Object.entries(agentBias).sort(([, a], [, b]) => b - a)[0];
    if (topRole) {
      (injectedState as any).executivePriority = topRole[0] as any;
    }

    return injectedState;
  }

  private applyJudgeBias(
    context: CognitiveContext,
    judgeBias: Record<string, number>,
    executionState: CompanyExecutionState,
  ): number {
    let bias = 0.5;

    const defaultBias = judgeBias.default ?? 0;
    bias += defaultBias * 0.1;

    context.memory.forEach((snap) => {
      if (snap.deploySuccess) {
        bias += 0.1;
      }
    });

    return Math.min(1.0, bias);
  }

  private applyMutationBias(
    context: CognitiveContext,
    mutationBias: Record<string, number>,
    executionState: CompanyExecutionState,
  ): Partial<EvolutionDelta> {
    const injectedDelta: Partial<EvolutionDelta> = {
      newBestPatterns: [],
      deprecatedPatterns: [],
      mutationsApplied: [],
      strategyShifts: [],
      expectedScoreImprovement: 0,
      generationId: `cgn-${deterministicNow(this.seed)}`,
    };

    if (context.worldState.globalGenomeCount > 10) {
      injectedDelta.newBestPatterns = ['global-innovation-pattern', 'global-efficiency-pattern'];
    }

    return injectedDelta;
  }

  private applyResourceBias(
    context: CognitiveContext,
    resourceBias: Record<string, number>,
    executionState: CompanyExecutionState,
  ): Partial<{ toolCost: number; resourceAllocation: number }>[] {
    return context.performance.map((result) => {
      const toolCostFactor = Object.values(resourceBias).reduce((a, b) => a + b, 0) / Object.keys(resourceBias).length;
      const baseCost = result.finalScore;
      const inflationFactor = 1 + context.systemLoad / 2;

      return { toolCost: baseCost * inflationFactor, resourceAllocation: (1 - baseCost) * toolCostFactor * 0.5 };
    });
  }

  getInjectionHistory(): InjectionResult[] {
    return [...this.injectionHistory];
  }

  updateSystemMemory(memory: { memoryId: string; content: string; credibility: number; lastUpdated: string }): void {}

  setCommunicationComplexity(value: number): void {}

  toJSON(): string {
    return JSON.stringify(
      {
        injectionHistory: this.injectionHistory,
        memoryIndex: Object.fromEntries(this.memoryIndex.entries()),
        genomeIndex: Object.fromEntries(this.genomeIndex.entries()),
        seed: this.seed,
      },
      null,
      2,
    );
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify(this.toJSON());
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as any).localStorage.setItem(this.storageKey, data);
      }
    } catch { /* Optional localStorage persistence is best-effort. */ }
  }

  private loadFromStorage(): void {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        const raw = (globalThis as any).localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.injectionHistory)) {
            this.injectionHistory.push(...parsed.injectionHistory);
          }
        }
      }
    } catch { /* Optional localStorage persistence is best-effort. */ }
  }
}
