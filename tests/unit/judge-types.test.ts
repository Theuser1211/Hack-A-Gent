import { describe, it, expect } from 'vitest';

import {
  JudgeCriterionSchema,
  JudgeIssueSchema,
  JudgeScoreSchema,
  JudgeReportSchema,
  OverallJudgeReportSchema,
  JudgeVerdictSchema,
  JudgeIssueCategorySchema,
} from '../../kernel/judge/judge-types.js';

describe('Judge Types', () => {
  describe('JudgeVerdictSchema', () => {
    it('accepts valid verdicts', () => {
      expect(JudgeVerdictSchema.parse('pass')).toBe('pass');
      expect(JudgeVerdictSchema.parse('pass_with_concerns')).toBe('pass_with_concerns');
      expect(JudgeVerdictSchema.parse('fail')).toBe('fail');
      expect(JudgeVerdictSchema.parse('critical')).toBe('critical');
    });

    it('rejects invalid verdicts', () => {
      expect(() => JudgeVerdictSchema.parse('invalid')).toThrow();
    });
  });

  describe('JudgeIssueCategorySchema', () => {
    it('accepts valid categories', () => {
      expect(JudgeIssueCategorySchema.parse('code_quality')).toBe('code_quality');
      expect(JudgeIssueCategorySchema.parse('security')).toBe('security');
      expect(JudgeIssueCategorySchema.parse('ux')).toBe('ux');
    });

    it('rejects invalid categories', () => {
      expect(() => JudgeIssueCategorySchema.parse('invalid')).toThrow();
    });
  });

  describe('JudgeCriterionSchema', () => {
    it('accepts valid criterion', () => {
      const c = JudgeCriterionSchema.parse({
        id: 'c1',
        description: 'Test',
        weight: 0.5,
        score: 80,
        max_score: 100,
      });
      expect(c.score).toBe(80);
      expect(c.weight).toBe(0.5);
    });

    it('applies defaults', () => {
      const c = JudgeCriterionSchema.parse({
        id: 'c1',
        description: 'Test',
        score: 90,
      });
      expect(c.weight).toBe(1);
      expect(c.max_score).toBe(100);
    });

    it('rejects score out of range', () => {
      expect(() =>
        JudgeCriterionSchema.parse({
          id: 'c1',
          description: 'Test',
          score: 150,
        }),
      ).toThrow();
    });
  });

  describe('JudgeIssueSchema', () => {
    it('accepts valid issue', () => {
      const issue = JudgeIssueSchema.parse({
        category: 'security',
        severity: 'high',
        message: 'XSS risk',
        recommendation: 'Sanitize inputs',
      });
      expect(issue.category).toBe('security');
      expect(issue.file).toBeUndefined();
    });

    it('accepts issue with file reference', () => {
      const issue = JudgeIssueSchema.parse({
        category: 'code_quality',
        severity: 'medium',
        message: 'Long function',
        file: 'src/app.ts',
        line: 42,
        recommendation: 'Refactor',
      });
      expect(issue.file).toBe('src/app.ts');
      expect(issue.line).toBe(42);
    });
  });

  describe('JudgeScoreSchema', () => {
    it('accepts valid score', () => {
      const score = JudgeScoreSchema.parse({
        total: 85,
        max: 100,
        percentage: 85,
        criteria: [],
      });
      expect(score.percentage).toBe(85);
    });

    it('applies max default', () => {
      const score = JudgeScoreSchema.parse({ total: 80, max: 100, percentage: 80 });
      expect(score.max).toBe(100);
    });
  });

  describe('JudgeReportSchema', () => {
    it('accepts valid report', () => {
      const report = JudgeReportSchema.parse({
        judge_id: 'judge.test.v1',
        judge_name: 'Test Judge',
        verdict: 'pass',
        score: { total: 90, max: 100, percentage: 90, criteria: [] },
        issues: [],
        recommendations: [],
        summary: 'All good',
        generated_at: new Date().toISOString(),
      });
      expect(report.judge_id).toBe('judge.test.v1');
      expect(report.verdict).toBe('pass');
    });

    it('rejects report missing required fields', () => {
      expect(() => JudgeReportSchema.parse({})).toThrow();
    });
  });

  describe('OverallJudgeReportSchema', () => {
    it('accepts valid overall report', () => {
      const report = OverallJudgeReportSchema.parse({
        project_name: 'TestApp',
        judge_reports: [
          {
            judge_id: 'judge.test.v1',
            judge_name: 'Test Judge',
            verdict: 'pass',
            score: { total: 90, max: 100, percentage: 90, criteria: [] },
            issues: [],
            recommendations: [],
            summary: 'Good',
            generated_at: new Date().toISOString(),
          },
        ],
        aggregated_score: { total: 90, max: 100, percentage: 90, criteria: [] },
        aggregated_verdict: 'pass',
        generated_at: new Date().toISOString(),
      });
      expect(report.project_name).toBe('TestApp');
      expect(report.judge_reports).toHaveLength(1);
      expect(report.aggregated_verdict).toBe('pass');
    });

    it('defaults counts to 0', () => {
      const report = OverallJudgeReportSchema.parse({
        project_name: 'TestApp',
        judge_reports: [],
        aggregated_score: { total: 0, max: 100, percentage: 0, criteria: [] },
        aggregated_verdict: 'fail',
        generated_at: new Date().toISOString(),
      });
      expect(report.total_issues).toBe(0);
      expect(report.critical_issues).toBe(0);
    });
  });
});
