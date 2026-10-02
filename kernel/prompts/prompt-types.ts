import { z } from 'zod';

export const PromptComponentSchema = z.object({
  id: z.string(),
  priority: z.number().int().nonnegative(),
  max_tokens: z.number().int().positive(),
  required: z.boolean().default(false),
  content: z.string().default(''),
  rendered: z.string().default(''),
});
export type PromptComponent = z.infer<typeof PromptComponentSchema>;

export const PromptTemplateSchema = z.object({
  template_id: z.string(),
  role: z.string(),
  description: z.string(),
  components: z.array(z.string()).default([]),
  typical_tokens: z.number().int().positive().default(4096),
});
export type PromptTemplate = z.infer<typeof PromptTemplateSchema>;

export const PromptAssemblySchema = z.object({
  system_prompt: z.string(),
  messages: z
    .array(
      z.object({
        role: z.enum(['system', 'user', 'assistant']),
        content: z.string(),
      }),
    )
    .default([]),
  token_count: z.number().int().nonnegative().default(0),
  budget: z.number().int().positive().default(4096),
  within_budget: z.boolean().default(true),
  warnings: z.array(z.string()).default([]),
});
export type PromptAssembly = z.infer<typeof PromptAssemblySchema>;

export const ComponentRenderFnSchema = z.function().args(z.any()).returns(z.promise(z.string()));
export type ComponentRenderFn = (context: Record<string, unknown>) => Promise<string>;
