import { v4 as uuid } from 'uuid';
import { z } from 'zod';

import type { EventDelivery, EventPriority } from '../types/index.js';

// ── Zod Schema ────────────────────────────────────────────────────────────

export const EventMetadataSchema = z.object({
  priority: z.enum(['critical', 'high', 'normal', 'low']).default('normal'),
  delivery_guarantee: z.enum(['at_most_once', 'at_least_once', 'exactly_once']).default('at_least_once'),
  ttl_ms: z.number().int().positive().default(300000),
  retry_count: z.number().int().min(0).default(0),
  max_retries: z.number().int().min(0).default(3),
  blocking: z.boolean().default(false),
  persist: z.boolean().default(true),
});

export const EventEnvelopeSchema = z.object({
  event_id: z.string().uuid(),
  type: z.string().regex(/^[A-Z][A-Z0-9_]+$/),
  source: z.string().min(1),
  target: z.union([z.string(), z.array(z.string())]),
  timestamp: z.string().datetime(),
  schema_version: z
    .string()
    .regex(/^\d+\.\d+$/)
    .default('1.0'),
  correlation_id: z.string().uuid(),
  causation_id: z.string().uuid().nullable().default(null),
  payload: z.record(z.unknown()).default({}),
  metadata: EventMetadataSchema,
});

export type EventMetadata = z.infer<typeof EventMetadataSchema>;
export type EventEnvelope = z.infer<typeof EventEnvelopeSchema>;

// ── Factory ───────────────────────────────────────────────────────────────

export interface CreateEventParams {
  type: string;
  source: string;
  target: string | string[];
  payload?: Record<string, unknown>;
  correlation_id?: string;
  causation_id?: string | null;
  metadata?: Partial<EventMetadata>;
}

export function createEvent(params: CreateEventParams): EventEnvelope {
  const now = new Date().toISOString();
  const eventId = uuid();

  return EventEnvelopeSchema.parse({
    event_id: eventId,
    type: params.type,
    source: params.source,
    target: params.target,
    timestamp: now,
    correlation_id: params.correlation_id ?? eventId,
    causation_id: params.causation_id ?? null,
    payload: params.payload ?? {},
    metadata: {
      priority: params.metadata?.priority ?? 'normal',
      delivery_guarantee: params.metadata?.delivery_guarantee ?? 'at_least_once',
      ttl_ms: params.metadata?.ttl_ms ?? 300_000,
      retry_count: params.metadata?.retry_count ?? 0,
      max_retries: params.metadata?.max_retries ?? 3,
      blocking: params.metadata?.blocking ?? false,
      persist: params.metadata?.persist ?? true,
    },
  });
}

// ── Event Ack ─────────────────────────────────────────────────────────────

export const EventAckSchema = z.object({
  event_id: z.string().uuid(),
  receiver: z.string().min(1),
  status: z.enum(['accepted', 'rejected', 'deferred']),
  reason: z.string().optional(),
});

export type EventAck = z.infer<typeof EventAckSchema>;
