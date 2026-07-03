import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createEvent } from '../../kernel/events/event-envelope.js';
import { JsonlEventStore } from '../../kernel/events/jsonl-store.js';

describe('JsonlEventStore', () => {
  let store: JsonlEventStore;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    store = new JsonlEventStore(path.join(tmpDir, 'events'));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('appends and replays events', async () => {
    const event1 = createEvent({ type: 'EVENT_A', source: 'test', target: '*' });
    const event2 = createEvent({ type: 'EVENT_B', source: 'test', target: '*' });

    await store.append(event1);
    await store.append(event2);

    const replayed: string[] = [];
    for await (const event of store.replay()) {
      replayed.push(event.type);
    }

    expect(replayed).toEqual(['EVENT_A', 'EVENT_B']);
  });

  it('replays events in chronological order', async () => {
    for (let i = 0; i < 5; i++) {
      const ev = createEvent({
        type: 'ORDER_TEST',
        source: 'test',
        target: '*',
        payload: { index: i },
      });
      // Make timestamps slightly different
      await new Promise((r) => setTimeout(r, 10));
      await store.append(ev);
    }

    const indices: number[] = [];
    for await (const event of store.replay()) {
      indices.push(event.payload.index as number);
    }

    expect(indices).toEqual([0, 1, 2, 3, 4]);
  });

  it('filters by event type during replay', async () => {
    await store.append(createEvent({ type: 'TYPE_A', source: 'test', target: '*' }));
    await store.append(createEvent({ type: 'TYPE_B', source: 'test', target: '*' }));
    await store.append(createEvent({ type: 'TYPE_A', source: 'test', target: '*' }));

    const typeAs: string[] = [];
    for await (const event of store.replay({ eventTypes: ['TYPE_A'] })) {
      typeAs.push(event.type);
    }

    expect(typeAs).toHaveLength(2);
  });

  it('filters by time range during replay', async () => {
    // Events with timestamps we control by passing metadata
    const earlyEvent = createEvent({
      type: 'EARLY',
      source: 'test',
      target: '*',
      metadata: { persist: true },
    });
    // Override timestamp to simulate time
    const early = { ...earlyEvent, timestamp: '2026-01-01T00:00:00.000Z' };
    await store.append(early as any);

    const lateEvent = createEvent({
      type: 'LATE',
      source: 'test',
      target: '*',
    });
    const late = { ...lateEvent, timestamp: '2026-06-01T00:00:00.000Z' };
    await store.append(late as any);

    // Filter since mid-point
    const sinceTypes: string[] = [];
    for await (const event of store.replay({ since: '2026-03-01T00:00:00.000Z' })) {
      sinceTypes.push(event.type);
    }
    expect(sinceTypes).toEqual(['LATE']);

    // Filter until mid-point
    const untilTypes: string[] = [];
    for await (const event of store.replay({ until: '2026-03-01T00:00:00.000Z' })) {
      untilTypes.push(event.type);
    }
    expect(untilTypes).toEqual(['EARLY']);
  });

  it('filters by source during replay', async () => {
    await store.append(createEvent({ type: 'EVENT', source: 'agent-1', target: '*' }));
    await store.append(createEvent({ type: 'EVENT', source: 'agent-2', target: '*' }));

    const sources: string[] = [];
    for await (const event of store.replay({ source: 'agent-1' })) {
      sources.push(event.source);
    }

    expect(sources).toEqual(['agent-1']);
  });

  it('respects limit and offset during replay', async () => {
    for (let i = 0; i < 10; i++) {
      await store.append(createEvent({ type: 'LIMIT_TEST', source: 'test', target: '*', payload: { i } }));
    }

    const first3: number[] = [];
    for await (const event of store.replay({ limit: 3 })) {
      first3.push(event.payload.i as number);
    }
    expect(first3).toHaveLength(3);

    const withOffset: number[] = [];
    for await (const event of store.replay({ offset: 5, limit: 3 })) {
      withOffset.push(event.payload.i as number);
    }
    expect(withOffset).toEqual([5, 6, 7]);
  });

  it('skips non-persist events', async () => {
    const event = createEvent({
      type: 'NO_PERSIST',
      source: 'test',
      target: '*',
      metadata: { persist: false },
    });
    await store.append(event);

    let count = 0;
    for await (const _event of store.replay()) {
      count++;
    }
    expect(count).toBe(0);
  });

  it('skips corrupted lines during replay', async () => {
    const { writeFileSync, mkdirSync } = await import('node:fs');
    const eventsDir = path.join(tmpDir, 'events');
    mkdirSync(eventsDir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    const filePath = path.join(eventsDir, `${today}.jsonl`);

    const validEvent = createEvent({ type: 'VALID', source: 'test', target: '*' });
    const validLine = JSON.stringify(validEvent);

    // Write valid, corrupted, valid
    const content = [validLine, 'not-json-at-all', validLine].join('\n');
    writeFileSync(filePath, content + '\n', 'utf-8');

    const replayed: string[] = [];
    for await (const event of store.replay()) {
      replayed.push(event.type);
    }

    // Only the valid events should be returned
    expect(replayed).toEqual(['VALID', 'VALID']);
  });

  it('handles empty store gracefully', async () => {
    let count = 0;
    for await (const _event of store.replay()) {
      count++;
    }
    expect(count).toBe(0);
  });
});
