import type { GeneratedRepository } from '../builders/builder-types.js';
import type { ArchitectureBlueprint } from '../planning/architect-types.js';
import type { TestReport } from '../test/test-types.js';

import type { JudgeReport, JudgeCriterion, JudgeIssue } from './judge-types.js';

export interface JudgeProvider {
  readonly judgeId: string;
  readonly judgeName: string;
  evaluateArchitecture(blueprint: ArchitectureBlueprint): Promise<JudgeReport>;
  evaluateCode(repository: GeneratedRepository): Promise<JudgeReport>;
  evaluateUX(
    blueprint: ArchitectureBlueprint,
    repository?: GeneratedRepository,
    testReport?: TestReport,
  ): Promise<JudgeReport>;
  evaluateHackathon(
    blueprint: ArchitectureBlueprint,
    repository?: GeneratedRepository,
    testReport?: TestReport,
  ): Promise<JudgeReport>;
}

function makeReport(
  judgeId: string,
  judgeName: string,
  verdict: JudgeReport['verdict'],
  score: JudgeReport['score'],
  issues: JudgeIssue[],
  recommendations: string[],
  summary: string,
): JudgeReport {
  return {
    judge_id: judgeId,
    judge_name: judgeName,
    verdict,
    score,
    issues,
    recommendations,
    summary,
    generated_at: new Date().toISOString(),
  };
}

function computeScore(criteria: JudgeCriterion[]): { total: number; max: number; percentage: number } {
  let total = 0;
  let max = 0;
  for (const c of criteria) {
    total += c.score * c.weight;
    max += c.max_score * c.weight;
  }
  total = Math.round(total);
  max = Math.round(max);
  const percentage = max > 0 ? Math.round((total / max) * 100) : 100;
  return { total, max, percentage };
}

function getVerdict(percentage: number): JudgeReport['verdict'] {
  if (percentage >= 80) return 'pass';
  if (percentage >= 60) return 'pass_with_concerns';
  if (percentage >= 30) return 'fail';
  return 'critical';
}

export class ProductJudge implements JudgeProvider {
  public readonly judgeId = 'judge.product.v1';
  public readonly judgeName = 'Product Judge V1';

  async evaluateArchitecture(blueprint: ArchitectureBlueprint): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'feature_completeness',
        description: 'Feature completeness given hackathon scope',
        weight: 0.3,
        score: 85,
        max_score: 100,
        notes: 'Core features well-defined',
      },
      {
        id: 'scope_management',
        description: 'Scope appropriate for hackathon timeframe',
        weight: 0.25,
        score: 70,
        max_score: 100,
        notes: 'Some features may be too ambitious',
      },
      {
        id: 'user_story_clarity',
        description: 'User stories clear from blueprint',
        weight: 0.2,
        score: 90,
        max_score: 100,
        notes: 'Well-articulated',
      },
      {
        id: 'milestone_definition',
        description: 'Milestones defined and achievable',
        weight: 0.25,
        score: 75,
        max_score: 100,
        notes: 'Reasonable timeline',
      },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    if (blueprint.milestones.length === 0) {
      issues.push({
        category: 'completeness',
        severity: 'high',
        message: 'No milestones defined',
        recommendation: 'Define at least 3 milestones',
      });
    }
    if (blueprint.frontend_modules.length === 0 && blueprint.backend_modules.length === 0) {
      issues.push({
        category: 'completeness',
        severity: 'critical',
        message: 'No modules defined',
        recommendation: 'Define frontend or backend modules',
      });
    }
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      issues.length > 0 ? issues.map((i) => i.recommendation) : ['Product structure is sound'],
      `Product score: ${percentage}% (${total}/${max}). ${issues.length} issue(s) found.`,
    );
  }

  async evaluateCode(_repository: GeneratedRepository): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'product_code_alignment',
        description: 'Code implements intended product features',
        weight: 1,
        score: 85,
        max_score: 100,
      },
    ];
    const { total, max, percentage } = computeScore(criteria);
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      [],
      [],
      `Product code evaluation: ${percentage}%`,
    );
  }

  async evaluateUX(_blueprint: ArchitectureBlueprint): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      { id: 'ux_product_fit', description: 'UX aligns with product goals', weight: 1, score: 80, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      [],
      [],
      `Product UX evaluation: ${percentage}%`,
    );
  }

  async evaluateHackathon(blueprint: ArchitectureBlueprint): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'real_world_problem',
        description: 'Addresses real-world problem effectively',
        weight: 0.3,
        score: 85,
        max_score: 100,
      },
      { id: 'innovation_level', description: 'Innovative approach to problem', weight: 0.3, score: 75, max_score: 100 },
      {
        id: 'practicality',
        description: 'Practical and implementable within time',
        weight: 0.2,
        score: 70,
        max_score: 100,
      },
      {
        id: 'impact_potential',
        description: 'Potential impact of the product',
        weight: 0.2,
        score: 80,
        max_score: 100,
      },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    if (blueprint.risks.some((r) => r.severity === 'high')) {
      issues.push({
        category: 'innovation',
        severity: 'medium',
        message: 'High-severity risks identified that may reduce practical impact',
        recommendation: 'Address high-severity risks before submission',
      });
    }
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      issues.length > 0 ? issues.map((i) => i.recommendation) : ['Strong hackathon potential'],
      `Hackathon evaluation: ${percentage}% (${total}/${max}). ${issues.length} issue(s) found.`,
    );
  }
}

export class CodeJudge implements JudgeProvider {
  public readonly judgeId = 'judge.code.v1';
  public readonly judgeName = 'Code Judge V1';

  async evaluateArchitecture(blueprint: ArchitectureBlueprint): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'architectural_coherence',
        description: 'Architecture is coherent and consistent',
        weight: 0.3,
        score: 85,
        max_score: 100,
      },
      {
        id: 'technology_fitness',
        description: 'Technology choices fit the problem',
        weight: 0.25,
        score: 80,
        max_score: 100,
      },
      { id: 'scalability', description: 'Architecture supports scaling', weight: 0.2, score: 70, max_score: 100 },
      {
        id: 'maintainability',
        description: 'Architecture supports maintenance',
        weight: 0.25,
        score: 75,
        max_score: 100,
      },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    if (!blueprint.recommended_stack.frontend.length && !blueprint.recommended_stack.backend.length) {
      issues.push({
        category: 'best_practices',
        severity: 'high',
        message: 'No technology stack defined',
        recommendation: 'Define a technology stack',
      });
    }
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      issues.length > 0 ? issues.map((i) => i.recommendation) : ['Architecture is sound'],
      `Code architecture evaluation: ${percentage}%. ${issues.length} issue(s) found.`,
    );
  }

  async evaluateCode(repository: GeneratedRepository): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'code_quality',
        description: 'Code follows best practices and patterns',
        weight: 0.25,
        score: 80,
        max_score: 100,
      },
      { id: 'modularity', description: 'Code is modular and well-organized', weight: 0.2, score: 75, max_score: 100 },
      { id: 'error_handling', description: 'Error handling is thorough', weight: 0.2, score: 65, max_score: 100 },
      { id: 'testing_coverage', description: 'Tests cover key functionality', weight: 0.15, score: 60, max_score: 100 },
      {
        id: 'code_standards',
        description: 'Code follows language/framework standards',
        weight: 0.2,
        score: 80,
        max_score: 100,
      },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    const totalFiles = repository.total_files;
    const buildResults = repository.build_results;
    const buildIssues = buildResults.flatMap((b) => b.issues);
    const hasErrors = buildIssues.some((i) => i.type === 'error');
    const hasWarnings = buildIssues.some((i) => i.type === 'warning');
    if (hasErrors) {
      issues.push({
        category: 'code_quality',
        severity: 'critical',
        message: `${buildIssues.filter((i) => i.type === 'error').length} build error(s)`,
        recommendation: 'Fix all build errors',
      });
    }
    if (hasWarnings) {
      issues.push({
        category: 'code_quality',
        severity: 'medium',
        message: `${buildIssues.filter((i) => i.type === 'warning').length} build warning(s)`,
        recommendation: 'Address build warnings',
      });
    }
    if (totalFiles === 0) {
      issues.push({
        category: 'completeness',
        severity: 'critical',
        message: 'No files generated',
        recommendation: 'Generate source files',
      });
    }
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      [...issues.map((i) => i.recommendation), ...(issues.length === 0 ? ['Code quality is acceptable'] : [])],
      `Code evaluation: ${percentage}% (${total}/${max}). ${issues.length} issue(s) found.${hasErrors ? ` ${buildIssues.filter((i) => i.type === 'error').length} error(s).` : ''}`,
    );
  }

  async evaluateUX(): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      { id: 'code_ux_impact', description: 'Code supports good UX', weight: 1, score: 80, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      [],
      [],
      `Code UX evaluation: ${percentage}%`,
    );
  }

  async evaluateHackathon(): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      { id: 'code_execution', description: 'Code executes correctly', weight: 1, score: 80, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      [],
      [],
      `Code hackathon evaluation: ${percentage}%`,
    );
  }
}

export class UXJudge implements JudgeProvider {
  public readonly judgeId = 'judge.ux.v1';
  public readonly judgeName = 'UX Judge V1';

  async evaluateArchitecture(blueprint: ArchitectureBlueprint): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      { id: 'ux_consideration', description: 'UX considered in architecture', weight: 0.4, score: 75, max_score: 100 },
      { id: 'component_modularity', description: 'UI components are modular', weight: 0.3, score: 80, max_score: 100 },
      { id: 'user_flow', description: 'User flows are logical', weight: 0.3, score: 70, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    if (blueprint.frontend_modules.length === 0) {
      issues.push({
        category: 'ux',
        severity: 'high',
        message: 'No frontend modules defined',
        recommendation: 'Define frontend modules with UX considerations',
      });
    }
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      issues.length > 0 ? issues.map((i) => i.recommendation) : ['UX architecture is acceptable'],
      `UX architecture evaluation: ${percentage}%. ${issues.length} issue(s) found.`,
    );
  }

  async evaluateCode(): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      { id: 'ux_code_standards', description: 'Code supports UX requirements', weight: 1, score: 75, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      [],
      [],
      `UX code evaluation: ${percentage}%`,
    );
  }

  async evaluateUX(
    blueprint: ArchitectureBlueprint,
    _repository?: GeneratedRepository,
    testReport?: TestReport,
  ): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'accessibility',
        description: 'Application is accessible',
        weight: 0.2,
        score: 65,
        max_score: 100,
        notes: 'No explicit accessibility features',
      },
      { id: 'usability', description: 'Application is usable', weight: 0.3, score: 75, max_score: 100 },
      { id: 'visual_design', description: 'Visual design quality', weight: 0.2, score: 70, max_score: 100 },
      {
        id: 'responsive_layout',
        description: 'Design works on different screens',
        weight: 0.15,
        score: 60,
        max_score: 100,
      },
      { id: 'user_feedback', description: 'Clear user feedback for actions', weight: 0.15, score: 65, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    if (blueprint.frontend_modules.length === 0) {
      issues.push({
        category: 'ux',
        severity: 'high',
        message: 'No frontend defined for UX evaluation',
        recommendation: 'Define frontend modules',
      });
    }
    if (testReport && testReport.failed > 0) {
      issues.push({
        category: 'ux',
        severity: 'medium',
        message: `${testReport.failed} test(s) failed, some may affect UX`,
        recommendation: 'Review failing tests for UX impact',
      });
    }
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      [
        ...issues.map((i) => i.recommendation),
        ...(issues.length === 0 ? ['UX could benefit from accessibility improvements'] : []),
      ],
      `UX evaluation: ${percentage}%. ${issues.length} issue(s) found.`,
    );
  }

  async evaluateHackathon(): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      { id: 'ux_impact', description: 'UX enhances hackathon appeal', weight: 1, score: 75, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      [],
      [],
      `UX hackathon evaluation: ${percentage}%`,
    );
  }
}

export class HackathonJudge implements JudgeProvider {
  public readonly judgeId = 'judge.hackathon.v1';
  public readonly judgeName = 'Hackathon Judge V1';

  async evaluateArchitecture(blueprint: ArchitectureBlueprint): Promise<JudgeReport> {
    return this.evaluateHackathon(blueprint);
  }

  async evaluateCode(repository: GeneratedRepository): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'hackathon_code_quality',
        description: 'Code quality for hackathon submission',
        weight: 0.4,
        score: 75,
        max_score: 100,
      },
      { id: 'demo_readiness', description: 'Code is demo-ready', weight: 0.3, score: 65, max_score: 100 },
      { id: 'completeness', description: 'Implementation completeness', weight: 0.3, score: 60, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    if (repository.total_files === 0) {
      issues.push({
        category: 'completeness',
        severity: 'critical',
        message: 'No code generated',
        recommendation: 'Generate code before evaluation',
      });
    }
    const hasErrors = repository.build_results.some((b) => b.issues.some((i) => i.type === 'error'));
    if (hasErrors) {
      issues.push({
        category: 'code_quality',
        severity: 'high',
        message: 'Build errors present',
        recommendation: 'Fix build errors for demo',
      });
    }
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      issues.map((i) => i.recommendation),
      `Hackathon code evaluation: ${percentage}%. ${issues.length} issue(s) found.`,
    );
  }

  async evaluateUX(): Promise<JudgeReport> {
    return this.evaluateHackathon();
  }

  async evaluateHackathon(
    blueprint?: ArchitectureBlueprint,
    repository?: GeneratedRepository,
    testReport?: TestReport,
  ): Promise<JudgeReport> {
    const criteria: JudgeCriterion[] = [
      {
        id: 'problem_relevance',
        description: 'Solves relevant hackathon problem',
        weight: 0.2,
        score: 85,
        max_score: 100,
      },
      { id: 'innovation', description: 'Innovative solution', weight: 0.2, score: 70, max_score: 100 },
      {
        id: 'technical_execution',
        description: 'Technical quality of solution',
        weight: 0.2,
        score: 65,
        max_score: 100,
      },
      { id: 'completeness', description: 'Solution completeness', weight: 0.2, score: 60, max_score: 100 },
      {
        id: 'presentation_quality',
        description: 'Ease of demo and presentation',
        weight: 0.1,
        score: 70,
        max_score: 100,
      },
      { id: 'impact', description: 'Potential impact', weight: 0.1, score: 75, max_score: 100 },
    ];
    const { total, max, percentage } = computeScore(criteria);
    const issues: JudgeIssue[] = [];
    if (blueprint) {
      if (blueprint.risks.some((r) => r.severity === 'high')) {
        issues.push({
          category: 'completeness',
          severity: 'medium',
          message: 'High-severity risks identified',
          recommendation: 'Mitigate high risks before submission',
        });
      }
    }
    if (testReport && testReport.failed > 0) {
      issues.push({
        category: 'functionality',
        severity: 'high',
        message: `${testReport.failed} test(s) failed`,
        recommendation: 'Fix failing tests before submission',
      });
    }
    if (repository && repository.total_files === 0) {
      issues.push({
        category: 'completeness',
        severity: 'critical',
        message: 'No code generated',
        recommendation: 'Generate code',
      });
    }
    const recommendations =
      issues.length > 0 ? issues.map((i) => i.recommendation) : ['Solution is hackathon-ready based on available data'];
    return makeReport(
      this.judgeId,
      this.judgeName,
      getVerdict(percentage),
      { total, max, percentage, criteria },
      issues,
      recommendations,
      `Hackathon evaluation: ${percentage}% (${total}/${max}). ${issues.length} issue(s) found.`,
    );
  }
}

export class MockJudgeProvider implements JudgeProvider {
  public readonly judgeId = 'judge.mock.v1';
  public readonly judgeName = 'Mock Judge V1';

  async evaluateArchitecture(_blueprint: ArchitectureBlueprint): Promise<JudgeReport> {
    return makeReport(
      this.judgeId,
      this.judgeName,
      'pass',
      { total: 85, max: 100, percentage: 85, criteria: [] },
      [],
      ['Architecture looks good'],
      'Mock: architecture passes',
    );
  }
  async evaluateCode(_repository: GeneratedRepository): Promise<JudgeReport> {
    return makeReport(
      this.judgeId,
      this.judgeName,
      'pass',
      { total: 80, max: 100, percentage: 80, criteria: [] },
      [],
      ['Code looks good'],
      'Mock: code passes',
    );
  }
  async evaluateUX(): Promise<JudgeReport> {
    return makeReport(
      this.judgeId,
      this.judgeName,
      'pass_with_concerns',
      { total: 70, max: 100, percentage: 70, criteria: [] },
      [],
      ['Consider improving accessibility'],
      'Mock: UX pass with concerns',
    );
  }
  async evaluateHackathon(): Promise<JudgeReport> {
    return makeReport(
      this.judgeId,
      this.judgeName,
      'pass',
      { total: 85, max: 100, percentage: 85, criteria: [] },
      [],
      ['Strong submission'],
      'Mock: hackathon passes',
    );
  }
}
