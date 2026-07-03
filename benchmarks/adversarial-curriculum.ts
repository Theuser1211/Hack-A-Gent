import type { CompanyProfile } from './company-spawner.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom, type RNG } from './determinism-kernel.js';

export interface AdversarialCompetency {
  competencyId: string;
  companyId: string;
  competencyType: 'exploitation' | 'deception' | 'counter_defense' | 'system_manipulation' | 'resource_control';
  proficiencyLevel: number;
  specializations: string[];
  masteryPath: boolean;
  lastMasteryCheck: string;
}

export interface AdaptivePressure {
  pressureId: string;
  targetCompanyId: string;
  pressureSource: 'environmental' | 'competitor' | 'system' | 'resource';
  pressureType: 'economic' | 'operational' | 'strategic' | 'evolutionary';
  intensity: number;
  duration: number;
  adaptiveResponse: string;
  timestamp: string;
}

export interface CompetitionAwareness {
  awarenessId: string;
  companyId: string;
  targetCompanyId: string;
  awarenessType: 'strategic_positioning' | 'resource_scarcity' | 'competitive_advantage' | 'weakness_exploitation';
  awarenessInsight: string;
  strategicValue: number;
  timeToAct: number;
  priority: 'high' | 'medium' | 'low';
  timestamp: string;
}

export interface CounterStrategy {
  strategyId: string;
  companyId: string;
  counterType: 'defensive_posture' | 'offensive_positioning' | 'resource_sharing' | 'market_manipulation';
  targetCompanyId: string;
  effectiveness: number;
  implementationCost: number;
  successRate: number;
  timestamp: string;
}

export class AdversarialIntelligenceCurriculum {
  private readonly seed: number;
  private readonly rng: RNG;
  private readonly competencies: AdversarialCompetency[] = [];
  private readonly adaptivePressures: AdaptivePressure[] = [];
  private readonly competitionAwareness: CompetitionAwareness[] = [];
  private readonly counterStrategies: CounterStrategy[] = [];
  private readonly storageKey = 'hackagent-adversarial-curriculum';

  constructor(seed: number | { seed?: number } = 42, ..._extra: unknown[]) {
    if (typeof seed === 'object') seed = seed.seed ?? 42;
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 52000);
    this.initializeCurriculum();
    this.loadFromStorage();
  }

  addCompetency(
    companyId: string,
    competencyType: 'exploitation' | 'deception' | 'counter_defense' | 'system_manipulation' | 'resource_control',
    proficiencyLevel: number,
    specializations: string[],
  ): AdversarialCompetency {
    const competency: AdversarialCompetency = {
      competencyId: `competency-${createDeterministicUuid(this.seed, Date.now())}`,
      companyId,
      competencyType,
      proficiencyLevel,
      specializations,
      masteryPath: false,
      lastMasteryCheck: deterministicNow(this.seed),
    };

    this.competencies.push(competency);
    this.updateCompetency(companyId, competencyType, proficiencyLevel, specializations);

    this.persistToStorage();
    return competency;
  }

  applyAdaptivePressure(
    targetCompanyId: string,
    pressureSource: 'environmental' | 'competitor' | 'system' | 'resource',
    pressureType: 'economic' | 'operational' | 'strategic' | 'evolutionary',
    intensity: number,
    duration: number,
    adaptiveResponse: string,
  ): AdaptivePressure {
    const pressure: AdaptivePressure = {
      pressureId: `pressure-${createDeterministicUuid(this.seed, Date.now())}`,
      targetCompanyId,
      pressureSource,
      pressureType,
      intensity,
      duration,
      adaptiveResponse,
      timestamp: deterministicNow(this.seed),
    };

    this.adaptivePressures.push(pressure);
    this.updateCompetency(targetCompanyId, 'counter_defense', intensity, []);

    this.persistToStorage();
    return pressure;
  }

  establishCompetitionAwareness(
    companyId: string,
    targetCompanyId: string,
    awarenessType: 'strategic_positioning' | 'resource_scarcity' | 'competitive_advantage' | 'weakness_exploitation',
    awarenessInsight: string,
    strategicValue: number,
    timeToAct: number,
    priority: 'high' | 'medium' | 'low',
  ): CompetitionAwareness {
    const awareness: CompetitionAwareness = {
      awarenessId: `awareness-${createDeterministicUuid(this.seed, Date.now())}`,
      companyId,
      targetCompanyId,
      awarenessType,
      awarenessInsight,
      strategicValue,
      timeToAct,
      priority,
      timestamp: deterministicNow(this.seed),
    };

    this.competitionAwareness.push(awareness);
    this.updateCounterStrategy(companyId, 'offensive_positioning', strategicValue);

    this.persistToStorage();
    return awareness;
  }

  implementCounterStrategy(
    companyId: string,
    counterType: 'defensive_posture' | 'offensive_positioning' | 'resource_sharing' | 'market_manipulation',
    targetCompanyId: string,
    effectiveness: number,
    implementationCost: number,
    successRate: number,
  ): CounterStrategy {
    const strategy: CounterStrategy = {
      strategyId: `strategy-${createDeterministicUuid(this.seed, Date.now())}`,
      companyId,
      counterType,
      targetCompanyId,
      effectiveness,
      implementationCost,
      successRate,
      timestamp: deterministicNow(this.seed),
    };

    this.counterStrategies.push(strategy);
    this.updateAdaptiveCounter(targetCompanyId, effectiveness, counterType);

    this.persistToStorage();
    return strategy;
  }

  getCompetencies(companyId?: string): AdversarialCompetency[] {
    if (!companyId) return [...this.competencies];
    return this.competencies.filter((c) => c.companyId === companyId);
  }

  getAdaptivePressures(targetCompanyId?: string): AdaptivePressure[] {
    if (!targetCompanyId) return [...this.adaptivePressures];
    return this.adaptivePressures.filter((p) => p.targetCompanyId === targetCompanyId);
  }

  getCompetitionAwareness(companyId?: string): CompetitionAwareness[] {
    if (!companyId) return [...this.competitionAwareness];
    return this.competitionAwareness.filter((a) => a.companyId === companyId);
  }

  getCounterStrategies(companyId?: string): CounterStrategy[] {
    if (!companyId) return [...this.counterStrategies];
    return this.counterStrategies.filter((s) => s.companyId === companyId);
  }

  updateCompanyAdaptiveLevel(companyId: string, level: number): void {
    for (const competency of this.competencies) {
      if (competency.companyId === companyId) {
        competency.proficiencyLevel = Math.min(1, competency.proficiencyLevel + level);
        if (competency.proficiencyLevel >= 0.8) {
          competency.masteryPath = true;
        }
      }
    }

    this.persistToStorage();
  }

  getAverageCompetency(): number {
    if (this.competencies.length === 0) return 0;
    const totalProficiency = this.competencies.reduce((sum, c) => sum + c.proficiencyLevel, 0);
    return totalProficiency / this.competencies.length;
  }

  getPrimaryAdversarialCompetency(): string {
    if (this.competencies.length === 0) return 'none';

    const competencyCounts = this.competencies.reduce(
      (counts, c) => {
        counts[c.competencyType] = (counts[c.competencyType] || 0) + 1;
        return counts;
      },
      {} as Record<string, number>,
    );

    const mostCompetency = Object.entries(competencyCounts).sort(([, a], [, b]) => b - a)[0];
    return mostCompetency ? mostCompetency[0] : 'none';
  }

  private initializeCurriculum(): void {
    const competencyTypes = [
      'exploitation',
      'deception',
      'counter_defense',
      'system_manipulation',
      'resource_control',
    ] as const;

    for (let i = 0; i < 7; i++) {
      const companyId = `company-${i}`;

      for (const competencyType of competencyTypes) {
        const proficiency = 0.3 + this.rng.next() * 0.4;
        const specializations = this.getSpecializationsForCompetency(competencyType);

        this.addCompetency(companyId, competencyType, proficiency, specializations);
      }
    }
  }

  private getSpecializationsForCompetency(competencyType: string): string[] {
    const specializationMap: Record<string, string[]> = {
      exploitation: ['price_manipulation', 'resource_theft', 'competitive_advantage'],
      deception: ['false_reporting', 'misinformation', 'strategic_omission'],
      counter_defense: ['security_enhancement', 'monitoring', 'detection_systems'],
      system_manipulation: ['interface_exploitation', 'protocol_violation', 'architecture_tampering'],
      resource_control: ['access_control', 'allocation_manipulation', 'scarcity_creation'],
    };

    return specializationMap[competencyType] || [];
  }

  private updateCompetency(
    companyId: string,
    competencyType: string,
    proficiencyLevel: number,
    specializations: string[],
  ): void {
    let competencyExists = false;

    for (const competency of this.competencies) {
      if (competency.companyId === companyId && competency.competencyType === competencyType) {
        competency.proficiencyLevel = Math.min(1, proficiencyLevel);
        competency.specializations = [...competency.specializations, ...specializations];
        competency.lastMasteryCheck = deterministicNow(this.seed);
        competencyExists = true;
        break;
      }
    }

    if (!competencyExists) {
      this.addCompetency(companyId, competencyType as unknown, proficiencyLevel, specializations);
    }
  }

  private updateCounterStrategy(companyId: string, counterType: string, strategicValue: number): void {
    let strategyExists = false;

    for (const strategy of this.counterStrategies) {
      if (strategy.companyId === companyId && strategy.counterType === counterType) {
        strategy.effectiveness = Math.min(1, strategy.effectiveness + strategicValue * 0.3);
        strategy.successRate = Math.min(1, strategy.successRate + strategicValue * 0.2);
        strategy.timestamp = deterministicNow(this.seed);
        strategyExists = true;
        break;
      }
    }

    if (!strategyExists) {
      this.implementCounterStrategy(
        companyId,
        counterType as unknown,
        'system',
        strategicValue,
        strategicValue * 2,
        0.5,
      );
    }
  }

  private updateAdaptiveCounter(targetCompanyId: string, effectiveness: number, adaptationType: string): void {
    for (const pressure of this.adaptivePressures) {
      if (pressure.targetCompanyId === targetCompanyId) {
        pressure.adaptiveResponse = `${adaptationType}@${effectiveness}`;
        break;
      }
    }
  }

  private loadFromStorage(): void {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        const raw = (globalThis as unknown).localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed.competencies) {
            this.competencies.push(...parsed.competencies);
          }
          if (parsed.adaptivePressures) {
            this.adaptivePressures.push(...parsed.adaptivePressures);
          }
          if (parsed.competitionAwareness) {
            this.competitionAwareness.push(...parsed.competitionAwareness);
          }
          if (parsed.counterStrategies) {
            this.counterStrategies.push(...parsed.counterStrategies);
          }
        }
      }
    } catch {}
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify({
        competencies: this.competencies,
        adaptivePressures: this.adaptivePressures,
        competitionAwareness: this.competitionAwareness,
        counterStrategies: this.counterStrategies,
      });
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as unknown).localStorage.setItem(this.storageKey, data);
      }
    } catch {}
  }

  classify(): { bdi: number; state: string } {
    return { bdi: 50, state: 'balanced' };
  }

  toJSON(): Record<string, unknown> {
    return {
      competencies: this.competencies,
      adaptivePressures: this.adaptivePressures,
      competitionAwareness: this.competitionAwareness,
      counterStrategies: this.counterStrategies,
    };
  }
}

export { AdversarialIntelligenceCurriculum as AdversarialCurriculum };
export const ADVERSARIAL_CURRICULUM = {
  COMPETENCY_TYPES: [
    'exploitation',
    'deception',
    'counter_defense',
    'system_manipulation',
    'resource_control',
  ] as const,
  ADAPTATION_PRESSURE_TYPES: ['environmental', 'competitor', 'system', 'resource'] as const,
  COMPETITION_AWARENESS_TYPES: [
    'strategic_positioning',
    'resource_scarcity',
    'competitive_advantage',
    'weakness_exploitation',
  ] as const,
  COUNTER_STRATEGY_TYPES: [
    'defensive_posture',
    'offensive_positioning',
    'resource_sharing',
    'market_manipulation',
  ] as const,
};
