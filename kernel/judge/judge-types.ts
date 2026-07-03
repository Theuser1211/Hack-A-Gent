import { z } from 'zod';

export const JudgeVerdictSchema = z.enum(['pass', 'pass_with_concerns', 'fail', 'critical']);
export type JudgeVerdict = z.infer<typeof JudgeVerdictSchema>;

export const JudgeCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  weight: z.number().min(0).max(1).default(1),
  score: z.number().min(0).max(100),
  max_score: z.number().min(1).default(100),
  notes: z.string().optional(),
});
export type JudgeCriterion = z.infer<typeof JudgeCriterionSchema>;

export const JudgeIssueCategorySchema = z.enum([
  'code_quality',
  'security',
  'performance',
  'ux',
  'completeness',
  'best_practices',
  'accessibility',
  'maintainability',
  'functionality',
  'innovation',
]);
export type JudgeIssueCategory = z.infer<typeof JudgeIssueCategorySchema>;

export const JudgeIssueSchema = z.object({
  category: JudgeIssueCategorySchema,
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  message: z.string(),
  file: z.string().optional(),
  line: z.number().int().nonnegative().optional(),
  recommendation: z.string(),
});
export type JudgeIssue = z.infer<typeof JudgeIssueSchema>;

export const JudgeScoreSchema = z.object({
  total: z.number().min(0).max(100),
  max: z.number().min(1).default(100),
  percentage: z.number().min(0).max(100),
  criteria: z.array(JudgeCriterionSchema).default([]),
});
export type JudgeScore = z.infer<typeof JudgeScoreSchema>;

export const JudgeReportSchema = z.object({
  judge_id: z.string(),
  judge_name: z.string(),
  verdict: JudgeVerdictSchema,
  score: JudgeScoreSchema,
  issues: z.array(JudgeIssueSchema).default([]),
  recommendations: z.array(z.string()).default([]),
  summary: z.string(),
  generated_at: z.string().datetime(),
});
export type JudgeReport = z.infer<typeof JudgeReportSchema>;

export const OverallJudgeReportSchema = z.object({
  project_name: z.string(),
  judge_reports: z.array(JudgeReportSchema).default([]),
  aggregated_score: JudgeScoreSchema,
  aggregated_verdict: JudgeVerdictSchema,
  generated_at: z.string().datetime(),
  total_issues: z.number().int().nonnegative().default(0),
  critical_issues: z.number().int().nonnegative().default(0),
  high_issues: z.number().int().nonnegative().default(0),
});
export type OverallJudgeReport = z.infer<typeof OverallJudgeReportSchema>;
