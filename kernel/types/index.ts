import { z } from 'zod';

// ── Agent Types ──────────────────────────────────────────────────────────

export const AgentTypeSchema = z.enum([
  'orchestrator',
  'planner',
  'question',
  'architect',
  'execution',
  'subagent',
  'judge',
  'infrastructure',
  'utility',
]);
export type AgentType = z.infer<typeof AgentTypeSchema>;

export const TaskTypeSchema = z.enum([
  'analysis',
  'planning',
  'architecture',
  'implementation',
  'testing',
  'judging',
  'documentation',
  'devops',
  'fix',
  'refactor',
  'review',
]);
export type TaskType = z.infer<typeof TaskTypeSchema>;

export const TaskStatusSchema = z.enum([
  'PENDING',
  'READY',
  'RUNNING',
  'WAITING',
  'BLOCKED',
  'FAILED',
  'COMPLETED',
  'SKIPPED',
]);
export type TaskStatus = z.infer<typeof TaskStatusSchema>;

export const TaskPrioritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;

// ── Phase Types ───────────────────────────────────────────────────────────

export const PhaseSchema = z.enum([
  'INIT',
  'ANALYZING',
  'QUESTIONING',
  'AWAITING_ANSWERS',
  'PLANNING',
  'ARCHITECTING',
  'BUILDING',
  'TESTING',
  'JUDGING',
  'DECIDING',
  'FIX_AND_RETEST',
  'SUBMITTING',
  'FAILED',
  'COMPLETED',
]);
export type Phase = z.infer<typeof PhaseSchema>;

// ── Event Types ───────────────────────────────────────────────────────────

export const EventTypeSchema = z.string().regex(/^[A-Z][A-Z0-9_]+$/);
export type EventType = z.infer<typeof EventTypeSchema>;

export const EventDeliverySchema = z.enum(['at_most_once', 'at_least_once', 'exactly_once']);
export type EventDelivery = z.infer<typeof EventDeliverySchema>;

export const EventPrioritySchema = z.enum(['critical', 'high', 'normal', 'low']);
export type EventPriority = z.infer<typeof EventPrioritySchema>;

// ── Memory Types ──────────────────────────────────────────────────────────

export const MemoryFileSchema = z.enum(['AGENT_LOG.md', 'BUGS.md', 'DECISIONS.md', 'TODO.md']);
export type MemoryFile = z.infer<typeof MemoryFileSchema>;

export const MemoryAccessSchema = z.enum(['append', 'read', 'update', 'admin']);
export type MemoryAccess = z.infer<typeof MemoryAccessSchema>;

// ── Workspace Types ───────────────────────────────────────────────────────

export const AccessLevelSchema = z.enum(['read', 'write', 'delete', 'admin']);
export type AccessLevel = z.infer<typeof AccessLevelSchema>;

// ── Recovery Types ────────────────────────────────────────────────────────

export const AnomalyTypeSchema = z.enum([
  'infinite_loop',
  'failure_burst',
  'hallucinated_file',
  'broken_build',
  'stuck_checkpoint',
  'context_thrashing',
]);
export type AnomalyType = z.infer<typeof AnomalyTypeSchema>;

export const AnomalySeveritySchema = z.enum(['low', 'medium', 'high', 'critical']);
export type AnomalySeverity = z.infer<typeof AnomalySeveritySchema>;

// ── Checkpoint Types ──────────────────────────────────────────────────────

export const CheckpointTypeSchema = z.enum([
  'github_repo_creation',
  'api_key_insertion',
  'deployment_approval',
  'design_decision',
  'scope_confirmation',
  'submission_review',
  'custom',
]);
export type CheckpointType = z.infer<typeof CheckpointTypeSchema>;

export const CheckpointStatusSchema = z.enum(['pending', 'waiting', 'resolved', 'expired', 'overridden']);
export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;
