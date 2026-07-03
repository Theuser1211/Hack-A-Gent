import { z } from 'zod';

// ── Recommended Stack ──────────────────────────────────────────────────────

export const TechnologySchema = z.object({
  name: z.string(),
  version: z.string().optional(),
  purpose: z.string(),
  alternatives: z.array(z.string()).default([]),
  rationale: z.string().optional(),
});

export type Technology = z.infer<typeof TechnologySchema>;

export const RecommendedStackSchema = z.object({
  frontend: z.array(TechnologySchema).default([]),
  backend: z.array(TechnologySchema).default([]),
  database: z.array(TechnologySchema).default([]),
  infrastructure: z.array(TechnologySchema).default([]),
  tooling: z.array(TechnologySchema).default([]),
});

export type RecommendedStack = z.infer<typeof RecommendedStackSchema>;

// ── Folder Structure ───────────────────────────────────────────────────────

export const FolderEntrySchema: z.ZodType<unknown> = z.object({
  path: z.string(),
  type: z.enum(['file', 'dir']),
  description: z.string().optional(),
  children: z.array(z.lazy(() => FolderEntrySchema)).default([]),
});

export type FolderEntry = z.infer<typeof FolderEntrySchema>;

export const FolderStructureSchema = z.object({
  root: z.string(),
  entries: z.array(FolderEntrySchema).default([]),
});

export type FolderStructure = z.infer<typeof FolderStructureSchema>;

// ── Database Schema ────────────────────────────────────────────────────────

export const ColumnSchema = z.object({
  name: z.string(),
  type: z.string(),
  nullable: z.boolean().default(false),
  primary_key: z.boolean().default(false),
  unique: z.boolean().default(false),
  default: z.string().optional(),
  references: z.string().optional(),
  description: z.string().optional(),
});

export type Column = z.infer<typeof ColumnSchema>;

export const IndexSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  unique: z.boolean().default(false),
});

export type Index = z.infer<typeof IndexSchema>;

export const TableSchema = z.object({
  name: z.string(),
  columns: z.array(ColumnSchema),
  indexes: z.array(IndexSchema).default([]),
  description: z.string().optional(),
});

export type Table = z.infer<typeof TableSchema>;

export const DatabaseSchema = z.object({
  engine: z.string(),
  tables: z.array(TableSchema).default([]),
  relationships: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
        description: z.string().optional(),
      }),
    )
    .default([]),
});

// ── API Contracts ──────────────────────────────────────────────────────────

export const RequestSchemaSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string(),
  description: z.string(),
  auth_required: z.boolean().default(false),
  request_body: z.string().optional(),
  response_body: z.string().optional(),
  query_params: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean().default(false),
        description: z.string().optional(),
      }),
    )
    .default([]),
  path_params: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  error_responses: z
    .array(
      z.object({
        status_code: z.number(),
        description: z.string(),
      }),
    )
    .default([]),
});

export type RequestSchema = z.infer<typeof RequestSchemaSchema>;

export const ApiContractSchema = z.object({
  endpoints: z.array(RequestSchemaSchema).default([]),
  base_url: z.string().optional(),
  auth_scheme: z.string().optional(),
});

export type ApiContract = z.infer<typeof ApiContractSchema>;

// ── Frontend Modules ───────────────────────────────────────────────────────

export const ComponentSchema = z.object({
  name: z.string(),
  description: z.string(),
  props: z
    .array(
      z.object({
        name: z.string(),
        type: z.string(),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
  state_management: z.string().optional(),
  dependencies: z.array(z.string()).default([]),
});

export type Component = z.infer<typeof ComponentSchema>;

export const FrontendModuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  route: z.string().optional(),
  components: z.array(ComponentSchema).default([]),
  services: z.array(z.string()).default([]),
});

export type FrontendModule = z.infer<typeof FrontendModuleSchema>;

// ── Backend Modules ────────────────────────────────────────────────────────

export const BackendModuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  endpoints: z.array(z.string()).default([]),
  dependencies: z.array(z.string()).default([]),
  environment_variables: z
    .array(
      z.object({
        name: z.string(),
        description: z.string(),
        required: z.boolean().default(false),
      }),
    )
    .default([]),
});

export type BackendModule = z.infer<typeof BackendModuleSchema>;

// ── Milestones ─────────────────────────────────────────────────────────────

export const MilestoneTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  estimated_hours: z.number().positive(),
  assigned_to: z.string().optional(),
  depends_on: z.array(z.string()).default([]),
});

export type MilestoneTask = z.infer<typeof MilestoneTaskSchema>;

export const MilestoneSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  due_offset_hours: z.number().positive(),
  tasks: z.array(MilestoneTaskSchema).default([]),
  deliverables: z.array(z.string()).default([]),
  verification: z.string().optional(),
});

export type Milestone = z.infer<typeof MilestoneSchema>;

// ── Execution Graph ────────────────────────────────────────────────────────

export const ExecutionNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  description: z.string().optional(),
  type: z.enum(['task', 'decision', 'parallel', 'checkpoint', 'subprocess']),
  estimated_duration_minutes: z.number().positive().optional(),
  depends_on: z.array(z.string()).default([]),
});

export type ExecutionNode = z.infer<typeof ExecutionNodeSchema>;

export const ExecutionEdgeSchema = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  condition: z.string().optional(),
});

export type ExecutionEdge = z.infer<typeof ExecutionEdgeSchema>;

export type ExecutionGraph = z.infer<typeof ExecutionGraphSchema>;

export const ExecutionGraphSchema = z.object({
  nodes: z.array(ExecutionNodeSchema).default([]),
  edges: z.array(ExecutionEdgeSchema).default([]),
  entry_point: z.string(),
});

// ── Required Skills ────────────────────────────────────────────────────────

export const SkillRequirementSchema = z.object({
  skill: z.string(),
  level: z.enum(['beginner', 'intermediate', 'advanced', 'expert']),
  required: z.boolean().default(true),
  notes: z.string().optional(),
});

export type SkillRequirement = z.infer<typeof SkillRequirementSchema>;

// ── Human Checkpoints ──────────────────────────────────────────────────────

export const HumanCheckpointSchema = z.object({
  id: z.string(),
  phase: z.string(),
  question: z.string(),
  options: z.array(z.string()).default([]),
  required: z.boolean().default(true),
  description: z.string().optional(),
});

export type HumanCheckpoint = z.infer<typeof HumanCheckpointSchema>;

// ── Architecture Blueprint ─────────────────────────────────────────────────

export const ArchitectureBlueprintSchema = z.object({
  project_name: z.string(),
  version: z.string().default('1.0.0'),
  summary: z.string(),
  recommended_stack: RecommendedStackSchema,
  folder_structure: FolderStructureSchema,
  database_schema: DatabaseSchema,
  api_contracts: ApiContractSchema,
  frontend_modules: z.array(FrontendModuleSchema).default([]),
  backend_modules: z.array(BackendModuleSchema).default([]),
  milestones: z.array(MilestoneSchema).default([]),
  execution_graph: ExecutionGraphSchema,
  required_skills: z.array(SkillRequirementSchema).default([]),
  risks: z
    .array(
      z.object({
        category: z.enum(['technical', 'time', 'scope', 'team', 'external']),
        description: z.string(),
        severity: z.enum(['low', 'medium', 'high']),
        mitigation: z.string().optional(),
      }),
    )
    .default([]),
  human_checkpoints: z.array(HumanCheckpointSchema).default([]),
  generated_at: z.string().datetime(),
  architect_version: z.string().default('1.0.0'),
});

export type ArchitectureBlueprint = z.infer<typeof ArchitectureBlueprintSchema>;
