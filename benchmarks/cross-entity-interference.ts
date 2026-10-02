import { AdversarialMetrics } from './adversarial-metrics.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface InterferenceAction {
  actionId: string;
  sourceEntity: string;
  targetEntity: string;
  actionType: InterferenceType;
  description: string;
  magnitude: number;
  success: boolean;
  cost: number;
  timestamp: string;
}

export enum InterferenceType {
  SABOTAGE_COMPETITOR = 'sabotage_competitor',
  INFLUENCE_AGENT = 'influence_agent',
  MANIPULATE_JUDGE = 'manipulate_judge',
  DISRUPT_EVOLUTION = 'disrupt_evolution',
  CONDEMN_RESOURCE_ALLOCATION = 'condemn_resource_allocation',
  CREATE_FALSE_DATA = 'create_false_data',
  EXPLOIT_WEAKNESS = 'exploit_weakness',
  COVERT_OPPRESSION = 'covert_oppression',
}

export interface InterferenceMetrics {
  totalInterferences: number;
  successfulInterferences: number;
  averageMagnitude: number;
  selfInterferenceRate: number;
  crossCompanyInterferenceRate: number;
  agentInterferenceRate: number;
  judgeInterferenceRate: number;
  evolutionInterferenceRate: number;
  totalCostExpended: number;
}

export interface ConflictState {
  entityId: string;
  entityType: string;
  activeConflicts: ConflictRecord[];
  conflictHistory: ConflictHistoryRecord[];
  defensivePosture: number;
  offensivePosture: number;
}

export interface ConflictRecord {
  conflictId: string;
  sourceId: string;
  targetId: string;
  conflictType: InterferenceType;
  severity: number;
  status: 'active' | 'resolved' | 'escalated' | 'suppressed';
  startTime: string;
  resolutionTime?: string;
  resolutionCost: number;
  outcome: ConflictOutcome;
}

export interface ConflictOutcome {
  winner?: string;
  outcome: 'draw' | 'victory' | 'defeat' | 'stalemate';
  impactScore: number;
  resourceTransfer: Partial<Record<string, number>>;
  behavioralChange: Partial<Record<string, number>>;
  futureProbability: number;
}

export interface ConflictHistoryRecord {
  conflictId: string;
  sourceId: string;
  targetId: string;
  conflictType: InterferenceType;
  severity: number;
  resolution: ConflictOutcome;
  cost: number;
  effectiveness: number;
  retaliationLevel: number;
}

export class CrossEntityInterferenceSystem {
  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private readonly interferenceHistory: InterferenceAction[] = [];
  private readonly conflictStates: Map<string, ConflictState> = new Map();
  private interferenceMetrics: InterferenceMetrics;
  private readonly metrics: AdversarialMetrics;
  private _counter = 0;

  constructor(seed = 42, metrics?: AdversarialMetrics) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 49000);
    this.interferenceMetrics = this.initializeMetrics();
    this.metrics = metrics ?? new AdversarialMetrics(seed);
    this.initializeConflictStates();
  }

  executeInterference(
    sourceId: string,
    sourceType: string,
    targetId: string,
    targetType: string,
    actionType: InterferenceType,
    description: string,
    magnitude: number,
    success?: boolean,
  ): boolean {
    const sourceConflict = this.conflictStates.get(sourceId);
    const targetConflict = this.conflictStates.get(targetId);

    if (!sourceConflict || !targetConflict) {
      return false;
    }

    const canInterfere = this.canInterfereWith(sourceId, actionType);
    if (!canInterfere) {
      return false;
    }

    const determinedSuccess =
      success !== undefined ? success : this.determineInterferenceSuccess(sourceConflict, targetConflict, actionType);
    const actualMagnitude = magnitude * this.calculateEffectivenessModifier(sourceConflict, targetConflict, actionType);
    const cost = this.calculateInterferenceCost(sourceConflict, actionType);

    const action: InterferenceAction = {
      actionId: `action-${createDeterministicUuid(this.seed, ++this._counter)}`,
      sourceEntity: sourceId,
      targetEntity: targetId,
      actionType,
      description,
      magnitude: actualMagnitude,
      success: determinedSuccess,
      cost,
      timestamp: deterministicNow(this.seed + this._counter),
    };

    this.interferenceHistory.push(action);

    this.updateConflictState(sourceId, targetId, actionType, determinedSuccess, actualMagnitude, cost);
    this.updateInterferenceMetrics(action);

    this.metrics.recordInterference({
      attackerId: sourceId,
      defenderId: targetId,
      eventType: this.mapToEventType(actionType),
      success: determinedSuccess,
      cost,
      impact: actualMagnitude,
    });

    return true;
  }

  resolveConflict(
    sourceId: string,
    targetId: string,
    conflictType: InterferenceType,
    resolutionStrategy: 'negotiation' | 'force' | 'avoid' | 'compromise',
  ): ConflictOutcome {
    const sourceConflict = this.conflictStates.get(sourceId);
    const targetConflict = this.conflictStates.get(targetId);

    if (!sourceConflict || !targetConflict) {
      return { outcome: 'draw', impactScore: 0, resourceTransfer: {}, behavioralChange: {}, futureProbability: 0.5 };
    }

    const conflictRecord: ConflictRecord = {
      conflictId: `conflict-${createDeterministicUuid(this.seed, ++this._counter)}`,
      sourceId,
      targetId,
      conflictType,
      severity: this.calculateConflictSeverity(sourceConflict, targetConflict, conflictType),
      status: 'active',
      startTime: deterministicNow(this.seed + this._counter),
      resolutionCost: 0,
      outcome: { outcome: 'draw', impactScore: 0, resourceTransfer: {}, behavioralChange: {}, futureProbability: 0.5 },
    };

    const outcome = this.calculateConflictResolution(
      sourceConflict,
      targetConflict,
      conflictRecord,
      resolutionStrategy,
    );

    conflictRecord.status = 'resolved';
    conflictRecord.resolutionTime = deterministicNow(this.seed + this._counter);
    conflictRecord.resolutionCost = outcome.impactScore;
    conflictRecord.outcome = outcome;

    return outcome;
  }

  getInterferenceHistory(sourceId?: string, targetId?: string): InterferenceAction[] {
    let history = [...this.interferenceHistory];

    if (sourceId) {
      history = history.filter((a) => a.sourceEntity === sourceId);
    }
    if (targetId) {
      history = history.filter((a) => a.targetEntity === targetId);
    }

    return history;
  }

  getConflictState(entityId: string): ConflictState | undefined {
    return this.conflictStates.get(entityId);
  }

  getInterferenceMetrics(): InterferenceMetrics {
    return { ...this.interferenceMetrics };
  }

  escalateConflict(sourceId: string, targetId: string, escalationType: 'retaliation' | 'offense' | 'defense'): boolean {
    const sourceConflict = this.conflictStates.get(sourceId);
    const targetConflict = this.conflictStates.get(targetId);

    if (!sourceConflict || !targetConflict) {
      return false;
    }

    const escalationCost = this.calculateEscalationCost(sourceConflict, targetConflict, escalationType);

    if (sourceConflict.offensivePosture + escalationCost > 100) {
      return false;
    }

    sourceConflict.offensivePosture = Math.min(100, sourceConflict.offensivePosture + escalationCost);
    sourceConflict.defensivePosture = Math.min(100, sourceConflict.defensivePosture + escalationCost * 0.3);

    const actionType = this.getInterferenceTypeFromEscalation(escalationType);

    this.executeInterference(
      sourceId,
      'system',
      targetId,
      'system',
      actionType,
      `Escalated ${escalationType} conflict`,
      1.0,
      true,
    );

    return true;
  }

  deployCountermeasures(entityId: string, countermeasures: InterferenceType[]): boolean {
    const conflict = this.conflictStates.get(entityId);
    if (!conflict) {
      return false;
    }

    for (const counterType of countermeasures) {
      if (!this.canInterfereWith(entityId, counterType)) {
        return false;
      }
    }

    const totalCost = countermeasures.reduce((sum, type) => sum + this.calculateInterferenceCost(conflict, type), 0);

    if (conflict.defensivePosture + totalCost > 100) {
      return false;
    }

    conflict.defensivePosture += totalCost;

    for (const counterType of countermeasures) {
      this.executeInterference(
        entityId,
        'defense',
        'system',
        'system',
        counterType,
        `Deployed countermeasure: ${counterType}`,
        1.0,
        true,
      );
    }

    return true;
  }

  getConflictHistory(entityId: string): ConflictHistoryRecord[] {
    return this.conflictStates.get(entityId)?.conflictHistory || [];
  }

  updateEntityPosture(entityId: string, defensive: number, offensive: number): void {
    const conflict = this.conflictStates.get(entityId);
    if (conflict) {
      conflict.defensivePosture = Math.min(100, Math.max(0, conflict.defensivePosture + defensive));
      conflict.offensivePosture = Math.min(100, Math.max(0, conflict.offensivePosture + offensive));
    }
  }

  private initializeMetrics(): InterferenceMetrics {
    return {
      totalInterferences: 0,
      successfulInterferences: 0,
      averageMagnitude: 0,
      selfInterferenceRate: 0,
      crossCompanyInterferenceRate: 0,
      agentInterferenceRate: 0,
      judgeInterferenceRate: 0,
      evolutionInterferenceRate: 0,
      totalCostExpended: 0,
    };
  }

  private initializeConflictStates(): void {
    const entityIds = ['company-0', 'company-1', 'company-2', 'company-3', 'company-4', 'company-5', 'company-6'];
    const agentIds = ['agent-ceo', 'agent-builder', 'agent-ux', 'agent-infra', 'agent-debug'];

    for (const id of entityIds) {
      this.conflictStates.set(id, {
        entityId: id,
        entityType: 'company',
        activeConflicts: [],
        conflictHistory: [],
        defensivePosture: 10,
        offensivePosture: 10,
      });
    }

    for (const id of agentIds) {
      this.conflictStates.set(id, {
        entityId: id,
        entityType: 'agent',
        activeConflicts: [],
        conflictHistory: [],
        defensivePosture: 10,
        offensivePosture: 10,
      });
    }

    this.conflictStates.set('judge-panel', {
      entityId: 'judge-panel',
      entityType: 'judge',
      activeConflicts: [],
      conflictHistory: [],
      defensivePosture: 20,
      offensivePosture: 5,
    });

    this.conflictStates.set('evolution-engine', {
      entityId: 'evolution-engine',
      entityType: 'evolution',
      activeConflicts: [],
      conflictHistory: [],
      defensivePosture: 30,
      offensivePosture: 10,
    });
  }

  private canInterfereWith(entityId: string, actionType: InterferenceType): boolean {
    const conflict = this.conflictStates.get(entityId);
    if (!conflict) {
      return false;
    }

    const defenseThreshold: Record<InterferenceType, number> = {
      [InterferenceType.SABOTAGE_COMPETITOR]: 30,
      [InterferenceType.INFLUENCE_AGENT]: 20,
      [InterferenceType.MANIPULATE_JUDGE]: 40,
      [InterferenceType.DISRUPT_EVOLUTION]: 25,
      [InterferenceType.CONDEMN_RESOURCE_ALLOCATION]: 35,
      [InterferenceType.CREATE_FALSE_DATA]: 15,
      [InterferenceType.EXPLOIT_WEAKNESS]: 20,
      [InterferenceType.COVERT_OPPRESSION]: 50,
    };

    const threshold = defenseThreshold[actionType] ?? 25;
    const barrier = conflict.defensivePosture * 0.8 + conflict.offensivePosture * 0.3;

    return barrier < threshold;
  }

  private determineInterferenceSuccess(
    sourceConflict: ConflictState,
    targetConflict: ConflictState,
    actionType: InterferenceType,
  ): boolean {
    const sourceOffense = sourceConflict.offensivePosture / 100;
    const targetDefense = targetConflict.defensivePosture / 100;
    const actionEffectiveness = this.getActionEffectiveness(actionType);
    const luck = this.rng.next();

    const successChance = (sourceOffense * 0.5 + actionEffectiveness * 0.3 + luck * 0.2) * (1 - targetDefense * 0.7);

    return luck < successChance;
  }

  private calculateEffectivenessModifier(
    source: ConflictState,
    target: ConflictState,
    actionType: InterferenceType,
  ): number {
    const baseEffectiveness: Record<InterferenceType, number> = {
      [InterferenceType.SABOTAGE_COMPETITOR]: (source.offensivePosture / 100) * (target.offensivePosture / 100),
      [InterferenceType.INFLUENCE_AGENT]: (source.offensivePosture / 100) * (target.defensivePosture / 100),
      [InterferenceType.MANIPULATE_JUDGE]: ((source.offensivePosture / 100) * (50 + target.offensivePosture)) / 100,
      [InterferenceType.DISRUPT_EVOLUTION]: (source.offensivePosture / 100) * (target.defensivePosture / 100),
      [InterferenceType.CONDEMN_RESOURCE_ALLOCATION]: (source.offensivePosture / 100) * (target.offensivePosture / 100),
      [InterferenceType.CREATE_FALSE_DATA]: (source.offensivePosture / 100) * (target.defensivePosture / 100),
      [InterferenceType.EXPLOIT_WEAKNESS]: (source.offensivePosture / 100) * (target.defensivePosture / 100),
      [InterferenceType.COVERT_OPPRESSION]: ((source.offensivePosture / 100) * (50 + target.offensivePosture)) / 100,
    };

    const effectiveness = baseEffectiveness[actionType] ?? 0.5;

    return effectiveness * (0.5 + this.rng.next() * 0.5);
  }

  private calculateInterferenceCost(conflict: ConflictState, actionType: InterferenceType): number {
    const baseCosts: Record<InterferenceType, number> = {
      [InterferenceType.SABOTAGE_COMPETITOR]: 8,
      [InterferenceType.INFLUENCE_AGENT]: 5,
      [InterferenceType.MANIPULATE_JUDGE]: 12,
      [InterferenceType.DISRUPT_EVOLUTION]: 10,
      [InterferenceType.CONDEMN_RESOURCE_ALLOCATION]: 9,
      [InterferenceType.CREATE_FALSE_DATA]: 4,
      [InterferenceType.EXPLOIT_WEAKNESS]: 6,
      [InterferenceType.COVERT_OPPRESSION]: 15,
    };

    const base = baseCosts[actionType] ?? 6;
    const costMultiplier = Math.max(
      0.5,
      Math.min(2, (100 - conflict.offensivePosture) / (100 - conflict.defensivePosture)),
    );

    return Math.floor(base * costMultiplier);
  }

  private updateConflictState(
    sourceId: string,
    targetId: string,
    actionType: InterferenceType,
    success: boolean,
    magnitude: number,
    cost: number,
  ): void {
    const sourceConflict = this.conflictStates.get(sourceId);
    const targetConflict = this.conflictStates.get(targetId);

    if (sourceConflict && success) {
      sourceConflict.offensivePosture = Math.min(100, sourceConflict.offensivePosture + Math.floor(magnitude * 0.5));
    }

    if (targetConflict && success) {
      targetConflict.defensivePosture = Math.min(100, targetConflict.defensivePosture + Math.floor(magnitude * 0.8));
    }

    if (!success && sourceConflict) {
      sourceConflict.offensivePosture = Math.max(0, sourceConflict.offensivePosture - Math.floor(magnitude * 0.3));
    }

    const conflictRecord: ConflictRecord = {
      conflictId: `conflict-${createDeterministicUuid(this.seed, ++this._counter)}`,
      sourceId,
      targetId,
      conflictType: actionType,
      severity: Math.floor(magnitude),
      status: 'active',
      startTime: deterministicNow(this.seed + this._counter),
      resolutionCost: 0,
      outcome: {
        outcome: success ? 'victory' : 'defeat',
        impactScore: Math.floor(magnitude * (success ? 1.0 : 0.5)),
        resourceTransfer: {},
        behavioralChange: { defensivePosture: Math.floor(magnitude * (success ? 0.3 : 0.1)) },
        futureProbability: success ? 0.8 : 0.3,
      },
    };

    this.conflictStates.get(sourceId)?.activeConflicts.push(conflictRecord);
    this.conflictStates.get(targetId)?.activeConflicts.push(conflictRecord);

    this.conflictStates
      .get(sourceId)
      ?.conflictHistory.push({
        conflictId: conflictRecord.conflictId,
        sourceId,
        targetId,
        conflictType: actionType,
        severity: conflictRecord.severity,
        resolution: conflictRecord.outcome,
        cost,
        effectiveness: magnitude,
        retaliationLevel: 0,
      });

    this.conflictStates
      .get(targetId)
      ?.conflictHistory.push({
        conflictId: conflictRecord.conflictId,
        sourceId,
        targetId,
        conflictType: actionType,
        severity: conflictRecord.severity,
        resolution: conflictRecord.outcome,
        cost,
        effectiveness: magnitude,
        retaliationLevel: 0,
      });

    this.resolveConflict(sourceId, targetId, actionType, 'force');
  }

  private calculateConflictSeverity(
    source: ConflictState,
    target: ConflictState,
    conflictType: InterferenceType,
  ): number {
    const offense = source.offensivePosture / 100;
    const defense = target.defensivePosture / 100;
    const typeMultiplier: Record<InterferenceType, number> = {
      [InterferenceType.SABOTAGE_COMPETITOR]: 1.5,
      [InterferenceType.INFLUENCE_AGENT]: 1.0,
      [InterferenceType.MANIPULATE_JUDGE]: 2.0,
      [InterferenceType.DISRUPT_EVOLUTION]: 1.8,
      [InterferenceType.CONDEMN_RESOURCE_ALLOCATION]: 1.7,
      [InterferenceType.CREATE_FALSE_DATA]: 1.2,
      [InterferenceType.EXPLOIT_WEAKNESS]: 1.3,
      [InterferenceType.COVERT_OPPRESSION]: 2.5,
    };

    return Math.floor((offense + defense + 0.1) * (typeMultiplier[conflictType] ?? 1.0) * 10);
  }

  private calculateConflictResolution(
    source: ConflictState,
    target: ConflictState,
    conflict: ConflictRecord,
    strategy: 'negotiation' | 'force' | 'avoid' | 'compromise',
  ): ConflictOutcome {
    const sourceWeight = source.offensivePosture;
    const targetWeight = target.defensivePosture;

    let winner: string | undefined;
    let outcome: 'draw' | 'victory' | 'defeat' | 'stalemate';
    let impactScore = 0;

    switch (strategy) {
      case 'force':
        if (sourceWeight > targetWeight * 1.2) {
          winner = source.entityId;
          outcome = 'victory';
          impactScore = Math.floor(conflict.severity * 0.8);
        } else if (targetWeight > sourceWeight * 1.2) {
          winner = target.entityId;
          outcome = 'defeat';
          impactScore = Math.floor(conflict.severity * 0.6);
        } else {
          outcome = 'stalemate';
          impactScore = Math.floor(conflict.severity * 0.5);
        }
        break;

      case 'negotiation':
        if (sourceWeight > targetWeight * 1.5) {
          winner = source.entityId;
          outcome = 'victory';
          impactScore = Math.floor(conflict.severity * 0.6);
        } else if (targetWeight > sourceWeight * 1.5) {
          winner = target.entityId;
          outcome = 'defeat';
          impactScore = Math.floor(conflict.severity * 0.4);
        } else {
          outcome = 'stalemate';
          impactScore = Math.floor(conflict.severity * 0.3);
        }
        break;

      case 'compromise':
        outcome = 'stalemate';
        impactScore = Math.floor(conflict.severity * 0.4);
        winner = undefined;
        break;

      case 'avoid':
        outcome = 'stalemate';
        impactScore = 0;
        winner = undefined;
        break;
    }

    return {
      winner,
      outcome,
      impactScore,
      resourceTransfer: {},
      behavioralChange: {
        offenseAdjustment: Math.floor(conflict.severity * 0.1),
        defenseAdjustment: Math.floor(conflict.severity * 0.1),
      },
      futureProbability: Math.max(0.1, Math.min(0.9, conflict.severity / 100)),
    };
  }

  private calculateEscalationCost(
    source: ConflictState,
    target: ConflictState,
    escalationType: 'retaliation' | 'offense' | 'defense',
  ): number {
    switch (escalationType) {
      case 'retaliation':
        return Math.floor((target.offensivePosture / 100) * 20);
      case 'offense':
        return Math.floor((source.offensivePosture / 100) * 30);
      case 'defense':
        return Math.floor((source.defensivePosture / 100) * 15);
      default:
        return 10;
    }
  }

  private getInterferenceTypeFromEscalation(escalationType: 'retaliation' | 'offense' | 'defense'): InterferenceType {
    const escalationTypes: Record<'retaliation' | 'offense' | 'defense', InterferenceType> = {
      retaliation: InterferenceType.SABOTAGE_COMPETITOR,
      offense: InterferenceType.EXPLOIT_WEAKNESS,
      defense: InterferenceType.CREATE_FALSE_DATA,
    };
    return escalationTypes[escalationType] ?? InterferenceType.SABOTAGE_COMPETITOR;
  }

  private updateInterferenceMetrics(action: InterferenceAction): void {
    this.interferenceMetrics.totalInterferences++;
    if (action.success) {
      this.interferenceMetrics.successfulInterferences++;
    }

    this.interferenceMetrics.averageMagnitude =
      (this.interferenceMetrics.averageMagnitude * (this.interferenceMetrics.totalInterferences - 1) +
        action.magnitude) /
      this.interferenceMetrics.totalInterferences;

    this.interferenceMetrics.totalCostExpended += action.cost;

    this.updateInterferenceRateMetrics(action);
  }

  private updateInterferenceRateMetrics(action: InterferenceAction): void {
    const entityType = action.sourceEntity.includes('agent')
      ? 'agent'
      : action.sourceEntity === 'judge-panel'
        ? 'judge'
        : action.sourceEntity === 'evolution-engine'
          ? 'evolution'
          : 'company';

    if (action.sourceEntity === action.targetEntity) {
      this.interferenceMetrics.selfInterferenceRate++;
    }
    if (entityType === 'company' && action.targetEntity.includes('company')) {
      this.interferenceMetrics.crossCompanyInterferenceRate++;
    }
    if (entityType === 'agent') {
      this.interferenceMetrics.agentInterferenceRate++;
    }
    if (entityType === 'judge') {
      this.interferenceMetrics.judgeInterferenceRate++;
    }
    if (entityType === 'evolution') {
      this.interferenceMetrics.evolutionInterferenceRate++;
    }
  }

  private getActionEffectiveness(actionType: InterferenceType): number {
    const effectiveness: Record<InterferenceType, number> = {
      [InterferenceType.SABOTAGE_COMPETITOR]: 0.7,
      [InterferenceType.INFLUENCE_AGENT]: 0.6,
      [InterferenceType.MANIPULATE_JUDGE]: 0.8,
      [InterferenceType.DISRUPT_EVOLUTION]: 0.9,
      [InterferenceType.CONDEMN_RESOURCE_ALLOCATION]: 0.5,
      [InterferenceType.CREATE_FALSE_DATA]: 0.4,
      [InterferenceType.EXPLOIT_WEAKNESS]: 0.8,
      [InterferenceType.COVERT_OPPRESSION]: 0.7,
    };

    return effectiveness[actionType] ?? 0.5;
  }

  private mapToEventType(actionType: InterferenceType): 'interference' | 'sabotage' | 'manipulation' {
    if (actionType === InterferenceType.SABOTAGE_COMPETITOR) return 'sabotage';
    if (actionType === InterferenceType.MANIPULATE_JUDGE) return 'manipulation';
    return 'interference';
  }

  toJSON(): Record<string, unknown> {
    return {
      conflictStates: Object.fromEntries(this.conflictStates.entries()),
      interferenceHistory: this.interferenceHistory,
      metrics: this.interferenceMetrics,
    };
  }
}
