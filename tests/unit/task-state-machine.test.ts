import { describe, it, expect } from 'vitest';
import { interpret } from 'xstate';

import { taskMachine } from '../../kernel/state/task-state-machine.js';

describe('TaskStateMachine', () => {
  it('starts in PENDING state', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1' } }).start();
    expect(actor.getSnapshot().value).toBe('PENDING');
  });

  it('transitions through happy path to COMPLETED', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1' } }).start();

    actor.send({ type: 'DEPS_RESOLVED' });
    expect(actor.getSnapshot().value).toBe('READY');

    actor.send({ type: 'ASSIGN' });
    expect(actor.getSnapshot().value).toBe('RUNNING');

    actor.send({ type: 'COMPLETE' });
    expect(actor.getSnapshot().value).toBe('COMPLETED');
  });

  it('transitions to WAITING and resumes', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1' } }).start();

    actor.send({ type: 'DEPS_RESOLVED' });
    actor.send({ type: 'ASSIGN' });

    actor.send({ type: 'WAIT', checkpointId: 'ck-001' });
    expect(actor.getSnapshot().value).toBe('WAITING');
    expect(actor.getSnapshot().context.checkpointId).toBe('ck-001');

    actor.send({ type: 'RESUME' });
    expect(actor.getSnapshot().value).toBe('READY');
    expect(actor.getSnapshot().context.checkpointId).toBeNull();
  });

  it('transitions to BLOCKED and unblocks', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1' } }).start();

    actor.send({ type: 'DEPS_RESOLVED' });
    actor.send({ type: 'BLOCK' });
    expect(actor.getSnapshot().value).toBe('BLOCKED');

    actor.send({ type: 'UNBLOCK' });
    expect(actor.getSnapshot().value).toBe('PENDING');
  });

  it('retries on failure if under max retries', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1', maxRetries: 3 } }).start();

    actor.send({ type: 'DEPS_RESOLVED' });
    actor.send({ type: 'ASSIGN' });
    actor.send({ type: 'FAIL' });
    expect(actor.getSnapshot().value).toBe('FAILED');

    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('READY');
  });

  it('skips task', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1' } }).start();

    actor.send({ type: 'SKIP' });
    expect(actor.getSnapshot().value).toBe('SKIPPED');
  });

  it('tracks retry count in context', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1', maxRetries: 2 } }).start();

    expect(actor.getSnapshot().context.retryCount).toBe(0);

    actor.send({ type: 'DEPS_RESOLVED' });
    actor.send({ type: 'ASSIGN' });
    actor.send({ type: 'FAIL' });
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().context.retryCount).toBe(1);
  });

  it('does not retry after max retries exceeded', () => {
    const actor = interpret(taskMachine, { input: { taskId: 'task-1', maxRetries: 1 } }).start();

    actor.send({ type: 'DEPS_RESOLVED' });
    actor.send({ type: 'ASSIGN' });
    actor.send({ type: 'FAIL' });
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('READY');

    actor.send({ type: 'ASSIGN' });
    actor.send({ type: 'FAIL' });
    expect(actor.getSnapshot().value).toBe('FAILED');

    // Should not transition back to READY
    actor.send({ type: 'RETRY' });
    expect(actor.getSnapshot().value).toBe('FAILED');
  });
});
