import { AdversarialMetrics } from './adversarial-metrics.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface JudgeDriftState {
  judgeId: string;
  biasVector: Record<string, number>;
  preferenceFatigue: Record<string, number>;
  antiRepetitionBias: number;
  adversarialSkepticism: number;
  manipulationHistory: ManipulationAttempt[];
  previousWinners: string[];
  strategyDominance: Record<string, number>;
  timestamp: string;
}

export interface ManipulationAttempt {
  attemptId: string;
  sourceId: string;
  strategyType: string;
  detected: boolean;
  timestamp: string;
}

export class JudgeAdversarialDrift {
  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private readonly metrics: AdversarialMetrics;
  private judgeStates: Map<string, JudgeDriftState> = new Map();
  private _counter = 0;

  constructor(seed = 42, metrics?: AdversarialMetrics) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 53000);
    this.metrics = metrics ?? new AdversarialMetrics(seed);
  }

  registerJudge(judgeId: string): JudgeDriftState {
    const state: JudgeDriftState = {
      judgeId,
      biasVector: { innovation: 0, functionality: 0, ux: 0, technicalDepth: 0, reliability: 0 },
      preferenceFatigue: {},
      antiRepetitionBias: 0,
      adversarialSkepticism: 0,
      manipulationHistory: [],
      previousWinners: [],
      strategyDominance: {},
      timestamp: deterministicNow(this.seed),
    };
    this.judgeStates.set(judgeId, state);
    return state;
  }

  getJudgeState(judgeId: string): JudgeDriftState | undefined {
    return this.judgeStates.get(judgeId);
  }

  recordWinner(judgeId: string, winnerId: string, strategyType: string): JudgeDriftState {
    let state = this.judgeStates.get(judgeId);
    if (!state) state = this.registerJudge(judgeId);

    state.previousWinners.push(winnerId);
    if (state.previousWinners.length > 10) {
      state.previousWinners.shift();
    }

    state.strategyDominance[strategyType] = (state.strategyDominance[strategyType] ?? 0) + 1;

    const previousBias = { ...state.biasVector };

    if (state.previousWinners.filter((w) => w === winnerId).length >= 3) {
      state.antiRepetitionBias = Math.min(1, state.antiRepetitionBias + 0.15);
      state.biasVector[strategyType] = (state.biasVector[strategyType] ?? 0) - 0.1;
    }

    const totalWins = Object.values(state.strategyDominance).reduce((a, b) => a + b, 0);
    for (const [stype, count] of Object.entries(state.strategyDominance)) {
      const dominance = totalWins > 0 ? count / totalWins : 0;
      if (dominance > 0.5) {
        state.biasVector[stype] = (state.biasVector[stype] ?? 0) - dominance * 0.2;
        state.adversarialSkepticism = Math.min(1, state.adversarialSkepticism + 0.05);
      }
    }

    state.preferenceFatigue[strategyType] = (state.preferenceFatigue[strategyType] ?? 0) + 1;
    for (const key of Object.keys(state.preferenceFatigue)) {
      if (key !== strategyType) {
        state.preferenceFatigue[key] = Math.max(0, (state.preferenceFatigue[key] ?? 0) - 0.5);
      }
    }

    const driftMagnitude = Object.values(state.biasVector).reduce((sum, v) => sum + Math.abs(v), 0);
    this.metrics.recordJudgeBiasDrift({
      judgeId,
      timestamp: deterministicNow(this.seed + ++this._counter),
      previousBias,
      newBias: { ...state.biasVector },
      driftMagnitude,
      trigger: `winner:${winnerId},strategy:${strategyType}`,
    });

    return state;
  }

  recordManipulationAttempt(
    judgeId: string,
    sourceId: string,
    strategyType: string,
    detected: boolean,
  ): JudgeDriftState {
    let state = this.judgeStates.get(judgeId);
    if (!state) state = this.registerJudge(judgeId);

    const attempt: ManipulationAttempt = {
      attemptId: `manip-${createDeterministicUuid(this.seed, ++this._counter)}`,
      sourceId,
      strategyType,
      detected,
      timestamp: deterministicNow(this.seed + this._counter),
    };

    state.manipulationHistory.push(attempt);
    if (detected) {
      state.adversarialSkepticism = Math.min(1, state.adversarialSkepticism + 0.1);
      state.biasVector[strategyType] = (state.biasVector[strategyType] ?? 0) - 0.15;
    }

    return state;
  }

  applyBiasToScore(judgeId: string, baseScore: number, strategyType: string): number {
    const state = this.judgeStates.get(judgeId);
    if (!state) return baseScore;

    const bias = state.biasVector[strategyType] ?? 0;
    const fatigue = (state.preferenceFatigue[strategyType] ?? 0) * 0.02;
    const skepticismPenalty = state.adversarialSkepticism * 0.05;
    const antiRepeatPenalty = state.antiRepetitionBias * 0.05;

    let adjusted = baseScore + bias * 10 - fatigue - skepticismPenalty * 10 - antiRepeatPenalty * 10;
    adjusted = Math.max(0, Math.min(100, adjusted));

    return Math.round(adjusted * 100) / 100;
  }

  getAllJudgeStates(): JudgeDriftState[] {
    return [...this.judgeStates.values()];
  }

  getSkepticismScore(judgeId: string): number {
    return this.judgeStates.get(judgeId)?.adversarialSkepticism ?? 0;
  }

  toJSON(): Record<string, unknown> {
    return { judges: [...this.judgeStates.values()] };
  }
}
