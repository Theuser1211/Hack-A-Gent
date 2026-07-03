import { z } from 'zod';

export const ModelCapabilitySchema = z.enum([
  'reasoning',
  'code_generation',
  'long_context',
  'function_calling',
  'json_output',
  'vision',
  'multilingual',
  'streaming',
]);
export type ModelCapability = z.infer<typeof ModelCapabilitySchema>;

export const ProviderIdSchema = z.enum(['gemini', 'nvidia', 'mistral', 'local', 'anthropic', 'openai', 'openrouter', 'custom']);
export type ProviderId = z.infer<typeof ProviderIdSchema>;

export const ProviderStatusSchema = z.enum(['healthy', 'degraded', 'unhealthy']);
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const ModelSpecSchema = z.object({
  model_id: z.string(),
  provider: ProviderIdSchema,
  capabilities: z.array(ModelCapabilitySchema).default([]),
  context_window: z.number().positive(),
  supports_json_mode: z.boolean().default(false),
  supports_tool_calling: z.boolean().default(false),
  typical_latency_ms: z.number().nonnegative().default(1000),
  cost_per_1k_input: z.number().nonnegative().default(0),
  cost_per_1k_output: z.number().nonnegative().default(0),
});
export type ModelSpec = z.infer<typeof ModelSpecSchema>;

export const ProviderHealthSchema = z.object({
  provider_id: ProviderIdSchema,
  status: ProviderStatusSchema.default('healthy'),
  last_check: z.string().datetime(),
  consecutive_failures: z.number().int().nonnegative().default(0),
  total_requests: z.number().int().nonnegative().default(0),
  failed_requests: z.number().int().nonnegative().default(0),
  avg_latency_ms: z.number().nonnegative().default(0),
});
export type ProviderHealth = z.infer<typeof ProviderHealthSchema>;

export const ProviderCapabilitiesSchema = z.object({
  provider_id: ProviderIdSchema,
  models: z.array(ModelSpecSchema).default([]),
  priority: z.number().int().nonnegative().default(10),
});
export type ProviderCapabilities = z.infer<typeof ProviderCapabilitiesSchema>;

export const RoutingDecisionSchema = z.object({
  model_id: z.string(),
  provider: ProviderIdSchema,
  confidence: z.number().min(0).max(1),
  fallback_level: z.number().int().nonnegative().default(0),
  reason: z.string(),
});
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;

export const RoutingTableEntrySchema = z.object({
  task_type: z.string(),
  preferred: z.string(),
  fallback: z.string(),
  emergency: z.string(),
});
export type RoutingTableEntry = z.infer<typeof RoutingTableEntrySchema>;

export const LLMRequestSchema = z.object({
  model_id: z.string(),
  provider: ProviderIdSchema,
  messages: z.array(
    z.object({
      role: z.enum(['system', 'user', 'assistant']),
      content: z.string(),
    }),
  ),
  temperature: z.number().min(0).max(2).default(0.3),
  max_tokens: z.number().int().positive().default(4096),
  response_format: z.enum(['text', 'json_object']).default('text'),
});
export type LLMRequest = z.infer<typeof LLMRequestSchema>;

export const LLMResponseSchema = z.object({
  content: z.string(),
  model_id: z.string(),
  provider: ProviderIdSchema,
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    total_tokens: z.number().int().nonnegative(),
  }),
  finish_reason: z.string().default('stop'),
  latency_ms: z.number().nonnegative().default(0),
});
export type LLMResponse = z.infer<typeof LLMResponseSchema>;
