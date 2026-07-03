import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DeadLetterQueue } from '../../kernel/events/dead-letter-queue.js';
import { createEvent } from '../../kernel/events/event-envelope.js';

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    dlq = new DeadLetterQueue(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('stores and replays dead letter entries', async () => {
    const event = createEvent({ type: 'FAILED_EVENT', source: 'test', target: '*' });
    await dlq.send(event, 'test failure');

    const entries = await dlq.replay();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.reason).toBe('test failure');
    expect(entries[0]!.event.event_id).toBe(event.event_id);
  });

  it('counts entries correctly', async () => {
    expect(await dlq.count()).toBe(0);

    for (let i = 0; i < 3; i++) {
      const event = createEvent({ type: 'FAIL', source: 'test', target: '*' });
      await dlq.send(event, `failure ${i}`);
    }

    expect(await dlq.count()).toBe(3);
  });

  it('creates directory when sending to non-existent path', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'events');
    const nestedDlq = new DeadLetterQueue(nestedDir);
    const event = createEvent({ type: 'NESTED_FAIL', source: 'test', target: '*' });
    await nestedDlq.send(event, 'nested test');

    const entries = await nestedDlq.replay();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.reason).toBe('nested test');
  });

  it('returns empty array when file does not exist', async () => {
    const entries = await dlq.replay();
    expect(entries).toEqual([]);
  });
});
