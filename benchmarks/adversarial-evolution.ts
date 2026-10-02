import { AdversarialMetrics } from './adversarial-metrics.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface AdaptiveMutation {
  mutationId: string;
  targetCompanyId: string;
  mutationType: 'strategy_bias_shift' | 'agent_role_reweighting' | 'tool_usage_optimization' | 'budget_reallocation';
  effectiveness: number;
  cost: number;
  success: boolean;
  timestamp: string;
  adversarialResponse?: 'neutralized' | 'exploited' | 'amplified';
  counterStrategyResistance: number;
  exploitVulnerability: number;
  adaptabilityUnderAttack: number;
}

export interface StrategicAdaptation {
  adaptationId: string;
  companyId: string;
  adaptationType: 'defensive' | 'offensive' | 'balanced' | 'evolutionary';
  adaptationScore: number;
  adversarialResponse?: string;
  evolutionInfluence: number;
  timestamp: string;
  opponentSuppressionImpact: number;
  selfPerformance: number;
}

export interface EvolutionMetaLearning {
  metaId: string;
  targetCompanyId: string;
  learningType: 'fitness_proxy' | 'strategy_extraction' | 'pattern_recognition' | 'trend_analysis';
  discoveredStrategy: string;
  applicabilityScore: number;
  costToDiscover: number;
  timestamp: string;
}

export interface EcosystemAdaptationEngine {
  adaptationId: string;
  adaptationType: 'mutation_amplification' | 'strategy_mutation' | 'fitness_redistribution' | 'ecological_balance';
  targetCompanyId?: string;
  impactOnSystem: number;
  cost: number;
  success: boolean;
  timestamp: string;
}

export interface EvolutionMetrics {
  totalAdaptiveMutations: number;
  successfulAdaptiveMutations: number;
  averageMutationEffectiveness: number;
  totalStrategicAdaptations: number;
  defensiveAdaptations: number;
  offensiveAdaptations: number;
  metaLearningEvents: number;
  ecosystemAdaptationsExecuted: number;
  successfulEcosystemAdaptations: number;
  adversarialCounterSuccessRate: number;
  evolutionaryPressureIndex: number;
}

export class AdversarialEvolutionSystem {
  setEvolutionPressure(value: number): void {}

  setIntensity(value: number): void {}

  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private readonly adaptiveMutations: AdaptiveMutation[] = [];
  private readonly strategicAdaptations: StrategicAdaptation[] = [];
  private readonly metaLearning: EvolutionMetaLearning[] = [];
  private readonly ecosystemAdaptations: EcosystemAdaptationEngine[] = [];
  private readonly adversarialCounters: Map<string, string> = new Map();
  private adaptationMetrics: EvolutionMetrics;
  private readonly metrics: AdversarialMetrics;
  private _counter = 0;

  constructor(seed = 42, metrics?: AdversarialMetrics) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 51000);
    this.adaptationMetrics = this.initializeMetrics();
    this.metrics = metrics ?? new AdversarialMetrics(seed);
  }

  executeAdaptiveMutation(
    companyId: string,
    mutation: Omit<AdaptiveMutation, 'mutationId' | 'timestamp' | 'success'>,
  ): boolean {
    const determined = this.determineAdaptiveMutationSuccess(companyId, mutation);

    const fullMutation: AdaptiveMutation = {
      ...mutation,
      mutationId: `mut-${createDeterministicUuid(this.seed, ++this._counter)}`,
      timestamp: deterministicNow(this.seed + this._counter),
      success: determined.success,
    };

    this.adaptiveMutations.push(fullMutation);
    this.updateAdaptiveCounter(companyId, mutation.mutationType, determined.success);

    this.adaptationMetrics.totalAdaptiveMutations++;
    if (determined.success) {
      this.adaptationMetrics.successfulAdaptiveMutations++;
    }
    this.adaptationMetrics.averageMutationEffectiveness =
      (this.adaptationMetrics.averageMutationEffectiveness * (this.adaptiveMutations.length - 1) +
        mutation.effectiveness) /
      this.adaptiveMutations.length;

    return determined.success;
  }

  conductStrategicAdaptation(
    companyId: string,
    adaptationType: 'defensive' | 'offensive' | 'balanced' | 'evolutionary',
    adaptationScore: number,
    opponentSuppressionImpact: number,
    selfPerformance: number,
    targetCompanyId?: string,
  ): StrategicAdaptation {
    const adaptation: StrategicAdaptation = {
      adaptationId: `adapt-${createDeterministicUuid(this.seed, ++this._counter)}`,
      companyId,
      adaptationType,
      adaptationScore,
      adversarialResponse: undefined,
      evolutionInfluence: adaptationScore * (this.rng.next() * 0.5 + 0.5),
      timestamp: deterministicNow(this.seed + this._counter),
      opponentSuppressionImpact,
      selfPerformance,
    };

    if (targetCompanyId && targetCompanyId !== companyId) {
      const counter = this.adversarialCounters.get(targetCompanyId);
      adaptation.adversarialResponse = counter || 'neutralized';
    }

    this.strategicAdaptations.push(adaptation);
    this.updateAdaptiveCounter(companyId, adaptationType, adaptation.adaptationScore > 0.5);

    this.adaptationMetrics.totalStrategicAdaptations++;
    if (adaptationType === 'defensive') {
      this.adaptationMetrics.defensiveAdaptations++;
    } else if (adaptationType === 'offensive') {
      this.adaptationMetrics.offensiveAdaptations++;
    }

    return adaptation;
  }

  conductMetaLearning(
    companyId: string,
    learningType: 'fitness_proxy' | 'strategy_extraction' | 'pattern_recognition' | 'trend_analysis',
    discoveredStrategy: string,
    applicabilityScore: number,
    costToDiscover: number,
  ): EvolutionMetaLearning {
    const learning: EvolutionMetaLearning = {
      metaId: `meta-${createDeterministicUuid(this.seed, ++this._counter)}`,
      targetCompanyId: companyId,
      learningType,
      discoveredStrategy,
      applicabilityScore,
      costToDiscover,
      timestamp: deterministicNow(this.seed + this._counter),
    };

    this.metaLearning.push(learning);
    this.updateMetaLearningStrategy(companyId, discoveredStrategy, applicabilityScore);
    this.adaptationMetrics.metaLearningEvents++;

    return learning;
  }

  executeEcosystemAdaptation(
    adaptation: Omit<EcosystemAdaptationEngine, 'adaptationId' | 'timestamp' | 'success'>,
  ): boolean {
    const success = this.rng.next() > 0.3;
    const fullAdaptation: EcosystemAdaptationEngine = {
      ...adaptation,
      adaptationId: `eco-${createDeterministicUuid(this.seed, ++this._counter)}`,
      timestamp: deterministicNow(this.seed + this._counter),
      success,
    };

    this.ecosystemAdaptations.push(fullAdaptation);
    this.adaptationMetrics.ecosystemAdaptationsExecuted++;
    if (success) {
      this.adaptationMetrics.successfulEcosystemAdaptations++;
    }

    return success;
  }

  calculateFitness(selfPerformance: number, opponentSuppressionImpact: number): number {
    return selfPerformance + opponentSuppressionImpact;
  }

  getAdaptiveMutations(companyId?: string): AdaptiveMutation[] {
    if (!companyId) return [...this.adaptiveMutations];
    return this.adaptiveMutations.filter((m) => m.targetCompanyId === companyId);
  }

  getStrategicAdaptations(companyId?: string): StrategicAdaptation[] {
    if (!companyId) return [...this.strategicAdaptations];
    return this.strategicAdaptations.filter((a) => a.companyId === companyId);
  }

  getMetaLearning(companyId?: string): EvolutionMetaLearning[] {
    if (!companyId) return [...this.metaLearning];
    return this.metaLearning.filter((m) => m.targetCompanyId === companyId);
  }

  getEcosystemAdaptations(): EcosystemAdaptationEngine[] {
    return [...this.ecosystemAdaptations];
  }

  getEvolutionMetrics(): EvolutionMetrics {
    return { ...this.adaptationMetrics };
  }

  counteractAdversarialAction(targetCompanyId: string, actionType: string): void {
    const counter = this.adversarialCounters.get(targetCompanyId);
    if (counter) {
      this.adversarialCounters.set(targetCompanyId, `${counter},${actionType}`);
    } else {
      this.adversarialCounters.set(targetCompanyId, actionType);
    }
  }

  updateAdaptiveCounter(companyId: string, adaptationType: string, successful: boolean): void {
    const counter = this.adversarialCounters.get(companyId);
    if (counter) {
      this.adversarialCounters.set(companyId, `${counter},${adaptationType}:${successful ? 's' : 'f'}`);
    } else {
      this.adversarialCounters.set(companyId, `${adaptationType}:${successful ? 's' : 'f'}`);
    }
  }

  updateMetaLearningStrategy(companyId: string, strategy: string, applicability: number): void {
    const counter = this.adversarialCounters.get(companyId);
    const learningSignature = `learn:${strategy}:${applicability}`;
    if (counter) {
      this.adversarialCounters.set(companyId, `${counter},${learningSignature}`);
    } else {
      this.adversarialCounters.set(companyId, learningSignature);
    }
  }

  private initializeMetrics(): EvolutionMetrics {
    return {
      totalAdaptiveMutations: 0,
      successfulAdaptiveMutations: 0,
      averageMutationEffectiveness: 0,
      totalStrategicAdaptations: 0,
      defensiveAdaptations: 0,
      offensiveAdaptations: 0,
      metaLearningEvents: 0,
      ecosystemAdaptationsExecuted: 0,
      successfulEcosystemAdaptations: 0,
      adversarialCounterSuccessRate: 0,
      evolutionaryPressureIndex: 0,
    };
  }

  private determineAdaptiveMutationSuccess(
    companyId: string,
    mutation: Omit<AdaptiveMutation, 'mutationId' | 'timestamp' | 'success'>,
  ): { success: boolean; effectiveness: number } {
    const companyAdaptationLevel = 0.5;
    const systemPressure = this.rng.next();
    const defensivePosture = this.getCompanyDefensivePosture(companyId);
    const adversarialResponse = this.getAdversarialResponse(companyId);

    const baseEffectiveness = mutation.effectiveness;
    let success = false;

    if (adversarialResponse === 'neutralized') {
      success = this.rng.next() < 0.4 && baseEffectiveness > 0.7;
    } else if (adversarialResponse === 'exploited') {
      success = this.rng.next() < 0.2 && baseEffectiveness > 0.8;
    } else if (adversarialResponse === 'amplified') {
      success = this.rng.next() < 0.6 && baseEffectiveness > 0.6;
    } else {
      success = this.rng.next() < 0.5;
    }

    const effectiveness = success ? baseEffectiveness * 1.5 : baseEffectiveness * 0.7;

    return { success, effectiveness: Math.min(1, effectiveness) };
  }

  private getCompanyDefensivePosture(companyId: string): number {
    return 0.3 + this.rng.next() * 0.4;
  }

  private getAdversarialResponse(companyId: string): string | undefined {
    return this.adversarialCounters.get(companyId);
  }

  toJSON(): Record<string, unknown> {
    return {
      adaptiveMutations: this.adaptiveMutations,
      strategicAdaptations: this.strategicAdaptations,
      metaLearning: this.metaLearning,
      ecosystemAdaptations: this.ecosystemAdaptations,
      adversarialCounters: Object.fromEntries(this.adversarialCounters.entries()),
      metrics: this.adaptationMetrics,
    };
  }
}
