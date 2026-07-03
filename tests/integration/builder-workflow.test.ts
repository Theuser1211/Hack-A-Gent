import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BackendBuilderAgent } from '../../agents/backend-builder-v1.js';
import { DatabaseBuilderAgent } from '../../agents/database-builder-v1.js';
import { FrontendBuilderAgent } from '../../agents/frontend-builder-v1.js';
import type { BuildResult } from '../../kernel/builders/builder-types.js';
import { MockBuilderProvider } from '../../kernel/builders/mock-builder-provider.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { createEvent } from '../../kernel/events/event-envelope.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';

function createBlueprint(): ArchitectureBlueprint {
  return {
    project_name: 'IntegrationTestApp',
    version: '1.0.0',
    summary: 'Integration test application',
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
        {
          method: 'POST',
          path: '/users',
          description: 'Create user',
          auth_required: false,
          request_body: 'json',
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

describe('Builder Workflow Integration', () => {
  let eventBus: EventBus;
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let provider: MockBuilderProvider;
  let blueprint: ArchitectureBlueprint;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-builder-int-'));
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

  it('FrontendBuilderAgent produces frontend module with files', async () => {
    const agent = new FrontendBuilderAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate frontend',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('IntegrationTestApp');
  });

  it('BackendBuilderAgent produces backend module with files', async () => {
    const agent = new BackendBuilderAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate backend',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('IntegrationTestApp');
  });

  it('DatabaseBuilderAgent produces database module with migration files', async () => {
    const agent = new DatabaseBuilderAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate database',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('IntegrationTestApp');
    expect(result.summary).toContain('Tables:');
  });

  it('receives events published during frontend build', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'BUILD_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'FILE_GENERATED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'MODULE_GENERATED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'BUILD_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new FrontendBuilderAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate frontend',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 200));

    expect(received).toContain('BUILD_STARTED');
    expect(received).toContain('FILE_GENERATED');
    expect(received).toContain('MODULE_GENERATED');
    expect(received).toContain('BUILD_COMPLETED');
  });

  it('receives events published during backend build', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'BUILD_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'FILE_GENERATED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'MODULE_GENERATED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'BUILD_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new BackendBuilderAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate backend',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 200));

    expect(received).toContain('BUILD_STARTED');
    expect(received).toContain('FILE_GENERATED');
    expect(received).toContain('MODULE_GENERATED');
    expect(received).toContain('BUILD_COMPLETED');
  });

  it('receives events published during database build', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'BUILD_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'FILE_GENERATED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'MODULE_GENERATED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'BUILD_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new DatabaseBuilderAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate database',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint },
    });
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 200));

    expect(received).toContain('BUILD_STARTED');
    expect(received).toContain('FILE_GENERATED');
    expect(received).toContain('MODULE_GENERATED');
    expect(received).toContain('BUILD_COMPLETED');
  });

  it('gracefully handles invalid blueprint input', async () => {
    const agent = new FrontendBuilderAgent({ provider, eventBus, memoryWriter });
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate frontend',
      creator_agent: agent.manifest.agent_id,
      input: { blueprint: null },
    });
    const result = await agent.executeTask(task);
    expect(result.status).toBe('FAILED');
  });

  it('all three builders can run sequentially with the same blueprint', async () => {
    const feAgent = new FrontendBuilderAgent({ provider, eventBus, memoryWriter });
    const beAgent = new BackendBuilderAgent({ provider, eventBus, memoryWriter });
    const dbAgent = new DatabaseBuilderAgent({ provider, eventBus, memoryWriter });

    const feTask = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate frontend',
      creator_agent: feAgent.manifest.agent_id,
      input: { blueprint },
    });
    const beTask = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate backend',
      creator_agent: beAgent.manifest.agent_id,
      input: { blueprint },
    });
    const dbTask = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Generate database',
      creator_agent: dbAgent.manifest.agent_id,
      input: { blueprint },
    });

    const feResult = await feAgent.executeTask(feTask);
    const beResult = await beAgent.executeTask(beTask);
    const dbResult = await dbAgent.executeTask(dbTask);

    expect(feResult.status).toBe('COMPLETED');
    expect(beResult.status).toBe('COMPLETED');
    expect(dbResult.status).toBe('COMPLETED');
  });
});
