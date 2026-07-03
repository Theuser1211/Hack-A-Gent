import type { MutationType } from './mutation-engine.js';

export interface MutationDifficultyState {
  mutationType: MutationType;
  difficulty: number;
  successRate: number;
  detectionRate: number;
  repairRate: number;
}

export class MutationDifficultyController {
  private states: Map<MutationType, MutationDifficultyState>;
  private readonly alpha: number;
  private registeredTypes: Set<MutationType>;

  constructor(initialDifficulty = 0.5, alpha = 0.3) {
    this.alpha = alpha;
    this.states = new Map<MutationType, MutationDifficultyState>();
    this.registeredTypes = new Set<MutationType>();
    this.registerDefaultTypes(initialDifficulty);
  }

  private registerDefaultTypes(initialDifficulty: number): void {
    const defaults = [
      'remove_file',
      'corrupt_content',
      'truncate_content',
      'drop_field',
      'duplicate_file',
      'break_module_type',
      'inject_syntax_error',
      'swap_dependency',
      'rename_symbol',
      'break_import_path',
      'corrupt_config_value',
      'delete_function_body',
      'add_dead_code',
      'comment_out_code',
      'change_return_type',
    ];

    for (const mt of defaults) {
      this.registerMutationType(mt, initialDifficulty);
    }
  }

  registerMutationType(type: MutationType, initialDifficulty = 0.5): void {
    if (!this.states.has(type)) {
      this.states.set(type, {
        mutationType: type,
        difficulty: initialDifficulty,
        successRate: 0.5,
        detectionRate: 0.5,
        repairRate: 0.5,
      });
      this.registeredTypes.add(type);
    }
  }

  updateAfterRun(perTypeStats: Record<string, { applied: number; detected: number; repaired: number }>): void {
    for (const [typeStr, stat] of Object.entries(perTypeStats)) {
      if (!this.states.has(typeStr)) {
        this.registerMutationType(typeStr);
      }

      const state = this.states.get(typeStr);
      if (!state) continue;

      const applied = stat.applied;
      if (applied === 0) continue;

      const rawDetectionRate = stat.detected / applied;
      const rawRepairRate = stat.applied > 0 ? stat.repaired / applied : 0;

      state.detectionRate = this.ema(state.detectionRate, rawDetectionRate);
      state.repairRate = this.ema(state.repairRate, rawRepairRate);

      const rawSuccessRate = applied > 0 ? (applied - Math.max(0, stat.detected - stat.repaired)) / applied : 0.5;
      state.successRate = this.ema(state.successRate, rawSuccessRate);

      let difficultyDelta = 0;
      if (rawDetectionRate > 0.8 && rawRepairRate > 0.8) {
        difficultyDelta = 0.1;
      } else if (rawDetectionRate > 0.6 && rawRepairRate > 0.6) {
        difficultyDelta = 0.05;
      } else if (rawDetectionRate < 0.4 || rawRepairRate < 0.4) {
        difficultyDelta = -0.1;
      } else if (rawDetectionRate < 0.2 || rawRepairRate < 0.2) {
        difficultyDelta = -0.15;
      }

      if (difficultyDelta !== 0) {
        const rawDifficulty = state.difficulty + difficultyDelta;
        state.difficulty = Math.max(0.1, Math.min(0.95, rawDifficulty));
      }
    }
  }

  getMutationProbabilities(): Record<MutationType, number> {
    const allTypes = [...this.states.keys()];
    const totalDifficulty = allTypes.reduce((s, t) => {
      const d = this.states.get(t)?.difficulty ?? 0.5;
      return s + d;
    }, 0);

    const probs: Record<MutationType, number> = {};
    for (const mt of allTypes) {
      const d = this.states.get(mt)?.difficulty ?? 0.5;
      probs[mt] = totalDifficulty > 0 ? d / totalDifficulty : 1 / allTypes.length;
    }
    return probs;
  }

  getMutationIntensity(type: MutationType): number {
    return this.states.get(type)?.difficulty ?? 0.5;
  }

  getDifficulty(type: MutationType): number {
    return this.states.get(type)?.difficulty ?? 0.5;
  }

  getAllStates(): MutationDifficultyState[] {
    return [...this.states.values()];
  }

  getGlobalAverageDifficulty(): number {
    const allTypes = [...this.states.keys()];
    const sum = allTypes.reduce((s, t) => s + (this.states.get(t)?.difficulty ?? 0.5), 0);
    return allTypes.length > 0 ? sum / allTypes.length : 0.5;
  }

  getMutationCount(repositoryComplexity: number, modelPerformance: number): number {
    const baseCount = 1;
    const maxCount = 5;
    const complexityFactor = Math.min(1, repositoryComplexity / 10);
    const perfFactor = modelPerformance;
    const raw = baseCount + (maxCount - baseCount) * complexityFactor * perfFactor;
    return Math.max(1, Math.min(maxCount, Math.round(raw)));
  }

  overrideDifficulty(type: MutationType, newDifficulty: number): void {
    const state = this.states.get(type);
    if (state) {
      state.difficulty = Math.max(0.1, Math.min(0.95, newDifficulty));
    }
  }

  getAllRegisteredTypes(): MutationType[] {
    return [...this.registeredTypes];
  }

  private ema(prev: number, current: number): number {
    return this.alpha * current + (1 - this.alpha) * prev;
  }
}
