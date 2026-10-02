import { z } from 'zod';

export const ContextItemSchema = z.object({
  id: z.string(),
  source: z.enum(['memory', 'file', 'skill', 'output', 'system']),
  content: z.string(),
  relevance_score: z.number().min(0).max(100).default(0),
  token_count: z.number().int().nonnegative().default(0),
  timestamp: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).default({}),
});
export type ContextItem = z.infer<typeof ContextItemSchema>;

export const ContextPackageSchema = z.object({
  items: z.array(ContextItemSchema).default([]),
  total_tokens: z.number().int().nonnegative().default(0),
  budget: z.number().int().positive().default(4096),
  sufficient: z.boolean().default(false),
  warnings: z.array(z.string()).default([]),
});
export type ContextPackage = z.infer<typeof ContextPackageSchema>;

export interface ContextOptions {
  taskType: string;
  modelContextWindow: number;
  requiredItems?: string[];
  budgetRatios?: Record<string, number>;
}
