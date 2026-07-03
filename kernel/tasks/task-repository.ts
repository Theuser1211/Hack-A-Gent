import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';

import { TaskSchema, type Task } from './task-entity.js';

export interface TaskFilter {
  status?: Task['status'][];
  project_id?: string;
  type?: Task['type'];
  assigned_agent?: string;
  creator_agent?: string;
}

export class TaskRepository {
  private tasks: Map<string, Task> = new Map();
  private readonly filePath: string;

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'tasks.json');
  }

  // ── Persistence ────────────────────────────────────────────────────────

  async load(): Promise<void> {
    if (!existsSync(this.filePath)) return;
    const content = await readFile(this.filePath, 'utf-8');
    const data = JSON.parse(content) as Record<string, unknown>;
    for (const [id, taskData] of Object.entries(data)) {
      const task = TaskSchema.parse(taskData);
      this.tasks.set(id, task);
    }
  }

  async save(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const data: Record<string, Task> = {};
    for (const [id, task] of this.tasks) {
      data[id] = task;
    }
    await writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
  }

  // ── CRUD ───────────────────────────────────────────────────────────────

  async insert(task: Task): Promise<Task> {
    this.tasks.set(task.task_id, task);
    await this.save();
    return task;
  }

  async update(task: Task): Promise<Task> {
    this.tasks.set(task.task_id, task);
    await this.save();
    return task;
  }

  async findById(taskId: string): Promise<Task | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async findMany(filter?: TaskFilter): Promise<Task[]> {
    let results = Array.from(this.tasks.values());

    if (filter?.status) {
      results = results.filter((t) => filter.status!.includes(t.status));
    }
    if (filter?.project_id) {
      results = results.filter((t) => t.project_id === filter.project_id);
    }
    if (filter?.type) {
      results = results.filter((t) => t.type === filter.type);
    }
    if (filter?.assigned_agent) {
      results = results.filter((t) => t.assigned_agent === filter.assigned_agent);
    }
    if (filter?.creator_agent) {
      results = results.filter((t) => t.creator_agent === filter.creator_agent);
    }

    return results.sort(
      (a, b) => new Date(b.timestamps.created_at).getTime() - new Date(a.timestamps.created_at).getTime(),
    );
  }

  async delete(taskId: string): Promise<boolean> {
    const deleted = this.tasks.delete(taskId);
    if (deleted) await this.save();
    return deleted;
  }

  async count(filter?: TaskFilter): Promise<number> {
    const results = await this.findMany(filter);
    return results.length;
  }
}
