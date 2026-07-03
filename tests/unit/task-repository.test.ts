import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { createTask } from '../../kernel/tasks/task-entity.js';
import { TaskRepository } from '../../kernel/tasks/task-repository.js';

describe('TaskRepository', () => {
  let repo: TaskRepository;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
    repo = new TaskRepository(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inserts and finds tasks', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Build auth',
      creator_agent: 'planner',
    });

    await repo.insert(task);
    const found = await repo.findById(task.task_id);
    expect(found).not.toBeNull();
    expect(found!.description).toBe('Build auth');
  });

  it('updates existing tasks', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Run tests',
      creator_agent: 'test-agent',
    });

    await repo.insert(task);
    const updated = { ...task, status: 'RUNNING' as const };
    await repo.update(updated);

    const found = await repo.findById(task.task_id);
    expect(found!.status).toBe('RUNNING');
  });

  it('saves to a new directory that does not exist', async () => {
    const deepDir = path.join(tmpDir, 'new', 'deep', 'dir');
    const deepRepo = new TaskRepository(deepDir);
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Deep save',
      creator_agent: 'test',
    });
    await deepRepo.insert(task);
    const found = await deepRepo.findById(task.task_id);
    expect(found).not.toBeNull();
  });

  it('filters by status', async () => {
    const t1 = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Running task',
      creator_agent: 'test',
    });
    const t2 = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Pending task',
      creator_agent: 'test',
    });
    await repo.insert(t1);
    await repo.insert(t2);
    await repo.update({ ...t1, status: 'RUNNING' });
    await repo.update({ ...t2, status: 'COMPLETED' });

    const runningTasks = await repo.findMany({ status: ['RUNNING'] });
    expect(runningTasks).toHaveLength(1);
    expect(runningTasks[0]!.description).toBe('Running task');
  });

  it('filters by assigned_agent', async () => {
    const t1 = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Agent A task',
      creator_agent: 'test',
    });
    const t2 = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Agent B task',
      creator_agent: 'test',
    });
    await repo.insert(t1);
    await repo.insert(t2);
    const updated1 = { ...t1, assigned_agent: 'agent-a' };
    const updated2 = { ...t2, assigned_agent: 'agent-b' };
    await repo.update(updated1);
    await repo.update(updated2);

    const agentATasks = await repo.findMany({ assigned_agent: 'agent-a' });
    expect(agentATasks).toHaveLength(1);
    expect(agentATasks[0]!.description).toBe('Agent A task');
  });

  it('finds tasks with filters', async () => {
    const t1 = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Task 1',
      creator_agent: 'agent-a',
    });
    const t2 = createTask({ project_id: 'proj-1', type: 'testing', description: 'Task 2', creator_agent: 'agent-a' });
    const t3 = createTask({
      project_id: 'proj-2',
      type: 'implementation',
      description: 'Task 3',
      creator_agent: 'agent-b',
    });

    await repo.insert(t1);
    await repo.insert(t2);
    await repo.insert(t3);

    // Filter by project
    const proj1Tasks = await repo.findMany({ project_id: 'proj-1' });
    expect(proj1Tasks).toHaveLength(2);

    // Filter by type
    const implTasks = await repo.findMany({ type: 'implementation' });
    expect(implTasks).toHaveLength(2);

    // Filter by creator
    const agentATasks = await repo.findMany({ creator_agent: 'agent-a' });
    expect(agentATasks).toHaveLength(2);
  });

  it('deletes tasks', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'documentation',
      description: 'Docs',
      creator_agent: 'docs',
    });
    await repo.insert(task);

    const deleted = await repo.delete(task.task_id);
    expect(deleted).toBe(true);

    const found = await repo.findById(task.task_id);
    expect(found).toBeNull();
  });

  it('persists and loads from disk', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'analysis',
      description: 'Analyze',
      creator_agent: 'planner',
    });
    await repo.insert(task);

    // Create new repo instance reading same data
    const repo2 = new TaskRepository(tmpDir);
    await repo2.load();

    const found = await repo2.findById(task.task_id);
    expect(found).not.toBeNull();
    expect(found!.description).toBe('Analyze');
  });

  it('counts tasks with filters', async () => {
    const t1 = createTask({ project_id: 'proj-1', type: 'implementation', description: 'T1', creator_agent: 'a' });
    const t2 = createTask({ project_id: 'proj-1', type: 'implementation', description: 'T2', creator_agent: 'a' });
    await repo.insert(t1);
    await repo.insert(t2);

    expect(await repo.count()).toBe(2);
    expect(await repo.count({ project_id: 'proj-1' })).toBe(2);
    expect(await repo.count({ project_id: 'proj-2' })).toBe(0);
  });
});
