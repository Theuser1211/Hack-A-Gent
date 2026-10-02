import { z, type ZodType } from 'zod';

import type { ArchitectureBlueprint } from '../planning/architect-types.js';

export interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
  description?: string;
  overwrite?: boolean;
}

export const GeneratedFileSchema: z.ZodType<GeneratedFile> = z.object({
  path: z.string(),
  content: z.string(),
  language: z.string().optional(),
  description: z.string().optional(),
  overwrite: z.boolean().optional().default(true),
});

export interface GeneratedDirectory {
  path: string;
  files?: GeneratedFile[];
  subdirectories?: GeneratedDirectory[];
  description?: string;
}

export const GeneratedDirectorySchema: z.ZodType<GeneratedDirectory> = z.object({
  path: z.string(),
  files: z.array(GeneratedFileSchema).default([]),
  subdirectories: z.array(z.lazy(() => GeneratedDirectorySchema as z.ZodType<GeneratedDirectory>)).default([]),
  description: z.string().optional(),
});

export const GeneratedModuleSchema = z.object({
  name: z.string(),
  type: z.enum(['frontend', 'backend', 'database', 'config', 'docs', 'tests']),
  files: z.array(GeneratedFileSchema).default([]),
  description: z.string().optional(),
});
export type GeneratedModule = z.infer<typeof GeneratedModuleSchema>;

export const BuildIssueSchema = z.object({
  type: z.enum(['error', 'warning', 'info']),
  message: z.string(),
  file: z.string().optional(),
  code: z.string().optional(),
});
export type BuildIssue = z.infer<typeof BuildIssueSchema>;

export const BuildResultSchema = z.object({
  success: z.boolean(),
  modules: z.array(GeneratedModuleSchema).default([]),
  issues: z.array(BuildIssueSchema).default([]),
  summary: z.string(),
  started_at: z.string().datetime(),
  completed_at: z.string().datetime(),
});
export type BuildResult = z.infer<typeof BuildResultSchema>;

export const GeneratedRepositorySchema = z.object({
  project_name: z.string(),
  blueprint_version: z.string().default('1.0.0'),
  modules: z.array(GeneratedModuleSchema).default([]),
  total_files: z.number().int().nonnegative(),
  total_lines: z.number().int().nonnegative(),
  generated_at: z.string().datetime(),
  build_results: z.array(BuildResultSchema).default([]),
});
export type GeneratedRepository = z.infer<typeof GeneratedRepositorySchema>;

export interface BuilderInput {
  blueprint: ArchitectureBlueprint;
  projectId: string;
  workspacePath: string;
}
