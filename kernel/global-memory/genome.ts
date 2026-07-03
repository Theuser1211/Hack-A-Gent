import type { CompanyStrategyType } from '../../benchmarks/company-spawner.js';
import {
  createDeterministicUuid,
  deterministicNow,
  getSeededRandom,
  type RNG,
} from '../../benchmarks/determinism-kernel.js';
import type { StrategyTemplate } from '../../benchmarks/winning-strategy-templates.js';

export interface StrategyGene {
  geneId: string;
  name: string;
  description: string;
  category: 'speed' | 'innovation' | 'reliability' | 'ux' | 'balanced';
  fitnessScore: number;
  frequency: number;
  lastObserved: string;
  mutationHistory: string[];
}

export interface EvolutionPattern {
  patternId: string;
  description: string;
  similarity: number;
  effectiveness: number;
  timeToConvergence: number;
  replicability: number;
  robustness: number;
  dominantInPopulation: boolean;
}

export interface GlobalGenomeRecord {
  geneId: string;
  strategyType: CompanyStrategyType;
  templateId: string;
  templateName: string;
  populationFrequency: number;
  averageFitness: number;
  bestFitness: number;
  averageScore: number;
  bestScore: number;
  generationCount: number;
  firstObserved: string;
  lastObserved: string;
  mutationLineage: string[];
  crossCompanyTransmission: string[];
  globalImpactScore: number;
}

export interface EvolutionMap {
  speciesId: string;
  genes: StrategyGene[];
  patterns: EvolutionPattern[];
  dominantStrategy: string;
  adaptationRate: number;
  populationSize: number;
  health: number;
}

class GlobalStrategyGenome {
  private readonly seed: number;
  private readonly rng: RNG;
  private readonly genes: Map<string, StrategyGene> = new Map();
  private readonly records: Map<string, GlobalGenomeRecord> = new Map();
  private readonly evolutionMap: Map<string, EvolutionMap> = new Map();
  private readonly storageKey = 'hackagent-global-genome';

  constructor(seed = 42) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 43000);
    this.initializeCoreGenes();
    this.loadFromStorage();
  }

  discoverNewGene(template: StrategyTemplate, strategyType: CompanyStrategyType): StrategyGene {
    const geneId = `gene-${createDeterministicUuid(this.seed, template.id.length)}`;
    const gene: StrategyGene = {
      geneId,
      name: template.name,
      description: template.description,
      category: strategyType as 'speed' | 'innovation' | 'reliability' | 'ux' | 'balanced',
      fitnessScore: template.predictedScoreBonus,
      frequency: 1,
      lastObserved: deterministicNow(this.seed),
      mutationHistory: [],
    };

    this.genes.set(geneId, gene);
    this.persistToStorage();
    return gene;
  }

  recordGenomeEvolution(
    templateId: string,
    templateName: string,
    strategyType: CompanyStrategyType,
    score: number,
    companyId: string,
  ): GlobalGenomeRecord {
    const recordId = `record-${templateId}-${Date.now()}`;
    const existing = this.records.get(recordId);

    if (existing) {
      existing.averageFitness =
        (existing.averageFitness * (existing.generationCount - 1) + score) / existing.generationCount;
      existing.bestFitness = Math.max(existing.bestFitness, score);
      existing.averageScore =
        (existing.averageScore * (existing.generationCount - 1) + score) / existing.generationCount;
      existing.bestScore = Math.max(existing.bestScore, score);
      existing.generationCount++;
      existing.lastObserved = deterministicNow(this.seed);
      existing.crossCompanyTransmission.push(companyId);
    } else {
      const record: GlobalGenomeRecord = {
        geneId: recordId,
        strategyType,
        templateId,
        templateName,
        populationFrequency: 1,
        averageFitness: score,
        bestFitness: score,
        averageScore: score,
        bestScore: score,
        generationCount: 1,
        firstObserved: deterministicNow(this.seed),
        lastObserved: deterministicNow(this.seed),
        mutationLineage: [],
        crossCompanyTransmission: [companyId],
        globalImpactScore: score,
      };
      this.records.set(recordId, record);
    }

    this.persistToStorage();
    return this.records.get(recordId)!;
  }

  evolveStrategy(geneId: string, mutationType: string, targetValue: string, sourceCompanyId: string): StrategyGene {
    const gene = this.genes.get(geneId);
    if (!gene) {
      throw new Error(`Gene ${geneId} not found`);
    }

    gene.mutationHistory.push(`${mutationType}@${sourceCompanyId}@${deterministicNow(this.seed)}`);

    switch (mutationType) {
      case 'strategy_bias_shift':
        if (gene.category === 'speed') gene.category = 'innovation';
        else if (gene.category === 'balanced') gene.category = 'reliability';
        break;
      case 'efficiency_boost':
        gene.fitnessScore += 2;
        break;
      case 'adaptiveness_gain':
        gene.fitnessScore *= 1.1;
        break;
    }

    gene.lastObserved = deterministicNow(this.seed);
    gene.frequency++;

    this.genes.set(geneId, gene);
    this.persistToStorage();
    return gene;
  }

  detectEvolutionTrends(): EvolutionPattern[] {
    const patterns: EvolutionPattern[] = [];
    const now = Date.now();

    for (const [geneId, gene] of this.genes.entries()) {
      if (gene.frequency >= 3) {
        const ageInMilliseconds = now - Date.parse(gene.lastObserved);
        const timeToConvergence = ageInMilliseconds / (gene.frequency - 2);

        const pattern: EvolutionPattern = {
          patternId: `pattern-${geneId}`,
          description: `Strategy: ${gene.name} (Category: ${gene.category}) observed ${gene.frequency} times`,
          similarity: Math.min(1, gene.frequency / 10),
          effectiveness: gene.fitnessScore / 20,
          timeToConvergence,
          replicability: Math.min(1, gene.frequency / 15),
          robustness: Math.max(0.5, gene.fitnessScore / 15),
          dominantInPopulation: gene.frequency >= 5,
        };

        patterns.push(pattern);
      }
    }

    return patterns.sort((a, b) => b.effectiveness - a.effectiveness);
  }

  getGene(id: string): StrategyGene | undefined {
    return this.genes.get(id);
  }

  getAllGenes(): StrategyGene[] {
    return [...this.genes.values()];
  }

  getRecord(id: string): GlobalGenomeRecord | undefined {
    return this.records.get(id);
  }

  getAllRecords(): GlobalGenomeRecord[] {
    return [...this.records.values()];
  }

  updateEvolutionMap(epoch: number): void {
    const map: EvolutionMap = {
      speciesId: `species-${epoch}`,
      genes: this.getAllGenes(),
      patterns: this.detectEvolutionTrends(),
      dominantStrategy: this.getAllRecords().reduce((dominant, record) => {
        const category = record.strategyType;
        return this.getGeneFrequency(category) > this.getGeneFrequency(dominant) ? category : dominant;
      }, 'balanced'),
      adaptationRate: this.calculateAdaptationRate(),
      populationSize: this.records.size,
      health: this.calculateHealth(),
    };

    this.evolutionMap.set(map.speciesId, map);
    this.persistToStorage();
  }

  getEvolutionMap(): EvolutionMap[] {
    return [...this.evolutionMap.values()];
  }

  toJSON(): Record<string, unknown> {
    return {
      genes: [...this.genes.entries()].map(([id, gene]) => [id, gene]),
      records: [...this.records.entries()].map(([id, record]) => [id, record]),
      evolutionMap: [...this.evolutionMap.entries()].map(([id, map]) => [id, map]),
    };
  }

  private getGeneFrequency(category: string): number {
    return Array.from(this.genes.values()).filter((g) => g.category === category).length;
  }

  private calculateAdaptationRate(): number {
    const totalChanges = Array.from(this.genes.values()).reduce((sum, gene) => sum + gene.mutationHistory.length, 0);
    return Math.min(1.0, totalChanges / 20);
  }

  private calculateHealth(): number {
    const totalGenes = this.genes.size;
    const activeGenes = Array.from(this.genes.values()).filter((g) => g.fitnessScore > 0).length;
    return totalGenes > 0 ? activeGenes / totalGenes : 0;
  }

  private initializeCoreGenes(): void {
    const templates: StrategyTemplate[] = [
      {
        id: 'wow-first',
        name: 'Wow First, Logic Later',
        category: 'wow_first',
        description:
          'Prioritize UI demo above all else. Fake backend if needed. Maximize judge impression in first 5 seconds.',
        executionSteps: [
          'Build visually stunning landing page',
          'Add interactive demo that works with mock data',
          'Polish transitions and animations',
          'Add real backend only if time permits',
          'Deploy and verify visual flow',
        ],
        uxPriority: 10,
        backendPriority: 2,
        wowFactor: 0.95,
        riskLevel: 0.2,
        predictedScoreBonus: 12,
        guardrails: [
          'Never show raw mock data — simulate realism',
          'At least one interactive element must work end-to-end',
          'Loading states must look intentional, not broken',
        ],
        antiPatterns: [
          'Building auth system before UI',
          'Writing tests before demo is visible',
          'Spending time on database schema',
        ],
      },
      {
        id: 'single-flow',
        name: 'Single Flow Obsession',
        category: 'single_flow',
        description: '1 user journey only. No branching complexity. Optimize completion rate of that single flow.',
        executionSteps: [
          'Map one complete user journey',
          'Build entry point (landing/login)',
          'Build core action (the main feature)',
          'Build success state (result/output screen)',
          'Deploy and test the single flow end-to-end',
        ],
        uxPriority: 8,
        backendPriority: 5,
        wowFactor: 0.7,
        riskLevel: 0.15,
        predictedScoreBonus: 8,
        guardrails: [
          'Only one button path — no side navigation',
          'Every screen leads to the next — no dead ends',
          'Error state must redirect back to flow start',
        ],
        antiPatterns: [],
      },
      {
        id: 'demo-safety',
        name: 'Demo Safety First',
        category: 'demo_safety',
        description: 'Ensure demo always works. Build fallback paths for every feature.',
        executionSteps: [
          'Build core feature with full error handling',
          'Create mock fallbacks for external dependencies',
          'Test failure scenarios',
          'Deploy with monitoring',
        ],
        uxPriority: 6,
        backendPriority: 7,
        wowFactor: 0.6,
        riskLevel: 0.1,
        predictedScoreBonus: 6,
        guardrails: [],
        antiPatterns: [],
      },
      {
        id: 'perceived-intelligence',
        name: 'Perceived Intelligence',
        category: 'perceived_intelligence',
        description: 'Make simple things look smart. Use clever UX to simulate advanced capabilities.',
        executionSteps: [
          'Build simple but impressive-looking feature',
          'Add visual indicators of "AI" or "smart" behavior',
          'Polish user feedback loops',
        ],
        uxPriority: 9,
        backendPriority: 4,
        wowFactor: 0.8,
        riskLevel: 0.25,
        predictedScoreBonus: 10,
        guardrails: [],
        antiPatterns: [],
      },
      {
        id: 'narrative-driven',
        name: 'Narrative Driven',
        category: 'narrative_driven',
        description: 'Frame every feature as part of a compelling story. Judges remember stories, not features.',
        executionSteps: [
          'Define the problem narrative',
          'Build features that advance the story',
          'Create compelling demo script',
        ],
        uxPriority: 7,
        backendPriority: 6,
        wowFactor: 0.75,
        riskLevel: 0.2,
        predictedScoreBonus: 9,
        guardrails: [],
        antiPatterns: [],
      },
    ];

    for (const template of templates) {
      this.discoverNewGene(template, template.category as CompanyStrategyType);
    }
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
          if (Array.isArray(parsed.genes)) {
            for (const [id, gene] of parsed.genes) {
              this.genes.set(id, gene as StrategyGene);
            }
          }
          if (Array.isArray(parsed.records)) {
            for (const [id, record] of parsed.records) {
              this.records.set(id, record as GlobalGenomeRecord);
            }
          }
          if (Array.isArray(parsed.evolutionMap)) {
            for (const [id, map] of parsed.evolutionMap) {
              this.evolutionMap.set(id, map as EvolutionMap);
            }
          }
        }
      }
    } catch {}
  }
}

export { GlobalStrategyGenome };
