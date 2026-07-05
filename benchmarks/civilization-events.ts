import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export type EvolutionEventType = string;
export type ResourceEventType = string;

export interface EconomicEvent {
  eventId: string;
  type: EconomicEventType;
  description: string;
  timestamp: string;
  resourceImpact: { sector: string; impact: number; duration: number };
}

export interface CivilizationEvent {
  eventId: string;
  type: CivilizationEventType;
  title: string;
  description: string;
  timestamp: string;
  severity: 'info' | 'low' | 'medium' | 'high' | 'critical';
  affectedSystem: string;
  impactScope: 'global' | 'regional' | 'local';
  affectedEntities: string[];
  metadata: Record<string, unknown>;
  cause: EventCause;
  consequences: EventConsequence[];
}

export interface EventCause {
  primaryCause: string;
  contributingFactors: string[];
  probabilityTrigger: number;
}

export interface EventConsequence {
  consequenceId: string;
  description: string;
  probability: number;
  impact: number;
  timeframe: string;
}

export interface EvolutionEvent {
  evolutionId: string;
  type: EvolutionEventType;
  description: string;
  timestamp: string;
  affectedSystem: string;
  evolutionaryPressure: number;
  successRate: number;
}

export interface ResourceEvent {
  eventId: string;
  type: ResourceEventType;
  description: string;
  timestamp: string;
  resourceImpact: ResourceImpact;
}

export interface InnovationEvent {
  eventId: string;
  innovationType: string;
  companyId: string;
  impact: number;
  timestamp: string;
  adoptionRate: number;
}

export interface DiscoveryEvent {
  eventId: string;
  discoveryType: string;
  discoveredBy: string;
  description: string;
  timestamp: string;
  significance: number;
}

export interface ConflictEvent {
  eventId: string;
  type: ConflictEventType;
  description: string;
  timestamp: string;
  belligerents: string[];
  outcome: ConflictOutcome;
}

export interface ConflictOutcome {
  winner?: string;
  loser?: string;
  resolution: 'victory' | 'defeat' | 'stalemate';
  impactScore: number;
}

export class CivilizationEvents {
  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private _counter = 0;

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 35000);
  }

  public generateNaturalEvent(
    eventType: CivilizationEventType,
    timestamp: string,
    affectedEntities: string[],
  ): CivilizationEvent {
    const eventId = `natural-${createDeterministicUuid(this.seed, ++this._counter)}`;

    const event: CivilizationEvent = {
      eventId,
      type: eventType,
      title: this.getEventTitle(eventType),
      description: this.getEventDescription(eventType),
      timestamp,
      severity: this.calculateEventSeverity(eventType),
      affectedSystem: this.getAffectedSystem(eventType),
      impactScope: this.getImpactScope(affectedEntities),
      affectedEntities,
      metadata: this.generateEventMetadata(eventType),
      cause: {
        primaryCause: this.getPrimaryCause(eventType),
        contributingFactors: this.getContributingFactors(eventType),
        probabilityTrigger: 0.7 + this.rng.next() * 0.3,
      },
      consequences: this.generateEventConsequences(eventType),
    };

    return event;
  }

  public generateEconomicEvent(
    eventType: EconomicEventType,
    timestamp: string,
    sector: string,
    impact: number,
  ): EconomicEvent {
    const eventId = `economic-${createDeterministicUuid(this.seed, ++this._counter)}`;

    const event: EconomicEvent = {
      eventId,
      type: eventType,
      description: this.getEconomicEventDescription(eventType),
      timestamp,
      resourceImpact: { sector, impact, duration: this.calculateEventDuration(eventType) },
    };

    return event;
  }

  public generateInnovationEvent(
    innovationType: string,
    companyId: string,
    impact: number,
    timestamp: string,
  ): InnovationEvent {
    const eventId = `innovation-${createDeterministicUuid(this.seed, ++this._counter)}`;

    const event: InnovationEvent = {
      eventId,
      innovationType,
      companyId,
      impact,
      timestamp,
      adoptionRate: this.calculateAdoptionRate(impact),
    };

    return event;
  }

  public generateDiscoveryEvent(
    discoveryType: string,
    discoveredBy: string,
    significance: number,
    timestamp: string,
  ): DiscoveryEvent {
    const eventId = `discovery-${createDeterministicUuid(this.seed, ++this._counter)}`;

    const event: DiscoveryEvent = {
      eventId,
      discoveryType,
      discoveredBy,
      description: this.getDiscoveryDescription(discoveryType),
      timestamp,
      significance,
    };

    return event;
  }

  public generateConflictEvent(
    eventType: ConflictEventType,
    description: string,
    belligerents: string[],
    outcome: ConflictOutcome,
    timestamp: string,
  ): ConflictEvent {
    const eventId = `conflict-${createDeterministicUuid(this.seed, ++this._counter)}`;

    const event: ConflictEvent = { eventId, type: eventType, description, timestamp, belligerents, outcome };

    return event;
  }

  public generateEvolutionEvent(
    eventType: EvolutionEventType,
    description: string,
    affectedSystem: string,
    evolutionaryPressure: number,
    successRate: number,
    timestamp: string,
  ): EvolutionEvent {
    const eventId = `evolution-${createDeterministicUuid(this.seed, ++this._counter)}`;

    const event: EvolutionEvent = {
      evolutionId: eventId,
      type: eventType,
      description,
      timestamp,
      affectedSystem,
      evolutionaryPressure,
      successRate,
    };

    return event;
  }

  private getEventTitle(eventType: CivilizationEventType): string {
    const titles = {
      [CivilizationEventType.INNOVATION]: 'Innovation Breakthrough',
      [CivilizationEventType.MERGER]: 'Company Merger',
      [CivilizationEventType.ACQUISITION]: 'Company Acquisition',
      [CivilizationEventType.BANKRUPTCY]: 'Company Bankruptcy',
      [CivilizationEventType.STRATEGY_REVOLUTION]: 'Strategic Revolution',
      [CivilizationEventType.ORGANIZATION_RESTRUCTURE]: 'Organizational Restructuring',
      [CivilizationEventType.AGENT_MIGRATION]: 'Agent Migration',
      [CivilizationEventType.JUDGE_REVOLUTION]: 'Judge Revolution',
      [CivilizationEventType.ECONOMIC_CRASH]: 'Economic Crash',
      [CivilizationEventType.ECONOMIC_BOOM]: 'Economic Boom',
      [CivilizationEventType.DISCOVERY]: 'Discovery Event',
      [CivilizationEventType.CULTURE_SHIFT]: 'Cultural Shift',
      [CivilizationEventType.COLLABORATION_ALLIANCE]: 'Collaboration Alliance',
      [CivilizationEventType.WAR]: 'War Declaration',
    };

    return titles[eventType] || 'Unknown Event';
  }

  private getEventDescription(eventType: CivilizationEventType): string {
    const descriptions = {
      [CivilizationEventType.INNOVATION]: 'Major innovation discovered that changes industry dynamics',
      [CivilizationEventType.MERGER]: 'Companies merge to create larger, more powerful entities',
      [CivilizationEventType.ACQUISITION]: 'Company acquired by competitor or investor',
      [CivilizationEventType.BANKRUPTCY]: 'Company goes bankrupt and ceases operations',
      [CivilizationEventType.STRATEGY_REVOLUTION]: 'Fundamental shift in strategic approach',
      [CivilizationEventType.ORGANIZATION_RESTRUCTURE]: 'Major organizational restructuring',
      [CivilizationEventType.AGENT_MIGRATION]: 'Agents change affiliations or migrate',
      [CivilizationEventType.JUDGE_REVOLUTION]: 'Judges evolve new evaluation criteria',
      [CivilizationEventType.ECONOMIC_CRASH]: 'Economy experiences severe contraction',
      [CivilizationEventType.ECONOMIC_BOOM]: 'Economy experiences rapid expansion',
      [CivilizationEventType.DISCOVERY]: 'New knowledge or technology discovered',
      [CivilizationEventType.CULTURE_SHIFT]: 'Fundamental cultural transformation',
      [CivilizationEventType.COLLABORATION_ALLIANCE]: 'Strategic alliance formed between entities',
      [CivilizationEventType.WAR]: 'Conflict breaks out between entities',
    };

    return descriptions[eventType] || 'Event occurred';
  }

  private getPrimaryCause(eventType: CivilizationEventType): string {
    const causes = {
      [CivilizationEventType.INNOVATION]: 'Breakthrough innovation',
      [CivilizationEventType.MERGER]: 'Strategic consolidation',
      [CivilizationEventType.ACQUISITION]: 'Market expansion',
      [CivilizationEventType.BANKRUPTCY]: 'Market competition failure',
      [CivilizationEventType.STRATEGY_REVOLUTION]: 'Evolutionary pressure',
      [CivilizationEventType.ORGANIZATION_RESTRUCTURE]: 'Efficiency optimization',
      [CivilizationEventType.AGENT_MIGRATION]: 'Opportunity seeking',
      [CivilizationEventType.JUDGE_REVOLUTION]: 'Evaluation paradigm shift',
      [CivilizationEventType.ECONOMIC_CRASH]: 'Market bubble burst',
      [CivilizationEventType.ECONOMIC_BOOM]: 'Growth catalyst',
      [CivilizationEventType.DISCOVERY]: 'Research breakthrough',
      [CivilizationEventType.CULTURE_SHIFT]: 'Cultural evolution',
      [CivilizationEventType.COLLABORATION_ALLIANCE]: 'Mutual benefit alignment',
      [CivilizationEventType.WAR]: 'Resource competition',
    };

    return causes[eventType] || 'System dynamics';
  }

  private getContributingFactors(eventType: CivilizationEventType): string[] {
    const contributingFactors: Record<CivilizationEventType, string[]> = {
      [CivilizationEventType.INNOVATION]: ['R&D investment', 'talent pool', 'market demand', 'technology maturity'],
      [CivilizationEventType.MERGER]: [
        'market consolidation',
        'regulatory pressure',
        'resource competition',
        'strategic vision',
      ],
      [CivilizationEventType.ACQUISITION]: [
        'valuation opportunities',
        'liquidity availability',
        'growth strategy',
        'market timing',
      ],
      [CivilizationEventType.BANKRUPTCY]: [
        'cash flow constraints',
        'market saturation',
        'competitive pressure',
        'operational inefficiencies',
      ],
      [CivilizationEventType.STRATEGY_REVOLUTION]: [
        'environmental changes',
        'competitive shifts',
        'internal reflection',
        'external threats',
      ],
      [CivilizationEventType.ORGANIZATION_RESTRUCTURE]: [
        'bureaucracy',
        'communication breakdown',
        'efficiency issues',
        'culture misalignment',
      ],
      [CivilizationEventType.AGENT_MIGRATION]: [
        'better opportunities',
        'cultural fit',
        'leadership changes',
        'compensation',
      ],
      [CivilizationEventType.JUDGE_REVOLUTION]: [
        'bias awareness',
        'external pressure',
        'innovation cycles',
        'market demands',
      ],
      [CivilizationEventType.ECONOMIC_CRASH]: [
        'excessive leverage',
        'market speculation',
        'external shocks',
        'policy failures',
      ],
      [CivilizationEventType.ECONOMIC_BOOM]: [
        'innovation cycles',
        'market expansion',
        'policy support',
        'resource discoveries',
      ],
      [CivilizationEventType.DISCOVERY]: ['research investment', 'curiosity', 'collaboration', 'infrastructure'],
      [CivilizationEventType.CULTURE_SHIFT]: [
        'generational change',
        'external influences',
        'success stories',
        'leadership changes',
      ],
      [CivilizationEventType.COLLABORATION_ALLIANCE]: [
        'shared threats',
        'mutual benefits',
        'strategic alignment',
        'trust building',
      ],
      [CivilizationEventType.WAR]: [
        'resource scarcity',
        'ideological differences',
        'power vacuums',
        'historical grievances',
      ],
    };

    return contributingFactors[eventType] || [];
  }

  private calculateEventSeverity(eventType: CivilizationEventType): 'info' | 'low' | 'medium' | 'high' | 'critical' {
    const severityMap: Record<CivilizationEventType, 'info' | 'low' | 'medium' | 'high' | 'critical'> = {
      [CivilizationEventType.INNOVATION]: 'medium',
      [CivilizationEventType.MERGER]: 'high',
      [CivilizationEventType.ACQUISITION]: 'high',
      [CivilizationEventType.BANKRUPTCY]: 'high',
      [CivilizationEventType.STRATEGY_REVOLUTION]: 'critical',
      [CivilizationEventType.ORGANIZATION_RESTRUCTURE]: 'low',
      [CivilizationEventType.AGENT_MIGRATION]: 'low',
      [CivilizationEventType.JUDGE_REVOLUTION]: 'critical',
      [CivilizationEventType.ECONOMIC_CRASH]: 'critical',
      [CivilizationEventType.ECONOMIC_BOOM]: 'high',
      [CivilizationEventType.DISCOVERY]: 'critical',
      [CivilizationEventType.CULTURE_SHIFT]: 'medium',
      [CivilizationEventType.COLLABORATION_ALLIANCE]: 'medium',
      [CivilizationEventType.WAR]: 'critical',
    };

    return severityMap[eventType] || 'info';
  }

  private getAffectedSystem(eventType: CivilizationEventType): string {
    const systems = {
      [CivilizationEventType.INNOVATION]: 'innovation_system',
      [CivilizationEventType.MERGER]: 'organization_system',
      [CivilizationEventType.ACQUISITION]: 'market_system',
      [CivilizationEventType.BANKRUPTCY]: 'economy_system',
      [CivilizationEventType.STRATEGY_REVOLUTION]: 'strategy_system',
      [CivilizationEventType.ORGANIZATION_RESTRUCTURE]: 'organization_system',
      [CivilizationEventType.AGENT_MIGRATION]: 'human_capital_system',
      [CivilizationEventType.JUDGE_REVOLUTION]: 'evaluation_system',
      [CivilizationEventType.ECONOMIC_CRASH]: 'economy_system',
      [CivilizationEventType.ECONOMIC_BOOM]: 'economy_system',
      [CivilizationEventType.DISCOVERY]: 'knowledge_system',
      [CivilizationEventType.CULTURE_SHIFT]: 'culture_system',
      [CivilizationEventType.COLLABORATION_ALLIANCE]: 'relationship_system',
      [CivilizationEventType.WAR]: 'conflict_system',
    };

    return systems[eventType] || 'general_system';
  }

  private getImpactScope(affectedEntities: string[]): 'global' | 'regional' | 'local' {
    if (affectedEntities.length > 5) return 'global';
    if (affectedEntities.length > 2) return 'regional';
    return 'local';
  }

  private generateEventMetadata(eventType: CivilizationEventType): Record<string, unknown> {
    return { generatedAt: deterministicNow(this.seed), eventType: eventType, simulationSeed: this.seed };
  }

  private generateEventConsequences(eventType: CivilizationEventType): EventConsequence[] {
    const consequences: EventConsequence[] = [];

    switch (eventType) {
      case CivilizationEventType.INNOVATION:
        consequences.push(
          {
            consequenceId: 'cons-econ-1',
            description: 'Economic activity increases by 15%',
            probability: 0.8,
            impact: 0.15,
            timeframe: 'immediate',
          },
          {
            consequenceId: 'cons-social-1',
            description: 'Social adoption of new technology',
            probability: 0.6,
            impact: 0.3,
            timeframe: 'phase_1',
          },
          {
            consequenceId: 'cons-competition-1',
            description: 'Increased market competition',
            probability: 0.9,
            impact: 0.2,
            timeframe: 'short_term',
          },
        );
        break;

      case CivilizationEventType.ECONOMIC_CRASH:
        consequences.push(
          {
            consequenceId: 'cons-unemployment-1',
            description: 'Unemployment rises by 20%',
            probability: 0.9,
            impact: 0.3,
            timeframe: 'immediate',
          },
          {
            consequenceId: 'cons-credit-crisis-1',
            description: 'Credit crunch affects all sectors',
            probability: 0.8,
            impact: 0.25,
            timeframe: 'short_term',
          },
        );
        break;

      case CivilizationEventType.DISCOVERY:
        consequences.push(
          {
            consequenceId: 'cons-knowledge-spillover-1',
            description: 'Knowledge spreads to other sectors',
            probability: 0.7,
            impact: 0.4,
            timeframe: 'medium_term',
          },
          {
            consequenceId: 'cons-paradigm-shift-1',
            description: 'New paradigm emerges in multiple disciplines',
            probability: 0.3,
            impact: 0.6,
            timeframe: 'long_term',
          },
        );
        break;

      default:
        consequences.push({
          consequenceId: 'cons-normal-consequence-1',
          description: 'System adjusts to new conditions',
          probability: 0.5,
          impact: 0.1,
          timeframe: 'immediate',
        });
    }

    return consequences;
  }

  private getEconomicEventDescription(eventType: EconomicEventType): string {
    const descriptions = {
      [EconomicEventType.MARKET_EXPLOSION]: 'Rapid economic expansion with surging demand and investment',
      [EconomicEventType.MARKET_CRASH]: 'Severe economic contraction with widespread layoffs and reduced consumption',
      [EconomicEventType.RESOURCE_SHORTAGE]: 'Critical shortage of key resources causing supply chain disruptions',
      [EconomicEventType.INFLATION]: 'Widespread price increases eroding purchasing power',
      [EconomicEventType.DEFLATION]: 'Deflationary spiral with falling prices and reduced economic activity',
      [EconomicEventType.TRADE_AGREEMENT]: 'New trade agreements opening markets and reducing barriers',
      [EconomicEventType.TARIFF_WAR]: 'Escalating trade tensions with protective tariffs',
    };

    return descriptions[eventType] || 'Economic event occurred';
  }

  private calculateEventDuration(eventType: EconomicEventType): number {
    switch (eventType) {
      case EconomicEventType.MARKET_EXPLOSION:
      case EconomicEventType.MARKET_CRASH:
        return 12; // months
      case EconomicEventType.RESOURCE_SHORTAGE:
      case EconomicEventType.INFLATION:
      case EconomicEventType.DEFLATION:
        return 24; // months
      case EconomicEventType.TRADE_AGREEMENT:
        return 6; // months
      case EconomicEventType.TARIFF_WAR:
        return 36; // months
      default:
        return 6;
    }
  }

  private calculateAdoptionRate(impact: number): number {
    return Math.min(1, impact * 0.8 + 0.2);
  }

  private getDiscoveryDescription(discoveryType: string): string {
    const descriptions: Record<string, string> = {
      quantum_computing: 'Breakthrough in quantum computing capabilities enables previously impossible calculations',
      nuclear_fusion: 'Nuclear fusion achieved, providing limitless clean energy',
      genetic_engineering: 'Gene editing technologies enable precise biological modifications',
      artificial_intelligence: 'Advanced AI systems achieve human-level reasoning and learning',
      nanotechnology: 'Molecular manipulation enables atomic-scale manufacturing',
      consciousness: 'Understanding of consciousness breakthroughs enables mind uploading',
      space_travel: 'Interstellar travel achieved, connecting galactic civilizations',
    };

    return descriptions[discoveryType.toLowerCase()] || 'Significant discovery made';
  }
}

export enum DiscoveryEventType {
  BREAKTHROUGH = 'breakthrough',
  REFINEMENT = 'refinement',
  APPLICATION = 'application',
  THEORY = 'theory',
  TECHNOLOGY = 'technology',
  METHODOLOGY = 'methodology',
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

export enum ConflictEventType {
  ALLIANCE_FORMATION = 'alliance_formation',
  TRADE_DISPUTES = 'trade_disputes',
  BORDER_TENSIONS = 'border_tensions',
  RESOURCE_WARS = 'resource_wars',
  IDEOLOGICAL_CONFLICTS = 'ideological_conflicts',
}

export interface ResourceImpact {
  sector: string;
  impact: number;
  duration: number;
}
