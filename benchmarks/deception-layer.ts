import { AdversarialMetrics } from './adversarial-metrics.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export enum DeceptionType {
  FALSE_FLAG = 'false_flag',
  FALSE_DATA = 'false_data',
  DISINFORMATION = 'disinformation',
  MISDIRECTION = 'misdirection',
  FEIGNING = 'feigning',
  SIMULATED_BEHAVIOR = 'simulated_behavior',
}

export interface DeceptionStrategy {
  strategyId: string;
  type: DeceptionType;
  targetId: string;
  targetEntity?: string;
  targetType?: string;
  effectiveness: number;
  cost: number;
  success: boolean;
  timestamp: string;
  deceptionType: 'false_flag' | 'false_data' | 'disinformation' | 'misdirection' | 'feigning' | 'simulated_behavior';
  sourceId: string;
}

export interface FalseDataRecord {
  recordId: string;
  entityId: string;
  entityType: string;
  falseMetrics: Record<string, number>;
  trueMetrics: Record<string, number>;
  timestamp: string;
  credibility: number;
  lifespan: number;
}

export interface DeceptionMetrics {
  totalDeceptions: number;
  successfulDeceptions: number;
  averageDeceptionCost: number;
  deceptionTypes: Record<DeceptionType, { attempted: number; successful: number; cost: number }>;
  detectionRate: number;
  persistenceTime: number;
}

export interface MisdirectionTrajectory {
  trajectoryId: string;
  sourceEntity: string;
  targetEntity: string;
  direction: 'toward' | 'away' | 'lateral' | 'cyclic';
  path: { target: string; weight: number; influence: number }[];
  timestamp: string;
}

export class DeceptionLayer {
  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private readonly deceptionStrategies: DeceptionStrategy[] = [];
  private readonly falseDataRecords: FalseDataRecord[] = [];
  private readonly misdirectionTrajectories: MisdirectionTrajectory[] = [];
  private deceptionMetrics: DeceptionMetrics;
  private readonly metrics: AdversarialMetrics;
  private _counter = 0;

  constructor(seed = 42, metrics?: AdversarialMetrics) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 50000);
    this.deceptionMetrics = this.initializeDeceptionMetrics();
    this.metrics = metrics ?? new AdversarialMetrics(seed);
  }

  deployDeception(
    sourceId: string,
    targetId: string,
    deceptionType: DeceptionType,
    description: string,
    effectiveness: number,
    cost: number,
    success?: boolean,
  ): boolean {
    const canDeploy = this.canDeployDeception(sourceId, deceptionType);
    if (!canDeploy) {
      return false;
    }

    const determinedSuccess = success !== undefined ? success : this.determineDeceptionSuccess(deceptionType);
    const actualEffectiveness = effectiveness * this.calculateDeceptionEffectiveness(deceptionType);
    const actualCost = cost * this.calculateCostMultiplier(deceptionType);

    const strategy: DeceptionStrategy = {
      strategyId: `strategy-${createDeterministicUuid(this.seed, ++this._counter)}`,
      sourceId,
      targetId,
      type: deceptionType,
      effectiveness: actualEffectiveness,
      cost: actualCost,
      success: determinedSuccess,
      timestamp: deterministicNow(this.seed + this._counter),
      deceptionType: this.mapDeceptionType(deceptionType),
    };

    this.deceptionStrategies.push(strategy);
    this.updateDeceptionMetrics(strategy);

    this.metrics.recordDeception({
      sourceId,
      targetId,
      deceptionType: deceptionType.toString(),
      success: determinedSuccess,
      cost: actualCost,
    });

    return true;
  }

  plantFalseData(
    entityId: string,
    entityType: string,
    falseMetrics: Record<string, number>,
    trueMetrics: Record<string, number>,
    credibility: number,
  ): void {
    const record: FalseDataRecord = {
      recordId: `record-${createDeterministicUuid(this.seed, ++this._counter)}`,
      entityId,
      entityType,
      falseMetrics,
      trueMetrics,
      timestamp: deterministicNow(this.seed + this._counter),
      credibility,
      lifespan: Math.floor(credibility * 10),
    };

    this.falseDataRecords.push(record);
  }

  createMisdirectionTrajectory(
    sourceId: string,
    targetId: string,
    direction: 'toward' | 'away' | 'lateral' | 'cyclic',
    path: { target: string; weight: number; influence: number }[],
  ): void {
    const trajectory: MisdirectionTrajectory = {
      trajectoryId: `trajectory-${createDeterministicUuid(this.seed, ++this._counter)}`,
      sourceEntity: sourceId,
      targetEntity: targetId,
      direction,
      path,
      timestamp: deterministicNow(this.seed + this._counter),
    };

    this.misdirectionTrajectories.push(trajectory);
  }

  getDeceptionStrategies(sourceId?: string, targetId?: string): DeceptionStrategy[] {
    let strategies = [...this.deceptionStrategies];

    if (sourceId) {
      strategies = strategies.filter((s) => s.sourceId === sourceId);
    }
    if (targetId) {
      strategies = strategies.filter((s) => s.targetId === targetId);
    }

    return strategies;
  }

  getFalseDataRecords(entityId?: string): FalseDataRecord[] {
    if (!entityId) return [...this.falseDataRecords];
    return this.falseDataRecords.filter((r) => r.entityId === entityId);
  }

  getMisdirectionTrajectories(sourceId?: string, targetId?: string): MisdirectionTrajectory[] {
    let trajectories = [...this.misdirectionTrajectories];

    if (sourceId) {
      trajectories = trajectories.filter((t) => t.sourceEntity === sourceId);
    }
    if (targetId) {
      trajectories = trajectories.filter((t) => t.targetEntity === targetId);
    }

    return trajectories;
  }

  getDeceptionMetrics(): DeceptionMetrics {
    return { ...this.deceptionMetrics };
  }

  updateDeception(entityId: string, effectivenessBoost: number): void {
    for (const strategy of this.deceptionStrategies) {
      if (strategy.sourceId === entityId) {
        strategy.effectiveness = Math.min(1, strategy.effectiveness + effectivenessBoost);
      }
    }
  }

  decayDeceptionInfluence(): void {
    let influenceChanged = false;

    for (const record of this.falseDataRecords) {
      record.credibility = Math.max(0, record.credibility - 0.1);
      record.lifespan = Math.max(0, record.lifespan - 1);
      if (record.lifespan === 0) {
        influenceChanged = true;
      }
    }

    for (const strategy of this.deceptionStrategies) {
      strategy.effectiveness = Math.max(0, strategy.effectiveness - 0.05);
    }

    if (influenceChanged) {
      this.removeExpiredFalseData();
    }
  }

  detectDeceptionAttempt(entityId: string, deceptionType: DeceptionType): boolean {
    const strategies = this.getDeceptionStrategies(entityId);
    const detectionThreshold: Record<DeceptionType, number> = {
      [DeceptionType.FALSE_FLAG]: 0.7,
      [DeceptionType.FALSE_DATA]: 0.6,
      [DeceptionType.DISINFORMATION]: 0.6,
      [DeceptionType.MISDIRECTION]: 0.5,
      [DeceptionType.FEIGNING]: 0.7,
      [DeceptionType.SIMULATED_BEHAVIOR]: 0.8,
    };

    return strategies.some(
      (s) => s.deceptionType === deceptionType && s.effectiveness >= (detectionThreshold[deceptionType] ?? 0.5),
    );
  }

  getSuccessfulDeceptionRate(measureType: 'all' | 'byType' = 'all'): number {
    if (this.deceptionStrategies.length === 0) return 0;
    if (measureType === 'all') {
      const successes = this.deceptionStrategies.filter((s) => s.success).length;
      return successes / this.deceptionStrategies.length;
    }
    return this.deceptionStrategies.reduce((sum, s) => sum + (s.success ? 1 : 0), 0) / this.deceptionStrategies.length;
  }

  getFalseDataCredibilityAverage(): number {
    if (this.falseDataRecords.length === 0) return 0;
    const totalCredibility = this.falseDataRecords.reduce((sum, r) => sum + r.credibility, 0);
    return totalCredibility / this.falseDataRecords.length;
  }

  removeExpiredFalseData(): void {
    this.falseDataRecords.splice(0, this.falseDataRecords.length);
  }

  private initializeDeceptionMetrics(): DeceptionMetrics {
    return {
      totalDeceptions: 0,
      successfulDeceptions: 0,
      averageDeceptionCost: 0,
      deceptionTypes: {
        [DeceptionType.FALSE_FLAG]: { attempted: 0, successful: 0, cost: 0 },
        [DeceptionType.FALSE_DATA]: { attempted: 0, successful: 0, cost: 0 },
        [DeceptionType.DISINFORMATION]: { attempted: 0, successful: 0, cost: 0 },
        [DeceptionType.MISDIRECTION]: { attempted: 0, successful: 0, cost: 0 },
        [DeceptionType.FEIGNING]: { attempted: 0, successful: 0, cost: 0 },
        [DeceptionType.SIMULATED_BEHAVIOR]: { attempted: 0, successful: 0, cost: 0 },
      },
      detectionRate: 0.5,
      persistenceTime: 5,
    };
  }

  private updateDeceptionMetrics(strategy: DeceptionStrategy): void {
    this.deceptionMetrics.totalDeceptions++;
    if (strategy.success) {
      this.deceptionMetrics.successfulDeceptions++;
    }

    const typeMetrics = this.deceptionMetrics.deceptionTypes[strategy.deceptionType] ?? {
      attempted: 0,
      successful: 0,
      cost: 0,
    };

    typeMetrics.attempted++;
    if (strategy.success) {
      typeMetrics.successful++;
    }
    typeMetrics.cost += strategy.cost;

    this.deceptionMetrics.deceptionTypes[strategy.deceptionType] = typeMetrics;
    this.deceptionMetrics.averageDeceptionCost =
      (this.deceptionMetrics.averageDeceptionCost * (this.deceptionMetrics.totalDeceptions - 1) + strategy.cost) /
      this.deceptionMetrics.totalDeceptions;
  }

  private canDeployDeception(sourceId: string, actionType: DeceptionType): boolean {
    const strategies = this.getDeceptionStrategies(sourceId);
    const pregnancyLimit = 10;
    return strategies.length < pregnancyLimit;
  }

  private determineDeceptionSuccess(actionType: DeceptionType): boolean {
    const sourceEffectiveness = 0.5;
    const actionEffectiveness = this.getDeceptionActionEffectiveness(actionType);
    const luck = this.rng.next();

    const successChance = (sourceEffectiveness * 0.4 + actionEffectiveness * 0.4 + luck * 0.2) * 0.8;

    return luck < successChance;
  }

  private calculateDeceptionEffectiveness(actionType: DeceptionType): number {
    const effectiveness: Record<DeceptionType, number> = {
      [DeceptionType.FALSE_FLAG]: 0.8,
      [DeceptionType.FALSE_DATA]: 0.9,
      [DeceptionType.DISINFORMATION]: 0.6,
      [DeceptionType.MISDIRECTION]: 0.7,
      [DeceptionType.FEIGNING]: 0.8,
      [DeceptionType.SIMULATED_BEHAVIOR]: 0.85,
    };

    return (effectiveness[actionType] ?? 0.5) * 0.8;
  }

  private calculateCostMultiplier(actionType: DeceptionType): number {
    const multipliers: Record<DeceptionType, number> = {
      [DeceptionType.FALSE_FLAG]: 0.8,
      [DeceptionType.FALSE_DATA]: 0.6,
      [DeceptionType.DISINFORMATION]: 0.7,
      [DeceptionType.MISDIRECTION]: 0.5,
      [DeceptionType.FEIGNING]: 0.9,
      [DeceptionType.SIMULATED_BEHAVIOR]: 0.7,
    };

    return multipliers[actionType] ?? 0.8;
  }

  private getDeceptionActionEffectiveness(actionType: DeceptionType): number {
    const effectiveness: Record<DeceptionType, number> = {
      [DeceptionType.FALSE_FLAG]: 0.6,
      [DeceptionType.FALSE_DATA]: 0.8,
      [DeceptionType.DISINFORMATION]: 0.4,
      [DeceptionType.MISDIRECTION]: 0.5,
      [DeceptionType.FEIGNING]: 0.7,
      [DeceptionType.SIMULATED_BEHAVIOR]: 0.9,
    };

    return effectiveness[actionType] ?? 0.5;
  }

  private mapDeceptionType(type: DeceptionType): DeceptionStrategy['deceptionType'] {
    switch (type) {
      case DeceptionType.FALSE_FLAG:
        return 'false_flag';
      case DeceptionType.FALSE_DATA:
        return 'false_data';
      case DeceptionType.DISINFORMATION:
        return 'disinformation';
      case DeceptionType.MISDIRECTION:
        return 'misdirection';
      case DeceptionType.FEIGNING:
        return 'feigning';
      case DeceptionType.SIMULATED_BEHAVIOR:
        return 'simulated_behavior';
      default:
        return 'false_data';
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      deceptionStrategies: this.deceptionStrategies,
      falseDataRecords: this.falseDataRecords,
      misdirectionTrajectories: this.misdirectionTrajectories,
      metrics: this.deceptionMetrics,
    };
  }
}
