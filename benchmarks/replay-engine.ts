import type { Repository } from '../kernel/builders/repository-types.js';
import { createRepository } from '../kernel/builders/repository-types.js';

import type { MutationMetrics } from './benchmark-judge.js';
import { getSeededRandom } from './determinism-kernel.js';
import type { FinalEvaluationResult } from './evaluation-orchestrator.js';
import type { ExperimentSnapshot, FrozenRepositoryState, FrozenMutationSequenceEntry } from './experiment-snapshot.js';

export interface ReplayResult {
  match: boolean;
  expected: FinalEvaluationResult;
  actual: FinalEvaluationResult | null;
  mismatches: string[];
  replayCompleted: boolean;
  errors: string[];
}

export function thawRepository(frozen: FrozenRepositoryState): Repository {
  return createRepository(
    frozen.projectName,
    frozen.modules.map((m) => ({
      name: m.name,
      type: m.type as Repository['modules'][number]['type'],
      files: m.files.map((f) => ({ path: f.path, content: f.content })),
    })),
    frozen.blueprintVersion,
  );
}

export function replayMutationSequence(snapshot: ExperimentSnapshot): {
  mutationSequence: FrozenMutationSequenceEntry[];
  originalRepository: Repository;
  finalRepository: Repository;
} {
  const rng = getSeededRandom(snapshot.masterSeed);
  const repo = thawRepository(snapshot.initialRepository);

  const appliedMutations: FrozenMutationSequenceEntry[] = [];

  let workingRepo = repo;
  for (const entry of snapshot.mutationSequence) {
    const intensity = entry.intensity;
    const targetModule = workingRepo.modules.find((m) => m.name === entry.moduleTarget);
    if (!targetModule) continue;

    let mutatedRepo = workingRepo;
    const fileIdx = entry.fileTarget
      ? targetModule.files.findIndex((f) => f.path === entry.fileTarget)
      : rng.nextInt(0, Math.max(0, targetModule.files.length - 1));

    if (fileIdx >= 0 && fileIdx < targetModule.files.length) {
      const file = targetModule.files[fileIdx]!;
      const corrupted = file.content + '\n// replayed mutation: ' + entry.mutationType;

      mutatedRepo = createRepository(
        workingRepo.project_name,
        workingRepo.modules.map((m) =>
          m.name === entry.moduleTarget
            ? { ...m, files: m.files.map((f, i) => (i === fileIdx ? { ...f, content: corrupted } : f)) }
            : m,
        ),
        workingRepo.blueprint_version,
      );
    }

    appliedMutations.push(entry);
    workingRepo = mutatedRepo;
  }

  return { mutationSequence: appliedMutations, originalRepository: repo, finalRepository: workingRepo };
}

export function compareResults(
  expected: FinalEvaluationResult,
  actual: FinalEvaluationResult,
  tolerance: number = 0.01,
): string[] {
  const mismatches: string[] = [];

  const numericKeys: (keyof FinalEvaluationResult)[] = [
    'robustnessScore',
    'repairEfficiency',
    'mutationSurvivalRate',
    'detectionAccuracy',
    'leaderboardRank',
    'correctnessScore',
    'mutationRecoveryRate',
    'canonicalScore',
  ];

  for (const key of numericKeys) {
    const ev = expected[key] as number;
    const av = actual[key] as number;
    if (Math.abs(ev - av) > tolerance) {
      mismatches.push(`${key}: expected ${ev}, got ${av} (diff ${Math.abs(ev - av)})`);
    }
  }

  if (expected.verdict !== actual.verdict) {
    mismatches.push(`verdict: expected ${expected.verdict}, got ${actual.verdict}`);
  }

  return mismatches;
}

export function validateDeterministicEquality(
  snapshot: ExperimentSnapshot,
  orchestratorFn: (seed: number) => { result: FinalEvaluationResult },
): Promise<ReplayResult> {
  return Promise.resolve().then(() => {
    const errors: string[] = [];
    const mismatches: string[] = [];

    try {
      const replayResult = orchestratorFn(snapshot.masterSeed);
      const actual = replayResult.result;

      const diffs = compareResults(snapshot.finalResults, actual);
      mismatches.push(...diffs);

      return {
        match: mismatches.length === 0,
        expected: snapshot.finalResults,
        actual,
        mismatches,
        replayCompleted: true,
        errors,
      };
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
      return {
        match: false,
        expected: snapshot.finalResults,
        actual: null,
        mismatches: [],
        replayCompleted: false,
        errors,
      };
    }
  });
}
