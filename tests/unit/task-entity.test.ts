import { describe, it, expect } from 'vitest';

import { createTask, TaskSchema } from '../../kernel/tasks/task-entity.js';

describe('TaskEntity', () => {
  it('creates a valid task with required fields', () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Implement auth API',
      creator_agent: 'planner',
    });

    expect(task.task_id).toBeDefined();
    expect(task.project_id).toBe('proj-1');
    expect(task.type).toBe('implementation');
    expect(task.status).toBe('PENDING');
    expect(task.description).toBe('Implement auth API');
    expect(task.timestamps.created_at).toBeDefined();
    expect(task.timestamps.assigned_at).toBeNull();
    expect(task.timestamps.completed_at).toBeNull();
  });

  it('accepts optional params', () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Write unit tests',
      creator_agent: 'architect',
      parent_task_id: 'parent-1',
      priority: 'high',
      dependencies: ['dep-1', 'dep-2'],
      acceptance_criteria: [
        { criterion_id: 'c1', description: 'Tests pass', verification_method: 'automated_test', verified: false },
      ],
      required_skills: ['vitest'],
      input: { testTarget: 'src/auth' },
      expected_outputs: ['tests/auth.test.ts'],
      checkpoint_required: true,
    });

    expect(task.parent_task_id).toBe('parent-1');
    expect(task.priority).toBe('high');
    expect(task.dependencies).toEqual(['dep-1', 'dep-2']);
    expect(task.acceptance_criteria).toHaveLength(1);
    expect(task.required_skills).toContain('vitest');
    expect(task.checkpoint_required).toBe(true);
  });

  it('validates via Zod schema', () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'analysis',
      description: 'Analyze requirements',
      creator_agent: 'orchestrator',
    });

    expect(() => TaskSchema.parse(task)).not.toThrow();
  });

  it('rejects invalid task via Zod schema', () => {
    expect(() =>
      TaskSchema.parse({
        task_id: 'not-a-uuid',
        project_id: 'proj-1',
        status: 'INVALID_STATUS',
        type: 'implementation',
      }),
    ).toThrow();
  });

  it('sets default values correctly', () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'documentation',
      description: 'Write README',
      creator_agent: 'docs',
    });

    expect(task.dependencies).toEqual([]);
    expect(task.acceptance_criteria).toEqual([]);
    expect(task.priority).toBe('medium');
    expect(task.retries.max_retries).toBe(3);
    expect(task.retries.backoff_ms).toBe(1000);
    expect(task.retries.current_attempt).toBe(0);
    expect(task.required_skills).toEqual([]);
    expect(task.input).toEqual({});
    expect(task.expected_outputs).toEqual([]);
  });
});
