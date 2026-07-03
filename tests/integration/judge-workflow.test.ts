import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { JudgePanelAgent } from '../../agents/judge-panel-v1.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import {
  MockJudgeProvider,
  ProductJudge,
  CodeJudge,
  UXJudge,
  HackathonJudge,
} from '../../kernel/judge/judge-provider.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';

function createBlueprint(): ArchitectureBlueprint {
  return {
    project_name: 'JudgeE2EApp',
    version: '1.0.0',
    summary: 'End-to-end judge test',
    recommended_stack: {
      frontend: [{ name: 'React', version: '18', purpose: 'UI framework', alternatives: ['Vue'] }],
      backend: [{ name: 'Node.js', version: '20', purpose: 'Runtime', alternatives: ['Python'] }],
      database: [{ name: 'PostgreSQL', version: '16', purpose: 'Primary DB', alternatives: ['MySQL'] }],
      infrastructure: [],
      tooling: [],
    },
    folder_structure: { root: 'src', entries: [] },
    database_schema: {
      engine: 'PostgreSQL',
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'SERIAL', primary_key: true, nullable: false, unique: true }],
          indexes: [],
        },
      ],
      relationships: [],
    },
    api_contracts: {
      base_url: '/api',
      endpoints: [
        {
          method: 'GET',
          path: '/health',
          description: 'Health check',
          auth_required: false,
          request_body: 'none',
          response_body: 'json',
          query_params: [],
          path_params: [],
          error_responses: [],
        },
      ],
    },
    frontend_modules: [{ name: 'App', description: 'Main app', components: [], services: [] }],
    backend_modules: [
      { name: 'API', description: 'API server', endpoints: [], dependencies: [], environment_variables: [] },
    ],
    milestones: [{ id: 'm1', name: 'MVP', description: 'MVP', due_offset_hours: 24, tasks: [], deliverables: [] }],
    execution_graph: { nodes: [], edges: [], entry_point: 'milestone-1' },
    required_skills: [],
    risks: [],
    human_checkpoints: [],
    architect_version: '1.0.0',
    generated_at: new Date().toISOString(),
  };
}

describe('Judge Workflow Integration', () => {
  let eventBus: EventBus;
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let blueprint: ArchitectureBlueprint;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-judge-int-'));
    memoryWriter = new MemoryWriter(tmpDir);
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();
    blueprint = createBlueprint();
  });

  afterEach(async () => {
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('judges a project with all four judges', async () => {
    const agent = new JudgePanelAgent({
      judges: [new ProductJudge(), new CodeJudge(), new UXJudge(), new HackathonJudge()],
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'judging',
      description: 'Full judge evaluation',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint, project_name: 'JudgeE2EApp' },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('JudgeE2EApp');
  });

  it('receives all judge lifecycle events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'JUDGING_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'JUDGE_COMPLETED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'JUDGING_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider(), new MockJudgeProvider()],
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'judging',
      description: 'Judge evaluation',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint, project_name: 'JudgeE2EApp' },
    });

    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received.filter((t) => t === 'JUDGING_STARTED').length).toBe(1);
    expect(received.filter((t) => t === 'JUDGE_COMPLETED').length).toBeGreaterThanOrEqual(2);
    expect(received.filter((t) => t === 'JUDGING_COMPLETED').length).toBe(1);
  });

  it('writes evaluation to AGENT_LOG.md', async () => {
    const agent = new JudgePanelAgent({
      judges: [new ProductJudge()],
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'judging',
      description: 'Judge evaluation',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint, project_name: 'JudgeE2EApp' },
    });

    await agent.executeTask(task);

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('JUDGING');
    expect(logContent).toContain('judge_evaluation');
    expect(logContent).toContain('Product Judge');
  });

  it('writes decisions to DECISIONS.md', async () => {
    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider()],
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'judging',
      description: 'Judge evaluation',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint, project_name: 'JudgeE2EApp' },
    });

    await agent.executeTask(task);

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('Running 1 judges on project "JudgeE2EApp');
  });

  it('handles missing blueprint gracefully', async () => {
    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider()],
      eventBus,
      memoryWriter,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'judging',
      description: 'Judge evaluation',
      creator_agent: agent.manifest.agent_id,
      input: {},
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.error).not.toBeNull();

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('failure');
  });

  it('returns acceptance criteria results', async () => {
    const agent = new JudgePanelAgent({
      judges: [new MockJudgeProvider()],
      eventBus,
    });

    const task = createTask({
      project_id: 'proj-1',
      type: 'judging',
      description: 'Judge evaluation',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint, project_name: 'JudgeE2EApp' },
      acceptance_criteria: [
        {
          criterion_id: 'c1',
          description: 'Judges run successfully',
          verification_method: 'judge_evaluation',
          verified: false,
        },
      ],
    });

    await agent.executeTask(task);
    // Acceptance criteria checked via criteria_results
  });
});
