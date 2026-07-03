import type { Task } from './task-entity.js';
import { TaskRepository } from './task-repository.js';

export type TaskQueueStatus = 'idle' | 'processing' | 'draining';

export class TaskQueue {
  private queue: Task[] = [];
  private inFlight: Set<string> = new Set();
  private status: TaskQueueStatus = 'idle';
  private processing = false;

  constructor(private readonly repository: TaskRepository) {}

  // ── Enqueue / Dequeue ─────────────────────────────────────────────────

  async enqueue(task: Task): Promise<void> {
    this.queue.push(task);
    this.queue.sort((a, b) => {
      const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });
  }

  async enqueueMany(tasks: Task[]): Promise<void> {
    for (const task of tasks) {
      await this.enqueue(task);
    }
  }

  async dequeue(): Promise<Task | null> {
    // Find the first task whose dependencies are all completed
    const index = this.queue.findIndex((task) => {
      if (this.inFlight.has(task.task_id)) return false;
      if (task.status === 'BLOCKED') return false;
      if (task.status === 'WAITING') return false;
      if (task.status === 'COMPLETED' || task.status === 'SKIPPED') return false;
      return true;
    });

    if (index === -1) return null;

    const task = this.queue[index]!;
    this.queue.splice(index, 1);
    this.inFlight.add(task.task_id);
    return task;
  }

  async complete(taskId: string): Promise<void> {
    this.inFlight.delete(taskId);
  }

  async fail(taskId: string, retry: boolean): Promise<void> {
    this.inFlight.delete(taskId);
    if (retry) {
      const task = await this.repository.findById(taskId);
      if (task) {
        this.queue.push(task);
      }
    }
  }

  // ── Status ────────────────────────────────────────────────────────────

  getStatus(): TaskQueueStatus {
    return this.status;
  }

  size(): number {
    return this.queue.length;
  }

  inFlightCount(): number {
    return this.inFlight.size;
  }

  async isEmpty(): Promise<boolean> {
    return this.queue.length === 0 && this.inFlight.size === 0;
  }

  // ── Dependency Resolution ─────────────────────────────────────────────

  async resolveDependencies(task: Task): Promise<boolean> {
    if (task.dependencies.length === 0) return true;

    const deps = await Promise.all(task.dependencies.map((depId) => this.repository.findById(depId)));

    return deps.every((dep) => dep?.status === 'COMPLETED');
  }

  async getBlockedBy(task: Task): Promise<string[]> {
    if (task.dependencies.length === 0) return [];

    const deps = await Promise.all(task.dependencies.map((depId) => this.repository.findById(depId)));

    return deps.filter((dep) => dep && dep.status !== 'COMPLETED').map((dep) => dep!.task_id);
  }
}
