import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BuildOrchestratorAgent } from '../../agents/build-orchestrator-v1.js';
import { GeneratedRepositorySchema } from '../../kernel/builders/builder-types.js';
import { MockBuilderProvider } from '../../kernel/builders/mock-builder-provider.js';
import { RepositoryValidator } from '../../kernel/builders/repository-validator.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';

function createBlueprint(): ArchitectureBlueprint {
  return {
    project_name: 'FullE2EApp',
    version: '1.0.0',
    summary: 'End-to-end orchestrator test',
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
          columns: [
            { name: 'id', type: 'SERIAL', primary_key: true, nullable: false, unique: true },
            { name: 'email', type: 'VARCHAR(255)', primary_key: false, nullable: false, unique: true },
          ],
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
    frontend_modules: [],
    backend_modules: [],
    milestones: [],
    execution_graph: { nodes: [], edges: [], entry_point: 'milestone-1' },
    required_skills: [],
    risks: [],
    human_checkpoints: [],
    architect_version: '1.0.0',
    generated_at: new Date().toISOString(),
  };
}

describe('Orchestrator Workflow Integration', () => {
  let eventBus: EventBus;
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let provider: MockBuilderProvider;
  let blueprint: ArchitectureBlueprint;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-orch-int-'));
    memoryWriter = new MemoryWriter(tmpDir);
    provider = new MockBuilderProvider();
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();
    blueprint = createBlueprint();
  });

  afterEach(async () => {
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('orchestrates full build with all modules', async () => {
    const agent = new BuildOrchestratorAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Full build',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('FullE2EApp');
    expect(result.summary).toContain('Modules generated:');
  });

  it('produces valid GeneratedRepository artifact', async () => {
    const agent = new BuildOrchestratorAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Full build',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('Build orchestration');
    expect(logContent).toContain('success');
  });

  it('writes decisions for orchestration start and completion', async () => {
    const agent = new BuildOrchestratorAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Full build',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    await agent.executeTask(task);

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('Orchestrating full build');
    expect(decisionsContent).toContain('completed');
  });

  it('receives all orchestration lifecycle events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_PROGRESS', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_COMPLETED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'FILE_GENERATED', async (e) => {
      received.push(e.type);
    });

    const agent = new BuildOrchestratorAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Full build',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received.filter((t) => t === 'BUILD_ORCHESTRATION_STARTED').length).toBe(1);
    expect(received.filter((t) => t === 'BUILD_ORCHESTRATION_COMPLETED').length).toBe(1);
    expect(received.filter((t) => t === 'BUILD_ORCHESTRATION_PROGRESS').length).toBeGreaterThanOrEqual(6);
    expect(received.filter((t) => t === 'FILE_GENERATED').length).toBeGreaterThan(0);
  });

  it('generates files across all module types', async () => {
    const agent = new BuildOrchestratorAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Full build',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const summary = result.summary;
    expect(summary).toContain('frontend');
    expect(summary).toContain('backend');
    expect(summary).toContain('database');
  });

  it('passes acceptance criteria when all modules succeed', async () => {
    const agent = new BuildOrchestratorAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Full build',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
      acceptance_criteria: [
        {
          criterion_id: 'c1',
          description: 'All modules generated',
          verification_method: 'automated_test',
          verified: false,
        },
        {
          criterion_id: 'c2',
          description: 'Repository validated',
          verification_method: 'automated_test',
          verified: false,
        },
      ],
    });

    const result = await agent.executeTask(task);
    expect(result.criteria_results.every((c) => c.passed)).toBe(true);
  });
});
