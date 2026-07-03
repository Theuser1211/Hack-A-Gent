import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createTask } from '../../kernel/tasks/task-entity.js';
import { TaskQueue } from '../../kernel/tasks/task-queue.js';
import { TaskRepository } from '../../kernel/tasks/task-repository.js';

describe('TaskQueue', () => {
  let repo: TaskRepository;
  let queue: TaskQueue;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    repo = new TaskRepository(tmpDir);
    queue = new TaskQueue(repo);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports initial status as idle', () => {
    expect(queue.getStatus()).toBe('idle');
  });

  it('enqueues and dequeues tasks', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Test task',
      creator_agent: 'test',
    });

    await queue.enqueue(task);
    expect(queue.size()).toBe(1);

    const dequeued = await queue.dequeue();
    expect(dequeued).not.toBeNull();
    expect(dequeued!.task_id).toBe(task.task_id);
    expect(queue.size()).toBe(0);
  });

  it('respects priority ordering', async () => {
    const lowTask = createTask({
      project_id: 'proj-1',
      type: 'documentation',
      description: 'Low priority',
      creator_agent: 'test',
      priority: 'low',
    });
    const highTask = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'High priority',
      creator_agent: 'test',
      priority: 'high',
    });

    await queue.enqueue(lowTask);
    await queue.enqueue(highTask);

    const first = await queue.dequeue();
    expect(first!.description).toBe('High priority');
  });

  it('returns null from dequeue when all tasks are non-dequeueable', async () => {
    const blocked = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Blocked',
      creator_agent: 'test',
    });
    const waiting = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Waiting',
      creator_agent: 'test',
    });

    await queue.enqueue({ ...blocked, status: 'BLOCKED' });
    await queue.enqueue({ ...waiting, status: 'WAITING' });

    const result = await queue.dequeue();
    expect(result).toBeNull();
  });

  it('skips blocked, waiting, completed, and skipped tasks in dequeue', async () => {
    const blocked = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Blocked',
      creator_agent: 'test',
    });
    const waiting = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Waiting',
      creator_agent: 'test',
    });
    const completed = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Completed',
      creator_agent: 'test',
    });
    const skipped = createTask({
      project_id: 'proj-1',
      type: 'documentation',
      description: 'Skipped',
      creator_agent: 'test',
    });
    const ready = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Ready task',
      creator_agent: 'test',
    });

    await queue.enqueue({ ...blocked, status: 'BLOCKED' });
    await queue.enqueue({ ...waiting, status: 'WAITING' });
    await queue.enqueue({ ...completed, status: 'COMPLETED' });
    await queue.enqueue({ ...skipped, status: 'SKIPPED' });
    await queue.enqueue(ready);

    expect(queue.size()).toBe(5);

    const dequeued = await queue.dequeue();
    expect(dequeued).not.toBeNull();
    expect(dequeued!.description).toBe('Ready task');
  });

  it('resolves dependencies defaults to true for no deps', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'No deps',
      creator_agent: 'test',
    });
    expect(await queue.resolveDependencies(task)).toBe(true);
  });

  it('returns empty blocked-by list for no deps', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'No deps',
      creator_agent: 'test',
    });
    expect(await queue.getBlockedBy(task)).toEqual([]);
  });

  it('tracks in-flight tasks', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'In flight',
      creator_agent: 'test',
    });

    await queue.enqueue(task);
    const dequeued = await queue.dequeue();

    expect(queue.inFlightCount()).toBe(1);
    expect(dequeued!.task_id).toBe(task.task_id);

    await queue.complete(task.task_id);
    expect(queue.inFlightCount()).toBe(0);
  });

  it('resolves dependencies correctly', async () => {
    const dep = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Dependency',
      creator_agent: 'test',
    });
    await repo.insert(dep);

    const dependent = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Dependent',
      creator_agent: 'test',
      dependencies: [dep.task_id],
    });

    // Dep not completed yet
    expect(await queue.resolveDependencies(dependent)).toBe(false);

    // Complete dep
    await repo.insert({ ...dep, status: 'COMPLETED' });

    // Now dep is resolved
    expect(await queue.resolveDependencies(dependent)).toBe(true);
  });

  it('enqueues multiple tasks', async () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      createTask({
        project_id: 'proj-1',
        type: 'implementation',
        description: `Task ${i}`,
        creator_agent: 'test',
      }),
    );

    await queue.enqueueMany(tasks);
    expect(queue.size()).toBe(5);
  });

  it('checks if queue is empty', async () => {
    expect(await queue.isEmpty()).toBe(true);

    const task = createTask({ project_id: 'proj-1', type: 'implementation', description: 'T', creator_agent: 'test' });
    await queue.enqueue(task);
    expect(await queue.isEmpty()).toBe(false);

    const dequeued = await queue.dequeue();
    expect(await queue.isEmpty()).toBe(false); // Still has in-flight
    await queue.complete(dequeued!.task_id);
    expect(await queue.isEmpty()).toBe(true);
  });
});
