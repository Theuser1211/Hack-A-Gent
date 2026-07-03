import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { EventBus } from '../../kernel/events/event-bus.js';
import { createEvent } from '../../kernel/events/event-envelope.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import type { TaskResult } from '../../kernel/tasks/task-entity.js';
import { TaskLifecycleManager } from '../../kernel/tasks/task-lifecycle.js';
import { TaskQueue } from '../../kernel/tasks/task-queue.js';
import { TaskRepository } from '../../kernel/tasks/task-repository.js';

describe('TaskLifecycle Integration', () => {
  let repo: TaskRepository;
  let queue: TaskQueue;
  let lifecycle: TaskLifecycleManager;
  let bus: EventBus;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    repo = new TaskRepository(tmpDir);
    queue = new TaskQueue(repo);
    lifecycle = new TaskLifecycleManager(repo, queue);
    bus = new EventBus(path.join(tmpDir, 'events'));
  });

  afterEach(() => {
    lifecycle.disposeAll();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('completes a task through the full lifecycle', async () => {
    // Create task
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Implement auth',
      creator_agent: 'orchestrator',
    });
    await repo.insert(task);

    // Add to queue
    await queue.enqueue(task);
    expect(queue.size()).toBe(1);

    // Check deps and transition
    const checked = await lifecycle.checkDependencies(task);
    expect(checked.status).toBe('READY');

    // Assign and start
    await lifecycle.transition(checked, { type: 'ASSIGN' });
    const started = await lifecycle.transition(checked, { type: 'START' });
    expect(started.status).toBe('RUNNING');
    expect(started.timestamps.started_at).not.toBeNull();

    // Complete
    const result: TaskResult = {
      task_id: task.task_id,
      status: 'COMPLETED',
      exit_code: 'AGENT_OK',
      artifacts: ['src/auth.ts'],
      criteria_results: [],
      summary: 'Completed auth implementation',
      error: null,
    };
    const completed = await lifecycle.handleResult(started, result);
    expect(completed.status).toBe('COMPLETED');
    expect(completed.timestamps.completed_at).not.toBeNull();

    // Verify in repo
    const stored = await repo.findById(task.task_id);
    expect(stored!.status).toBe('COMPLETED');
  });

  it('handles task failure without retry when max retries exceeded', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'No retry left',
      creator_agent: 'orchestrator',
    });
    // Set retries to 0 so canRetry is false
    const noRetryTask = { ...task, retries: { max_retries: 0, backoff_ms: 1000, current_attempt: 0 } };
    await repo.insert(noRetryTask);
    await queue.enqueue(noRetryTask);
    await lifecycle.checkDependencies(noRetryTask);
    await lifecycle.transition(noRetryTask, { type: 'ASSIGN' });
    await lifecycle.transition(noRetryTask, { type: 'START' });

    const failResult: TaskResult = {
      task_id: noRetryTask.task_id,
      status: 'FAILED',
      exit_code: 'AGENT_FAIL',
      artifacts: [],
      criteria_results: [],
      summary: 'Failed, no retry',
      error: { code: 'INTERNAL_ERROR', message: 'Fatal', timestamp: new Date().toISOString() },
    };
    const failed = await lifecycle.handleResult(noRetryTask, failResult);
    expect(failed.status).toBe('FAILED');
  });

  it('handles task failure with retry', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Flaky task',
      creator_agent: 'orchestrator',
    });
    await repo.insert(task);
    await queue.enqueue(task);

    await lifecycle.checkDependencies(task);
    await lifecycle.transition(task, { type: 'ASSIGN' });
    await lifecycle.transition(task, { type: 'START' });

    // Fail with retry
    const failResult: TaskResult = {
      task_id: task.task_id,
      status: 'FAILED',
      exit_code: 'AGENT_FAIL',
      artifacts: [],
      criteria_results: [],
      summary: 'Task failed, will retry',
      error: { code: 'TIMEOUT', message: 'LLM timeout', timestamp: new Date().toISOString() },
    };
    const failed = await lifecycle.handleResult(task, failResult);
    expect(failed.status).toBe('READY'); // Retry resets to READY
  });

  it('handles dependency resolution', async () => {
    // Create and complete dependency
    const dep = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Dependency task',
      creator_agent: 'orchestrator',
    });
    await repo.insert(dep);
    await repo.update({ ...dep, status: 'COMPLETED' });

    // Create dependent
    const dependent = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Depends on dep',
      creator_agent: 'orchestrator',
      dependencies: [dep.task_id],
    });
    await repo.insert(dependent);

    const resolved = await lifecycle.checkDependencies(dependent);
    expect(resolved.status).toBe('READY');
  });

  it('sets waiting state for checkpoints', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Needs API key',
      creator_agent: 'orchestrator',
      checkpoint_required: true,
    });
    await repo.insert(task);
    await lifecycle.checkDependencies(task);
    await lifecycle.transition(task, { type: 'ASSIGN' });
    await lifecycle.transition(task, { type: 'START' });

    const waiting = await lifecycle.setWaiting(task, 'ck-api-key');
    expect(waiting.status).toBe('WAITING');

    const resumed = await lifecycle.resume(waiting);
    expect(resumed.status).toBe('READY');
  });

  it('emits events through bus for task transitions', async () => {
    const received: string[] = [];
    bus.subscribe('test-watcher', 'TASK_CREATED', async (event) => {
      received.push(event.type);
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'documentation',
      description: 'Write docs',
      creator_agent: 'orchestrator',
    });

    // Publish event when task is created
    await bus.publish(
      createEvent({
        type: 'TASK_CREATED',
        source: 'orchestrator',
        target: '*',
        payload: { task_id: task.task_id },
      }),
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(received).toContain('TASK_CREATED');
  });

  it('handles SKIPPED result from READY state', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'documentation',
      description: 'Skip me',
      creator_agent: 'orchestrator',
    });
    await repo.insert(task);
    await queue.enqueue(task);
    const ready = await lifecycle.checkDependencies(task);
    expect(ready.status).toBe('READY');

    const skipResult: TaskResult = {
      task_id: task.task_id,
      status: 'SKIPPED',
      exit_code: 'AGENT_SKIP',
      artifacts: [],
      criteria_results: [],
      summary: 'Skipped',
      error: null,
    };
    const skipped = await lifecycle.handleResult(ready, skipResult);
    expect(skipped.status).toBe('SKIPPED');
  });

  it('fails task via fail() helper', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Fail helper',
      creator_agent: 'orchestrator',
    });
    await repo.insert(task);

    const failed = await lifecycle.fail(task, 'Manual fail');
    expect(failed.status).toBe('FAILED');
  });

  it('completes task via complete() helper', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Complete helper',
      creator_agent: 'orchestrator',
    });
    await repo.insert(task);
    // Transition to RUNNING first since COMPLETE is only valid from RUNNING
    await lifecycle.checkDependencies(task);
    const assigned = await lifecycle.transition(task, { type: 'ASSIGN' });
    const started = await lifecycle.transition(assigned, { type: 'START' });

    const completed = await lifecycle.complete(started);
    expect(completed.status).toBe('COMPLETED');
  });

  it('disposes a single task actor', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Dispose me',
      creator_agent: 'orchestrator',
    });
    await repo.insert(task);
    await lifecycle.checkDependencies(task);
    await lifecycle.transition(task, { type: 'ASSIGN' });

    lifecycle.dispose(task.task_id);

    // New actor starts in PENDING, transition through READY to RUNNING
    const depsResolved = await lifecycle.transition(task, { type: 'DEPS_RESOLVED' });
    expect(depsResolved.status).toBe('READY');
    const restarted = await lifecycle.transition(depsResolved, { type: 'ASSIGN' });
    expect(restarted.status).toBe('RUNNING');
  });

  it('executes dependent tasks in order', async () => {
    // Create chain: task-1 -> task-2 -> task-3
    const task1 = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Task 1',
      creator_agent: 'orch',
    });
    await repo.insert(task1);

    const task2 = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Task 2',
      creator_agent: 'orch',
      dependencies: [task1.task_id],
    });
    await repo.insert(task2);

    const task3 = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Task 3',
      creator_agent: 'orch',
      dependencies: [task2.task_id],
    });
    await repo.insert(task3);

    // Task 3 should be blocked because task 2 is not completed
    const t3Resolved = await lifecycle.checkDependencies(task3);
    expect(t3Resolved.status).toBe('PENDING'); // Still PENDING because task 2 is PENDING

    // Complete task 1 and task 2
    await repo.update({ ...task1, status: 'COMPLETED' });
    const t2Resolved = await lifecycle.checkDependencies(task2);
    expect(t2Resolved.status).toBe('READY');

    await repo.update({ ...task2, status: 'COMPLETED' });
    const t3NowResolved = await lifecycle.checkDependencies(task3);
    expect(t3NowResolved.status).toBe('READY');
  });
});
