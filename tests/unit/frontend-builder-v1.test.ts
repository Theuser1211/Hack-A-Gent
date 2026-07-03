import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { FrontendBuilderAgent } from '../../agents/frontend-builder-v1.js';
import { MockBuilderProvider } from '../../kernel/builders/mock-builder-provider.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { createEvent } from '../../kernel/events/event-envelope.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import type { Task } from '../../kernel/tasks/task-entity.js';

function createSampleBlueprint(): ArchitectureBlueprint {
  return {
    project_name: 'TestApp',
    version: '1.0.0',
    summary: 'A test application',
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

function createFrontendTask(blueprint: ArchitectureBlueprint): Task {
  return createTask({
    project_id: 'proj-1',
    type: 'implementation',
    description: 'Generate frontend',
    creator_agent: 'agent.builder.frontend.v1',
    input: { blueprint },
    acceptance_criteria: [
      {
        criterion_id: 'c1',
        description: 'Frontend files generated',
        verification_method: 'automated_test',
        verified: false,
      },
    ],
  });
}

describe('FrontendBuilderAgent', () => {
  let agent: FrontendBuilderAgent;
  let provider: MockBuilderProvider;
  let eventBus: EventBus;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-fe-'));
    provider = new MockBuilderProvider();
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();

    agent = new FrontendBuilderAgent({
      provider,
      eventBus,
      memoryWriter: new MemoryWriter(tmpDir),
      agentId: 'agent.builder.frontend.v1',
    });
  });

  afterEach(async () => {
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('manifest', () => {
    it('has correct agent_id', () => {
      expect(agent.manifest.agent_id).toBe('agent.builder.frontend.v1');
    });

    it('has page_generation capability', () => {
      expect(agent.manifest.capabilities.some((c) => c.capability_id === 'page_generation')).toBe(true);
    });

    it('accepts implementation tasks', () => {
      expect(agent.manifest.accepted_tasks).toContain('implementation');
    });
  });

  describe('initialization and shutdown', () => {
    it('initializes without error', async () => {
      await expect(agent.initialize()).resolves.toBeUndefined();
    });

    it('shuts down without error', async () => {
      await expect(agent.shutdown()).resolves.toBeUndefined();
    });
  });

  describe('event handling', () => {
    it('handles ARCHITECTURE_COMPLETE event', async () => {
      await expect(
        agent.onEvent({ type: 'ARCHITECTURE_COMPLETE', payload: { project_name: 'Test' } }),
      ).resolves.toBeUndefined();
    });
  });

  describe('executeTask', () => {
    it('completes successfully with valid blueprint', async () => {
      const blueprint = createSampleBlueprint();
      const task = createFrontendTask(blueprint);
      const result = await agent.executeTask(task);

      expect(result.status).toBe('COMPLETED');
      expect(result.exit_code).toBe('AGENT_OK');
      expect(result.summary).toContain('TestApp');
    });

    it('returns failed status for missing blueprint', async () => {
      const task = createTask({
        project_id: 'proj-1',
        type: 'implementation',
        description: 'Generate frontend',
        creator_agent: 'agent.builder.frontend.v1',
        input: {},
      });
      const result = await agent.executeTask(task);
      expect(result.status).toBe('FAILED');
      expect(result.error).not.toBeNull();
    });

    it('emits BUILD_STARTED event', async () => {
      const received: string[] = [];
      eventBus.subscribe('test', 'BUILD_STARTED', async (event) => {
        received.push(event.type);
      });

      const blueprint = createSampleBlueprint();
      await agent.executeTask(createFrontendTask(blueprint));
      await new Promise((r) => setTimeout(r, 100));
      expect(received).toContain('BUILD_STARTED');
    });

    it('emits FILE_GENERATED events', async () => {
      const received: string[] = [];
      eventBus.subscribe('test', 'FILE_GENERATED', async (event) => {
        received.push(event.type);
      });

      const blueprint = createSampleBlueprint();
      await agent.executeTask(createFrontendTask(blueprint));
      await new Promise((r) => setTimeout(r, 100));
      expect(received.length).toBeGreaterThanOrEqual(1);
    });

    it('emits MODULE_GENERATED event', async () => {
      const received: string[] = [];
      eventBus.subscribe('test', 'MODULE_GENERATED', async (event) => {
        received.push(event.type);
      });

      const blueprint = createSampleBlueprint();
      await agent.executeTask(createFrontendTask(blueprint));
      await new Promise((r) => setTimeout(r, 100));
      expect(received).toContain('MODULE_GENERATED');
    });

    it('emits BUILD_COMPLETED event on success', async () => {
      const received: string[] = [];
      eventBus.subscribe('test', 'BUILD_COMPLETED', async (event) => {
        received.push(event.type);
      });

      const blueprint = createSampleBlueprint();
      await agent.executeTask(createFrontendTask(blueprint));
      await new Promise((r) => setTimeout(r, 100));
      expect(received).toContain('BUILD_COMPLETED');
    });

    it('emits BUILD_FAILED event on failure', async () => {
      const received: string[] = [];
      eventBus.subscribe('test', 'BUILD_FAILED', async (event) => {
        received.push(event.type);
      });

      const task = createTask({
        project_id: 'proj-1',
        type: 'implementation',
        description: 'Generate frontend',
        creator_agent: 'agent.builder.frontend.v1',
        input: {},
      });
      await agent.executeTask(task);
      await new Promise((r) => setTimeout(r, 100));
      expect(received).toContain('BUILD_FAILED');
    });

    it('runs acceptance criteria', async () => {
      const blueprint = createSampleBlueprint();
      const task = createFrontendTask(blueprint);
      const result = await agent.executeTask(task);

      expect(result.criteria_results).toHaveLength(1);
      expect(result.criteria_results[0]!.passed).toBe(true);
    });
  });
});
