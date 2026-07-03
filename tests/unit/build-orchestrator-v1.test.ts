import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BuildOrchestratorAgent } from '../../agents/build-orchestrator-v1.js';
import type { BuilderProvider } from '../../kernel/builders/builder-provider.js';
import { BuildResultSchema, GeneratedRepositorySchema } from '../../kernel/builders/builder-types.js';
import type { GeneratedModule } from '../../kernel/builders/builder-types.js';
import { MockBuilderProvider } from '../../kernel/builders/mock-builder-provider.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import type { Task } from '../../kernel/tasks/task-entity.js';

function createSampleBlueprint(): ArchitectureBlueprint {
  return {
    project_name: 'OrchTestApp',
    version: '1.0.0',
    summary: 'Build orchestrator test app',
    recommended_stack: {
      frontend: [{ name: 'React', version: '18', purpose: 'UI framework', alternatives: ['Vue'] }],
      backend: [{ name: 'Node.js', version: '20', purpose: 'Runtime', alternatives: ['Python'] }],
      database: [{ name: 'PostgreSQL', version: '16', purpose: 'Primary DB', alternatives: ['MySQL'] }],
      infrastructure: [],
      tooling: [],
    },
    folder_structure: { root: 'src', entries: [] },
    database_schema: { engine: 'PostgreSQL', tables: [], relationships: [] },
    api_contracts: { base_url: '/api', endpoints: [] },
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

function createOrchTask(blueprint: ArchitectureBlueprint): Task {
  return createTask({
    project_id: 'proj-1',
    type: 'implementation',
    description: 'Orchestrate full build',
    creator_agent: 'agent.builder.orchestrator.v1',
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
}

describe('BuildOrchestratorAgent', () => {
  let agent: BuildOrchestratorAgent;
  let provider: MockBuilderProvider;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-orch-'));
    provider = new MockBuilderProvider();
    agent = new BuildOrchestratorAgent({ provider });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  // ── Manifest ──────────────────────────────────────────────────────────────

  it('has correct manifest', () => {
    expect(agent.manifest.agent_id).toBe('agent.builder.orchestrator.v1');
    expect(agent.manifest.agent_type).toBe('execution');
    expect(agent.manifest.accepted_tasks).toContain('implementation');
    expect(agent.manifest.capabilities).toHaveLength(1);
    expect(agent.manifest.capabilities[0]!.capability_id).toBe('build_orchestration');
    expect(agent.manifest.event_subscriptions).toContain('ARCHITECTURE_COMPLETE');
  });

  it('allows custom agent id', () => {
    const custom = new BuildOrchestratorAgent({ provider, agentId: 'custom.orch' });
    expect(custom.manifest.agent_id).toBe('custom.orch');
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  it('initialize and shutdown succeed', async () => {
    await expect(agent.initialize()).resolves.toBeUndefined();
    await expect(agent.shutdown()).resolves.toBeUndefined();
  });

  // ── executeTask ───────────────────────────────────────────────────────────

  it('generates all modules and returns COMPLETED', async () => {
    const task = createOrchTask(createSampleBlueprint());
    const result = await agent.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(result.summary).toContain('OrchTestApp');
    expect(result.error).toBeNull();
  });

  it('returns FAILED for invalid blueprint', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Orchestrate build',
      creator_agent: 'agent.builder.orchestrator.v1',
      input: { blueprint: null },
    });
    const result = await agent.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe('AGENT_FAIL');
    expect(result.error).not.toBeNull();
  });

  it('returns FAILED when blueprint is missing entirely', async () => {
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Orchestrate build',
      creator_agent: 'agent.builder.orchestrator.v1',
      input: {},
    });
    const result = await agent.executeTask(task);
    expect(result.status).toBe('FAILED');
  });

  it('creates a valid GeneratedRepository with all modules', async () => {
    const task = createOrchTask(createSampleBlueprint());
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const criteria = result.criteria_results;
    expect(criteria).toHaveLength(2);
    expect(criteria.every((c) => c.passed)).toBe(true);
  });

  it('handles partial failures gracefully', async () => {
    const failingProvider: BuilderProvider = {
      generateFrontend: () => Promise.reject(new Error('Frontend failed')),
      generateBackend: (b) => provider.generateBackend(b),
      generateDatabase: (b) => provider.generateDatabase(b),
      generateConfig: (b) => provider.generateConfig(b),
      generateDocumentation: (b) => provider.generateDocumentation(b),
      generateTests: (b) => provider.generateTests(b),
    };

    const partialAgent = new BuildOrchestratorAgent({ provider: failingProvider });
    const task = createOrchTask(createSampleBlueprint());
    const result = await partialAgent.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('5/6 succeeded, 1 failed');
  });

  it('returns FAILED when all modules fail', async () => {
    const allFailingProvider: BuilderProvider = {
      generateFrontend: () => Promise.reject(new Error('Fail')),
      generateBackend: () => Promise.reject(new Error('Fail')),
      generateDatabase: () => Promise.reject(new Error('Fail')),
      generateConfig: () => Promise.reject(new Error('Fail')),
      generateDocumentation: () => Promise.reject(new Error('Fail')),
      generateTests: () => Promise.reject(new Error('Fail')),
    };

    const badAgent = new BuildOrchestratorAgent({ provider: allFailingProvider });
    const task = createOrchTask(createSampleBlueprint());
    const result = await badAgent.executeTask(task);
    expect(result.status).toBe('FAILED');
  });
});

describe('BuildOrchestratorAgent with EventBus', () => {
  let eventBus: EventBus;
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let provider: MockBuilderProvider;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-orch-evt-'));
    memoryWriter = new MemoryWriter(tmpDir);
    provider = new MockBuilderProvider();
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();
  });

  afterEach(async () => {
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('emits BUILD_ORCHESTRATION_STARTED and COMPLETED events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_STARTED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_COMPLETED', async (e) => {
      received.push(e.type);
    });

    const agent = new BuildOrchestratorAgent({ provider, eventBus, memoryWriter });
    const task = createOrchTask(createSampleBlueprint());
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toContain('BUILD_ORCHESTRATION_STARTED');
    expect(received).toContain('BUILD_ORCHESTRATION_COMPLETED');
  });

  it('emits BUILD_ORCHESTRATION_FAILED on error', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_FAILED', async (e) => {
      received.push(e.type);
    });
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_STARTED', async (e) => {
      received.push(e.type);
    });

    const failingProvider: BuilderProvider = {
      generateFrontend: () => {
        throw new Error('Fatal');
      },
      generateBackend: () => Promise.reject(new Error('Fail')),
      generateDatabase: () => Promise.reject(new Error('Fail')),
      generateConfig: () => Promise.reject(new Error('Fail')),
      generateDocumentation: () => Promise.reject(new Error('Fail')),
      generateTests: () => Promise.reject(new Error('Fail')),
    };

    const agent = new BuildOrchestratorAgent({ provider: failingProvider, eventBus, memoryWriter });
    const task = createOrchTask(createSampleBlueprint());

    try {
      await agent.executeTask(task);
    } catch {
      // expected
    }
    await new Promise((r) => setTimeout(r, 300));

    expect(received).toContain('BUILD_ORCHESTRATION_STARTED');
    expect(received).toContain('BUILD_ORCHESTRATION_FAILED');
  });

  it('emits BUILD_ORCHESTRATION_PROGRESS events for each module', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'BUILD_ORCHESTRATION_PROGRESS', async (e) => {
      received.push(e.type);
    });

    const agent = new BuildOrchestratorAgent({ provider, eventBus });
    const task = createOrchTask(createSampleBlueprint());
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBeGreaterThanOrEqual(6);
  });

  it('emits FILE_GENERATED events', async () => {
    const received: string[] = [];
    eventBus.subscribe('test', 'FILE_GENERATED', async (e) => {
      received.push(e.type);
    });

    const agent = new BuildOrchestratorAgent({ provider, eventBus });
    const task = createOrchTask(createSampleBlueprint());
    await agent.executeTask(task);
    await new Promise((r) => setTimeout(r, 300));

    expect(received.length).toBeGreaterThan(0);
  });
});

describe('BuildOrchestratorAgent with MemoryWriter', () => {
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let provider: MockBuilderProvider;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-orch-mem-'));
    memoryWriter = new MemoryWriter(tmpDir);
    provider = new MockBuilderProvider();
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes to AGENT_LOG.md', async () => {
    const agent = new BuildOrchestratorAgent({ provider, memoryWriter });
    const task = createOrchTask(createSampleBlueprint());
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('Build orchestration');
    expect(logContent).toContain('success');
  });

  it('writes decisions to DECISIONS.md', async () => {
    const agent = new BuildOrchestratorAgent({ provider, memoryWriter });
    const task = createOrchTask(createSampleBlueprint());
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('Orchestrating full build');
    expect(decisionsContent).toContain('completed');
  });

  it('parses flat blueprint from task input', async () => {
    const agent = new BuildOrchestratorAgent({ provider, memoryWriter });
    const blueprint = createSampleBlueprint();
    const task = createTask({
      project_id: 'proj-1',
      type: 'implementation',
      description: 'Orchestrate build',
      creator_agent: 'agent.builder.orchestrator.v1',
      input: blueprint as unknown as Record<string, unknown>,
    });
    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
  });
});
