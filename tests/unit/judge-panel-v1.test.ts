import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { JudgePanelAgent } from '../../agents/judge-panel-v1.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { MockJudgeProvider } from '../../kernel/judge/judge-provider.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import type { Task } from '../../kernel/tasks/task-entity.js';

function sampleBlueprint(): ArchitectureBlueprint {
  return {
    project_name: 'JudgeTestApp',
    version: '1.0.0',
    summary: 'Test app for judging',
    recommended_stack: {
      frontend: [{ name: 'React', version: '18', purpose: 'UI', alternatives: [] }],
      backend: [{ name: 'Node.js', version: '20', purpose: 'Runtime', alternatives: [] }],
      database: [{ name: 'PostgreSQL', version: '16', purpose: 'DB', alternatives: [] }],
      infrastructure: [],
      tooling: [],
    },
    folder_structure: { root: 'src', entries: [] },
    database_schema: { engine: 'PostgreSQL', tables: [], relationships: [] },
    api_contracts: { base_url: '/api', endpoints: [] },
    frontend_modules: [{ name: 'App', description: 'Main', components: [], services: [] }],
    backend_modules: [{ name: 'API', description: 'API', endpoints: [], dependencies: [], environment_variables: [] }],
    milestones: [{ id: 'm1', name: 'MVP', description: 'MVP', due_offset_hours: 24, tasks: [], deliverables: [] }],
    execution_graph: { nodes: [], edges: [], entry_point: 'm1' },
    required_skills: [],
    risks: [],
    human_checkpoints: [],
    architect_version: '1.0.0',
    generated_at: new Date().toISOString(),
  };
}

function createJudgeTask(blueprint: ArchitectureBlueprint): Task {
  return createTask({
    project_id: 'proj-1',
    type: 'judging',
    description: 'Judge project',
    creator_agent: 'agent.judge.panel.v1',
    input: { blueprint, project_name: 'JudgeTestApp' },
    acceptance_criteria: [
      {
        criterion_id: 'c1',
        description: 'Judges produce reports',
        verification_method: 'judge_evaluation',
        verified: false,
      },
    ],
  });
}

describe('JudgePanelAgent', () => {
  let agent: JudgePanelAgent;
  let judges: MockJudgeProvider[];

  beforeEach(() => {
    judges = [new MockJudgeProvider()];
    agent = new JudgePanelAgent({ judges });
  });

  it('has correct manifest', () => {
    expect(agent.manifest.agent_id).toBe('agent.judge.panel.v1');
    expect(agent.manifest.agent_type).toBe('judge');
    expect(agent.manifest.accepted_tasks).toContain('judging');
    expect(agent.manifest.capabilities).toHaveLength(1);
    expect(agent.manifest.capabilities[0]!.capability_id).toBe('judge_evaluation');
    expect(agent.manifest.event_subscriptions).toContain('TESTING_COMPLETED');
  });

  it('allows custom agent id', () => {
    const custom = new JudgePanelAgent({ judges, agentId: 'custom.judge' });
    expect(custom.manifest.agent_id).toBe('custom.judge');
  });

  it('initialize and shutdown succeed', async () => {
    await expect(agent.initialize()).resolves.toBeUndefined();
    await expect(agent.shutdown()).resolves.toBeUndefined();
  });

  it('returns COMPLETED with valid blueprint', async () => {
    const task = createJudgeTask(sampleBlueprint());
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(result.error).toBeNull();
  });

  it('returns FAILED when blueprint is missing', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'judging',
      description: 'Judge project',
      creator_agent: 'agent.judge.panel.v1',
      input: {},
    });
    const result = await agent.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.error).not.toBeNull();
  });

  it('produces summary containing project name', async () => {
    const task = createJudgeTask(sampleBlueprint());
    const result = await agent.executeTask(task);
    expect(result.summary).toContain('JudgeTestApp');
  });

  it('handles multiple judges', async () => {
    const multiAgent = new JudgePanelAgent({
      judges: [new MockJudgeProvider(), new MockJudgeProvider()],
    });
    const task = createJudgeTask(sampleBlueprint());
    const result = await multiAgent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
  });

  it('onEvent handles TESTING_COMPLETED', async () => {
    await expect(
      agent.onEvent({ type: 'TESTING_COMPLETED', payload: { project_name: 'Test' } }),
    ).resolves.not.toThrow();
  });

  it('onEvent handles unknown event silently', async () => {
    await expect(agent.onEvent({ type: 'UNKNOWN_EVENT', payload: {} })).resolves.not.toThrow();
  });
});

describe('JudgePanelAgent with EventBus', () => {
  let eventBus: EventBus;
  let tmpDir: string;
  let memoryWriter: MemoryWriter;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-judge-evt-'));
    memoryWriter = new MemoryWriter(tmpDir);
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();
  });

  afterEach(async () => {
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits JUDGING_STARTED and JUDGING_COMPLETED events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'JUDGING_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'JUDGING_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider()],
      eventBus,
      memoryWriter,
    });
    const task = createJudgeTask(sampleBlueprint());
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toContain('JUDGING_STARTED');
    expect(received).toContain('JUDGING_COMPLETED');
  });

  it('emits JUDGE_COMPLETED events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'JUDGE_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider()],
      eventBus,
    });
    const task = createJudgeTask(sampleBlueprint());
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBeGreaterThanOrEqual(1);
  });
});

describe('JudgePanelAgent with MemoryWriter', () => {
  let tmpDir: string;
  let memoryWriter: MemoryWriter;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-judge-mem-'));
    memoryWriter = new MemoryWriter(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to AGENT_LOG.md', async () => {
    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider()],
      memoryWriter,
    });
    const task = createJudgeTask(sampleBlueprint());
    await agent.executeTask(task);

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('judge_evaluation');
    expect(logContent).toContain('success');
  });

  it('writes decisions to DECISIONS.md', async () => {
    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider()],
      memoryWriter,
    });
    const task = createJudgeTask(sampleBlueprint());
    await agent.executeTask(task);

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('Running 1 judges');
  });
});
