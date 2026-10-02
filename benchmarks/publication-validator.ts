import type { FinalEvaluationResult } from './evaluation-orchestrator.js';
import { computeRobustnessScore } from './evaluation-orchestrator.js';
import type { ExperimentSnapshot } from './experiment-snapshot.js';
import type { PublicationExperimentOutput } from './publication-schema.js';
import { compareResults } from './replay-engine.js';

export interface ValidationResult {
  passed: boolean;
  checks: ValidationCheck[];
  summary: string;
}

export interface ValidationCheck {
  name: string;
  passed: boolean;
  details: string;
}

export class PublicationValidator {
  validateDeterminism(snapshot: ExperimentSnapshot): ValidationCheck {
    const seed = snapshot.masterSeed;
    const hasDeterministicSeed = seed !== undefined && seed !== null && Number.isInteger(seed);
    return {
      name: 'determinism_check',
      passed: hasDeterministicSeed,
      details: hasDeterministicSeed
        ? `Master seed ${seed} is a valid integer seed for reproducible runs`
        : `Master seed is missing or invalid: ${seed}`,
    };
  }

  validateReplayEquivalence(original: FinalEvaluationResult, replayed: FinalEvaluationResult): ValidationCheck {
    const mismatches = compareResults(original, replayed);
    return {
      name: 'replay_equivalence_check',
      passed: mismatches.length === 0,
      details:
        mismatches.length === 0
          ? 'Replay produced identical results to original run'
          : `Replay mismatch: ${mismatches.join('; ')}`,
    };
  }

  validateScoringConsistency(output: PublicationExperimentOutput): ValidationCheck {
    const issues: string[] = [];

    const { metrics } = output;

    const recomputedRobustness = computeRobustnessScore(true, 0, {
      mutations_applied: 0,
      mutations_detected: 0,
      mutations_repaired: 0,
      detection_rate: 0,
      repair_success_rate: 0,
      survived_mutation: false,
    });

    const hasAllMetrics =
      metrics.robustnessScore !== undefined &&
      metrics.repairEfficiency !== undefined &&
      metrics.mutationSurvivalRate !== undefined &&
      metrics.detectionAccuracy !== undefined;

    if (!hasAllMetrics) {
      issues.push(
        'Missing one or more required metrics (robustnessScore, repairEfficiency, mutationSurvivalRate, detectionAccuracy)',
      );
    }

    const perTypeSum = output.perMutationTypeMetrics.reduce(
      (acc, pt) => ({
        applied: acc.applied + pt.applied,
        detected: acc.detected + pt.detected,
        repaired: acc.repaired + pt.repaired,
      }),
      { applied: 0, detected: 0, repaired: 0 },
    );

    if (perTypeSum.detected > perTypeSum.applied) {
      issues.push(`Per-type detected (${perTypeSum.detected}) exceeds applied (${perTypeSum.applied})`);
    }
    if (perTypeSum.repaired > perTypeSum.detected) {
      issues.push(`Per-type repaired (${perTypeSum.repaired}) exceeds detected (${perTypeSum.detected})`);
    }

    return {
      name: 'scoring_consistency_check',
      passed: issues.length === 0,
      details: issues.length === 0 ? 'All scoring is consistent and canonical' : `Scoring issues: ${issues.join('; ')}`,
    };
  }

  validateTraceCompleteness(snapshot: ExperimentSnapshot): ValidationCheck {
    const issues: string[] = [];
    const trace = snapshot.fullExecutionTrace;

    if (!trace.agentTraces || trace.agentTraces.length === 0) {
      issues.push('No agent execution traces found');
    }
    if (!trace.repairDecisionTraces) {
      issues.push('No repair decision traces found');
    }
    if (!trace.verificationReasoningTraces) {
      issues.push('No verification reasoning traces found');
    }
    if (!trace.judgeScoringTraces) {
      issues.push('No judge scoring traces found');
    }
    if (!trace.mutationSelectionTraces || trace.mutationSelectionTraces.length === 0) {
      issues.push('No mutation selection traces found');
    }

    const mutationSequence = snapshot.mutationSequence;
    if (!mutationSequence || mutationSequence.length === 0) {
      issues.push('No mutation sequence recorded');
    }

    return {
      name: 'trace_completeness_check',
      passed: issues.length === 0,
      details:
        issues.length === 0
          ? `All trace records present (${trace.agentTraces.length} agents, ${trace.repairDecisionTraces.length} repairs, ${trace.mutationSelectionTraces.length} mutations)`
          : `Trace gaps: ${issues.join('; ')}`,
    };
  }

  validateSchema(output: PublicationExperimentOutput): ValidationCheck {
    const issues: string[] = [];

    if (!output.metadata) issues.push('Missing metadata');
    if (!output.versions) issues.push('Missing version stamps');
    if (!output.metrics) issues.push('Missing metrics');
    if (!output.reproducibilityHash) issues.push('Missing reproducibility hash');

    if (output.versions) {
      if (!output.versions.protocolVersion) issues.push('Missing protocolVersion');
      if (!output.versions.mutationEngineVersion) issues.push('Missing mutationEngineVersion');
      if (!output.versions.judgeVersion) issues.push('Missing judgeVersion');
      if (!output.versions.repairEngineVersion) issues.push('Missing repairEngineVersion');
    }

    return {
      name: 'schema_validation_check',
      passed: issues.length === 0,
      details:
        issues.length === 0 ? 'Output conforms to publication schema' : `Schema violations: ${issues.join('; ')}`,
    };
  }

  validate(snapshot: ExperimentSnapshot, output: PublicationExperimentOutput): ValidationResult {
    const checks: ValidationCheck[] = [
      this.validateDeterminism(snapshot),
      this.validateScoringConsistency(output),
      this.validateTraceCompleteness(snapshot),
      this.validateSchema(output),
    ];

    const allPassed = checks.every((c) => c.passed);
    const failedChecks = checks.filter((c) => !c.passed);

    return {
      passed: allPassed,
      checks,
      summary: allPassed
        ? `All ${checks.length} publication validation checks passed`
        : `${failedChecks.length}/${checks.length} validation check(s) failed: ${failedChecks.map((c) => c.name).join(', ')}`,
    };
  }

  fullValidation(
    snapshot: ExperimentSnapshot,
    output: PublicationExperimentOutput,
    originalResult: FinalEvaluationResult,
    replayedResult: FinalEvaluationResult,
  ): ValidationResult {
    const checks: ValidationCheck[] = [
      this.validateDeterminism(snapshot),
      this.validateReplayEquivalence(originalResult, replayedResult),
      this.validateScoringConsistency(output),
      this.validateTraceCompleteness(snapshot),
      this.validateSchema(output),
    ];

    const allPassed = checks.every((c) => c.passed);
    const failedChecks = checks.filter((c) => !c.passed);

    return {
      passed: allPassed,
      checks,
      summary: allPassed
        ? `All ${checks.length} publication validation checks passed Ã¢â‚¬â€ experiment is publication-ready`
        : `${failedChecks.length}/${checks.length} validation check(s) failed: ${failedChecks.map((c) => c.name).join(', ')}`,
    };
  }
}
