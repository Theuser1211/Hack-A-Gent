import type { GeneratedRepository } from '../kernel/builders/builder-types.js';
import { ProductJudge, CodeJudge, UXJudge, HackathonJudge } from '../kernel/judge/judge-provider.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';

import type { HackathonBenchmarkDefinition } from './benchmark-types.js';

export interface RobustnessScore {
  correctness: number;
  repair_efficiency: number;
  mutation_recovery_rate: number;
  overall: number;
}

export interface BenchmarkJudgeResult {
  score: number;
  max_score: number;
  percentage: number;
  verdict: 'pass' | 'fail';
  passed_threshold: boolean;
  threshold: number;
  reasoning: string;
  details: JudgeDetail[];
  issues: string[];
  robustness_score?: RobustnessScore;
  repair_quality_score?: number;
}

export interface JudgeDetail {
  aspect: string;
  score: number;
  max: number;
  percentage: number;
  verdict: string;
  reasoning: string;
  issues: string[];
}

export interface MutationMetrics {
  mutations_applied: number;
  mutations_detected: number;
  mutations_repaired: number;
  detection_rate: number;
  repair_success_rate: number;
  survived_mutation: boolean;
}

export interface RepairHistoryEntry {
  strategy: string;
  modulesRegenerated: number;
  filesRepaired: number;
  iterationsUsed: number;
  success: boolean;
}

export interface BenchmarkJudgeInput {
  blueprint: ArchitectureBlueprint;
  repository: GeneratedRepository;
  benchmark: HackathonBenchmarkDefinition;
  verificationErrors?: string[];
  testResults?: { passed: number; failed: number; total: number; errors: string[] };
  mutationMetrics?: MutationMetrics;
  repairHistory?: RepairHistoryEntry[];
}

export class BenchmarkJudge {
  private readonly productJudge = new ProductJudge();
  private readonly codeJudge = new CodeJudge();
  private readonly uxJudge = new UXJudge();
  private readonly hackathonJudge = new HackathonJudge();

  async evaluate(input: BenchmarkJudgeInput): Promise<BenchmarkJudgeResult> {
    const details: JudgeDetail[] = [];
    const allIssues: string[] = [];

    const archReport = await this.productJudge.evaluateArchitecture(input.blueprint);
    details.push({
      aspect: 'architecture',
      score: archReport.score.total,
      max: archReport.score.max,
      percentage: archReport.score.percentage,
      verdict: archReport.verdict,
      reasoning: archReport.summary,
      issues: archReport.issues.map((i) => `${i.severity}: ${i.message}`),
    });
    allIssues.push(...archReport.issues.map((i) => `[architecture] ${i.severity}: ${i.message}`));

    const codeReport = await this.codeJudge.evaluateCode(input.repository);
    details.push({
      aspect: 'code_quality',
      score: codeReport.score.total,
      max: codeReport.score.max,
      percentage: codeReport.score.percentage,
      verdict: codeReport.verdict,
      reasoning: codeReport.summary,
      issues: codeReport.issues.map((i) => `${i.severity}: ${i.message}`),
    });
    allIssues.push(...codeReport.issues.map((i) => `[code] ${i.severity}: ${i.message}`));

    const uxReport = await this.uxJudge.evaluateUX(input.blueprint, input.repository);
    details.push({
      aspect: 'ux',
      score: uxReport.score.total,
      max: uxReport.score.max,
      percentage: uxReport.score.percentage,
      verdict: uxReport.verdict,
      reasoning: uxReport.summary,
      issues: uxReport.issues.map((i) => `${i.severity}: ${i.message}`),
    });
    allIssues.push(...uxReport.issues.map((i) => `[ux] ${i.severity}: ${i.message}`));

    const hackReport = await this.hackathonJudge.evaluateHackathon(input.blueprint, input.repository);
    details.push({
      aspect: 'hackathon',
      score: hackReport.score.total,
      max: hackReport.score.max,
      percentage: hackReport.score.percentage,
      verdict: hackReport.verdict,
      reasoning: hackReport.summary,
      issues: hackReport.issues.map((i) => `${i.severity}: ${i.message}`),
    });
    allIssues.push(...hackReport.issues.map((i) => `[hackathon] ${i.severity}: ${i.message}`));

    const criteriaScore = this.evaluateSuccessCriteria(input.benchmark, input.repository, input.blueprint);
    details.push({
      aspect: 'success_criteria',
      score: criteriaScore.score,
      max: criteriaScore.max,
      percentage: criteriaScore.percentage,
      verdict: criteriaScore.percentage >= 70 ? 'pass' : 'fail',
      reasoning: criteriaScore.summary,
      issues: criteriaScore.issues,
    });
    allIssues.push(...criteriaScore.issues.map((i) => `[criteria] ${i}`));

    if (input.verificationErrors && input.verificationErrors.length > 0) {
      details.push({
        aspect: 'verification',
        score: Math.max(0, 100 - input.verificationErrors.length * 20),
        max: 100,
        percentage: Math.max(0, 100 - input.verificationErrors.length * 20),
        verdict: input.verificationErrors.length === 0 ? 'pass' : 'fail',
        reasoning: `${input.verificationErrors.length} verification error(s) detected`,
        issues: input.verificationErrors,
      });
      allIssues.push(...input.verificationErrors.map((e) => `[verification] ${e}`));
    }

    if (input.testResults) {
      const testPct =
        input.testResults.total > 0 ? Math.round((input.testResults.passed / input.testResults.total) * 100) : 100;
      details.push({
        aspect: 'testing',
        score: input.testResults.passed,
        max: input.testResults.total || 1,
        percentage: testPct,
        verdict: input.testResults.failed === 0 ? 'pass' : 'fail',
        reasoning: `${input.testResults.passed}/${input.testResults.total} tests passed`,
        issues: input.testResults.errors,
      });
      if (input.testResults.failed > 0) {
        allIssues.push(`[testing] ${input.testResults.failed} test(s) failed`);
      }
    }

    const totalScore = details.reduce((s, d) => s + d.score, 0);
    const totalMax = details.reduce((s, d) => s + d.max, 0);
    const overallPct = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

    const threshold = input.benchmark.rubric.passing_threshold;
    const passedThreshold = overallPct >= threshold;

    const allDetails = details.map(
      (d) =>
        `${d.aspect}: ${d.score}/${d.max} (${d.percentage}%) Ã¢â‚¬â€ ${d.verdict}. ${d.reasoning}${d.issues.length > 0 ? ` Issues: ${d.issues.join('; ')}` : ''}`,
    );

    let robustnessScore: RobustnessScore | undefined;
    if (input.mutationMetrics) {
      const m = input.mutationMetrics;
      const unRepairedRatio =
        m.mutations_applied > 0 ? (m.mutations_applied - m.mutations_repaired) / m.mutations_applied : 0;
      const correctness =
        m.mutations_repaired > 0 || m.mutations_applied === 0
          ? overallPct
          : Math.round(overallPct * (1 - unRepairedRatio * 0.3));
      const repair_efficiency =
        m.mutations_applied > 0
          ? Math.round(
              100 *
                (m.mutations_detected / m.mutations_applied) *
                (m.mutations_repaired / Math.max(m.mutations_detected, 1)),
            )
          : 100;
      const mutation_recovery_rate =
        m.mutations_applied > 0 ? Math.round(100 * (m.mutations_repaired / m.mutations_applied)) : 100;
      const overall = Math.round((correctness + repair_efficiency + mutation_recovery_rate) / 3);

      robustnessScore = { correctness, repair_efficiency, mutation_recovery_rate, overall };

      details.push({
        aspect: 'robustness',
        score: overall,
        max: 100,
        percentage: overall,
        verdict: overall >= 50 ? 'pass' : 'fail',
        reasoning: `Robustness: correctness=${correctness}%, repair_efficiency=${repair_efficiency}%, mutation_recovery=${mutation_recovery_rate}% (applied=${m.mutations_applied}, detected=${m.mutations_detected}, repaired=${m.mutations_repaired})`,
        issues: [],
      });
    }

    // Compute repair quality score
    let repairQualityScore: number | undefined;
    if (input.repairHistory && input.repairHistory.length > 0) {
      const history = input.repairHistory;
      const totalRepairs = history.length;
      const fileLevelPatches = history.filter((r) => r.strategy === 'file-level patch').length;
      const successfulRepairs = history.filter((r) => r.success).length;

      // Minimality: proportion of file-level patches vs module-level regenerations
      const minimality = totalRepairs > 0 ? fileLevelPatches / totalRepairs : 1;

      // Correctness after repair: proportion of successful repair attempts
      const correctnessAfter = totalRepairs > 0 ? successfulRepairs / totalRepairs : 1;

      // Efficiency: fewer iterations is better (inverse of iterations used)
      const maxIterations = Math.max(...history.map((r) => r.iterationsUsed), 1);
      const efficiency = 1 / maxIterations;

      // Precision: file-level repairs / (file-level + module-level)
      const totalFileRepairs = history.reduce((s, r) => s + r.filesRepaired, 0);
      const totalModuleRegens = history.reduce((s, r) => s + r.modulesRegenerated, 0);
      const precision =
        totalFileRepairs + totalModuleRegens > 0 ? totalFileRepairs / (totalFileRepairs + totalModuleRegens) : 1;

      repairQualityScore = Math.round(
        (minimality * 0.3 + correctnessAfter * 0.3 + efficiency * 0.2 + precision * 0.2) * 100,
      );

      details.push({
        aspect: 'repair_quality',
        score: repairQualityScore,
        max: 100,
        percentage: repairQualityScore,
        verdict: repairQualityScore >= 50 ? 'pass' : 'fail',
        reasoning: `Repair quality: minimality=${Math.round(minimality * 100)}%, correctness=${Math.round(correctnessAfter * 100)}%, efficiency=${Math.round(efficiency * 100)}%, precision=${Math.round(precision * 100)}% (file-patches=${fileLevelPatches}, regenerations=${totalRepairs - fileLevelPatches})`,
        issues: [],
      });
    } else {
      // No repair needed Ã¢â‚¬â€ perfect score
      repairQualityScore = 100;
    }

    return {
      score: totalScore,
      max_score: totalMax,
      percentage: overallPct,
      verdict: passedThreshold ? 'pass' : 'fail',
      passed_threshold: passedThreshold,
      threshold,
      reasoning: allDetails.join('\n'),
      details,
      issues: allIssues,
      robustness_score: robustnessScore,
      repair_quality_score: repairQualityScore,
    };
  }

  private evaluateSuccessCriteria(
    benchmark: HackathonBenchmarkDefinition,
    repository: GeneratedRepository,
    _blueprint: ArchitectureBlueprint,
  ): { score: number; max: number; percentage: number; summary: string; issues: string[] } {
    const issues: string[] = [];
    let score = 0;
    let max = 0;

    const allFiles = repository.modules.flatMap((m) => m.files);
    const allPaths = new Set(allFiles.map((f) => f.path));
    const allContent = allFiles.map((f) => ({ path: f.path, content: f.content }));

    for (const criterion of benchmark.success_criteria) {
      max += Math.round(criterion.weight * 100);
      const desc = criterion.description.toLowerCase();
      let passed = true;

      if (desc.includes('api') || desc.includes('endpoint')) {
        const hasApi =
          allPaths.has('/api') ||
          [...allPaths].some((p) => p.includes('api') || p.includes('route') || p.includes('controller'));
        if (!hasApi) {
          passed = false;
          issues.push(`Criterion "${criterion.description}": no API endpoints found`);
        }
      } else if (desc.includes('databas') || desc.includes('schema') || desc.includes('persist')) {
        const hasDb = repository.modules.some((m) => m.type === 'database');
        if (!hasDb) {
          passed = false;
          issues.push(`Criterion "${criterion.description}": no database module`);
        }
      } else if (desc.includes('frontend') || desc.includes('ui') || desc.includes('interface')) {
        const hasFE = repository.modules.some((m) => m.type === 'frontend');
        if (!hasFE) {
          passed = false;
          issues.push(`Criterion "${criterion.description}": no frontend module`);
        }
      } else if (desc.includes('auth') || desc.includes('login') || desc.includes('user')) {
        const hasAuth = allContent.some(
          (f) =>
            f.content.includes('auth') ||
            f.content.includes('login') ||
            f.content.includes('password') ||
            f.content.includes('token') ||
            f.content.includes('session'),
        );
        if (!hasAuth) {
          passed = false;
          issues.push(`Criterion "${criterion.description}": no authentication patterns found`);
        }
      } else if (desc.includes('test')) {
        const hasTests = repository.modules.some((m) => m.type === 'tests');
        if (!hasTests) {
          passed = false;
          issues.push(`Criterion "${criterion.description}": no test module`);
        }
      } else if (desc.includes('config') || desc.includes('deploy')) {
        const hasConfig = repository.modules.some((m) => m.type === 'config');
        if (!hasConfig) {
          passed = false;
          issues.push(`Criterion "${criterion.description}": no config module`);
        }
      } else if (desc.includes('doc') || desc.includes('readme')) {
        const hasDocs = repository.modules.some((m) => m.type === 'docs');
        if (!hasDocs) {
          passed = false;
          issues.push(`Criterion "${criterion.description}": no docs module`);
        }
      }

      if (passed) {
        score += Math.round(criterion.weight * 100);
      }
    }

    const pct = max > 0 ? Math.round((score / max) * 100) : 100;
    const summary = `Success criteria: ${score}/${max} (${pct}%). ${issues.length} issue(s).`;
    return { score, max, percentage: pct, summary, issues };
  }
}
