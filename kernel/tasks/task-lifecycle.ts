import { createMachine, interpret } from 'xstate';

import { taskMachine, type TaskContext, type TaskEvent } from '../state/task-state-machine.js';
import type { TaskMachine } from '../state/task-state-machine.js';

import type { Task, TaskResult } from './task-entity.js';
import { TaskQueue } from './task-queue.js';
import { TaskRepository } from './task-repository.js';

export class TaskLifecycleManager {
  private actors: Map<string, ReturnType<typeof interpret<TaskMachine>>> = new Map();

  constructor(
    private readonly repository: TaskRepository,
    private readonly queue: TaskQueue,
  ) {}

  async transition(task: Task, event: TaskEvent): Promise<Task> {
    let actor = this.actors.get(task.task_id);

    if (!actor) {
      actor = interpret(taskMachine, { input: { taskId: task.task_id, maxRetries: task.retries.max_retries } }).start();
      this.actors.set(task.task_id, actor);
    }

    actor.send(event);
    const snapshot = actor.getSnapshot();
    const newStatus = snapshot.context.status;
    const updatedTask: Task = { ...task, status: newStatus };

    // Update timestamps on transitions
    if (event.type === 'START' && !updatedTask.timestamps.started_at) {
      updatedTask.timestamps.started_at = new Date().toISOString();
    }
    if (event.type === 'COMPLETE') {
      updatedTask.timestamps.completed_at = new Date().toISOString();
    }

    await this.repository.update(updatedTask);
    return updatedTask;
  }

  async handleResult(task: Task, result: TaskResult): Promise<Task> {
    if (result.status === 'COMPLETED') {
      return this.transition(task, { type: 'COMPLETE' });
    }
    if (result.status === 'FAILED') {
      const failed = await this.transition(task, { type: 'FAIL', error: result.error?.message });
      const canRetry = task.retries.current_attempt < task.retries.max_retries;
      if (canRetry) {
        await this.queue.fail(task.task_id, true);
        return this.transition(failed, { type: 'RETRY' });
      }
      return failed;
    }
    if (result.status === 'SKIPPED') {
      return this.transition(task, { type: 'SKIP' });
    }
    return task;
  }

  async checkDependencies(task: Task): Promise<Task> {
    const blockedBy = await this.queue.getBlockedBy(task);
    if (blockedBy.length === 0) {
      return this.transition(task, { type: 'DEPS_RESOLVED' });
    }
    return task;
  }

  async setWaiting(task: Task, checkpointId: string): Promise<Task> {
    return this.transition(task, { type: 'WAIT', checkpointId } as TaskEvent);
  }

  async resume(task: Task): Promise<Task> {
    return this.transition(task, { type: 'RESUME' });
  }

  async fail(task: Task, error?: string): Promise<Task> {
    return this.transition(task, { type: 'FAIL', error });
  }

  async complete(task: Task): Promise<Task> {
    return this.transition(task, { type: 'COMPLETE' });
  }

  dispose(taskId: string): void {
    const actor = this.actors.get(taskId);
    actor?.stop();
    this.actors.delete(taskId);
  }

  disposeAll(): void {
    for (const actor of this.actors.values()) {
      actor.stop();
    }
    this.actors.clear();
  }
}
