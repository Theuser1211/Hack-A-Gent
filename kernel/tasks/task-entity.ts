import { v4 as uuid } from 'uuid';
import { z } from 'zod';

import { TaskStatusSchema, TaskTypeSchema, TaskPrioritySchema } from '../types/index.js';

// ── Acceptance Criterion ──────────────────────────────────────────────────

export const AcceptanceCriterionSchema = z.object({
  criterion_id: z.string(),
  description: z.string().min(1),
  verification_method: z.enum(['manual_review', 'automated_test', 'judge_evaluation', 'lint_check', 'build_check']),
  verified: z.boolean().default(false),
});

export type AcceptanceCriterion = z.infer<typeof AcceptanceCriterionSchema>;

// ── Retry Policy ──────────────────────────────────────────────────────────

export const RetryPolicySchema = z.object({
  max_retries: z.number().int().min(0).default(3),
  backoff_ms: z.number().int().min(0).default(1000),
  current_attempt: z.number().int().min(0).default(0),
});

export type RetryPolicy = z.infer<typeof RetryPolicySchema>;

// ── Task Error ────────────────────────────────────────────────────────────

export const TaskErrorSchema = z.object({
  code: z.enum([
    'TIMEOUT',
    'DEPENDENCY_FAILURE',
    'TOOL_FAILURE',
    'VALIDATION_FAILURE',
    'INTERNAL_ERROR',
    'CHECKPOINT_BLOCKED',
  ]),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime(),
});

export type TaskError = z.infer<typeof TaskErrorSchema>;

// ── Task Timestamps ───────────────────────────────────────────────────────

export const TaskTimestampsSchema = z.object({
  created_at: z.string().datetime(),
  assigned_at: z.string().datetime().nullable().default(null),
  started_at: z.string().datetime().nullable().default(null),
  completed_at: z.string().datetime().nullable().default(null),
  deadline: z.string().datetime().nullable().default(null),
});

export type TaskTimestamps = z.infer<typeof TaskTimestampsSchema>;

// ── Task Entity ───────────────────────────────────────────────────────────

export const TaskSchema = z.object({
  task_id: z.string().uuid(),
  project_id: z.string(),
  parent_task_id: z.string().nullable().default(null),
  creator_agent: z.string().min(1),
  assigned_agent: z.string().nullable().default(null),
  status: TaskStatusSchema.default('PENDING'),
  type: TaskTypeSchema,
  description: z.string().min(1),
  dependencies: z.array(z.string()).default([]),
  acceptance_criteria: z.array(AcceptanceCriterionSchema).default([]),
  retries: RetryPolicySchema.default({}),
  priority: TaskPrioritySchema.default('medium'),
  checkpoint_required: z.boolean().default(false),
  required_skills: z.array(z.string()).default([]),
  input: z.record(z.unknown()).default({}),
  expected_outputs: z.array(z.string()).default([]),
  error: TaskErrorSchema.nullable().default(null),
  timestamps: TaskTimestampsSchema,
});

export type Task = z.infer<typeof TaskSchema>;

// ── Task Factory ──────────────────────────────────────────────────────────

export interface CreateTaskParams {
  project_id: string;
  type: Task['type'];
  description: string;
  creator_agent: string;
  parent_task_id?: string | null;
  dependencies?: string[];
  acceptance_criteria?: AcceptanceCriterion[];
  priority?: Task['priority'];
  checkpoint_required?: boolean;
  required_skills?: string[];
  input?: Record<string, unknown>;
  expected_outputs?: string[];
  deadline?: string;
}

export function createTask(params: CreateTaskParams): Task {
  const now = new Date().toISOString();
  return TaskSchema.parse({
    task_id: uuid(),
    project_id: params.project_id,
    parent_task_id: params.parent_task_id ?? null,
    creator_agent: params.creator_agent,
    assigned_agent: null,
    status: 'PENDING',
    type: params.type,
    description: params.description,
    dependencies: params.dependencies ?? [],
    acceptance_criteria: params.acceptance_criteria ?? [],
    retries: { max_retries: 3, backoff_ms: 1000, current_attempt: 0 },
    priority: params.priority ?? 'medium',
    checkpoint_required: params.checkpoint_required ?? false,
    required_skills: params.required_skills ?? [],
    input: params.input ?? {},
    expected_outputs: params.expected_outputs ?? [],
    error: null,
    timestamps: {
      created_at: now,
      assigned_at: null,
      started_at: null,
      completed_at: null,
      deadline: params.deadline ?? null,
    },
  });
}

// ── Task Result ────────────────────────────────────────────────────────────

export const TaskResultSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(['COMPLETED', 'FAILED', 'SKIPPED']),
  exit_code: z.enum(['AGENT_OK', 'AGENT_FAIL', 'AGENT_FATAL', 'AGENT_SKIP']),
  artifacts: z.array(z.string()).default([]),
  criteria_results: z
    .array(
      z.object({
        criterion_id: z.string(),
        passed: z.boolean(),
        evidence: z.string(),
      }),
    )
    .default([]),
  summary: z.string(),
  error: TaskErrorSchema.nullable().default(null),
});

export type TaskResult = z.infer<typeof TaskResultSchema>;
