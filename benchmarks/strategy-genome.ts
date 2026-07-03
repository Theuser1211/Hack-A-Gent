import { getSeededRandom } from './determinism-kernel.js';

export interface StrategyGenomeRecord {
  genomeId: string;
  templateId: string;
  templateName: string;
  strategyType: string;
  averageScore: number;
  winRate: number;
  generation: number;
  createdAt: string;
  lastUsedAt: string;
  innovationScore: number;
  complexityScore: number;
  adaptabilityScore: number;
  parentGenomeId: string | null;
}

export class GlobalStrategyGenome {
  private seed: number;

  constructor(config: { seed: number }) {
    this.seed = config.seed;
  }

  initializeGenomeDatabase(): void {}
}
