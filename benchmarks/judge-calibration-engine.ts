import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';
import { Judge } from './judge-identity.js';
export interface CalibrationComparison {
  judgeId: string;
  judgeName: string;
  specialization: string;
  biasMagnitude: number;
  systematicBias: Record<string, number>;
  consistencyScore: number;
  varianceScore: number;
  accuracyScore: number;
  comparisonTimestamp: string;
}
export interface CalibrationAdjustment {
  judgeId: string;
  adjustmentType: 'bias_correction' | 'consistency_boost' | 'calibration_refine' | 'trend_alignment';
  adjustmentAmount: number;
  reason: string;
  sourceJudgeId: string;
  targetJudgeId: string;
  impactScore: number;
}
export interface MetaJudgeEvaluation {
  metaJudgeId: string;
  evaluatedJudgeId: string;
  fairnessScore: number;
  biasScore: number;
  consistencyScore: number;
  noveltyScore: number;
  accuracyScore: number;
  stabilityScore: number;
  agreementScore: number;
  outlierScore: number;
  inflationScore: number;
  deflationScore: number;
  overallScore: number;
  evaluationTimestamp: string;
}
export class JudgeCalibrationEngine {
  setSensitivity(value: number): void {}

  private readonly seed: number;
  private _counter = 0;

  constructor(seed = 42) {
    this.seed = seed;
  }

  compareJudge(judge: unknown): CalibrationComparison {
    const comparisonId = `comp-${createDeterministicUuid(this.seed, ++this._counter)}`;

    const biasMagnitude = calculateBiasMagnitude(judge);
    const systematicBias = calculateSystematicBias(judge);
    const consistencyScore = judge.calibration?.consistencyScore || 0.5;
    const varianceScore = judge.calibration?.varianceScore || 0.5;
    const accuracyScore = judge.accuracyScore || 0.5;

    return {
      judgeId: judge.id,
      judgeName: judge.name,
      specialization: judge.specialization,
      biasMagnitude,
      systematicBias,
      consistencyScore,
      varianceScore,
      accuracyScore,
      comparisonTimestamp: deterministicNow(this.seed + this._counter),
    };
  }

  calculateJudgeBias(judge: unknown): Record<string, number> {
    const biasVector: Record<string, number> = {};

    const biasIndicators = [
      'leniency',
      'harshness',
      'novelty',
      'technical',
      'complexity',
      'risk',
      'innovation',
      'business',
    ];

    for (const indicator of biasIndicators) {
      const key = indicator + 'Bias';
      if (key in judge) {
        biasVector[indicator] = judge[key];
      }
    }

    return biasVector;
  }

  calculateCalibrationAccuracy(judge: unknown): number {
    if (judge.lifetimeEvaluations === 0) return 0.5;

    const weights = { accuracy: 0.4, reputation: 0.3, consistency: 0.2, auditScore: 0.1 };

    return (
      judge.accuracyScore * weights.accuracy +
      judge.reputation * weights.reputation +
      (judge.calibration?.consistencyScore || 0 * weights.consistency) +
      judge.auditScore * weights.auditScore
    );
  }

  calculateConsistencyScore(judge: unknown): number {
    const rewardHistory = judge.memory?.rewardHistory || [];
    if (rewardHistory.length === 0) return 0.5;

    const recentRewards = rewardHistory.filter((r: unknown) => {
      const rewardDate = new Date(r.timestamp);
      const now = new Date();
      const diffDays = (now.getTime() - rewardDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    });

    if (recentRewards.length === 0) return 0.5;

    const positiveRewards = recentRewards.filter((r: unknown) => r.rewardType === 'bonus');
    const negativeRewards = recentRewards.filter((r: unknown) => r.rewardType === 'penalty');

    const consistency = positiveRewards.length / Math.max(1, recentRewards.length);
    const stabilityPenalty = Math.min(0.3, negativeRewards.length * 0.05);

    return Math.max(0, consistency - stabilityPenalty);
  }

  calculateVarianceScore(judge: unknown): number {
    const rewardHistory = judge.memory?.rewardHistory || [];
    if (rewardHistory.length < 3) return 0.5;

    const scores = rewardHistory.map((r: unknown) => r.score);
    const mean = scores.reduce((a: number, b: number) => a + b, 0) / scores.length;

    const variance = scores.reduce((sum: number, score: number) => sum + Math.pow(score - mean, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    const normalizedVariance = Math.min(1, stdDev / 50);

    return 1 - normalizedVariance;
  }

  applyCalibrationAdjustments(judgeId: string, adjustments: CalibrationAdjustment[]): void {
    for (const adjustment of adjustments) {
      if (adjustment.targetJudgeId === judgeId) {
        switch (adjustment.adjustmentType) {
          case 'bias_correction':
            adjustBias(adjustment.targetJudgeId, adjustment.adjustmentAmount);
            break;
          case 'consistency_boost':
            boostConsistency(adjustment.targetJudgeId, adjustment.adjustmentAmount);
            break;
          case 'calibration_refine':
            refineCalibration(adjustment.targetJudgeId, adjustment.adjustmentAmount);
            break;
          case 'trend_alignment':
            alignTrend(adjustment.targetJudgeId, adjustment.adjustmentAmount);
            break;
        }
      }
    }
  }

  generateCalibrationReport(judgeId: string): CalibrationReport {
    const judge = getJudgeById(judgeId);
    if (!judge) {
      throw new Error(`Judge not found: ${judgeId}`);
    }

    const comparisons: CalibrationComparison[] = [];
    const adjustments: CalibrationAdjustment[] = [];
    const accuracyTrend: TrendData[] = [];

    if (judge.memory?.rewardHistory) {
      for (let i = 0; i < judge.memory.rewardHistory.length; i += 10) {
        const chunk = judge.memory.rewardHistory.slice(i, i + 10);
        if (chunk.length > 0) {
          const avgScore = chunk.reduce((sum: number, r: unknown) => sum + r.score, 0) / chunk.length;
          accuracyTrend.push({
            timestamp: chunk[chunk.length - 1].timestamp,
            value: avgScore,
            trend: i > 0 ? avgScore - (accuracyTrend[accuracyTrend.length - 1]?.value ?? 0) : 0,
          });
        }
      }
    }

    return {
      judgeId,
      judgeName: judge.name,
      specialization: judge.specialization,
      currentCalibration: judge.calibration,
      comparisons,
      adjustments,
      accuracyTrend,
      recommendedActions: generateRecommendedActions(judge),
      calibrationScore: this.calculateCalibrationAccuracy(judge),
      generatedAt: deterministicNow(this.seed),
    };
  }

  getJudgeCalibrationScore(judgeId: string): number {
    const judge = getJudgeById(judgeId);
    if (!judge) return 0;
    return this.calculateCalibrationAccuracy(judge);
  }

  identifyCalibrationDrift(judgeId: string): DriftAnalysis {
    const judge = getJudgeById(judgeId);
    if (!judge) {
      throw new Error(`Judge not found: ${judgeId}`);
    }

    const recentEvaluations =
      (judge.memory?.rewardHistory || []).filter((r: unknown) => {
        const rDate = new Date(r.timestamp);
        const now = new Date();
        const diffDays = (now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24);
        return diffDays <= 30;
      }) || [];

    if (recentEvaluations.length < 5) {
      return {
        driftDetected: false,
        driftMagnitude: 0,
        driftType: 'none',
        affectedDimensions: [],
        trendDirection: 'stable',
        confidenceLevel: 0,
        startTimestamp: '',
        currentTimestamp: '',
      };
    }

    const scores = recentEvaluations.map((r: unknown) => r.score);
    const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
    const secondHalf = scores.slice(Math.ceil(scores.length / 2));

    const firstMean = firstHalf.reduce((a: number, b: number) => a + b, 0) / firstHalf.length;
    const secondMean = secondHalf.reduce((a: number, b: number) => a + b, 0) / secondHalf.length;

    const driftMagnitude = Math.abs(secondMean - firstMean) / 50;

    let driftType: 'increasing' | 'decreasing' | 'stable' = 'stable';
    let trendDirection: 'improving' | 'declining' | 'stable' = 'stable';

    if (driftMagnitude > 0.2) {
      driftType = secondMean > firstMean ? 'increasing' : 'decreasing';
      trendDirection = secondMean > firstMean ? 'improving' : 'declining';
    }

    const affectedDimensions = [];
    if (Math.abs(secondMean - firstMean) > 10) affectedDimensions.push('overall_score');
    if (judge.biasVector?.leniencyBias && Math.abs(judge.biasVector.leniencyBias) > 0.2)
      affectedDimensions.push('leniency_bias');
    if (judge.biasVector?.harshnessBias && Math.abs(judge.biasVector.harshnessBias) > 0.2)
      affectedDimensions.push('harshness_bias');

    const driftAnalysis: DriftAnalysis = {
      driftDetected: driftMagnitude > 0.1,
      driftMagnitude,
      driftType,
      affectedDimensions,
      trendDirection,
      confidenceLevel: Math.min(1, recentEvaluations.length / 20),
      startTimestamp: recentEvaluations[0]?.timestamp || '',
      currentTimestamp: recentEvaluations[recentEvaluations.length - 1]?.timestamp || '',
    };

    return driftAnalysis;
  }
}

function calculateBiasMagnitude(judge: unknown): number {
  const biasKeys = [
    'leniencyBias',
    'harshnessBias',
    'noveltyBias',
    'technicalBias',
    'complexityBias',
    'riskBias',
    'innovationBias',
    'businessBias',
  ];

  let totalMagnitude = 0;
  let count = 0;

  for (const key of biasKeys) {
    if (key in judge) {
      totalMagnitude += Math.abs(judge[key]);
      count++;
    }
  }

  return count > 0 ? totalMagnitude / count : 0;
}

function calculateSystematicBias(judge: unknown): Record<string, number> {
  const systematicBias: Record<string, number> = {};

  const biasKeys = [
    'leniencyBias',
    'harshnessBias',
    'noveltyBias',
    'technicalBias',
    'complexityBias',
    'riskBias',
    'innovationBias',
    'businessBias',
  ];

  for (const key of biasKeys) {
    if (key in judge) {
      const biasValue = judge[key];
      if (Math.abs(biasValue) > 0.05) {
        const biasType = key.replace('Bias', '');
        systematicBias[biasType] = biasValue;
      }
    }
  }

  return systematicBias;
}

function adjustBias(judgeId: string, adjustment: number): void {
  const judge = getJudgeById(judgeId);
  if (!judge) return;

  for (const [key, value] of Object.entries(judge.biasVector)) {
    judge.biasVector[key as keyof typeof judge.biasVector] = Math.max(
      -1,
      Math.min(1, (value as number) + adjustment * 0.1),
    );
  }
}

function boostConsistency(judgeId: string, adjustment: number): void {
  const judge = getJudgeById(judgeId);
  if (!judge) return;

  if (!judge.calibration) judge.calibration = {};
  judge.calibration.consistencyScore = Math.min(1, (judge.calibration.consistencyScore || 0) + adjustment * 0.1);
  judge.calibration.varianceScore = Math.max(0, (judge.calibration.varianceScore || 0) - adjustment * 0.05);
}

function refineCalibration(judgeId: string, adjustment: number): void {
  const judge = getJudgeById(judgeId);
  if (!judge) return;

  if (!judge.calibration) judge.calibration = {};
  judge.calibration.calibrationAccuracy = Math.min(1, (judge.calibration.calibrationAccuracy || 0) + adjustment * 0.05);
}

function alignTrend(judgeId: string, adjustment: number): void {
  const judge = getJudgeById(judgeId);
  if (!judge) return;

  if (!judge.memory?.rewardHistory || judge.memory.rewardHistory.length === 0) return;

  const recentScores = judge.memory.rewardHistory
    .filter((r: unknown) => {
      const rDate = new Date(r.timestamp);
      const now = new Date();
      const diffDays = (now.getTime() - rDate.getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    })
    .map((r: unknown) => r.score);

  if (recentScores.length < 3) return;

  const targetScore = 50 + (recentScores.reduce((a: number, b: number) => a + b, 0) / recentScores.length - 50) * 0.1;

  for (const [key, value] of Object.entries(judge.biasVector)) {
    const biasAdjustment = (targetScore - 50) * 0.02 * (Math.random() - 0.5);
    judge.biasVector[key as keyof typeof judge.biasVector] = Math.max(
      -1,
      Math.min(1, ((value as number) || 0) + biasAdjustment),
    );
  }
}

function getJudgeById(judgeId: string): unknown {
  const judges = Array.from(globalJudges.values());
  return judges.find((j) => j.id === judgeId);
}

const globalJudges = new Map<string, unknown>();

export interface CalibrationReport {
  judgeId: string;
  judgeName: string;
  specialization: string;
  currentCalibration: unknown;
  comparisons: CalibrationComparison[];
  adjustments: CalibrationAdjustment[];
  accuracyTrend: TrendData[];
  recommendedActions: string[];
  calibrationScore: number;
  generatedAt: string;
}

export interface TrendData {
  timestamp: string;
  value: number;
  trend: number;
}

export interface DriftAnalysis {
  driftDetected: boolean;
  driftMagnitude: number;
  driftType: 'increasing' | 'decreasing' | 'stable' | 'none';
  affectedDimensions: string[];
  trendDirection: 'improving' | 'declining' | 'stable';
  confidenceLevel: number;
  startTimestamp: string;
  currentTimestamp: string;
}

function generateRecommendedActions(judge: unknown): string[] {
  const actions: string[] = [];

  if (judge.accuracyScore < 0.4) actions.push('Increase calibration accuracy through more consistent evaluations');
  if (judge.reputation < 0.3) actions.push('Improve reputation by reducing harsh judgments');
  if (judge.biasVector && Math.abs(judge.biasVector.leniencyBias) > 0.3)
    actions.push('Address leniency bias through calibration training');
  if (judge.biasVector && Math.abs(judge.biasVector.harshnessBias) > 0.3)
    actions.push('Address harshness bias through empathy training');
  if (judge.calibration?.consistencyScore < 0.4) actions.push('Implement consistency improvement protocols');

  if (actions.length === 0) actions.push('Maintain current performance levels');

  return actions;
}
