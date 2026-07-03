import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { RepairCoordinatorAgent } from '../../agents/repair-coordinator-v1.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import type { OverallJudgeReport } from '../../kernel/judge/judge-types.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import { DefaultRepairTaskGenerator } from '../../kernel/repair/repair-task-generator.js';
import { createTask } from '../../kernel/tasks/task-entity.js';

function createFailingReport(): OverallJudgeReport {
  return {
    project_name: 'RepairE2EApp',
    judge_reports: [
      {
        judge_id: 'judge.code.v1',
        judge_name: 'Code Judge',
        verdict: 'fail',
        score: { total: 40, max: 100, percentage: 40, criteria: [] },
        issues: [
          {
            category: 'code_quality',
            severity: 'high',
            message: 'Duplicated code detected',
            file: 'src/utils.ts',
            recommendation: 'Extract shared logic into a utility module',
          },
          {
            category: 'security',
            severity: 'critical',
            message: 'SQL injection risk in query builder',
            file: 'src/db.ts',
            recommendation: 'Use parameterized queries',
          },
        ],
        recommendations: ['Extract shared logic', 'Use parameterized queries'],
        summary: 'Code quality and security issues found',
        generated_at: new Date().toISOString(),
      },
      {
        judge_id: 'judge.ux.v1',
        judge_name: 'UX Judge',
        verdict: 'pass_with_concerns',
        score: { total: 70, max: 100, percentage: 70, criteria: [] },
        issues: [
          {
            category: 'accessibility',
            severity: 'medium',
            message: 'Missing ARIA labels',
            recommendation: 'Add ARIA attributes',
          },
        ],
        recommendations: ['Improve accessibility'],
        summary: 'Minor UX concerns',
        generated_at: new Date().toISOString(),
      },
    ],
    aggregated_score: { total: 55, max: 100, percentage: 55, criteria: [] },
    aggregated_verdict: 'fail',
    generated_at: new Date().toISOString(),
    total_issues: 3,
    critical_issues: 1,
    high_issues: 1,
  };
}

function createPassingReport(): OverallJudgeReport {
  return {
    project_name: 'RepairE2EApp',
    judge_reports: [
      {
        judge_id: 'judge.test.v1',
        judge_name: 'Test Judge',
        verdict: 'pass',
        score: { total: 90, max: 100, percentage: 90, criteria: [] },
        issues: [],
        recommendations: [],
        summary: 'All good',
        generated_at: new Date().toISOString(),
      },
    ],
    aggregated_score: { total: 90, max: 100, percentage: 90, criteria: [] },
    aggregated_verdict: 'pass',
    generated_at: new Date().toISOString(),
    total_issues: 0,
    critical_issues: 0,
    high_issues: 0,
  };
}

describe('Repair Workflow Integration', () => {
  let eventBus: EventBus;
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let generator: DefaultRepairTaskGenerator;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-repair-int-'));
    memoryWriter = new MemoryWriter(tmpDir);
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();
    generator = new DefaultRepairTaskGenerator();
  });

  afterEach(async () => {
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('generates fix tasks from judge report', async () => {
    const agent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair issues from judge evaluation',
      creator_agent: agent.manifest.agent_id,
      input: {
        judge_report: createFailingReport(),
        project_name: 'RepairE2EApp',
        iteration: 0,
      },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const iterations = agent.getIterations();
    expect(iterations.length).toBeGreaterThan(0);
    expect(iterations[0]!.fix_tasks.length).toBe(2);
  });

  it('creates builder tasks for each fix', async () => {
    const agent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair issues',
      creator_agent: agent.manifest.agent_id,
      input: {
        judge_report: createFailingReport(),
        project_name: 'RepairE2EApp',
        iteration: 0,
      },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const iterations = agent.getIterations();
    const fixTasks = iterations[0]!.fix_tasks;
    expect(fixTasks.every((ft) => ft.task_id !== null)).toBe(true);
  });

  it('returns no fix tasks for passing report', async () => {
    const agent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair issues',
      creator_agent: agent.manifest.agent_id,
      input: {
        judge_report: createPassingReport(),
        project_name: 'RepairE2EApp',
        iteration: 0,
      },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.artifacts).toHaveLength(0);
  });

  it('receives all repair lifecycle events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'REPAIR_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'FIX_TASK_CREATED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'REPAIR_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair issues',
      creator_agent: agent.manifest.agent_id,
      input: {
        judge_report: createFailingReport(),
        project_name: 'RepairE2EApp',
        iteration: 0,
      },
    });

    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received.filter((t) => t === 'REPAIR_STARTED').length).toBe(1);
    expect(received.filter((t) => t === 'FIX_TASK_CREATED').length).toBe(2);
    expect(received.filter((t) => t === 'REPAIR_COMPLETED').length).toBe(1);
  });

  it('writes to AGENT_LOG.md during repair', async () => {
    const agent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair issues',
      creator_agent: agent.manifest.agent_id,
      input: {
        judge_report: createFailingReport(),
        project_name: 'RepairE2EApp',
        iteration: 0,
      },
    });

    await agent.executeTask(task);

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('FIX_AND_RETEST');
    expect(logContent).toContain('repair_coordination');
    expect(logContent).toContain('success');
  });

  it('handles max iterations correctly', async () => {
    const agent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      memoryWriter,
      config: { max_iterations: 1 },
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair issues',
      creator_agent: agent.manifest.agent_id,
      input: {
        judge_report: createFailingReport(),
        project_name: 'RepairE2EApp',
        iteration: 1,
      },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.summary).toContain('Max repair iterations');

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('Max repair iterations');
  });

  it('writes decisions to DECISIONS.md', async () => {
    const agent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair issues',
      creator_agent: agent.manifest.agent_id,
      input: {
        judge_report: createFailingReport(),
        project_name: 'RepairE2EApp',
        iteration: 0,
      },
    });

    await agent.executeTask(task);

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('Starting repair iteration');
  });
});
