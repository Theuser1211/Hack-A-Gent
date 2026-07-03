import { z } from 'zod';

export const ProjectType = z.enum(['node', 'python', 'unknown']);
export type ProjectType = z.infer<typeof ProjectType>;

export const BuildCommandResultSchema = z.object({
  command: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().nullable(),
  duration_ms: z.number(),
  success: z.boolean(),
  project_path: z.string(),
});
export type BuildCommandResult = z.infer<typeof BuildCommandResultSchema>;

export const BuildFailureSchema = z.object({
  type: z.enum(['compilation', 'dependency', 'lint', 'test', 'timeout', 'unknown']),
  message: z.string(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  column: z.number().nullable(),
  code: z.string().nullable(),
  command: z.string().nullable(),
});
export type BuildFailure = z.infer<typeof BuildFailureSchema>;

export const BuildWarningSchema = z.object({
  type: z.enum(['deprecation', 'style', 'unused_import', 'unused_variable', 'type_coercion', 'unknown']),
  message: z.string(),
  file: z.string().nullable(),
  line: z.number().nullable(),
  code: z.string().nullable(),
});
export type BuildWarning = z.infer<typeof BuildWarningSchema>;

export const BuildArtifactSchema = z.object({
  name: z.string(),
  path: z.string(),
  size_bytes: z.number().nullable(),
  type: z.enum(['binary', 'bundle', 'asset', 'report', 'log', 'other']),
});
export type BuildArtifact = z.infer<typeof BuildArtifactSchema>;

export const MaterializationResultSchema = z.object({
  success: z.boolean(),
  files_written: z.array(z.string()),
  directories_created: z.array(z.string()),
  root_path: z.string(),
  timestamp: z.string(),
  error: z.string().nullable(),
});
export type MaterializationResult = z.infer<typeof MaterializationResultSchema>;

export const RunningApplicationSchema = z.object({
  pid: z.number().nullable(),
  port: z.number().nullable(),
  url: z.string(),
  ready: z.boolean(),
  process_path: z.string(),
  started_at: z.string(),
  project_path: z.string(),
});
export type RunningApplication = z.infer<typeof RunningApplicationSchema>;

export const BuildSummarySchema = z.object({
  total_commands: z.number(),
  passed: z.number(),
  failed: z.number(),
  warnings: z.number(),
  duration_ms: z.number(),
  success: z.boolean(),
});
export type BuildSummary = z.infer<typeof BuildSummarySchema>;

export const BuildReportSchema = z.object({
  project_name: z.string(),
  repository_path: z.string(),
  materialized: MaterializationResultSchema,
  dependency_installation: BuildCommandResultSchema.nullable(),
  build_command: BuildCommandResultSchema.nullable(),
  lint_command: BuildCommandResultSchema.nullable(),
  test_command: BuildCommandResultSchema.nullable(),
  dev_server: RunningApplicationSchema.nullable().optional(),
  failures: z.array(BuildFailureSchema),
  warnings: z.array(BuildWarningSchema),
  artifacts: z.array(BuildArtifactSchema),
  summary: BuildSummarySchema,
  generated_at: z.string(),
});
export type BuildReport = z.infer<typeof BuildReportSchema>;
