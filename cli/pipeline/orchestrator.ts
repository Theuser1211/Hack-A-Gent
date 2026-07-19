import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { PipelineBenchmarker } from './benchmarking.js';
import { CompetitionIntelligence } from './competition-intelligence.js';
import { HackathonOptimizer } from './optimizer.js';
import { PipelineReportGenerator } from './reporting.js';
import { ProjectScaffolder } from './scaffolding.js';
import { SelfReviewScorer } from './self-review.js';
import { WinningStrategyGenerator } from './strategy.js';
import type { CompetitionAnalysis, WinningStrategy, ReviewFeedback, ImprovementAction, FinalReport, QualityCheck, GeneratedFile, BenchmarkComparison, PipelineStage, PipelineContext } from './types.js';

export class HackathonPipelineOrchestrator {
  private intelligence: CompetitionIntelligence;
  private strategyGen: WinningStrategyGenerator;
  private scorer: SelfReviewScorer;
  private reporter: PipelineReportGenerator;
  private context: PipelineContext;

  constructor(seed = 42) {
    this.intelligence = new CompetitionIntelligence();
    this.strategyGen = new WinningStrategyGenerator();
    this.scorer = new SelfReviewScorer();
    this.reporter = new PipelineReportGenerator(this.scorer);
    this.context = this.createContext(seed);
  }

  private createContext(seed: number): PipelineContext {
    return {
      analysis: null,
      strategy: null,
      executionResult: null,
      reviewFeedback: null,
      feedbackConverged: false,
      feedbackIterations: 0,
      qualityChecks: null,
      report: null,
      stages: {},
      seed,
      startedAt: Date.now(),
    };
  }

  getContext(): PipelineContext {
    return this.context;
  }

  private recordStage(name: string, status: PipelineStage['status'], error: string | null = null, result: unknown = null): void {
    const existing = this.context.stages[name];
    this.context.stages[name] = {
      name,
      status,
      startedAt: existing?.startedAt ?? Date.now(),
      completedAt: status === 'completed' || status === 'failed' ? Date.now() : null,
      durationMs: status === 'completed' || status === 'failed' ? Date.now() - (existing?.startedAt ?? Date.now()) : null,
      error,
      result,
    };
  }

  /**
   * Initialize the orchestrator with pre-computed analysis and strategy.
   * This avoids duplicating work that was already done externally.
   */
  init(analysis: CompetitionAnalysis, strategy: WinningStrategy): void {
    this.recordStage('competition-intelligence', 'completed', null, {
      challenge: analysis.challenge.title,
      criteriaCount: analysis.judgingCriteria.length,
      sponsorCount: analysis.sponsorAPIs.length,
    });
    this.recordStage('winning-strategy', 'completed', null, {
      projectName: strategy.projectName,
      estimatedScore: strategy.estimatedJudgeScore,
      apiCount: strategy.prioritizedAPIs.length,
      differentiators: strategy.differentiators.length,
    });
    this.context.analysis = analysis;
    this.context.strategy = strategy;
  }

  /**
   * Stage 1 & 2: Compute analysis and strategy from raw input.
   */
  runIntelligencePhase(devpostResult: Parameters<CompetitionIntelligence['analyze']>[0]): { analysis: CompetitionAnalysis; strategy: WinningStrategy } {
    const analysis = this.intelligence.analyze(devpostResult);
    this.context.analysis = analysis;
    this.recordStage('competition-intelligence', 'completed', null, {
      challenge: analysis.challenge.title,
      criteriaCount: analysis.judgingCriteria.length,
      sponsorCount: analysis.sponsorAPIs.length,
    });

    const strategy = this.strategyGen.generate(analysis);
    this.context.strategy = strategy;
    this.recordStage('winning-strategy', 'completed', null, {
      projectName: strategy.projectName,
      estimatedScore: strategy.estimatedJudgeScore,
      apiCount: strategy.prioritizedAPIs.length,
      differentiators: strategy.differentiators.length,
    });

    return { analysis, strategy };
  }

  /**
   * Stage 3: Record Execution Results — ingest execution output for self-review
   */
  recordExecution(params: {
    features: string[];
    errors: string[];
    deployUrl: string | null;
    taskCount: number;
    buildSuccess: boolean;
    testPassRate: number;
    durationMs: number;
  }): void {
    this.recordStage('execution', 'completed', null, {
      featureCount: params.features.length,
      errorCount: params.errors.length,
      hasDeploy: !!params.deployUrl,
    });
    this.context.executionResult = {
      ...params,
      criteriaCount: this.context.analysis?.judgingCriteria.length ?? 4,
      featureCount: params.features.length,
      errorCount: params.errors.length,
    };
  }

  /**
   * Stage 4: Self-Review — score + improvement feedback loop
   */
  review(): ReviewFeedback {
    this.recordStage('self-review', 'running');
    try {
      const exec = this.context.executionResult;
      if (!exec) {
        throw new Error('Cannot review: no execution results recorded');
      }

      const { finalFeedback, converged, iterations } = this.scorer.runImprovementLoop({
        hasUI: exec.features.some(f => /ui|page|component|app|frontend/i.test(f)),
        hasLiveDeploy: !!exec.deployUrl,
        hasWowMoment: exec.features.some(f => /wow|ai|smart|interactive|realtime|animation/i.test(f)),
        buildSuccess: exec.buildSuccess,
        deploySuccess: !!exec.deployUrl,
        testPassRate: exec.testPassRate,
        crashFree: exec.errorCount === 0,
        taskCompleteness: exec.taskCount > 0 ? Math.min(1, exec.featureCount / exec.taskCount) : 0.5,
        featureCount: exec.featureCount,
        errorCount: exec.errorCount,
        criteriaCount: exec.criteriaCount,
      }, 3);

      this.context.reviewFeedback = finalFeedback;
      this.context.feedbackConverged = converged;
      this.context.feedbackIterations = iterations;
      this.recordStage('self-review', 'completed', null, {
        overallScore: finalFeedback.score.overall,
        weaknesses: finalFeedback.weaknesses.length,
        improvements: finalFeedback.improvementActions.length,
        converged,
        iterations,
});
      return finalFeedback;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('self-review', 'failed', msg);
      throw new Error(`Self-review failed: ${msg}`);
    }
  }

  /**
   * Stage 5: Optimization — run optimizer pass on the review feedback
   */
  optimize(): ImprovementAction[] {
      this.recordStage('optimization', 'running');
      try {
        if (!this.context.reviewFeedback) {
          this.review();
        }
        const optimizer = new HackathonOptimizer();
        const optimizations = optimizer.optimize(
          this.context.reviewFeedback!,
          this.context.analysis ?? undefined,
        );
        this.recordStage('optimization', 'completed', null, {
          optimizations: optimizations.length,
          criticalCount: optimizations.filter(a => a.priority === 'critical').length,
        });
        return optimizations;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordStage('optimization', 'failed', msg);
        throw err;
      }
    }

    /**
     * Stage 6: Project Quality — scaffolder checks and enhancements
     */
    scaffoldQuality(): QualityCheck[] {
      this.recordStage('project-quality', 'running');
      try {
        const scaffolder = new ProjectScaffolder();
        const checks = scaffolder.check({
          analysis: this.context.analysis ?? undefined,
          strategy: this.context.strategy ?? undefined,
          features: this.context.executionResult?.features ?? ['Project scaffold'],
          errors: this.context.executionResult?.errors ?? [],
        });
        this.context.qualityChecks = checks;
        this.recordStage('project-quality', 'completed', null, {
          checks: checks.length,
          passed: checks.filter(c => c.passed).length,
          failed: checks.filter(c => !c.passed).length,
        });
        return checks;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordStage('project-quality', 'failed', msg);
        throw err;
      }
    }

  /**
   * Stage 7: Generate missing scaffolding files into the project directory.
   * Generates README.md, LICENSE, .gitignore, .env.example, Dockerfile, CI/CD
   * for any items that failed the quality check and don't exist on disk.
   */
  generateScaffolding(projectDir: string, force = false): GeneratedFile[] {
    this.recordStage('scaffold-generation', 'running');
    try {
      if (!this.context.qualityChecks) {
        this.scaffoldQuality();
      }
      const scaffolder = new ProjectScaffolder();
      const exec = this.context.executionResult ?? {
        features: ['Project scaffold', 'Core features', 'Deployment'],
        errors: [], deployUrl: null, taskCount: 0, buildSuccess: true, testPassRate: 0.8, criteriaCount: 4, featureCount: 3, errorCount: 0, durationMs: 0,
      };
      const generated = scaffolder.generate({
        projectDir,
        checks: this.context.qualityChecks ?? [],
        features: exec.features,
        techStack: this.context.strategy?.recommendedStack ?? ['React', 'Node.js'],
        projectName: this.context.strategy?.projectName ?? 'project',
        description: this.context.analysis?.challenge.title ?? undefined,
        deployUrl: exec.deployUrl,
        sponsorAPIs: this.context.analysis?.sponsorAPIs.map(a => a.name),
        force,
      });
      this.recordStage('scaffold-generation', 'completed', null, {
        generatedCount: generated.length,
        files: generated.map(g => g.file),
      });
      if (generated.length > 0) {
        this.scaffoldQuality();
      }
      return generated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('scaffold-generation', 'failed', msg);
      return [];
    }
  }

  /**
   * Stage 8: Run pipeline benchmarks — compare current run metrics
   * against the previous run's baseline to track improvement over time.
   */
  benchmark(dataDir: string): BenchmarkComparison[] {
    this.recordStage('benchmark', 'running');
    try {
      const exec = this.context.executionResult ?? {
        features: ['Project scaffold', 'Core features', 'Deployment'],
        errors: [], deployUrl: null, taskCount: 0, buildSuccess: true, testPassRate: 0.8, criteriaCount: 4, featureCount: 3, errorCount: 0, durationMs: 0,
      };
      const report = this.context.report;
      const analysis = this.context.analysis;

      const newMetrics: Record<string, unknown> = {
        promptSizeChars: exec.features.reduce((s, f) => s + f.length, 0) * 5,
        generationTimeMs: exec.durationMs,
        errorCount: exec.errorCount,
        judgeScore: report?.judgeScorePrediction ?? 0,
        criteriaAnalyzed: analysis?.judgingCriteria.length ?? exec.criteriaCount,
        improvementActions: report?.futureImprovements.length ?? 0,
      };

      const benchmarksDir = path.join(dataDir, 'benchmarks');
      if (!existsSync(benchmarksDir)) mkdirSync(benchmarksDir, { recursive: true });
      const benchFile = path.join(benchmarksDir, 'pipeline.json');

      let oldMetrics: Record<string, unknown> | null = null;
      if (existsSync(benchFile)) {
        oldMetrics = JSON.parse(readFileSync(benchFile, 'utf-8'));
      }

      const benchmarker = new PipelineBenchmarker();
      const comparisons = oldMetrics
        ? benchmarker.compare(oldMetrics, newMetrics)
        : [];

      writeFileSync(benchFile, JSON.stringify(newMetrics, null, 2), 'utf-8');

      this.recordStage('benchmark', 'completed', null, {
        isBaseline: !oldMetrics,
        comparisonsCount: comparisons.length,
      });
      return comparisons;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('benchmark', 'failed', msg);
      return [];
    }
  }

  /**
   * Stage 9: Generate Final Report
   */
  report(): FinalReport {
    this.recordStage('report', 'running');
    try {
      const exec = this.context.executionResult ?? {
        features: ['Project scaffold', 'Core features', 'Deployment'],
        errors: [],
        deployUrl: null,
        taskCount: 0,
        buildSuccess: true,
        testPassRate: 0.8,
        criteriaCount: 4,
        featureCount: 3,
        errorCount: 0,
        durationMs: 0,
      };

      const report = this.reporter.generate({
        analysis: this.context.analysis,
        strategy: this.context.strategy,
        features: exec.features,
        errors: exec.errors,
        deployUrl: exec.deployUrl,
        durationMs: exec.durationMs,
        reviewFeedback: this.context.reviewFeedback,
        qualityChecks: this.context.qualityChecks,
      });
      this.context.report = report;
      this.recordStage('report', 'completed', null, {
        challengeSummary: report.challengeSummary,
        judgeScore: report.judgeScorePrediction,
        featuresCount: report.generatedFeatures.length,
        weaknessesCount: report.knownWeaknesses.length,
      });
      return report;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('report', 'failed', msg);
      throw err;
    }
  }

  /**
   * Run the full pipeline end-to-end.
   */
  runFullPipeline(input: Parameters<CompetitionIntelligence['analyze']>[0]): PipelineContext {
    this.context = this.createContext(this.context.seed);
    this.runIntelligencePhase(input);
    return this.context;
  }

  /**
   * Complete the pipeline after execution results are available.
   */
  completePipeline(params: Parameters<HackathonPipelineOrchestrator['recordExecution']>[0]): FinalReport {
    this.recordExecution(params);
    this.review();
    this.optimize();
    this.scaffoldQuality();
    return this.report();
  }

  /**
   * Generate a markdown summary of the pipeline run.
   */
  summarizePipeline(): string {
    const ctx = this.context;
    const lines: string[] = [];
    lines.push('# Hackathon Pipeline Report');
    lines.push('');
    lines.push('## Pipeline Stages');
    lines.push('');
    lines.push('| Stage | Status | Duration | Details |');
    lines.push('|-------|--------|----------|---------|');
    for (const [name, stage] of Object.entries(ctx.stages)) {
      const icon = stage.status === 'completed' ? '✅' : stage.status === 'failed' ? '❌' : stage.status === 'running' ? '⏳' : '⏸️';
      const dur = stage.durationMs !== null ? `${(stage.durationMs / 1000).toFixed(1)}s` : '-';
      const details = stage.result ? JSON.stringify(stage.result).slice(0, 80) : stage.error ?? '-';
      lines.push(`| ${icon} ${name} | ${stage.status} | ${dur} | ${details} |`);
    }
    lines.push('');
    if (ctx.reviewFeedback) {
      lines.push('## Review Scores');
      lines.push('');
      lines.push('| Dimension | Score |');
      lines.push('|-----------|-------|');
      lines.push(`| Innovation | ${ctx.reviewFeedback.score.innovation}/100 |`);
      lines.push(`| Technical Depth | ${ctx.reviewFeedback.score.technicalDepth}/100 |`);
      lines.push(`| Feasibility | ${ctx.reviewFeedback.score.feasibility}/100 |`);
      lines.push(`| Presentation | ${ctx.reviewFeedback.score.presentation}/100 |`);
      lines.push(`| Completeness | ${ctx.reviewFeedback.score.completeness}/100 |`);
      lines.push(`| Maintainability | ${ctx.reviewFeedback.score.maintainability}/100 |`);
      lines.push(`| Judge Alignment | ${ctx.reviewFeedback.score.judgeAlignment}/100 |`);
      lines.push(`| **Overall** | **${ctx.reviewFeedback.score.overall}/100** |`);
      lines.push('');
      lines.push(`Converged: ${ctx.feedbackConverged ? 'Yes' : 'No'} | Iterations: ${ctx.feedbackIterations}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}
