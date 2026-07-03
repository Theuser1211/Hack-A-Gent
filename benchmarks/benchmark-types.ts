import { z } from 'zod';

export const HackathonCategorySchema = z.enum(['ai', 'saas', 'webapp', 'healthcare', 'education']);
export type HackathonCategory = z.infer<typeof HackathonCategorySchema>;

export const DeliverableSchema = z.object({
  path: z.string(),
  description: z.string(),
  required: z.boolean().default(true),
  type: z.enum(['file', 'directory', 'config', 'code', 'docs']).default('file'),
});
export type Deliverable = z.infer<typeof DeliverableSchema>;

export const SuccessCriterionSchema = z.object({
  id: z.string(),
  description: z.string(),
  weight: z.number().min(0).max(1).default(1),
  verification_method: z.enum(['automated', 'manual', 'build_check', 'test_check', 'judge_check']).default('automated'),
});
export type SuccessCriterion = z.infer<typeof SuccessCriterionSchema>;

export const RubricItemSchema = z.object({
  category: z.string(),
  max_score: z.number().int().positive().default(10),
  description: z.string(),
  scoring_guide: z.string(),
});
export type RubricItem = z.infer<typeof RubricItemSchema>;

export const EvaluationRubricSchema = z.object({
  items: z.array(RubricItemSchema),
  max_total: z.number().int().positive(),
  passing_threshold: z.number().min(0).max(100).default(70),
});
export type EvaluationRubric = z.infer<typeof EvaluationRubricSchema>;

export const HackathonBenchmarkDefinitionSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: HackathonCategorySchema,
  devpost_url: z.string().url(),
  description: z.string(),
  hackathon_description: z.string(),
  expected_deliverables: z.array(DeliverableSchema),
  success_criteria: z.array(SuccessCriterionSchema),
  rubric: EvaluationRubricSchema,
  difficulty: z.enum(['easy', 'medium', 'hard']).default('medium'),
  estimated_hours: z.number().positive().default(24),
});
export type HackathonBenchmarkDefinition = z.infer<typeof HackathonBenchmarkDefinitionSchema>;

export const BenchmarkPhaseSchema = z.enum([
  'planning',
  'architecture',
  'building',
  'materialization',
  'build_verification',
  'testing',
  'judging',
  'repair',
  'complete',
]);
export type BenchmarkPhase = z.infer<typeof BenchmarkPhaseSchema>;

export const PhaseResultSchema = z.object({
  phase: BenchmarkPhaseSchema,
  success: z.boolean(),
  duration_ms: z.number().nonnegative(),
  error: z.string().nullable().default(null),
  token_count: z.number().int().nonnegative().default(0),
  artifacts: z.array(z.string()).default([]),
});
export type PhaseResult = z.infer<typeof PhaseResultSchema>;

export const RobustnessMetricsSchema = z.object({
  mutations_applied: z.number().int().nonnegative().default(0),
  mutations_detected: z.number().int().nonnegative().default(0),
  mutations_repaired: z.number().int().nonnegative().default(0),
  detection_rate: z.number().min(0).max(1).default(0),
  repair_success_rate: z.number().min(0).max(1).default(0),
  survived_mutation: z.boolean().default(false),
  robustness_score: z.number().min(0).max(100).default(0),
});
export type RobustnessMetrics = z.infer<typeof RobustnessMetricsSchema>;

export const PerMutationTypeStatSchema = z.object({
  applied: z.number().int().nonnegative().default(0),
  detected: z.number().int().nonnegative().default(0),
  repaired: z.number().int().nonnegative().default(0),
});
export type PerMutationTypeStat = z.infer<typeof PerMutationTypeStatSchema>;

export const BenchmarkRunResultSchema = z.object({
  agent_id: z.string().default(''),
  benchmark_id: z.string(),
  benchmark_name: z.string(),
  category: HackathonCategorySchema,
  run_id: z.string(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
  total_duration_ms: z.number().nonnegative(),
  phases: z.array(PhaseResultSchema),
  overall_success: z.boolean(),
  judge_score: z.number().min(0).max(100).nullable().default(null),
  judge_verdict: z.string().nullable().default(null),
  build_success: z.boolean(),
  test_success: z.boolean().nullable().default(null),
  total_tokens: z.number().int().nonnegative().default(0),
  total_cost: z.number().nonnegative().default(0),
  repair_iterations: z.number().int().nonnegative().default(0),
  repair_strategies_used: z.array(z.string()).default([]),
  per_mutation_type_stats: z.record(PerMutationTypeStatSchema).default({}),
  benchmark_difficulty_index: z.number().min(0).max(100).default(50),
  curriculum_state: z.string().default('balanced'),
  global_difficulty: z.number().min(0).max(1).default(0.5),
  errors: z.array(z.string()).default([]),
  artifacts_dir: z.string().nullable().default(null),
  adversarial_mode: z.boolean().default(false),
  mutations_applied: z.number().int().nonnegative().default(0),
  mutations_detected: z.number().int().nonnegative().default(0),
  mutations_repaired: z.number().int().nonnegative().default(0),
  detection_rate: z.number().min(0).max(1).default(0),
  repair_success_rate: z.number().min(0).max(1).default(0),
  survived_mutation: z.boolean().default(false),
  robustness_score: z.number().min(0).max(100).default(0),
});

export type BenchmarkRunResult = z.infer<typeof BenchmarkRunResultSchema>;
export type PartialBenchmarkRunResult = Partial<BenchmarkRunResult>;
export const PartialBenchmarkRunResultSchema = z.object({}).partial();
export const BenchmarkSuiteResultSchema = z.object({
  suite_name: z.string().default('Hack-A-Gent Benchmark Suite'),
  run_at: z.string().datetime(),
  benchmark_results: z.array(BenchmarkRunResultSchema),
  summary: z.object({
    total_benchmarks: z.number().int().nonnegative(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    average_judge_score: z.number().min(0).max(100),
    average_build_pass_rate: z.number().min(0).max(100),
    average_test_pass_rate: z.number().nullable(),
    average_token_consumption: z.number().nonnegative(),
    average_cost: z.number().nonnegative(),
    average_duration_ms: z.number().nonnegative(),
    total_repair_iterations: z.number().int().nonnegative(),
  }),
});
export type BenchmarkSuiteResult = z.infer<typeof BenchmarkSuiteResultSchema>;
