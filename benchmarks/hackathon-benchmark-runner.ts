import { mkdtempSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { BuilderProvider } from '../kernel/builders/builder-provider.js';
import type { GeneratedRepository, GeneratedModule } from '../kernel/builders/builder-types.js';
import type { CodeRepairProvider, RepairStrategy, ModuleErrorReport } from '../kernel/builders/code-repair-provider.js';
import { DefaultCodeRepairProvider } from '../kernel/builders/code-repair-provider.js';
import type { Repository, Module, ModuleDiff } from '../kernel/builders/repository-types.js';
import { createRepository, patchModules, computeModuleDiff } from '../kernel/builders/repository-types.js';
import { RepositoryValidator } from '../kernel/builders/repository-validator.js';
import { DefaultRepositoryMaterializer } from '../kernel/execution/repository-materializer.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';
import type { PlannerOutput } from '../kernel/planning/planner-types.js';

import type { AdversarialIntelligenceCurriculum as AdversarialCurriculum } from './adversarial-curriculum.js';
import type { BenchmarkJudge, BenchmarkJudgeResult, MutationMetrics } from './benchmark-judge.js';
import type { BenchmarkTester, TestSuiteResult } from './benchmark-tester.js';
import type { HackathonBenchmarkDefinition, BenchmarkRunResult, PhaseResult } from './benchmark-types.js';
import { BenchmarkRunResultSchema } from './benchmark-types.js';
import type { BuildVerifier, VerificationResult, VerificationError } from './build-verifier.js';
import {
  createDeterministicUuid,
  deterministicNow,
  getSeededRandom,
  initializeGlobalRNG,
} from './determinism-kernel.js';
import type { RNG } from './determinism-kernel.js';
import { EvaluationOrchestrator } from './evaluation-orchestrator.js';
import type { FinalEvaluationResult } from './evaluation-orchestrator.js';
import { ExperimentSnapshotBuilder, freezeRepository, freezeMutationSequence } from './experiment-snapshot.js';
import type { ExperimentSnapshot } from './experiment-snapshot.js';
import type { MutationDifficultyController } from './mutation-difficulty-controller.js';
import { applyMutations } from './mutation-engine.js';
import type { MutationResult, MutationMetadata } from './mutation-engine.js';
import type { PerformanceMemoryBuffer } from './performance-memory-buffer.js';

export type { RepairRecord } from './runner-types.js';
import type { RepairRecord } from './runner-types.js';

export interface SharedMutationState {
  mutatedRepository: Repository;
  originalRepository: Repository;
  mutations: MutationMetadata[];
  perTypeStats: Record<string, { applied: number; detected: number; repaired: number }>;
}

export interface BenchmarkRunnerConfig {
  planner: { execute(input: Record<string, unknown>): Promise<{ output: PlannerOutput }> };
  architect: { execute(input: Record<string, unknown>): Promise<{ output: ArchitectureBlueprint }> };
  builderProvider: BuilderProvider;
  codeRepairProvider?: CodeRepairProvider;
  buildVerifier?: BuildVerifier;
  testAgent?: BenchmarkTester;
  judgePanel?: BenchmarkJudge;
  artifactsDir?: string;
  repairLimit?: number;
  adversarialMode?: boolean;
  mutationCount?: number;
  difficultyController?: MutationDifficultyController;
  memoryBuffer?: PerformanceMemoryBuffer;
  curriculum?: AdversarialCurriculum;
  agentId?: string;
  sharedMutationState?: SharedMutationState;
  seed?: number;
}

export class HackathonBenchmarkRunner {
  private readonly config: BenchmarkRunnerConfig;
  private readonly validator: RepositoryValidator;
  private repairHistory: RepairRecord[] = [];
  private rng: RNG;
  private runCounter = 0;
  private orchestrator: EvaluationOrchestrator;
  private masterSeed: number;

  constructor(config: BenchmarkRunnerConfig) {
    this.config = config;
    this.validator = new RepositoryValidator();
    this.masterSeed = config.seed ?? 42;
    initializeGlobalRNG(this.masterSeed);
    this.rng = getSeededRandom(this.masterSeed);
    this.orchestrator = new EvaluationOrchestrator();
  }

  getRepairHistory(): readonly RepairRecord[] {
    return this.repairHistory;
  }

  static createSharedMutationState(
    repo: Repository,
    mutationCount?: number,
    seed?: number,
    difficultyController?: MutationDifficultyController,
  ): SharedMutationState {
    const originalRepository = createRepository(repo.project_name, repo.modules, repo.blueprint_version);
    const result: MutationResult = applyMutations(repo, mutationCount, seed, difficultyController);
    const perTypeStats: Record<string, { applied: number; detected: number; repaired: number }> = {};
    for (const m of result.mutations) {
      const t = m.type;
      if (!perTypeStats[t]) perTypeStats[t] = { applied: 0, detected: 0, repaired: 0 };
      perTypeStats[t]!.applied++;
    }
    return {
      mutatedRepository: result.mutatedRepository,
      originalRepository,
      mutations: result.mutations,
      perTypeStats,
    };
  }

  async runBenchmark(
    benchmark: HackathonBenchmarkDefinition,
    options?: { mutationsEnabled?: boolean; mutationLevel?: number; maxRepairAttempts?: number },
  ): Promise<BenchmarkRunResult> {
    const runId = `run-${createDeterministicUuid(this.masterSeed, ++this.runCounter).slice(0, 8)}`;
    const startedAt = deterministicNow(this.masterSeed + this.runCounter);
    const startTime = Date.now();
    const phases: PhaseResult[] = [];
    const errors: string[] = [];
    let totalTokens = 0;
    let buildSuccess = false;
    let testSuccess: boolean | null = null;
    let judgeScore: number | null = null;
    let judgeVerdict: string | null = null;
    let repairIterations = 0;
    let architectureBlueprint: ArchitectureBlueprint | null = null;
    let repository: Repository | null = null;
    let lastVerificationResult: VerificationResult | null = null;
    let lastTestResult: TestSuiteResult | null = null;
    let lastJudgeResult: BenchmarkJudgeResult | null = null;
    let mutationLog: MutationMetadata[] = [];
    let originalRepository: Repository | null = null;
    let mutationMetrics: MutationMetrics = {
      mutations_applied: 0,
      mutations_detected: 0,
      mutations_repaired: 0,
      detection_rate: 0,
      repair_success_rate: 0,
      survived_mutation: false,
    };
    const perTypeStats: Record<string, { applied: number; detected: number; repaired: number }> = {};
    this.repairHistory = [];

    const artifactsDir = this.config.artifactsDir
      ? path.join(this.config.artifactsDir, benchmark.id, runId)
      : mkdtempSync(path.join(os.tmpdir(), `hackagent-bench-${benchmark.id}-`));

    if (!existsSync(artifactsDir)) {
      mkdirSync(artifactsDir, { recursive: true });
    }

    await this.saveArtifact(artifactsDir, 'benchmark-definition.json', JSON.stringify(benchmark, null, 2));

    // Phase 1: Planning
    const planPhase = await this.runPhase('planning', async () => {
      await this.config.planner.execute({
        hackathon_description: benchmark.hackathon_description,
        preferences: { team_size: 'small', platform: 'web', experience: 'advanced' },
      });
      return { success: true, tokens: 0, artifacts: [] as string[] };
    });
    phases.push(planPhase.phase);
    totalTokens += planPhase.phase.token_count;
    if (!planPhase.phase.success) errors.push(planPhase.phase.error ?? 'Planning failed');

    // Phase 2: Architecture
    const archPhase = await this.runPhase('architecture', async () => {
      const result = await this.config.architect.execute({
        project_name: benchmark.name,
        summary: benchmark.description,
        hackathon_description: benchmark.hackathon_description,
      });
      architectureBlueprint = result.output;
      await this.saveArtifact(artifactsDir, 'architecture-blueprint.json', JSON.stringify(result.output, null, 2));
      return { success: true, tokens: 0, artifacts: ['architecture-blueprint.json'] as string[] };
    });
    phases.push(archPhase.phase);
    totalTokens += archPhase.phase.token_count;
    if (!archPhase.phase.success) errors.push(archPhase.phase.error ?? 'Architecture failed');

    // Phase 3: Building
    const buildOutcome = await this.runBuildPhase(benchmark, architectureBlueprint, artifactsDir);
    phases.push(buildOutcome.phaseResult);
    totalTokens += buildOutcome.phaseResult.token_count;
    repository = buildOutcome.repository;
    if (!buildOutcome.phaseResult.success) errors.push(buildOutcome.phaseResult.error ?? 'Building failed');

    // Phase 4: Materialization
    const materializeFn = async (repo: Repository): Promise<boolean> => {
      const materializer = new DefaultRepositoryMaterializer();
      const workspacePath = path.join(artifactsDir, 'workspace');
      const genRepo: GeneratedRepository = { ...repo, build_results: [] };
      const result = await materializer.materialize(genRepo, workspacePath);
      const validation = this.validator.validate(genRepo);
      await this.saveArtifact(artifactsDir, 'materialization-result.json', JSON.stringify(result, null, 2));
      await this.saveArtifact(artifactsDir, 'validation-report.json', JSON.stringify(validation, null, 2));
      return result.success && validation.valid;
    };

    const materializeOk = repository ? await materializeFn(repository) : false;
    phases.push({
      phase: 'materialization',
      success: materializeOk,
      duration_ms: 0,
      error: materializeOk ? null : 'Materialization failed',
      token_count: 0,
      artifacts: ['materialization-result.json', 'validation-report.json'],
    });
    if (!materializeOk) errors.push('Materialization failed');

    // Adversarial mutation phase (only when adversarialMode is enabled)
    if (this.config.adversarialMode && repository) {
      const repoBefore = repository;
      const mutationPhase = await this.runPhase('building', async () => {
        originalRepository = createRepository(
          repoBefore.project_name,
          repoBefore.modules,
          repoBefore.blueprint_version,
        );
        await this.saveArtifact(
          artifactsDir,
          'pre-mutation-repository.json',
          JSON.stringify(originalRepository, null, 2),
        );

        if (this.config.sharedMutationState) {
          repository = this.config.sharedMutationState.mutatedRepository;
          mutationLog = this.config.sharedMutationState.mutations;
          for (const [mType, stat] of Object.entries(this.config.sharedMutationState.perTypeStats)) {
            if (!perTypeStats[mType]) perTypeStats[mType] = { applied: 0, detected: 0, repaired: 0 };
            perTypeStats[mType]!.applied += stat.applied;
          }
          mutationMetrics = { ...mutationMetrics, mutations_applied: this.config.sharedMutationState.mutations.length };
        } else {
          const mutationSeed = this.masterSeed + this.runCounter * 1000;
          const result: MutationResult = applyMutations(
            repoBefore,
            this.config.mutationCount,
            mutationSeed,
            this.config.difficultyController,
          );
          repository = result.mutatedRepository;
          mutationLog = result.mutations;
          mutationMetrics = { ...mutationMetrics, mutations_applied: result.mutations.length };
          for (const m of result.mutations) {
            const t = m.type;
            if (!perTypeStats[t]) perTypeStats[t] = { applied: 0, detected: 0, repaired: 0 };
            perTypeStats[t]!.applied++;
          }
        }

        await this.saveArtifact(artifactsDir, `mutations-applied.json`, JSON.stringify(mutationLog, null, 2));
        await this.saveArtifact(artifactsDir, 'mutated-repository.json', JSON.stringify(repository, null, 2));

        const mutationDesc = mutationLog.map((m) => `[${m.severity}] ${m.description}`).join('; ');
        console.log(`  Adversarial: applied ${mutationLog.length} mutation(s) Ã¢â‚¬â€  ${mutationDesc}`);
        return {
          success: true,
          tokens: 0,
          artifacts: ['mutations-applied.json', 'mutated-repository.json'] as string[],
        };
      });
      phases.push(mutationPhase.phase);
    }

    // Repair loop: verify Ã¢â€ â€™ repair Ã¢â€ â€™ re-verify until pass or attempts exhausted
    const repairLimit = this.config.repairLimit ?? 2;

    const loopResult = await this.runVerificationLoop(
      repository,
      architectureBlueprint,
      benchmark,
      artifactsDir,
      phases,
      repairLimit,
      errors,
      perTypeStats,
    );

    repository = loopResult.repository;
    lastVerificationResult = loopResult.verificationResult;
    buildSuccess = loopResult.buildSuccess;
    repairIterations = loopResult.repairIterations;

    // Record final repair phase in phases list
    if (this.repairHistory.length > 0) {
      phases.push({
        phase: 'repair',
        success: true,
        duration_ms: 0,
        error: null,
        token_count: 0,
        artifacts: this.repairHistory.map((_, i) => `generated-repository-v${i + 1}.json`),
      });
    } else {
      phases.push({
        phase: 'repair',
        success: true,
        duration_ms: 0,
        error: null,
        token_count: 0,
        artifacts: [] as string[],
      });
    }

    // Phase 6: Testing (runs only after verification passes)
    if (loopResult.verificationPassed && this.config.testAgent && repository && architectureBlueprint) {
      const testOutcome = await this.runTestingPhase(repository, architectureBlueprint, artifactsDir);
      phases.push(testOutcome.phaseResult);
      totalTokens += testOutcome.phaseResult.token_count;
      lastTestResult = testOutcome.testResult;
      testSuccess = testOutcome.testSuccess;
      if (!testOutcome.phaseResult.success) {
        errors.push(`Testing failed: ${testOutcome.errorMessages.join('; ') ?? 'unknown'}`);
      }
    } else if (loopResult.verificationPassed) {
      phases.push({
        phase: 'testing',
        success: true,
        duration_ms: 0,
        error: null,
        token_count: 0,
        artifacts: [] as string[],
      });
    }

    // Phase 7: Judging (runs only after verification passes)
    if (loopResult.verificationPassed && this.config.judgePanel && repository && architectureBlueprint) {
      const judgeOutcome = await this.runJudgingPhase(
        repository,
        architectureBlueprint,
        benchmark,
        artifactsDir,
        loopResult.verificationResult,
        lastTestResult,
        mutationMetrics,
        this.repairHistory,
      );
      phases.push(judgeOutcome.phaseResult);
      totalTokens += judgeOutcome.phaseResult.token_count;
      lastJudgeResult = judgeOutcome.judgeResult;
      judgeScore = judgeOutcome.judgeScore;
      judgeVerdict = judgeOutcome.judgeVerdict;
      if (!judgeOutcome.phaseResult.success) {
        errors.push(
          `Judge score ${judgeOutcome.judgeScore ?? 0}% below threshold ${benchmark.rubric.passing_threshold}%`,
        );
      }
    } else if (loopResult.verificationPassed) {
      phases.push({
        phase: 'judging',
        success: true,
        duration_ms: 0,
        error: null,
        token_count: 0,
        artifacts: [] as string[],
      });
    }

    // Compute mutation metrics from verification results
    if (this.config.adversarialMode && loopResult.verificationResult) {
      // Compute per-mutation-type repaired counts from post-repair verification
      const postRepairTypeCounts = this.collectMutationTypeCounts(loopResult.verificationResult.errors);
      for (const [mType, stat] of Object.entries(perTypeStats)) {
        const remaining = postRepairTypeCounts[mType] ?? 0;
        stat.repaired = Math.max(0, stat.detected - remaining);
      }

      const mutationAwareErrors = loopResult.verificationResult.errors.filter(
        (e) =>
          e.category === 'invalid_schema' ||
          e.category === 'broken_module_consistency' ||
          e.category === 'content_corruption' ||
          e.category === 'missing_file' ||
          e.category === 'empty_file',
      );
      mutationMetrics = {
        ...mutationMetrics,
        mutations_detected: mutationAwareErrors.length,
        mutations_repaired: loopResult.verificationPassed
          ? mutationMetrics.mutations_applied
          : Math.max(0, mutationMetrics.mutations_applied - mutationAwareErrors.length),
        detection_rate:
          mutationMetrics.mutations_applied > 0 ? mutationAwareErrors.length / mutationMetrics.mutations_applied : 0,
        survived_mutation: loopResult.verificationPassed && mutationMetrics.mutations_applied > 0,
      };
      mutationMetrics.repair_success_rate =
        mutationMetrics.mutations_applied > 0
          ? mutationMetrics.mutations_repaired / mutationMetrics.mutations_applied
          : 0;
    }

    // Compute robustness score using EvaluationOrchestrator (single source of truth)
    let finalResult: FinalEvaluationResult | null = null;
    if (this.config.adversarialMode) {
      const leaderboardRank = 0;
      finalResult = this.orchestrator.evaluate({
        verificationPassed: loopResult.verificationPassed,
        verificationErrors: loopResult.verificationResult?.errors ?? [],
        testResult: lastTestResult,
        mutationMetrics,
        perTypeStats,
        repairHistory: this.repairHistory,
        passingThreshold: benchmark.rubric.passing_threshold,
        leaderboardRank,
      });
    }
    const robustnessScore = finalResult?.robustnessScore ?? 0;

    // Post-run adaptive updates: difficulty controller, memory buffer, curriculum
    let bdi = 50;
    let curriculumState = 'balanced';
    let globalDifficulty = 0.5;

    if (this.config.difficultyController && this.config.adversarialMode) {
      this.config.difficultyController.updateAfterRun(perTypeStats);

      globalDifficulty = this.config.difficultyController.getGlobalAverageDifficulty();

      if (this.config.memoryBuffer) {
        if (this.config.curriculum) {
          const decision = this.config.curriculum.classify();
          bdi = decision.bdi;
          curriculumState = decision.state;
        }

        this.config.memoryBuffer.addRecord({
          detection_rate: mutationMetrics.detection_rate,
          repair_success_rate: mutationMetrics.repair_success_rate,
          robustness_score: robustnessScore,
          per_mutation_type_stats: perTypeStats,
          bdi,
          curriculum_state: curriculumState,
          global_difficulty: globalDifficulty,
          timestamp: deterministicNow(this.masterSeed + this.runCounter),
        });
      }
    }

    // Final pass/fail
    const finalVerificationOk = loopResult.verificationResult ? loopResult.verificationResult.passed : true;
    const finalJudgeOk = lastJudgeResult ? lastJudgeResult.passed_threshold : true;
    const allPhasesOk = phases.every((p) => p.success);
    const survivedMutation = this.config.adversarialMode ? mutationMetrics.survived_mutation : true;
    const overallSuccess = survivedMutation && finalVerificationOk && allPhasesOk && finalJudgeOk;

    const completedAt = deterministicNow(this.masterSeed + this.runCounter + 1);
    const totalDuration = Date.now() - startTime;

    const result: BenchmarkRunResult = {
      agent_id: this.config.agentId ?? '',
      benchmark_id: benchmark.id,
      benchmark_name: benchmark.name,
      category: benchmark.category,
      run_id: runId,
      started_at: startedAt,
      completed_at: completedAt,
      total_duration_ms: totalDuration,
      phases,
      overall_success: overallSuccess,
      judge_score: judgeScore,
      judge_verdict: judgeVerdict,
      build_success: buildSuccess,
      test_success: testSuccess,
      total_tokens: totalTokens,
      total_cost: 0, // Not computed — provider pricing varies
      repair_iterations: repairIterations,
      repair_strategies_used: loopResult.repairStrategies ?? [],
      per_mutation_type_stats: perTypeStats,
      benchmark_difficulty_index: bdi,
      curriculum_state: curriculumState,
      global_difficulty: globalDifficulty,
      errors,
      artifacts_dir: artifactsDir,
      adversarial_mode: this.config.adversarialMode ?? false,
      mutations_applied: mutationMetrics.mutations_applied,
      mutations_detected: mutationMetrics.mutations_detected,
      mutations_repaired: mutationMetrics.mutations_repaired,
      detection_rate: mutationMetrics.detection_rate,
      repair_success_rate: mutationMetrics.repair_success_rate,
      survived_mutation: mutationMetrics.survived_mutation,
      robustness_score: robustnessScore,
    };

    // Build experiment snapshot for reproducibility
    if (originalRepository) {
      try {
        const snapshot: ExperimentSnapshot = new ExperimentSnapshotBuilder()
          .setMasterSeed(this.masterSeed)
          .setInitialRepository(freezeRepository(originalRepository))
          .setMutationSequence(freezeMutationSequence(mutationLog))
          .setPhaseResults(phases)
          .setFinalResults(
            finalResult ?? {
              robustnessScore: 0,
              repairEfficiency: 0,
              mutationSurvivalRate: 0,
              detectionAccuracy: 0,
              leaderboardRank: 0,
              correctnessScore: 0,
              mutationRecoveryRate: 0,
              perMutationTypeMetrics: [],
              aggregateMutationMetrics: mutationMetrics,
              canonicalScore: 0,
              verdict: 'fail',
              reasoning: 'No adversarial evaluation',
            },
          )
          .setVersions({
            protocolVersion: '1.0.0',
            mutationEngineVersion: '1.0.0',
            judgeVersion: '1.0.0',
            repairEngineVersion: '1.0.0',
          })
          .build();
        await this.saveArtifact(artifactsDir, 'experiment-snapshot.json', JSON.stringify(snapshot, null, 2));
      } catch (snapErr) {
        errors.push(`Snapshot build failed: ${(snapErr as Error).message}`);
      }
    }

    const parsed = BenchmarkRunResultSchema.parse(result);
    await this.saveArtifact(artifactsDir, 'benchmark-run-result.json', JSON.stringify(parsed, null, 2));
    return parsed;
  }

  private groupErrorsByModule(errors: VerificationError[]): Map<string, VerificationError[]> {
    const grouped = new Map<string, VerificationError[]>();
    for (const err of errors) {
      const moduleName = err.module ?? 'unknown';
      if (!grouped.has(moduleName)) grouped.set(moduleName, []);
      grouped.get(moduleName)!.push(err);
    }
    return grouped;
  }

  private separateFileFromModuleErrors(errors: VerificationError[]): {
    fileErrors: Map<string, VerificationError[]>;
    moduleLevelErrors: VerificationError[];
  } {
    const fileErrors = new Map<string, VerificationError[]>();
    const moduleLevelErrors: VerificationError[] = [];

    for (const err of errors) {
      const isModuleLevel =
        err.category === 'structural' ||
        err.category === 'invalid_schema' ||
        err.category === 'inconsistency' ||
        err.category === 'broken_module_consistency' ||
        (err.category === 'missing_file' && !err.file);
      if (err.file) {
        if (!fileErrors.has(err.file)) fileErrors.set(err.file, []);
        fileErrors.get(err.file)!.push(err);
      } else if (isModuleLevel) {
        moduleLevelErrors.push(err);
      } else {
        moduleLevelErrors.push(err);
      }
    }

    return { fileErrors, moduleLevelErrors };
  }

  private collectMutationTypeCounts(errors: VerificationError[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const err of errors) {
      if (err.detectedMutationType) {
        if (!counts[err.detectedMutationType]) counts[err.detectedMutationType] = 0;
        counts[err.detectedMutationType]!++;
      }
    }
    return counts;
  }

  private async repairModules(
    repo: Repository,
    failedTypes: Module['type'][],
    blueprint: ArchitectureBlueprint,
    artifactsDir: string,
    attemptNumber: number,
    verificationErrors: VerificationError[],
  ): Promise<{
    repository: Repository;
    regenerated: { type: Module['type']; module: Module }[];
    patchedModules: { type: Module['type']; module: Module; patchedFiles: string[] }[];
    diffs: ModuleDiff[];
    strategy: RepairStrategy;
  }> {
    const patches: { type: Module['type']; module: Module }[] = [];
    const patchedModules: { type: Module['type']; module: Module; patchedFiles: string[] }[] = [];
    const diffs: ModuleDiff[] = [];
    const codeRepair = this.config.codeRepairProvider ?? new DefaultCodeRepairProvider();
    let overallStrategy: RepairStrategy = 'no-op failure';

    const groupedByMod = this.groupErrorsByModule(verificationErrors);

    for (const type of failedTypes) {
      const module = repo.modules.find((m) => m.type === type);
      if (!module) continue;

      const moduleErrors = groupedByMod.get(module.name) ?? [];
      const { fileErrors, moduleLevelErrors } = this.separateFileFromModuleErrors(moduleErrors);

      if (moduleLevelErrors.length > 0) {
        // Module-level corruption Ã¢â‚¬â€  regenerate full module
        const genModule: GeneratedModule = await this.generateModuleForType(type, blueprint);
        const newModule: Module = genModule;
        const oldModule = repo.modules.find((m) => m.type === type);
        if (oldModule) {
          diffs.push(computeModuleDiff(oldModule, newModule));
        }
patches.push({ type, module: newModule });
        overallStrategy = 'module regeneration';
      } else if (fileErrors.size > 0) {
        // File-level errors only — try targeted repair
        const moduleReport: ModuleErrorReport = { errors: moduleErrors, fileErrors, moduleLevelErrors: [] };

        const repairResult = await codeRepair.repairModule(module, moduleReport);

        if (repairResult.strategy === 'file-level patch') {
          const oldModule = repo.modules.find((m) => m.type === type);
          if (oldModule) {
            diffs.push(computeModuleDiff(oldModule, repairResult.module));
          }
          patches.push({ type, module: repairResult.module });
          patchedModules.push({ type, module: repairResult.module, patchedFiles: repairResult.patchedFiles });
          overallStrategy = 'file-level patch';
        } else {
          // Fall back to full module regeneration
          const genModule: GeneratedModule = await this.generateModuleForType(type, blueprint);
          const newModule: Module = genModule;
          const oldModule = repo.modules.find((m) => m.type === type);
          if (oldModule) {
            diffs.push(computeModuleDiff(oldModule, newModule));
          }
          patches.push({ type, module: newModule });
          overallStrategy = 'module regeneration';
        }
      }
    }

    if (patches.length === 0 && patchedModules.length === 0) {
      // No patches Ã¢â‚¬â€  fall back to full regeneration of all failed types
      overallStrategy = 'full rollback';
      for (const type of failedTypes) {
        const genModule: GeneratedModule = await this.generateModuleForType(type, blueprint);
        const newModule: Module = genModule;
        const oldModule = repo.modules.find((m) => m.type === type);
        if (oldModule) {
          diffs.push(computeModuleDiff(oldModule, newModule));
        }
        patches.push({ type, module: newModule });
      }
    }

    const updatedRepo = patchModules(repo, [
      ...patches,
      ...patchedModules.map((p) => ({ type: p.type, module: p.module })),
    ]);
    await this.saveArtifact(
      artifactsDir,
      `generated-repository-v${attemptNumber}.json`,
      JSON.stringify(updatedRepo, null, 2),
    );

    return { repository: updatedRepo, regenerated: patches, patchedModules, diffs, strategy: overallStrategy };
  }

  private async generateModuleForType(
    type: Module['type'],
    blueprint: ArchitectureBlueprint,
  ): Promise<GeneratedModule> {
    switch (type) {
      case 'frontend':
        return this.config.builderProvider.generateFrontend(blueprint);
      case 'backend':
        return this.config.builderProvider.generateBackend(blueprint);
      case 'database':
        return this.config.builderProvider.generateDatabase(blueprint);
      case 'config':
        return this.config.builderProvider.generateConfig(blueprint);
      case 'docs':
        return this.config.builderProvider.generateDocumentation(blueprint);
      case 'tests':
        return this.config.builderProvider.generateTests(blueprint);
    }
  }

  private collectFailedModuleTypes(verificationResult: VerificationResult): Module['type'][] {
    const types = new Set<Module['type']>();
    for (const error of verificationResult.errors) {
      if (error.module) {
        const validTypes: Module['type'][] = ['frontend', 'backend', 'database', 'config', 'docs', 'tests'];
        const matched = validTypes.find((t) => error.module === t);
        if (matched) {
          types.add(matched);
        }
      }
    }
    // Also check module-level errors that don't have module field
    for (const error of verificationResult.errors) {
      if (!error.module && (error.category === 'structural' || error.category === 'broken_module_consistency')) {
        types.add('frontend');
        types.add('backend');
        types.add('database');
      }
    }
    if (types.size === 0) {
      // If no specific modules, regenerate all major modules
      types.add('frontend');
      types.add('backend');
      types.add('database');
    }
    return [...types];
  }

  private async runVerificationLoop(
    initialRepo: Repository | null,
    blueprint: ArchitectureBlueprint | null,
    benchmark: HackathonBenchmarkDefinition,
    artifactsDir: string,
    phases: PhaseResult[],
    repairLimit: number,
    errors: string[],
    perTypeStats: Record<string, { applied: number; detected: number; repaired: number }>,
  ): Promise<{
    verificationPassed: boolean;
    verificationResult: VerificationResult | null;
    repository: Repository | null;
    buildSuccess: boolean;
    repairIterations: number;
    repairStrategies: string[];
  }> {
    let repository = initialRepo;
    let verificationResult: VerificationResult | null = null;
    let buildSuccess = false;
    let repairIterations = 0;
    const repairStrategies: string[] = [];

    for (let attempt = 0; attempt <= repairLimit; attempt++) {
      if (this.config.buildVerifier && blueprint && repository) {
        const verifResult = this.config.buildVerifier.verify({
          repository: { ...repository, build_results: [] } as GeneratedRepository,
          blueprint,
          benchmark,
        });
        verificationResult = verifResult;
        buildSuccess = verifResult.passed;

        await this.saveArtifact(
          artifactsDir,
          `build-verification-v${attempt}.json`,
          JSON.stringify(verifResult, null, 2),
        );

        if (this.isFirstPass(phases, 'build_verification', attempt)) {
          phases.push({
            phase: 'build_verification',
            success: verifResult.passed,
            duration_ms: 0,
            error: verifResult.passed ? null : verifResult.summary,
            token_count: 0,
            artifacts: [`build-verification-v${attempt}.json`],
          });
        }

        // Collect per-mutation-type detected counts from verification errors
        const errorTypeCounts = this.collectMutationTypeCounts(verifResult.errors);
        for (const [mType, count] of Object.entries(errorTypeCounts)) {
          if (!perTypeStats[mType]) perTypeStats[mType] = { applied: 0, detected: 0, repaired: 0 };
          perTypeStats[mType]!.detected = Math.max(perTypeStats[mType]!.detected, count);
        }

        if (verifResult.passed) {
          return {
            verificationPassed: true,
            verificationResult,
            repository,
            buildSuccess,
            repairIterations,
            repairStrategies,
          };
        }

        if (attempt < repairLimit) {
          const failedModuleTypes = this.collectFailedModuleTypes(verifResult);
          if (failedModuleTypes.length === 0) {
            errors.push('Verification failed but no specific modules identified for repair');
            break;
          }

          const repaired = await this.repairModules(
            repository,
            failedModuleTypes,
            blueprint,
            artifactsDir,
            attempt + 1,
            verifResult.errors,
          );
          repository = repaired.repository;
          repairIterations = attempt + 1;
          repairStrategies.push(repaired.strategy);

          const record: RepairRecord = {
            attempt: attempt + 1,
            trigger_phase: 'build_verification',
            trigger_reason: verifResult.summary,
            modules_regenerated: repaired.regenerated.map((r) => r.type),
            modules_repaired: repaired.patchedModules.map((r) => r.type),
            files_repaired: repaired.patchedModules.flatMap((r) => r.patchedFiles),
            files_replaced:
              repaired.regenerated.reduce((s, r) => s + r.module.files.length, 0) +
              repaired.patchedModules.flatMap((r) => r.patchedFiles).length,
            diffs: repaired.diffs,
            strategy_used: repaired.strategy,
            success: true,
          };
          this.repairHistory.push(record);

          const diffLog = repaired.diffs
            .map(
              (d) =>
                `${d.type}: ${d.oldFileCount}Ã¢â€ â€™${d.newFileCount} files, ${d.oldLineCount}Ã¢â€ â€™${d.newLineCount} lines (added: ${d.addedFiles.length}, removed: ${d.removedFiles.length}, changed: ${d.changedFiles.length})`,
            )
            .join('; ');
          const strategyLabel =
            repaired.strategy === 'file-level patch'
              ? `file-patch [${record.files_repaired.join(', ')}]`
              : `regenerated [${record.modules_regenerated.join(', ')}]`;
          console.log(`  Repair attempt ${attempt + 1}: ${strategyLabel} Ã¢â‚¬â€  ${diffLog}`);

          const materializer = new DefaultRepositoryMaterializer();
          const workspacePath = path.join(artifactsDir, 'workspace');
          const genRepo: GeneratedRepository = { ...repository, build_results: [] };
          await materializer.materialize(genRepo, workspacePath);
        }
      } else if (this.isFirstPass(phases, 'build_verification', attempt)) {
        phases.push({
          phase: 'build_verification',
          success: true,
          duration_ms: 0,
          error: null,
          token_count: 0,
          artifacts: [] as string[],
        });
        return {
          verificationPassed: true,
          verificationResult: null,
          repository,
          buildSuccess: true,
          repairIterations: 0,
          repairStrategies: [],
        };
      }
    }

    return {
      verificationPassed: false,
      verificationResult,
      repository,
      buildSuccess,
      repairIterations,
      repairStrategies,
    };
  }

  private async runBuildPhase(
    benchmark: HackathonBenchmarkDefinition,
    blueprint: ArchitectureBlueprint | null,
    artifactsDir: string,
  ): Promise<{ phaseResult: PhaseResult; repository: Repository | null }> {
    const start = Date.now();
    try {
      if (!blueprint) throw new Error('No architecture blueprint available');
      const [fe, be, db, configModule, docs, testsMod] = await Promise.all([
        this.config.builderProvider.generateFrontend(blueprint),
        this.config.builderProvider.generateBackend(blueprint),
        this.config.builderProvider.generateDatabase(blueprint),
        this.config.builderProvider.generateConfig(blueprint),
        this.config.builderProvider.generateDocumentation(blueprint),
        this.config.builderProvider.generateTests(blueprint),
      ]);
      const modules: Module[] = [fe, be, db, configModule, docs, testsMod].filter((m) => m.files.length > 0);
      const repo = createRepository(benchmark.name, modules);
      await this.saveArtifact(artifactsDir, 'generated-repository.json', JSON.stringify(repo, null, 2));
      const duration = Date.now() - start;
      return {
        phaseResult: {
          phase: 'building',
          success: true,
          duration_ms: duration,
          error: null,
          token_count: 0,
          artifacts: ['generated-repository.json'],
        },
        repository: repo,
      };
    } catch (err) {
      const duration = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        phaseResult: {
          phase: 'building',
          success: false,
          duration_ms: duration,
          error: errorMsg,
          token_count: 0,
          artifacts: [],
        },
        repository: null,
      };
    }
  }

  private async runTestingPhase(
    repository: Repository,
    blueprint: ArchitectureBlueprint,
    artifactsDir: string,
  ): Promise<{
    phaseResult: PhaseResult;
    testResult: TestSuiteResult | null;
    testSuccess: boolean;
    errorMessages: string[];
  }> {
    let testResult: TestSuiteResult | null = null;
    const start = Date.now();

    try {
      const result = await this.config.testAgent!.run({
        repository: { ...repository, build_results: [] } as GeneratedRepository,
        blueprint,
      });
      testResult = result;

      await this.saveArtifact(artifactsDir, `test-results.json`, JSON.stringify(result, null, 2));

      const duration = Date.now() - start;
      return {
        phaseResult: {
          phase: 'testing',
          success: result.passed,
          duration_ms: duration,
          error: result.passed ? null : result.summary,
          token_count: 0,
          artifacts: ['test-results.json'],
        },
        testResult: result,
        testSuccess: result.passed,
        errorMessages: result.passed ? [] : result.errors,
      };
    } catch (err) {
      const duration = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        phaseResult: {
          phase: 'testing',
          success: false,
          duration_ms: duration,
          error: errorMsg,
          token_count: 0,
          artifacts: [],
        },
        testResult: null,
        testSuccess: false,
        errorMessages: [errorMsg],
      };
    }
  }

  private async runJudgingPhase(
    repository: Repository,
    blueprint: ArchitectureBlueprint,
    benchmark: HackathonBenchmarkDefinition,
    artifactsDir: string,
    verificationResult: VerificationResult | null,
    testResult: TestSuiteResult | null,
    mutMetrics?: MutationMetrics,
    repairHistory?: RepairRecord[],
  ): Promise<{
    phaseResult: PhaseResult;
    judgeResult: BenchmarkJudgeResult | null;
    judgeScore: number | null;
    judgeVerdict: string | null;
  }> {
    let judgeResult: BenchmarkJudgeResult | null = null;
    const start = Date.now();

    try {
      const verifErrors: string[] = verificationResult ? verificationResult.errors.map((e) => e.message) : [];
      const testResults: { passed: number; failed: number; total: number; errors: string[] } | undefined = testResult
        ? {
            passed: testResult.passed_count,
            failed: testResult.failed_count,
            total: testResult.total,
            errors: testResult.errors,
          }
        : undefined;

      const judgeInput: Parameters<BenchmarkJudge['evaluate']>[0] = {
        blueprint,
        repository: { ...repository, build_results: [] } as GeneratedRepository,
        benchmark,
        verificationErrors: verifErrors,
        testResults,
      };
      if (mutMetrics) {
        judgeInput.mutationMetrics = mutMetrics;
      }
      if (repairHistory && repairHistory.length > 0) {
        judgeInput.repairHistory = repairHistory.map((r) => ({
          strategy: r.strategy_used,
          modulesRegenerated: r.modules_regenerated.length,
          filesRepaired: r.files_repaired.length,
          iterationsUsed: r.attempt,
          success: r.success,
        }));
      }
      const result = await this.config.judgePanel!.evaluate(judgeInput);
      judgeResult = result;

      await this.saveArtifact(artifactsDir, `judge-report.json`, JSON.stringify(result, null, 2));

      const duration = Date.now() - start;
      return {
        phaseResult: {
          phase: 'judging',
          success: result.passed_threshold,
          duration_ms: duration,
          error: result.passed_threshold
            ? null
            : `Score ${result.percentage}% below threshold ${benchmark.rubric.passing_threshold}%`,
          token_count: 0,
          artifacts: ['judge-report.json'],
        },
        judgeResult: result,
        judgeScore: result.percentage,
        judgeVerdict: result.verdict,
      };
    } catch (err) {
      const duration = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        phaseResult: {
          phase: 'judging',
          success: false,
          duration_ms: duration,
          error: errorMsg,
          token_count: 0,
          artifacts: [],
        },
        judgeResult: null,
        judgeScore: null,
        judgeVerdict: null,
      };
    }
  }

  private isFirstPass(phases: PhaseResult[], phaseName: string, attempt: number): boolean {
    if (attempt === 0) return true;
    return !phases.some((p) => p.phase === phaseName);
  }

  private async runPhase(
    phaseName: BenchmarkRunResult['phases'][number]['phase'],
    fn: () => Promise<{ success: boolean; tokens?: number; artifacts?: string[]; [key: string]: unknown }>,
  ): Promise<{ phase: PhaseResult; [key: string]: unknown }> {
    const start = Date.now();
    try {
      const output = await fn();
      const duration = Date.now() - start;
      return {
        phase: {
          phase: phaseName,
          success: output.success as boolean,
          duration_ms: duration,
          error: null,
          token_count: (output.tokens as number) ?? 0,
          artifacts: (output.artifacts as string[]) ?? [],
        },
        ...output,
      };
    } catch (err) {
      const duration = Date.now() - start;
      const errorMsg = err instanceof Error ? err.message : String(err);
      return {
        phase: {
          phase: phaseName,
          success: false,
          duration_ms: duration,
          error: errorMsg,
          token_count: 0,
          artifacts: [],
        },
        success: false,
      };
    }
  }

  private async saveArtifact(dir: string, name: string, content: string): Promise<void> {
    try {
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(path.join(dir, name), content, 'utf-8');
    } catch {
      // best effort
    }
  }
}
