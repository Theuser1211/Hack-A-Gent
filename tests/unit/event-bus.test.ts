import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EventBus } from '../../kernel/events/event-bus.js';
import { createEvent } from '../../kernel/events/event-envelope.js';

describe('EventBus', () => {
  let bus: EventBus;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    bus = new EventBus(path.join(tmpDir, 'events'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts and stops', async () => {
    expect(bus.isRunning()).toBe(false);
    await bus.start();
    expect(bus.isRunning()).toBe(true);
    await bus.stop();
    expect(bus.isRunning()).toBe(false);
  });

  it('delivers events to subscribed handlers', async () => {
    const received: string[] = [];
    bus.subscribe('test-agent', 'TEST_EVENT', async (event) => {
      received.push(event.type);
    });

    await bus.publish(createEvent({ type: 'TEST_EVENT', source: 'test', target: 'test-agent' }));

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('TEST_EVENT');
  });

  it('supports wildcard broadcast target', async () => {
    const received: string[] = [];
    bus.subscribe('agent-1', 'BROADCAST_EVENT', async (event) => {
      received.push('agent-1');
    });
    bus.subscribe('agent-2', 'BROADCAST_EVENT', async (event) => {
      received.push('agent-2');
    });

    await bus.publish(createEvent({ type: 'BROADCAST_EVENT', source: 'test', target: '*' }));

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(2);
    expect(received).toContain('agent-1');
    expect(received).toContain('agent-2');
  });

  it('filters events by subscriber filter', async () => {
    const received: string[] = [];
    bus.subscribe(
      'filter-agent',
      'FILTERED_EVENT',
      async (event) => {
        received.push(event.payload.value as string);
      },
      (event) => event.payload.include === true,
    );

    await bus.publish(
      createEvent({
        type: 'FILTERED_EVENT',
        source: 'test',
        target: 'filter-agent',
        payload: { value: 'included', include: true },
      }),
    );
    await bus.publish(
      createEvent({
        type: 'FILTERED_EVENT',
        source: 'test',
        target: 'filter-agent',
        payload: { value: 'excluded', include: false },
      }),
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(1);
    expect(received[0]).toBe('included');
  });

  it('sends failed events to dead letter queue after max retries', async () => {
    let attempts = 0;
    bus.subscribe('failing-agent', 'FAIL_EVENT', async () => {
      attempts++;
      throw new Error('always fails');
    });

    await bus.publish(
      createEvent({
        type: 'FAIL_EVENT',
        source: 'test',
        target: 'failing-agent',
        metadata: { max_retries: 2, ttl_ms: 5000 },
      }),
    );

    await new Promise((r) => setTimeout(r, 500));

    const dlq = bus.getDeadLetterQueue();
    const count = await dlq.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  it('unsubscribe removes only the matching subscription when multiple exist for same pattern', async () => {
    const received1: string[] = [];
    const received2: string[] = [];
    const id1 = bus.subscribe('agent-1', 'SHARED_EVENT', async () => {
      received1.push('a1');
    });
    bus.subscribe('agent-2', 'SHARED_EVENT', async () => {
      received2.push('a2');
    });

    // Unsubscribe only agent-1
    bus.unsubscribe(id1);

    await bus.publish(createEvent({ type: 'SHARED_EVENT', source: 'test', target: 'agent-2' }));

    await new Promise((r) => setTimeout(r, 100));
    expect(received1).toHaveLength(0);
    expect(received2).toHaveLength(1);
  });

  it('unsubscribes handlers', async () => {
    const received: string[] = [];
    const id = bus.subscribe('temp-agent', 'UNSUB_EVENT', async (event) => {
      received.push(event.type);
    });

    bus.unsubscribe(id);

    await bus.publish(createEvent({ type: 'UNSUB_EVENT', source: 'test', target: 'temp-agent' }));

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toHaveLength(0);
  });

  it('replays events from JSONL store', async () => {
    // Publish a few events
    for (let i = 0; i < 3; i++) {
      await bus.publish(
        createEvent({
          type: 'REPLAY_TEST',
          source: 'test',
          target: '*',
          payload: { index: i },
        }),
      );
    }

    await new Promise((r) => setTimeout(r, 200));

    // Replay
    const replayed: number[] = [];
    for await (const event of bus.replay()) {
      if (event.type === 'REPLAY_TEST') {
        replayed.push(event.payload.index as number);
      }
    }

    expect(replayed).toHaveLength(3);
    expect(replayed).toEqual(expect.arrayContaining([0, 1, 2]));
  });

  it('acknowledge sends rejected events to DLQ', async () => {
    // First publish a real event so we can reference it
    const event = createEvent({
      type: 'ACK_TEST',
      source: 'test',
      target: 'test-agent',
    });
    await bus.publish(event);

    await bus.acknowledge({
      event_id: event.event_id,
      receiver: 'test-agent',
      status: 'rejected',
      reason: 'handler rejected',
    });

    const dlq = bus.getDeadLetterQueue();
    const entries = await dlq.replay();
    // There should be 2 entries: the delivery failure from publish
    // and the rejected ack
    expect(entries.length).toBeGreaterThanOrEqual(1);
    const ackEntry = entries.find((e) => e.reason === 'handler rejected');
    expect(ackEntry).toBeDefined();
  });

  it('accepts array of event types in subscribe', async () => {
    const received: string[] = [];
    bus.subscribe('multi-agent', ['TYPE_X', 'TYPE_Y'], async (event) => {
      received.push(event.type);
    });

    await bus.publish(createEvent({ type: 'TYPE_X', source: 'test', target: 'multi-agent' }));
    await bus.publish(createEvent({ type: 'TYPE_Y', source: 'test', target: 'multi-agent' }));
    await bus.publish(createEvent({ type: 'TYPE_Z', source: 'test', target: 'multi-agent' }));

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toEqual(['TYPE_X', 'TYPE_Y']);
  });

  it('replays with filters', async () => {
    await bus.publish(createEvent({ type: 'TYPE_A', source: 'src1', target: '*' }));
    await bus.publish(createEvent({ type: 'TYPE_B', source: 'src2', target: '*' }));

    await new Promise((r) => setTimeout(r, 100));

    const types: string[] = [];
    for await (const event of bus.replay({ eventTypes: ['TYPE_A'] })) {
      types.push(event.type);
    }

    expect(types).toEqual(['TYPE_A']);
  });
});
