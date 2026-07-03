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
import type { Task } from '../../kernel/tasks/task-entity.js';

function failingJudgeReport(): OverallJudgeReport {
  return {
    project_name: 'RepairTestApp',
    judge_reports: [
      {
        judge_id: 'judge.test.v1',
        judge_name: 'Test Judge',
        verdict: 'fail',
        score: { total: 40, max: 100, percentage: 40, criteria: [] },
        issues: [
          {
            category: 'code_quality',
            severity: 'high',
            message: 'Duplicated code',
            file: 'src/utils.ts',
            recommendation: 'Extract shared logic',
          },
        ],
        recommendations: ['Refactor'],
        summary: 'Issues found',
        generated_at: new Date().toISOString(),
      },
    ],
    aggregated_score: { total: 40, max: 100, percentage: 40, criteria: [] },
    aggregated_verdict: 'fail',
    generated_at: new Date().toISOString(),
    total_issues: 1,
    critical_issues: 0,
    high_issues: 1,
  };
}

function passingJudgeReport(): OverallJudgeReport {
  return {
    project_name: 'RepairTestApp',
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

function createRepairTask(report: OverallJudgeReport, iteration?: number): Task {
  return createTask({
    project_id: 'proj-1',
    type: 'fix',
    description: 'Repair project issues',
    creator_agent: 'agent.repair.coordinator.v1',
    input: {
      judge_report: report,
      project_name: 'RepairTestApp',
      iteration: iteration ?? 0,
    },
    acceptance_criteria: [
      {
        criterion_id: 'c1',
        description: 'Fix tasks generated',
        verification_method: 'judge_evaluation',
        verified: false,
      },
    ],
  });
}

describe('RepairCoordinatorAgent', () => {
  let agent: RepairCoordinatorAgent;
  let generator: DefaultRepairTaskGenerator;

  beforeEach(() => {
    generator = new DefaultRepairTaskGenerator();
    agent = new RepairCoordinatorAgent({ taskGenerator: generator });
  });

  it('has correct manifest', () => {
    expect(agent.manifest.agent_id).toBe('agent.repair.coordinator.v1');
    expect(agent.manifest.agent_type).toBe('infrastructure');
    expect(agent.manifest.accepted_tasks).toContain('fix');
    expect(agent.manifest.capabilities).toHaveLength(1);
    expect(agent.manifest.capabilities[0]!.capability_id).toBe('repair_coordination');
    expect(agent.manifest.event_subscriptions).toContain('JUDGING_COMPLETED');
  });

  it('allows custom agent id', () => {
    const custom = new RepairCoordinatorAgent({ taskGenerator: generator, agentId: 'custom.repair' });
    expect(custom.manifest.agent_id).toBe('custom.repair');
  });

  it('initialize and shutdown succeed', async () => {
    await expect(agent.initialize()).resolves.toBeUndefined();
    await expect(agent.shutdown()).resolves.toBeUndefined();
  });

  it('returns COMPLETED and generates fix tasks for failing report', async () => {
    const task = createRepairTask(failingJudgeReport());
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(result.artifacts.length).toBeGreaterThan(0);
  });

  it('returns COMPLETED without fix tasks when no high/critical issues', async () => {
    const task = createRepairTask(passingJudgeReport());
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.artifacts).toHaveLength(0);
    expect(result.summary).toContain('No fixable');
  });

  it('returns FAILED when report is missing', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'fix',
      description: 'Repair',
      creator_agent: 'agent.repair.coordinator.v1',
      input: {},
    });
    const result = await agent.executeTask(task);
    expect(result.status).toBe('FAILED');
  });

  it('stops after max iterations', async () => {
    const restrictedAgent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      config: { max_iterations: 1 },
    });
    const task = createRepairTask(failingJudgeReport(), 1);
    const result = await restrictedAgent.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.summary).toContain('Max repair iterations');
  });

  it('creates builder tasks with acceptance criteria', async () => {
    const task = createRepairTask(failingJudgeReport());
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const iterations = agent.getIterations();
    expect(iterations.length).toBeGreaterThan(0);
    const lastIter = iterations[iterations.length - 1]!;
    expect(lastIter.fix_tasks.length).toBeGreaterThan(0);

    const fixTask = lastIter.fix_tasks[0]!;
    expect(fixTask.task_id).not.toBeNull();
    expect(fixTask.acceptance_criteria).toHaveLength(3);
  });

  it('onEvent handles JUDGING_COMPLETED', async () => {
    await expect(
      agent.onEvent({ type: 'JUDGING_COMPLETED', payload: { project_name: 'Test' } }),
    ).resolves.not.toThrow();
  });
});

describe('RepairCoordinatorAgent with EventBus', () => {
  let eventBus: EventBus;
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let generator: DefaultRepairTaskGenerator;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-repair-evt-'));
    memoryWriter = new MemoryWriter(tmpDir);
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();
    generator = new DefaultRepairTaskGenerator();
  });

  afterEach(async () => {
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits REPAIR_STARTED and REPAIR_COMPLETED events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'REPAIR_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'REPAIR_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new RepairCoordinatorAgent({ taskGenerator: generator, eventBus, memoryWriter });
    const task = createRepairTask(failingJudgeReport());
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toContain('REPAIR_STARTED');
    expect(received).toContain('REPAIR_COMPLETED');
  });

  it('emits FIX_TASK_CREATED events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'FIX_TASK_CREATED', async (e) => {
      received.push(e.type);
    });

    const agent = new RepairCoordinatorAgent({ taskGenerator: generator, eventBus });
    const task = createRepairTask(failingJudgeReport());
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBeGreaterThan(0);
  });

  it('emits REPAIR_FAILED when max iterations reached', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'REPAIR_FAILED', async (e) => {
      received.push(e.type);
    });

    const restrictedAgent = new RepairCoordinatorAgent({
      taskGenerator: generator,
      eventBus,
      config: { max_iterations: 1 },
    });
    const task = createRepairTask(failingJudgeReport(), 1);
    await restrictedAgent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toContain('REPAIR_FAILED');
  });
});

describe('RepairCoordinatorAgent with MemoryWriter', () => {
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let generator: DefaultRepairTaskGenerator;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-repair-mem-'));
    memoryWriter = new MemoryWriter(tmpDir);
    generator = new DefaultRepairTaskGenerator();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to AGENT_LOG.md', async () => {
    const agent = new RepairCoordinatorAgent({ taskGenerator: generator, memoryWriter });
    const task = createRepairTask(failingJudgeReport());
    await agent.executeTask(task);

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('repair_coordination');
    expect(logContent).toContain('success');
  });

  it('writes decisions to DECISIONS.md', async () => {
    const agent = new RepairCoordinatorAgent({ taskGenerator: generator, memoryWriter });
    const task = createRepairTask(failingJudgeReport());
    await agent.executeTask(task);

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('Starting repair iteration');
  });
});
