import { z } from 'zod';

export const SkillTypeSchema = z.enum(['framework', 'database', 'tool', 'library', 'pattern', 'platform']);
export type SkillType = z.infer<typeof SkillTypeSchema>;

export const SkillMetadataSchema = z.object({
  skill_id: z.string(),
  name: z.string(),
  version: z.string(),
  description: z.string().default(''),
  type: SkillTypeSchema,
  technology: z.string(),
  dependencies: z.array(z.string()).default([]),
  conflicts_with: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  estimated_tokens: z.number().int().positive().default(1000),
});
export type SkillMetadata = z.infer<typeof SkillMetadataSchema>;

export const ResolvedSkillSchema = z.object({
  metadata: SkillMetadataSchema,
  content: z.string().default(''),
  resolution_path: z.array(z.string()).default([]),
});
export type ResolvedSkill = z.infer<typeof ResolvedSkillSchema>;

export const ConflictReportSchema = z.object({
  has_conflicts: z.boolean().default(false),
  conflicts: z
    .array(
      z.object({
        skill_a: z.string(),
        skill_b: z.string(),
        description: z.string(),
      }),
    )
    .default([]),
});
export type ConflictReport = z.infer<typeof ConflictReportSchema>;
