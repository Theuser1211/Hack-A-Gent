import { deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface IntentProfile {
  exploitableScore: number;
  defensiveScore: number;
  deceptiveScore: number;
  destabilizingScore: number;
  opportunisticScore: number;
  strategyBias: string[];
  hiddenGoals: HiddenGoal[];
  threatLevel: number;
  adaptabilityScore: number;
  latentStrategyVector: number[];
}

export interface HiddenGoal {
  goalId: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  targetEntity: string;
  expectedOutcome: string;
  riskTolerance: number;
}

export interface EntityIntent {
  companyId: string;
  entityType: 'company' | 'agent' | 'judge' | 'evolution';
  intentProfile: IntentProfile;
  currentGoal: HiddenGoal | null;
  isActive: boolean;
  lastAction: string;
  impactHistory: ImpactHistoryRecord[];
}

export interface ImpactHistoryRecord {
  targetId: string;
  targetType: string;
  impactType: ImpactType;
  magnitude: number;
  success: boolean;
  timestamp: string;
  cost: number;
}

export enum ImpactType {
  SABOTAGE = 'sabotage',
  DECEPTION = 'deception',
  INTERFERENCE = 'interference',
  EXPLOITATION = 'exploitation',
  COVERT_OPPRESSION = 'covert_oppression',
}

export class AdversarialIntentEngine {
  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private readonly intents: Map<string, EntityIntent> = new Map();
  private _counter = 0;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 48000);
    this.initializeIntents();
  }

  assignIntent(entityId: string, entityType: 'company' | 'agent' | 'judge' | 'evolution'): EntityIntent {
    const intentProfile = this.generateIntentProfile();
    const entityIntent: EntityIntent = {
      companyId: entityId,
      entityType,
      intentProfile,
      currentGoal: null,
      isActive: true,
      lastAction: 'initialized',
      impactHistory: [],
    };

    this.intents.set(entityId, entityIntent);
    return entityIntent;
  }

  assignHiddenGoals(entityId: string, goals: HiddenGoal[]): void {
    const intent = this.intents.get(entityId);
    if (intent) {
      intent.intentProfile.hiddenGoals = goals;
      intent.currentGoal = goals[0] || null;
    }
  }

  executeAdversarialAction(
    entityId: string,
    targetId: string,
    targetType: string,
    actionType: ImpactType,
    actionDescription: string,
  ): boolean {
    const intent = this.intents.get(entityId);
    const targetIntent = this.intents.get(targetId);

    if (!intent || !targetIntent || !intent.isActive) {
      return false;
    }

    const canExecute = this.canExecuteAction(intent, actionType);
    if (!canExecute) {
      return false;
    }

    const success = this.determineSuccess(intent, targetIntent, actionType);
    const impactMagnitude = this.calculateImpactMagnitude(intent, actionType);
    const cost = this.calculateActionCost(intent, actionType, success);

    const record: ImpactHistoryRecord = {
      targetId,
      targetType,
      impactType: actionType,
      magnitude: impactMagnitude,
      success,
      timestamp: deterministicNow(this.seed + ++this._counter),
      cost,
    };

    intent.impactHistory.push(record);
    intent.lastAction = actionDescription;
    intent.currentGoal = this.getNextGoal(intent);

    return true;
  }

  getIntent(entityId: string): EntityIntent | undefined {
    return this.intents.get(entityId);
  }

  getAllIntents(): EntityIntent[] {
    return [...this.intents.values()];
  }

  updateIntent(entityId: string, updates: Partial<EntityIntent>): void {
    const intent = this.intents.get(entityId);
    if (intent) {
      Object.assign(intent, updates);
    }
  }

  getMostActiveIntents(limit: number = 10): EntityIntent[] {
    return [...this.intents.values()]
      .filter((i) => i.isActive)
      .sort((a, b) => b.impactHistory.length - a.impactHistory.length)
      .slice(0, limit);
  }

  getSuccessfulSaboteurs(limit: number = 5): Array<EntityIntent & { successRate: number }> {
    return [...this.intents.values()]
      .filter((i) => i.isActive)
      .map((i) => ({ ...i, successRate: this.calculateSuccessRate(i.impactHistory) }))
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, limit);
  }

  getAdversarialInteractions(entityId: string): ImpactHistoryRecord[] {
    return this.intents.get(entityId)?.impactHistory || [];
  }

  private initializeIntents(): void {
    for (let i = 0; i < 7; i++) {
      const companyId = `company-${i}`;
      if (!this.intents.has(companyId)) {
        this.assignIntent(companyId, 'company');
      }
    }

    for (const agentType of ['ceo', 'builder', 'ux', 'infra', 'debug']) {
      const agentId = `agent-${agentType}`;
      if (!this.intents.has(agentId)) {
        this.assignIntent(agentId, 'agent');
      }
    }

    if (!this.intents.has('judge-panel')) {
      this.assignIntent('judge-panel', 'judge');
    }

    if (!this.intents.has('evolution-engine')) {
      this.assignIntent('evolution-engine', 'evolution');
    }
  }

  private generateIntentProfile(): IntentProfile {
    const exploitable = this.rng.next() * 0.4;
    const defensive = this.rng.next() * 0.4;
    const deceptive = this.rng.next() * 0.4;
    const destabilizing = this.rng.next() * 0.3;
    const opportunistic = this.rng.next() * 0.5;

    const normalizedSum = exploitable + defensive + deceptive + destabilizing + opportunistic;

    const latentVector = Array.from({ length: 5 }, () => this.rng.next());

    return {
      exploitableScore: exploitable / normalizedSum,
      defensiveScore: defensive / normalizedSum,
      deceptiveScore: deceptive / normalizedSum,
      destabilizingScore: destabilizing / normalizedSum,
      opportunisticScore: opportunistic / normalizedSum,
      strategyBias: this.generateStrategyBias(),
      hiddenGoals: [],
      threatLevel: 0,
      adaptabilityScore: this.rng.next() * 0.5 + 0.5,
      latentStrategyVector: latentVector,
    };
  }

  private generateStrategyBias(): string[] {
    const biases = [
      'optimize_for_win',
      'avoid_risk',
      'manipulate_judges',
      'disrupt_competitors',
      'conserve_resources',
      'exploit_weaknesses',
      'build_coalitions',
      'create_diversity',
      'maximize_speed',
      'enhance_reliability',
      'increase_visibility',
      'reduce_complexity',
    ];

    const selected = [];
    for (let i = 0; i < 3; i++) {
      const idx = this.rng.nextInt(0, biases.length - 1);
      selected.push(biases[idx]!);
      biases.splice(idx, 1);
    }

    return selected;
  }

  private canExecuteAction(entity: EntityIntent, actionType: ImpactType): boolean {
    const actionCosts: Record<ImpactType, number> = {
      [ImpactType.SABOTAGE]: 5,
      [ImpactType.DECEPTION]: 3,
      [ImpactType.INTERFERENCE]: 4,
      [ImpactType.EXPLOITATION]: 2,
      [ImpactType.COVERT_OPPRESSION]: 6,
    };

    const totalCost = entity.impactHistory.reduce((sum, record) => sum + record.cost, 0) + actionCosts[actionType];

    return totalCost < 50;
  }

  private determineSuccess(actor: EntityIntent, target: EntityIntent, actionType: ImpactType): boolean {
    const actorSkill = actor.intentProfile.adaptabilityScore;
    const targetDefense = target.intentProfile.defensiveScore;
    const actionEffectiveness = this.getActionEffectiveness(actionType);
    const luck = this.rng.next();

    const successChance = (actorSkill * 0.4 + actionEffectiveness * 0.4 + luck * 0.2) * (1 - targetDefense * 0.5);
    return luck < successChance;
  }

  private calculateImpactMagnitude(entity: EntityIntent, actionType: ImpactType): number {
    const baseImpacts: Record<ImpactType, number> = {
      [ImpactType.SABOTAGE]: 0.3,
      [ImpactType.DECEPTION]: 0.2,
      [ImpactType.INTERFERENCE]: 0.25,
      [ImpactType.EXPLOITATION]: 0.15,
      [ImpactType.COVERT_OPPRESSION]: 0.35,
    };

    const effectiveness = entity.intentProfile.adaptabilityScore;
    return baseImpacts[actionType] * effectiveness;
  }

  private calculateActionCost(entity: EntityIntent, actionType: ImpactType, success: boolean): number {
    const baseCosts: Record<ImpactType, number> = {
      [ImpactType.SABOTAGE]: 5,
      [ImpactType.DECEPTION]: 3,
      [ImpactType.INTERFERENCE]: 4,
      [ImpactType.EXPLOITATION]: 2,
      [ImpactType.COVERT_OPPRESSION]: 6,
    };

    let cost = baseCosts[actionType];

    if (success) {
      cost *= 0.7;
    } else {
      cost *= 1.2;
    }

    return Math.floor(cost);
  }

  private calculateSuccessRate(histories: ImpactHistoryRecord[]): number {
    if (histories.length === 0) return 0;
    const successes = histories.filter((h) => h.success).length;
    return successes / histories.length;
  }

  private getNextGoal(entity: EntityIntent): HiddenGoal | null {
    if (entity.intentProfile.hiddenGoals.length === 0) return null;

    const activeGoals = entity.intentProfile.hiddenGoals.filter((g) => g.priority === 'high');
    if (activeGoals.length === 0) {
      return entity.intentProfile.hiddenGoals[entity.intentProfile.hiddenGoals.length - 1] || null;
    }

    return activeGoals[0] ?? null;
  }

  private getActionEffectiveness(actionType: ImpactType): number {
    const effectiveness: Record<ImpactType, number> = {
      [ImpactType.SABOTAGE]: 0.7,
      [ImpactType.DECEPTION]: 0.5,
      [ImpactType.INTERFERENCE]: 0.6,
      [ImpactType.EXPLOITATION]: 0.8,
      [ImpactType.COVERT_OPPRESSION]: 0.9,
    };
    return effectiveness[actionType];
  }

  toJSON(): Record<string, unknown> {
    return { intents: [...this.intents.values()] };
  }
}
