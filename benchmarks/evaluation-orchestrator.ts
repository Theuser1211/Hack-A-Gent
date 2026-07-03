import type { MutationMetrics } from './benchmark-judge.js';
import type { TestSuiteResult } from './benchmark-tester.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import type { VerificationResult } from './build-verifier.js';
import type { RepairRecord } from './hackathon-benchmark-runner.js';
import type { PerMutationTypeMetrics } from './publication-schema.js';

export interface FinalEvaluationResult {
  robustnessScore: number;
  repairEfficiency: number;
  mutationSurvivalRate: number;
  detectionAccuracy: number;
  leaderboardRank: number;

  correctnessScore: number;
  mutationRecoveryRate: number;

  perMutationTypeMetrics: PerMutationTypeMetrics[];
  aggregateMutationMetrics: MutationMetrics;

  canonicalScore: number;
  verdict: 'pass' | 'fail';
  reasoning: string;
}

export interface EvaluationInput {
  verificationPassed: boolean;
  verificationErrors: VerificationResult['errors'];
  testResult: TestSuiteResult | null;
  mutationMetrics: MutationMetrics;
  perTypeStats: Record<string, { applied: number; detected: number; repaired: number }>;
  repairHistory: RepairRecord[];
  passingThreshold: number;
  leaderboardRank: number;
}

export function computeRobustnessScore(
  verificationPassed: boolean,
  verificationErrors: number,
  mutationMetrics: MutationMetrics,
): number {
  const correctnessBase = verificationPassed ? 100 : Math.max(0, 100 - verificationErrors * 10);
  const correctness = Math.round(correctnessBase);

  const repairEfficiency = computeRepairEfficiency(mutationMetrics);

  const mutationRecoveryRate = computeMutationRecoveryRate(mutationMetrics);

  return Math.round((correctness + repairEfficiency + mutationRecoveryRate) / 3);
}

export function computeRepairEfficiency(mutationMetrics: MutationMetrics): number {
  if (mutationMetrics.mutations_applied === 0) return 100;
  if (mutationMetrics.mutations_detected === 0) return 0;
  return Math.round(
    100 *
      (mutationMetrics.mutations_detected / mutationMetrics.mutations_applied) *
      (mutationMetrics.mutations_repaired / mutationMetrics.mutations_detected),
  );
}

export function computeMutationRecoveryRate(mutationMetrics: MutationMetrics): number {
  if (mutationMetrics.mutations_applied === 0) return 100;
  return Math.round(100 * (mutationMetrics.mutations_repaired / mutationMetrics.mutations_applied));
}

export function computeDetectionAccuracy(mutationMetrics: MutationMetrics): number {
  if (mutationMetrics.mutations_applied === 0) return 100;
  return Math.round(100 * (mutationMetrics.mutations_detected / mutationMetrics.mutations_applied));
}

export function computeMutationSurvivalRate(mutationMetrics: MutationMetrics): number {
  if (mutationMetrics.mutations_applied === 0) return 0;
  if (mutationMetrics.mutations_repaired >= mutationMetrics.mutations_applied) return 0;
  return (mutationMetrics.mutations_applied - mutationMetrics.mutations_repaired) / mutationMetrics.mutations_applied;
}

export function buildPerMutationTypeMetrics(
  perTypeStats: Record<string, { applied: number; detected: number; repaired: number }>,
): PerMutationTypeMetrics[] {
  return Object.entries(perTypeStats)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([mutationType, stat]) => ({
      mutationType,
      applied: stat.applied,
      detected: stat.detected,
      repaired: stat.repaired,
      detectionRate: stat.applied > 0 ? stat.detected / stat.applied : 0,
      repairRate: stat.detected > 0 ? stat.repaired / stat.detected : 0,
      survivalRate: stat.applied > 0 ? Math.max(0, stat.applied - stat.repaired) / stat.applied : 0,
    }));
}

export class EvaluationOrchestrator {
  evaluate(input: EvaluationInput): FinalEvaluationResult {
    const robustnessScore = computeRobustnessScore(
      input.verificationPassed,
      input.verificationErrors.length,
      input.mutationMetrics,
    );

    const repairEfficiency = computeRepairEfficiency(input.mutationMetrics);
    const mutationRecoveryRate = computeMutationRecoveryRate(input.mutationMetrics);
    const detectionAccuracy = computeDetectionAccuracy(input.mutationMetrics);
    const mutationSurvivalRate = computeMutationSurvivalRate(input.mutationMetrics);

    const correctnessScore = input.verificationPassed ? 100 : Math.max(0, 100 - input.verificationErrors.length * 10);

    const canonicalScore = Math.round(
      robustnessScore * 0.4 +
        repairEfficiency * 0.25 +
        detectionAccuracy * 0.2 +
        (1 - mutationSurvivalRate) * 100 * 0.15,
    );

    const verdict: 'pass' | 'fail' = canonicalScore >= input.passingThreshold ? 'pass' : 'fail';

    const reasoning = [
      `Robustness: ${robustnessScore}/100`,
      `Repair Efficiency: ${repairEfficiency}%`,
      `Mutation Recovery: ${mutationRecoveryRate}%`,
      `Detection Accuracy: ${detectionAccuracy}%`,
      `Survival Rate: ${(mutationSurvivalRate * 100).toFixed(1)}%`,
      `Aggregate: ${canonicalScore}/100`,
      `Verdict: ${verdict}`,
    ].join(' | ');

    return {
      robustnessScore,
      repairEfficiency,
      mutationSurvivalRate,
      detectionAccuracy,
      leaderboardRank: input.leaderboardRank,
      correctnessScore,
      mutationRecoveryRate,
      perMutationTypeMetrics: buildPerMutationTypeMetrics(input.perTypeStats),
      aggregateMutationMetrics: input.mutationMetrics,
      canonicalScore,
      verdict,
      reasoning,
    };
  }
}
