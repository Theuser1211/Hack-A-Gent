import { describe, it, expect } from 'vitest';

import type { OverallJudgeReport } from '../../kernel/judge/judge-types.js';
import { DefaultRepairTaskGenerator } from '../../kernel/repair/repair-task-generator.js';

function sampleReport(overrides?: Partial<OverallJudgeReport>): OverallJudgeReport {
  return {
    project_name: 'TestApp',
    judge_reports: [],
    aggregated_score: { total: 50, max: 100, percentage: 50, criteria: [] },
    aggregated_verdict: 'fail',
    generated_at: new Date().toISOString(),
    total_issues: 0,
    critical_issues: 0,
    high_issues: 0,
    ...overrides,
  };
}

describe('DefaultRepairTaskGenerator', () => {
  const generator = new DefaultRepairTaskGenerator();

  it('returns empty array when no issues', () => {
    const report = sampleReport();
    const tasks = generator.generateFixTasks(report);
    expect(tasks).toHaveLength(0);
  });

  it('skips low and medium severity issues', () => {
    const report = sampleReport({
      judge_reports: [
        {
          judge_id: 'judge.test.v1',
          judge_name: 'Test Judge',
          verdict: 'fail',
          score: { total: 50, max: 100, percentage: 50, criteria: [] },
          issues: [
            { category: 'code_quality', severity: 'low', message: 'Minor style issue', recommendation: 'Fix style' },
            { category: 'ux', severity: 'medium', message: 'Could improve layout', recommendation: 'Adjust layout' },
          ],
          recommendations: ['Fix style', 'Adjust layout'],
          summary: 'Issues found',
          generated_at: new Date().toISOString(),
        },
      ],
      total_issues: 2,
    });
    const tasks = generator.generateFixTasks(report);
    expect(tasks).toHaveLength(0);
  });

  it('generates fix tasks for high and critical issues', () => {
    const report = sampleReport({
      judge_reports: [
        {
          judge_id: 'judge.test.v1',
          judge_name: 'Test Judge',
          verdict: 'critical',
          score: { total: 20, max: 100, percentage: 20, criteria: [] },
          issues: [
            {
              category: 'security',
              severity: 'critical',
              message: 'XSS vulnerability',
              file: 'src/auth.ts',
              recommendation: 'Sanitize user input',
            },
            {
              category: 'functionality',
              severity: 'high',
              message: 'API endpoint broken',
              recommendation: 'Fix API endpoint',
            },
            { category: 'completeness', severity: 'low', message: 'Missing comments', recommendation: 'Add JSDoc' },
          ],
          recommendations: ['Sanitize input', 'Fix API'],
          summary: 'Critical issues',
          generated_at: new Date().toISOString(),
        },
      ],
      total_issues: 3,
      critical_issues: 1,
      high_issues: 1,
    });
    const tasks = generator.generateFixTasks(report);
    expect(tasks).toHaveLength(2);

    const securityTask = tasks.find((t) => t.severity === 'critical');
    expect(securityTask).toBeDefined();
    expect(securityTask!.target_file).toBe('src/auth.ts');
    expect(securityTask!.recommendation).toContain('Sanitize');

    const funcTask = tasks.find((t) => t.severity === 'high');
    expect(funcTask).toBeDefined();
    expect(funcTask!.acceptance_criteria).toHaveLength(3);
    expect(funcTask!.status).toBe('pending');
  });

  it('infers target file from category when file not specified', () => {
    const report = sampleReport({
      judge_reports: [
        {
          judge_id: 'judge.test.v1',
          judge_name: 'Test Judge',
          verdict: 'fail',
          score: { total: 50, max: 100, percentage: 50, criteria: [] },
          issues: [
            { category: 'ux', severity: 'high', message: 'Poor accessibility', recommendation: 'Add ARIA labels' },
          ],
          recommendations: ['Add ARIA labels'],
          summary: 'UX issue',
          generated_at: new Date().toISOString(),
        },
      ],
      total_issues: 1,
      high_issues: 1,
    });
    const tasks = generator.generateFixTasks(report);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.target_file).toBe('src/components/');
  });

  it('generates tasks from multiple judge reports', () => {
    const report = sampleReport({
      judge_reports: [
        {
          judge_id: 'judge.code.v1',
          judge_name: 'Code Judge',
          verdict: 'fail',
          score: { total: 40, max: 100, percentage: 40, criteria: [] },
          issues: [
            {
              category: 'code_quality',
              severity: 'high',
              message: 'Duplicated code',
              file: 'src/utils.ts',
              recommendation: 'Extract shared logic',
            },
          ],
          recommendations: ['Refactor'],
          summary: 'Code issues',
          generated_at: new Date().toISOString(),
        },
        {
          judge_id: 'judge.ux.v1',
          judge_name: 'UX Judge',
          verdict: 'fail',
          score: { total: 30, max: 100, percentage: 30, criteria: [] },
          issues: [
            {
              category: 'accessibility',
              severity: 'critical',
              message: 'No alt text on images',
              recommendation: 'Add alt attributes',
            },
          ],
          recommendations: ['Add alt text'],
          summary: 'UX issues',
          generated_at: new Date().toISOString(),
        },
      ],
      total_issues: 2,
      critical_issues: 1,
      high_issues: 1,
    });
    const tasks = generator.generateFixTasks(report);
    expect(tasks).toHaveLength(2);
  });
});
