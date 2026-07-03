import { z } from 'zod';

export const RepairStateSchema = z.enum([
  'REPAIR_PENDING',
  'REPAIRING',
  'RETESTING',
  'REJUDGING',
  'REPAIR_COMPLETED',
  'REPAIR_FAILED',
]);
export type RepairState = z.infer<typeof RepairStateSchema>;

export const FixTaskSchema = z.object({
  id: z.string(),
  target_file: z.string(),
  issue: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  recommendation: z.string(),
  acceptance_criteria: z.array(z.string()).default([]),
  task_id: z.string().nullable().default(null),
  status: z.enum(['pending', 'in_progress', 'completed', 'failed']).default('pending'),
  created_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable().default(null),
});
export type FixTask = z.infer<typeof FixTaskSchema>;

export const RepairConfigSchema = z.object({
  max_iterations: z.number().int().positive().default(3),
  retest_after_fix: z.boolean().default(true),
  rejudge_after_retest: z.boolean().default(true),
});
export type RepairConfig = z.infer<typeof RepairConfigSchema>;

export const RepairIterationSchema = z.object({
  iteration_number: z.number().int().nonnegative(),
  state: RepairStateSchema,
  fix_tasks: z.array(FixTaskSchema).default([]),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime().nullable().default(null),
  summary: z.string().default(''),
});
export type RepairIteration = z.infer<typeof RepairIterationSchema>;
