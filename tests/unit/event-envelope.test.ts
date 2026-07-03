import { describe, it, expect } from 'vitest';

import { createEvent, EventEnvelopeSchema } from '../../kernel/events/event-envelope.js';

describe('EventEnvelope', () => {
  it('creates a valid event envelope with required fields', () => {
    const event = createEvent({
      type: 'TASK_CREATED',
      source: 'orchestrator',
      target: 'execution',
      payload: { taskId: 'abc-123' },
    });

    expect(event.event_id).toBeDefined();
    expect(event.type).toBe('TASK_CREATED');
    expect(event.source).toBe('orchestrator');
    expect(event.target).toBe('execution');
    expect(event.timestamp).toBeDefined();
    expect(event.payload.taskId).toBe('abc-123');
    expect(event.correlation_id).toBe(event.event_id);
    expect(event.causation_id).toBeNull();
  });

  it('sets correlation_id from params when provided', () => {
    const corrId = '00000000-0000-0000-0000-000000000001';
    const causeId = '00000000-0000-0000-0000-000000000002';

    const event = createEvent({
      type: 'TASK_COMPLETED',
      source: 'agent.backend',
      target: 'orchestrator',
      correlation_id: corrId,
      causation_id: causeId,
    });

    expect(event.correlation_id).toBe(corrId);
    expect(event.causation_id).toBe(causeId);
  });

  it('validates type must be UPPER_SNAKE_CASE', () => {
    expect(() =>
      createEvent({
        type: 'task_created',
        source: 'test',
        target: '*',
      }),
    ).toThrow();
  });

  it('validates event_id is uuid', () => {
    const event = createEvent({
      type: 'TEST_EVENT',
      source: 'test',
      target: '*',
    });
    expect(() => EventEnvelopeSchema.parse({ ...event, event_id: 'not-a-uuid' })).toThrow();
  });

  it('supports array targets for broadcast', () => {
    const event = createEvent({
      type: 'PHASE_STARTED',
      source: 'orchestrator',
      target: ['agent.frontend', 'agent.backend'],
    });

    expect(Array.isArray(event.target)).toBe(true);
    expect(event.target).toContain('agent.frontend');
    expect(event.target).toContain('agent.backend');
  });

  it('applies default metadata correctly', () => {
    const event = createEvent({
      type: 'TEST_EVENT',
      source: 'test',
      target: '*',
    });

    expect(event.metadata.priority).toBe('normal');
    expect(event.metadata.delivery_guarantee).toBe('at_least_once');
    expect(event.metadata.ttl_ms).toBe(300000);
    expect(event.metadata.retry_count).toBe(0);
    expect(event.metadata.max_retries).toBe(3);
    expect(event.metadata.blocking).toBe(false);
    expect(event.metadata.persist).toBe(true);
  });

  it('merges custom metadata with defaults', () => {
    const event = createEvent({
      type: 'TEST_EVENT',
      source: 'test',
      target: '*',
      metadata: { priority: 'critical', blocking: true, ttl_ms: 5000 },
    });

    expect(event.metadata.priority).toBe('critical');
    expect(event.metadata.blocking).toBe(true);
    expect(event.metadata.ttl_ms).toBe(5000);
    expect(event.metadata.delivery_guarantee).toBe('at_least_once'); // default
  });
});
