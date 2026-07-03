import type { EvolutionDelta, EvolutionMutationRecord } from './company-evolution-engine.js';
import type { CompanyProfile } from './company-spawner.js';
import type { CompanyResult } from './company-spawner.js';
import { getSeededRandom, deterministicNow, createDeterministicUuid, type RNG } from './determinism-kernel.js';

export interface TypeSpecialization {
  agentId: string;
  primaryType: 'frontend' | 'backend' | 'ux' | 'fullstack' | 'ai' | 'devops';
  specializationLevel: number;
  experiencePoints: number;
  skillLevel: number;
  lastPractice: string;
  adaptationRate: number;
}

export interface SkillTree {
  treeId: string;
  agentId: string;
  level: number;
  expertise: Partial<Record<'frontend' | 'backend' | 'ux' | 'fullstack' | 'ai' | 'devops', number>>;
  certifications: string[];
  specializations: TypeSpecialization[];
}

export interface CrossAgentLearning {
  learnerId: string;
  mentorId: string;
  knowledgeGained: string[];
  skillTransferred: string[];
  sessionCount: number;
  lastSession: string;
  learningImpact: number;
}

export interface TypeEvolutionEvent {
  eventId: string;
  agentId: string;
  eventType: 'specialization' | 'skill_gain' | 'cross_learning' | 'expertise_shift';
  timestamp: string;
  skillChanges: Record<string, number>;
  specializationChanges: Partial<TypeSpecialization>;
  learningAccelerated: boolean;
  impactOnPerformance: number;
}

export class TypeEvolutionSystem {
  private readonly seed: number;
  private readonly rng: RNG;
  private readonly skillTrees: Map<string, SkillTree> = new Map();
  private readonly typeSpecializations: Map<string, TypeSpecialization> = new Map();
  private readonly crossLearning: Map<string, CrossAgentLearning> = new Map();
  private readonly typeEvents: TypeEvolutionEvent[] = [];
  private readonly storageKey = 'hackagent-type-evolution';

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 44000);
    this.initializeDefaultSpecializations();
    this.loadFromStorage();
  }

  evolveAgentSkills(
    agentId: string,
    executionResult: CompanyResult,
    specializationGains: number = 0,
  ): TypeSpecialization {
    const specialization = this.typeSpecializations.get(agentId);
    if (!specialization) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const experienceGained = this.calculateExperience(agentId, executionResult);
    specialization.experiencePoints += experienceGained;
    specialization.lastPractice = deterministicNow(this.seed);

    if (specialization.experiencePoints >= this.getNextLevelThreshold(specialization)) {
      specialization.specializationLevel++;
      specialization.experiencePoints -= this.getNextLevelThreshold(specialization);
      this.levelUpSpecialization(specialization);
    }

    if (specializationGains > 0) {
      this.accelerateSpecialization(specialization, specializationGains);
    }

    this.recordTypeEvent({
      eventId: '',
      timestamp: '',
      agentId,
      eventType: 'specialization',
      skillChanges: { [specialization.primaryType]: specialization.skillLevel * 0.1 },
      specializationChanges: {
        specializationLevel: specialization.specializationLevel,
        experiencePoints: specialization.experiencePoints,
        lastPractice: specialization.lastPractice,
      },
      learningAccelerated: specializationGains > 0,
      impactOnPerformance: experienceGained / 100,
    });

    this.typeSpecializations.set(agentId, specialization);
    this.persistToStorage();
    return specialization;
  }

  facilitateCrossLearning(mentorId: string, learnerId: string, skillTransfer: string[]): CrossAgentLearning {
    const mentorSpec = this.typeSpecializations.get(mentorId);
    const learnerSpec = this.typeSpecializations.get(learnerId);

    if (!mentorSpec || !learnerSpec) {
      throw new Error(`Agent ${!mentorSpec ? mentorId : learnerId} not found`);
    }

    const existingLearning = this.crossLearning.get(`${learnerId}-${mentorId}`);
    if (existingLearning) {
      existingLearning.sessionCount++;
      existingLearning.knowledgeGained.push(...skillTransfer);
      existingLearning.lastSession = deterministicNow(this.seed);
      existingLearning.learningImpact = Math.min(1, existingLearning.learningImpact + 0.1);
      this.crossLearning.set(`${learnerId}-${mentorId}`, existingLearning);
      return existingLearning;
    }

    const newLearning: CrossAgentLearning = {
      learnerId,
      mentorId,
      knowledgeGained: skillTransfer,
      skillTransferred: this.filterSkillTransfer(learnerSpec, mentorSpec, skillTransfer),
      sessionCount: 1,
      lastSession: deterministicNow(this.seed),
      learningImpact: 0.8,
    };

    this.crossLearning.set(`${learnerId}-${mentorId}`, newLearning);
    this.recordTypeEvent({
      eventId: '',
      timestamp: '',
      agentId: learnerId,
      eventType: 'cross_learning',
      skillChanges: { [learnerSpec.primaryType]: newLearning.learningImpact * 0.5 },
      specializationChanges: null as unknown,
      learningAccelerated: true,
      impactOnPerformance: newLearning.learningImpact * 0.3,
    });

    this.persistToStorage();
    return newLearning;
  }

  generateEvolutionDelta(agentId: string): EvolutionDelta | null {
    const events = this.typeEvents.filter((e) => e.agentId === agentId && e.eventType === 'specialization');

    if (events.length === 0) return null;

    const lastEvent = events[events.length - 1];
    const impactFactor = lastEvent!.impactOnPerformance;

    const evolutionDelta: EvolutionDelta = {
      generationId: `type-evol-${agentId}-${Date.now()}`,
      newBestPatterns: impactFactor > 0.7 ? [`expertise-${agentId}`] : [],
      deprecatedPatterns: impactFactor < 0.3 ? [`legacy-${agentId}`] : [],
      mutationsApplied: this.convertEventsToMutations(events),
      strategyShifts: [],
      expectedScoreImprovement: impactFactor * 0.2,
    };

    return evolutionDelta;
  }

  getAgentSkillTree(agentId: string): SkillTree {
    return this.skillTrees.get(agentId)!;
  }

  getAgentSpecialization(agentId: string): TypeSpecialization {
    return this.typeSpecializations.get(agentId)!;
  }

  getCrossLearningHistory(agentId: string): CrossAgentLearning[] {
    return [...this.crossLearning.values()].filter((cl) => cl.learnerId === agentId || cl.mentorId === agentId);
  }

  private calculateExperience(agentId: string, result: CompanyResult): number {
    const base = 10 + result.finalScore * 10;
    const complexity = Math.min(5, Math.floor((result.toolCallsUsed + result.deployAttempts) / 10));
    const improvement = result.finalScore > 0.7 ? 15 : result.finalScore < 0.3 ? -5 : 0;

    return base + complexity + improvement;
  }

  private getNextLevelThreshold(specialization: TypeSpecialization): number {
    return Math.floor(100 * Math.pow(1.5, specialization.specializationLevel - 1));
  }

  private levelUpSpecialization(specialization: TypeSpecialization): void {
    specialization.adaptationRate += 0.05;
    specialization.skillLevel = Math.min(10, specialization.skillLevel + 0.2);
    this.upgradeSkillTree(specialization.agentId, specialization.primaryType);
  }

  private upgradeSkillTree(agentId: string, primaryType: string): void {
    const skillTree = this.skillTrees.get(agentId);
    if (!skillTree) return;

    const currentLevel = skillTree.level;
    skillTree.level = currentLevel + 1;
    const pt = primaryType as keyof typeof skillTree.expertise;
    skillTree.expertise[pt] = (skillTree.expertise[pt] || 0) + 1;
    skillTree.certifications.push(`${primaryType}-cert-level-${currentLevel + 1}`);

    this.skillTrees.set(agentId, skillTree);
  }

  private accelerateSpecialization(specialization: TypeSpecialization, gains: number): void {
    const rate = specialization.adaptationRate * gains;
    specialization.skillLevel += rate * 0.1;
    specialization.specializationLevel += Math.floor(gains * 0.2);
  }

  private filterSkillTransfer(learner: TypeSpecialization, mentor: TypeSpecialization, skills: string[]): string[] {
    const transferrable: string[] = [];

    for (const skill of skills) {
      if (skill === mentor.primaryType && mentor.skillLevel >= 5) {
        transferrable.push(skill);
      }
    }

    return transferrable;
  }

  private recordTypeEvent(event: TypeEvolutionEvent): void {
    event.eventId = `type-event-${createDeterministicUuid(this.seed, event.agentId.length)}`;
    event.timestamp = deterministicNow(this.seed);
    this.typeEvents.push(event);

    if (this.typeEvents.length > 1000) {
      this.typeEvents.splice(0, this.typeEvents.length - 500);
    }
  }

  private convertEventsToMutations(events: TypeEvolutionEvent[]): EvolutionMutationRecord[] {
    return events.map((event) => ({
      target: `type-${event.agentId}`,
      mutationType: 'agent_role_reweighting' as const,
      previousValue: 'legacy',
      newValue: 'advanced-specialized',
    }));
  }

  private initializeDefaultSpecializations(): void {
    const types: Array<'frontend' | 'backend' | 'ux' | 'fullstack' | 'ai' | 'devops'> = [
      'frontend',
      'backend',
      'ux',
      'fullstack',
      'ai',
      'devops',
    ];

    for (let i = 0; i < 15; i++) {
      const agentId = `agent-${i}`;
      const primaryType = types[Math.floor(this.rng.next() * types.length)]!;

      const specialization: TypeSpecialization = {
        agentId,
        primaryType,
        specializationLevel: 1,
        experiencePoints: 0,
        skillLevel: 5 + Math.random() * 5,
        lastPractice: deterministicNow(this.seed),
        adaptationRate: 1.0 + (Math.random() - 0.5) * 0.2,
      };

      this.typeSpecializations.set(agentId, specialization);

      const skillTree: SkillTree = {
        treeId: `tree-${agentId}`,
        agentId,
        level: 1,
        expertise: { [primaryType]: 1 } as SkillTree['expertise'],
        certifications: [`${primaryType}-foundation`],
        specializations: [specialization],
      };

      this.skillTrees.set(agentId, skillTree);
    }
  }

  toJSON(): Record<string, unknown> {
    return {
      skillTrees: [...this.skillTrees.entries()].map(([id, tree]) => [id, tree]),
      typeSpecializations: [...this.typeSpecializations.entries()].map(([id, spec]) => [id, spec]),
      crossLearning: [...this.crossLearning.entries()].map(([id, cl]) => [id, cl]),
      typeEvents: this.typeEvents,
    };
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify(this.toJSON());
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as unknown).localStorage.setItem(this.storageKey, data);
      }
    } catch {}
  }

  private loadFromStorage(): void {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        const raw = (globalThis as unknown).localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.typeSpecializations)) {
            for (const [id, spec] of parsed.typeSpecializations) {
              this.typeSpecializations.set(id, spec as TypeSpecialization);
            }
          }
          if (Array.isArray(parsed.skillTrees)) {
            for (const [id, tree] of parsed.skillTrees) {
              this.skillTrees.set(id, tree as SkillTree);
            }
          }
          if (Array.isArray(parsed.crossLearning)) {
            for (const [id, cl] of parsed.crossLearning) {
              this.crossLearning.set(id, cl as CrossAgentLearning);
            }
          }
          if (Array.isArray(parsed.typeEvents)) {
            this.typeEvents.push(...parsed.typeEvents);
          }
        }
      }
    } catch {}
  }
}
