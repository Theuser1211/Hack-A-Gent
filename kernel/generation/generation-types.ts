import { z } from 'zod';

export const CodeGenerationLevel = z.enum(['file', 'module', 'repository']);
export type CodeGenerationLevel = z.infer<typeof CodeGenerationLevel>;

export const CodeGenerationContextSchema = z.object({
  blueprint: z.record(z.unknown()),
  build_report: z.record(z.unknown()).nullable().default(null),
  previous_fix_tasks: z.array(z.record(z.unknown())).default([]),
  level: CodeGenerationLevel.default('module'),
  module_type: z.enum(['frontend', 'backend', 'database', 'config', 'docs', 'tests']).nullable().default(null),
  target_file: z.string().nullable().default(null),
  project_name: z.string(),
  project_type: z.enum(['node', 'python', 'unknown']).default('unknown'),
});
export type CodeGenerationContext = z.infer<typeof CodeGenerationContextSchema>;

export const CodeGenerationPromptSchema = z.object({
  system_prompt: z.string(),
  user_prompt: z.string(),
  response_format: z.enum(['text', 'json_object']).default('json_object'),
  model_preference: z.string().nullable().default(null),
  max_tokens: z.number().int().positive().default(8192),
  temperature: z.number().min(0).max(2).default(0.3),
});
export type CodeGenerationPrompt = z.infer<typeof CodeGenerationPromptSchema>;

export const FileDependencySchema = z.object({
  source: z.string(),
  type: z.enum(['import', 'require', 'dynamic_import', 'reference']).default('import'),
  specifier: z.string(),
});
export type FileDependency = z.infer<typeof FileDependencySchema>;

export const FileExportSchema = z.object({
  name: z.string(),
  type: z.enum(['function', 'class', 'interface', 'type', 'const', 'default', 'variable']).default('function'),
});
export type FileExport = z.infer<typeof FileExportSchema>;

export const StructuredCodeOutputSchema = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string(),
  dependencies: z.array(FileDependencySchema).default([]),
  exports: z.array(FileExportSchema).default([]),
  imports: z.array(z.string()).default([]),
  validation_errors: z.array(z.string()).default([]),
  validated: z.boolean().default(false),
});
export type StructuredCodeOutput = z.infer<typeof StructuredCodeOutputSchema>;

export const FileGenerationResultSchema = z.object({
  file: StructuredCodeOutputSchema,
  attempt: z.number().int().nonnegative().default(0),
  success: z.boolean(),
  error: z.string().nullable().default(null),
  latency_ms: z.number().nonnegative().default(0),
  tokens_used: z.number().int().nonnegative().default(0),
  model_used: z.string().nullable().default(null),
  retried: z.boolean().default(false),
  fallback_used: z.boolean().default(false),
});
export type FileGenerationResult = z.infer<typeof FileGenerationResultSchema>;

export const ModuleGenerationResultSchema = z.object({
  module_name: z.string(),
  module_type: z.enum(['frontend', 'backend', 'database', 'config', 'docs', 'tests']),
  files: z.array(FileGenerationResultSchema),
  success: z.boolean(),
  total_latency_ms: z.number().nonnegative().default(0),
  total_tokens: z.number().int().nonnegative().default(0),
  error: z.string().nullable().default(null),
});
export type ModuleGenerationResult = z.infer<typeof ModuleGenerationResultSchema>;

export const RepositoryGenerationResultSchema = z.object({
  project_name: z.string(),
  modules: z.array(ModuleGenerationResultSchema),
  success: z.boolean(),
  total_latency_ms: z.number().nonnegative().default(0),
  total_tokens: z.number().int().nonnegative().default(0),
  error: z.string().nullable().default(null),
});
export type RepositoryGenerationResult = z.infer<typeof RepositoryGenerationResultSchema>;

export const GenerationAttemptSchema = z.object({
  attempt_number: z.number().int().positive(),
  prompt_used: CodeGenerationPromptSchema,
  result: FileGenerationResultSchema.nullable().default(null),
  error: z.string().nullable().default(null),
  model_used: z.string(),
  fallback_level: z.number().int().nonnegative().default(0),
});
export type GenerationAttempt = z.infer<typeof GenerationAttemptSchema>;

export const SelfRepairConfigSchema = z.object({
  max_attempts: z.number().int().positive().default(3),
  prompt_variation_strategy: z
    .enum(['more_detailed', 'simplify', 'example_driven', 'error_focused'])
    .default('more_detailed'),
  use_fallback_model: z.boolean().default(true),
  use_alternative_provider: z.boolean().default(true),
});
export type SelfRepairConfig = z.infer<typeof SelfRepairConfigSchema>;

export const PatchOperationSchema = z.object({
  type: z.enum(['replace', 'insert_before', 'insert_after', 'delete', 'append', 'prepend']),
  target: z.string(),
  content: z.string(),
  line: z.number().int().nonnegative().nullable().default(null),
});
export type PatchOperation = z.infer<typeof PatchOperationSchema>;

export const FilePatchSchema = z.object({
  file_path: z.string(),
  operations: z.array(PatchOperationSchema),
  language: z.string(),
});
export type FilePatch = z.infer<typeof FilePatchSchema>;

export const CodeRepairResultSchema = z.object({
  file_path: z.string(),
  original_content: z.string(),
  patched_content: z.string(),
  operations_applied: z.array(PatchOperationSchema),
  success: z.boolean(),
  error: z.string().nullable().default(null),
  latency_ms: z.number().nonnegative().default(0),
});
export type CodeRepairResult = z.infer<typeof CodeRepairResultSchema>;
