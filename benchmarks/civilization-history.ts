import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export interface CivilizationEventRecord {
  recordId: string;
  eventType: CivilizationEventType;
  eventId: string;
  timestamp: string;
  description: string;
  impactScope: 'global' | 'regional' | 'local';
  affectedEntities: string[];
  metadata: Record<string, unknown>;
  discoveredBy: string;
  significance: number;
}

export interface EconomyEventRecord {
  eventId: string;
  type: EconomicEventType;
  description: string;
  marketImpact: number;
  timestamp: string;
  sector: string;
  causedBy: string;
  duration: number;
}

export interface InnovationRecord {
  innovationId: string;
  innovationType: string;
  companyId: string;
  impact: number;
  timestamp: string;
  adoptionRate: number;
  competitors: string[];
  lifecycleStage: 'experimental' | 'development' | 'testing' | 'deployment' | 'mature';
}

export interface CivilizationMemory {
  civilizationId: string;
  seed: number;
  creationTimestamp: string;
  lastEpochTimestamp: string;
  eventRecords: CivilizationEventRecord[];
  economyRecords: EconomyEventRecord[];
  innovationRecords: InnovationRecord[];
  populationHistory: PopulationSnapshot[];
  companyLifecycle: CompanyLifecycleRecord[];
  judgeLifecycle: JudgeLifecycleRecord[];
  agentLifecycle: AgentLifecycleRecord[];
  resourceDynamics: ResourceDynamicsRecord[];
  discoveryHistory: DiscoveryRecord[];
}

export interface PopulationSnapshot {
  epoch: number;
  timestamp: string;
  totalCompanies: number;
  activeCompanies: number;
  retiredCompanies: number;
  totalJudges: number;
  activeJudges: number;
  retiredJudges: number;
  totalAgents: number;
  activeAgents: number;
}

export interface CompanyLifecycleRecord {
  companyId: string;
  epoch: number;
  birthTimestamp: string;
  retirementTimestamp?: string;
  majorEvents: string[];
  strategyEvolution: StrategyEvolutionRecord[];
}

export interface JudgeLifecycleRecord {
  judgeId: string;
  epoch: number;
  birthTimestamp: string;
  retirementTimestamp?: string;
  majorEvaluations: string[];
  calibrationHistory: CalibrationEventRecord[];
}

export interface AgentLifecycleRecord {
  agentId: string;
  epoch: number;
  birthTimestamp: string;
  retirementTimestamp?: string;
  majorRoles: string[];
  skillEvolution: SkillEvolutionRecord[];
}

export interface StrategyEvolutionRecord {
  strategyId: string;
  epoch: number;
  strategyType: string;
  description: string;
  impactScore: number;
}

export interface CalibrationEventRecord {
  calibrationId: string;
  epoch: number;
  judgeId: string;
  comparisonJudgeId: string;
  biasMagnitude: number;
  impactScore: number;
}

export interface SkillEvolutionRecord {
  skillId: string;
  epoch: number;
  agentId: string;
  skillType: string;
  proficiencyLevel: number;
  timeToMaster: number;
}

export interface ResourceDynamicsRecord {
  epoch: number;
  timestamp: string;
  totalResources: number;
  resourceScarcityIndex: number;
  economicHealth: number;
}

export interface DiscoveryRecord {
  discoveryId: string;
  discoveryType: string;
  discoveredBy: string;
  epoch: number;
  timestamp: string;
  impactAssessment: number;
  legacy: string;
}

export enum CivilizationEventType {
  INNOVATION = 'innovation',
  MERGER = 'merger',
  ACQUISITION = 'acquisition',
  BANKRUPTCY = 'bankruptcy',
  STRATEGY_REVOLUTION = 'strategy_revolution',
  ORGANIZATION_RESTRUCTURE = 'organization_restructure',
  AGENT_MIGRATION = 'agent_migration',
  JUDGE_REVOLUTION = 'judge_revolution',
  ECONOMIC_CRASH = 'economic_crash',
  ECONOMIC_BOOM = 'economic_boom',
  DISCOVERY = 'discovery',
  CULTURE_SHIFT = 'culture_shift',
  COLLABORATION_ALLIANCE = 'collaboration_alliance',
  WAR = 'war',
}

export enum EconomicEventType {
  MARKET_EXPLOSION = 'market_explosion',
  MARKET_CRASH = 'market_crash',
  RESOURCE_SHORTAGE = 'resource_shortage',
  INFLATION = 'inflation',
  DEFLATION = 'deflation',
  TRADE_AGREEMENT = 'trade_agreement',
  TARIFF_WAR = 'tariff_war',
}

export interface CivilizationOutcomes {
  companyEvolution: Record<string, unknown>;
  judgeEvolution: Record<string, unknown>;
  agentEvolution: Record<string, unknown>;
  innovationEvolution: Record<string, unknown>;
  economicEvolution: Record<string, unknown>;
  historicalSignificance: number;
}

export interface PatternQuery {
  type?: CivilizationEventType;
  affectedEntity?: string;
  since?: string;
  until?: string;
}

export class CivilizationHistory {
  private readonly seed: number;
  private civilizationMemory: CivilizationMemory;
  private _counter = 0;

  constructor(seed = 42) {
    this.seed = seed;
    this.civilizationMemory = {
      civilizationId: `civilization-${seed}`,
      seed,
      creationTimestamp: deterministicNow(seed),
      lastEpochTimestamp: deterministicNow(seed),
      eventRecords: [],
      economyRecords: [],
      innovationRecords: [],
      populationHistory: [],
      companyLifecycle: [],
      judgeLifecycle: [],
      agentLifecycle: [],
      resourceDynamics: [],
      discoveryHistory: [],
    };
  }

  public recordEvent(event: CivilizationEventRecord): void {
    this.civilizationMemory.eventRecords.push(event);
    this.saveEventToHistory(event);
  }

  public recordEconomicEvent(event: EconomyEventRecord): void {
    this.civilizationMemory.economyRecords.push(event);
    this.detectEconomicPatternChange(event);
  }

  public recordInnovation(innovation: InnovationRecord): void {
    this.civilizationMemory.innovationRecords.push(innovation);
    this.detectInnovationPattern(innovation);
  }

  public updatePopulationSnapshot(snapshot: PopulationSnapshot): void {
    this.civilizationMemory.populationHistory.push(snapshot);
  }

  public recordCompanyLifecycle(record: CompanyLifecycleRecord): void {
    this.civilizationMemory.companyLifecycle.push(record);
    this.ensureCompanyUniqueness(record);
  }

  public recordJudgeLifecycle(record: JudgeLifecycleRecord): void {
    this.civilizationMemory.judgeLifecycle.push(record);
  }

  public recordAgentLifecycle(record: AgentLifecycleRecord): void {
    this.civilizationMemory.agentLifecycle.push(record);
  }

  public recordResourceDynamics(record: ResourceDynamicsRecord): void {
    this.civilizationMemory.resourceDynamics.push(record);
  }

  public recordDiscovery(discovery: DiscoveryRecord): void {
    this.civilizationMemory.discoveryHistory.push(discovery);
    this.detectBreakthroughDiscovery(discovery);
  }

  public getCivilizationMemory(): CivilizationMemory {
    return { ...this.civilizationMemory };
  }

  public getEventsByType(type: CivilizationEventType, limit?: number): CivilizationEventRecord[] {
    let events = this.civilizationMemory.eventRecords.filter((e) => e.eventType === type);
    if (limit) {
      events = events.slice(-limit);
    }
    return events;
  }

  public getEconomicEventsByType(type: EconomicEventType, limit?: number): EconomyEventRecord[] {
    let events = this.civilizationMemory.economyRecords.filter((e) => e.type === type);
    if (limit) {
      events = events.slice(-limit);
    }
    return events;
  }

  public getInnovationsByCompany(companyId: string, limit?: number): InnovationRecord[] {
    let innovations = this.civilizationMemory.innovationRecords.filter((i) => i.companyId === companyId);
    if (limit) {
      innovations = innovations.slice(-limit);
    }
    return innovations;
  }

  public getCivilizationOutcomes(): CivilizationOutcomes {
    const companyOutcomes = this.calculateCompanyOutcomes();
    const judgeOutcomes = this.calculateJudgeOutcomes();
    const agentOutcomes = this.calculateAgentOutcomes();
    const innovationOutcomes = this.calculateInnovationOutcomes();
    const economicOutcomes = this.calculateEconomicOutcomes();
    return {
      companyEvolution: companyOutcomes,
      judgeEvolution: judgeOutcomes,
      agentEvolution: agentOutcomes,
      innovationEvolution: innovationOutcomes,
      economicEvolution: economicOutcomes,
      historicalSignificance: this.calculateHistoricalSignificance(),
    };
  }

  public exportHistory(): Record<string, unknown> {
    return {
      civilizationId: this.civilizationMemory.civilizationId,
      seed: this.civilizationMemory.seed,
      creationTimestamp: this.civilizationMemory.creationTimestamp,
      lastEpochTimestamp: this.civilizationMemory.lastEpochTimestamp,
      eventCount: this.civilizationMemory.eventRecords.length,
      economicEventCount: this.civilizationMemory.economyRecords.length,
      innovationCount: this.civilizationMemory.innovationRecords.length,
      populationSnapshotCount: this.civilizationMemory.populationHistory.length,
      companyLifecycleCount: this.civilizationMemory.companyLifecycle.length,
      discoveryCount: this.civilizationMemory.discoveryHistory.length,
    };
  }

  public importHistory(data: unknown): void {
    this.civilizationMemory = { ...(data as CivilizationMemory) };
  }

  public findPattern(pattern: PatternQuery): CivilizationEventRecord[] {
    let events = this.civilizationMemory.eventRecords;
    if (pattern.type) {
      events = events.filter((e) => e.eventType === pattern.type);
    }
    if (pattern.affectedEntity) {
      events = events.filter((e) => e.affectedEntities.includes(pattern.affectedEntity!));
    }
    if (pattern.since) {
      events = events.filter((e) => new Date(e.timestamp) >= new Date(pattern.since!));
    }
    if (pattern.until) {
      events = events.filter((e) => new Date(e.timestamp) <= new Date(pattern.until!));
    }
    return events;
  }

  private saveEventToHistory(event: CivilizationEventRecord): void {
    if (event.impactScope === 'global') {
      this.ensureHistoricalSignificance(event);
    }
    this.limitHistorySize();
  }

  private ensureHistoricalSignificance(event: CivilizationEventRecord): void {
    if (event.affectedEntities.length > 2 && event.impactScope === 'global') {
      const significance = Math.min(1, event.affectedEntities.length / 10);
      event.significance = significance;
    }
  }

  private detectEconomicPatternChange(event: EconomyEventRecord): void {
    const majorEconomicEvents = this.civilizationMemory.economyRecords.filter(
      (e) => e.type === EconomicEventType.MARKET_CRASH || e.type === EconomicEventType.MARKET_EXPLOSION,
    );
    if (majorEconomicEvents.length > 0 && majorEconomicEvents.length % 3 === 0) {
      const discovery: DiscoveryRecord = {
        discoveryId: `discovery-${createDeterministicUuid(this.seed, ++this._counter)}`,
        discoveryType: 'economic_pattern',
        discoveredBy: 'civilization_analyzer',
        epoch: Math.floor(this._counter / 3),
        timestamp: deterministicNow(this.seed + this._counter),
        impactAssessment: 0.7,
        legacy:
          'Economic patterns cycle predictably, creating predictable boom-bust dynamics that shape civilization development.',
      };
      this.civilizationMemory.discoveryHistory.push(discovery);
    }
  }

  private detectInnovationPattern(innovation: InnovationRecord): void {
    const technologyPathEvents = this.civilizationMemory.innovationRecords.filter(
      (i) => i.lifecycleStage === 'development' || i.lifecycleStage === 'testing',
    );
    if (technologyPathEvents.length > 0 && technologyPathEvents.length % 5 === 0) {
      const discovery: DiscoveryRecord = {
        discoveryId: `discovery-${createDeterministicUuid(this.seed, ++this._counter)}`,
        discoveryType: 'technological_path',
        discoveredBy: 'civilization_analyzer',
        epoch: Math.floor(this._counter / 5),
        timestamp: deterministicNow(this.seed + this._counter),
        impactAssessment: 0.8,
        legacy:
          'Sequential technology development creates cumulative advantage and path dependence across civilizations.',
      };
      this.civilizationMemory.discoveryHistory.push(discovery);
    }
  }

  private ensureCompanyUniqueness(record: CompanyLifecycleRecord): void {
    const existing = this.civilizationMemory.companyLifecycle.find((r) => r.companyId === record.companyId);
    if (existing && existing.epoch < record.epoch) {
      existing.epoch = record.epoch;
      existing.birthTimestamp = record.birthTimestamp;
      existing.majorEvents = [...existing.majorEvents, ...record.majorEvents];
    }
  }

  private calculateCompanyOutcomes(): Record<string, unknown> {
    return {};
  }

  private calculateJudgeOutcomes(): Record<string, unknown> {
    return {};
  }

  private calculateAgentOutcomes(): Record<string, unknown> {
    return {};
  }

  private calculateInnovationOutcomes(): Record<string, unknown> {
    return {};
  }

  private calculateEconomicOutcomes(): Record<string, unknown> {
    return {};
  }

  private calculateHistoricalSignificance(): number {
    const eventWeight: Record<string, number> = {
      [CivilizationEventType.INNOVATION]: 2,
      [CivilizationEventType.DISCOVERY]: 3,
      [CivilizationEventType.STRATEGY_REVOLUTION]: 2,
      [CivilizationEventType.ORGANIZATION_RESTRUCTURE]: 1,
      [CivilizationEventType.MERGER]: 1,
      [CivilizationEventType.ACQUISITION]: 1,
      [CivilizationEventType.BANKRUPTCY]: -1,
      [CivilizationEventType.ECONOMIC_CRASH]: -2,
    };
    let significance = 0;
    for (const event of this.civilizationMemory.eventRecords) {
      significance += (event.significance || 0) * (eventWeight[event.eventType] || 0);
    }
    return Math.min(1, significance / 100);
  }

  private limitHistorySize(): void {
    const maxEvents = 10000;
    if (this.civilizationMemory.eventRecords.length > maxEvents) {
      this.civilizationMemory.eventRecords.splice(0, this.civilizationMemory.eventRecords.length - maxEvents);
    }
    const maxEconomyEvents = 5000;
    if (this.civilizationMemory.economyRecords.length > maxEconomyEvents) {
      this.civilizationMemory.economyRecords.splice(
        0,
        this.civilizationMemory.economyRecords.length - maxEconomyEvents,
      );
    }
    const maxInnovations = 5000;
    if (this.civilizationMemory.innovationRecords.length > maxInnovations) {
      this.civilizationMemory.innovationRecords.splice(
        0,
        this.civilizationMemory.innovationRecords.length - maxInnovations,
      );
    }
  }

  private detectBreakthroughDiscovery(discovery: DiscoveryRecord): void {
    const breakthroughTypes = [
      'quantum',
      'nuclear',
      'genetic',
      'artificial_intelligence',
      'nanotechnology',
      'consciousness',
      'space_travel',
    ];
    const isBreakthrough = breakthroughTypes.some((type) => discovery.discoveredBy.toLowerCase().includes(type));
    if (isBreakthrough && discovery.impactAssessment > 0.8) {
      const civilizationEvent: CivilizationEventRecord = {
        recordId: `event-${createDeterministicUuid(this.seed, ++this._counter)}`,
        eventType: CivilizationEventType.DISCOVERY,
        eventId: discovery.discoveryId,
        timestamp: discovery.timestamp,
        description: `Breakthrough discovery: ${discovery.discoveryType} by ${discovery.discoveredBy}`,
        impactScope: 'global',
        affectedEntities: ['civilization', 'all entities'],
        metadata: { discovery },
        discoveredBy: discovery.discoveredBy,
        significance: discovery.impactAssessment,
      };
      this.civilizationMemory.eventRecords.push(civilizationEvent);
    }
  }
}
