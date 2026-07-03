import { z } from 'zod';

import { AgentTypeSchema, TaskTypeSchema, MemoryAccessSchema, AccessLevelSchema } from '../types/index.js';

// ── Agent Capability ──────────────────────────────────────────────────────

export const AgentCapabilitySchema = z.object({
  capability_id: z.string(),
  description: z.string(),
  input_schema: z.record(z.unknown()).default({}),
  output_schema: z.record(z.unknown()).default({}),
});

export type AgentCapability = z.infer<typeof AgentCapabilitySchema>;

// ── Output Specification ──────────────────────────────────────────────────

export const OutputSpecificationSchema = z.object({
  output_id: z.string(),
  description: z.string(),
  mime_type: z.string(),
  path_template: z.string(),
});

export type OutputSpecification = z.infer<typeof OutputSpecificationSchema>;

// ── Tool Permission ──────────────────────────────────────────────────────

export const ToolPermissionSchema = z.object({
  tool_name: z.string(),
  access_level: AccessLevelSchema,
  constraints: z.record(z.unknown()).optional(),
});

export type ToolPermission = z.infer<typeof ToolPermissionSchema>;

// ── Memory Permission ────────────────────────────────────────────────────

export const MemoryPermissionSchema = z.object({
  file: z.enum(['AGENT_LOG.md', 'BUGS.md', 'DECISIONS.md', 'TODO.md']),
  access: MemoryAccessSchema,
});

export type MemoryPermission = z.infer<typeof MemoryPermissionSchema>;

// ── Escalation Rule ──────────────────────────────────────────────────────

export const EscalationRuleSchema = z.object({
  condition: z.enum([
    'max_retries_exceeded',
    'timeout_reached',
    'invalid_input',
    'tool_failure',
    'missing_information',
    'ambiguous_state',
  ]),
  action: z.enum([
    'emit_error_event',
    'request_human_checkpoint',
    'request_task_reassignment',
    'rollback_to_recovery_point',
    'abort_phase',
  ]),
  message: z.string().optional(),
});

export type EscalationRule = z.infer<typeof EscalationRuleSchema>;

// ── Agent Manifest ───────────────────────────────────────────────────────

export const AgentManifestSchema = z.object({
  agent_id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9]+)*$/),
  agent_name: z.string(),
  agent_type: AgentTypeSchema,
  contract_version: z.string().regex(/^\d+\.\d+\.\d+$/),
  capabilities: z.array(AgentCapabilitySchema).default([]),
  required_skills: z.array(z.string()).default([]),
  event_subscriptions: z.array(z.string()).default([]),
  accepted_tasks: z.array(TaskTypeSchema).default([]),
  produced_outputs: z.array(OutputSpecificationSchema).default([]),
  accessible_tools: z.array(ToolPermissionSchema).default([]),
  accessible_memories: z.array(MemoryPermissionSchema).default([]),
  escalation_rules: z.array(EscalationRuleSchema).default([]),
  timeout_ms: z.number().int().positive().default(300000),
  max_retries: z.number().int().min(0).default(3),
});

export type AgentManifest = z.infer<typeof AgentManifestSchema>;

// ── Agent Registration ──────────────────────────────────────────────────

export const AgentRegistrationSchema = z.object({
  manifest: AgentManifestSchema,
  endpoint: z.string(),
  health_check: z.object({
    type: z.enum(['heartbeat', 'ping']).default('heartbeat'),
    interval_ms: z.number().int().positive().default(30000),
  }),
});

export type AgentRegistration = z.infer<typeof AgentRegistrationSchema>;
