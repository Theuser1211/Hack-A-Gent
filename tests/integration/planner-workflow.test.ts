import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { PlannerAgent } from '../../agents/planner-v1.js';
import { AgentRegistry } from '../../kernel/agents/agent-registry.js';
import { AgentRuntime } from '../../kernel/agents/agent-runtime.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { createEvent } from '../../kernel/events/event-envelope.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import { MockPlanningProvider } from '../../kernel/planning/planning-provider.js';
import type { PlanningProvider } from '../../kernel/planning/planning-provider.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import { TaskLifecycleManager } from '../../kernel/tasks/task-lifecycle.js';
import { TaskQueue } from '../../kernel/tasks/task-queue.js';
import { TaskRepository } from '../../kernel/tasks/task-repository.js';

describe('Planner Workflow Integration', () => {
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let eventBus: EventBus;
  let repo: TaskRepository;
  let queue: TaskQueue;
  let lifecycle: TaskLifecycleManager;
  let registry: AgentRegistry;
  let runtime: AgentRuntime;
  let planner: PlannerAgent;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-planner-'));

    memoryWriter = new MemoryWriter(tmpDir);
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    repo = new TaskRepository(tmpDir);
    queue = new TaskQueue(repo);
    lifecycle = new TaskLifecycleManager(repo, queue);
    registry = new AgentRegistry();
    runtime = new AgentRuntime({ eventBus, taskLifecycle: lifecycle, registry });

    planner = new PlannerAgent({
      provider: new MockPlanningProvider(),
      memoryWriter,
      eventBus,
      agentId: 'agent.planner.integration',
    });
  });

  afterEach(async () => {
    await runtime.shutdown();
    lifecycle.disposeAll();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes a full planning workflow via AgentRuntime', async () => {
    // Register planner
    runtime.registerAgent(planner);

    // Create a planning task
    const task = createTask({
      project_id: 'proj-integration',
      type: 'planning',
      description: 'Plan for Climate Hackathon 2026',
      creator_agent: 'test-orchestrator',
      input: {
        hackathon_url: 'https://climate-hack.devpost.com',
        hackathon_description:
          'Theme: Climate Change\nDeadline: July 15, 2026\nBuild innovative solutions for environmental challenges.',
        preferences: {
          team_size: 'solo',
          platform: 'web',
          experience: 'intermediate',
          preferred_stack: ['typescript', 'react'],
        },
      },
      acceptance_criteria: [
        {
          criterion_id: 'c1',
          description: 'Generate project ideas',
          verification_method: 'automated_test',
          verified: false,
        },
        { criterion_id: 'c2', description: 'Assess risks', verification_method: 'automated_test', verified: false },
      ],
    });

    // Execute via runtime
    const result = await runtime.executeTask(task);

    // Verify result
    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(result.summary).toContain('Climate');
    expect(result.summary).toContain('Difficulty');
    expect(result.error).toBeNull();

    // Verify memory files were written
    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('PLANNING');
    expect(logContent).toContain('project ideas');

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('project ideas');
  });

  it('receives events published during planning', async () => {
    const receivedEvents: string[] = [];
    eventBus.subscribe('test-watcher', 'PLANNING_STARTED', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'PLANNING_COMPLETE', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'HACKATHON_INGESTED', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'IDEAS_GENERATED', async (event) => {
      receivedEvents.push(event.type);
    });

    runtime.registerAgent(planner);

    const task = createTask({
      project_id: 'proj-events',
      type: 'planning',
      description: 'Event test hackathon',
      creator_agent: 'test',
      input: { hackathon_description: 'Theme: Education\nBuild learning tools' },
    });

    await runtime.executeTask(task);

    // Wait for async event delivery
    await new Promise((r) => setTimeout(r, 200));

    expect(receivedEvents).toContain('PLANNING_STARTED');
    expect(receivedEvents).toContain('HACKATHON_INGESTED');
    expect(receivedEvents).toContain('IDEAS_GENERATED');
    expect(receivedEvents).toContain('PLANNING_COMPLETE');
  });

  it('fails gracefully when provider throws', async () => {
    const failingProvider: PlanningProvider = {
      ingestHackathon: async () => {
        throw new Error('Provider offline');
      },
      generateProjectIdeas: async () => [],
      assessRisks: async () => [],
      identifyUnknowns: async () => [],
      generateQuestions: async () => [],
    };
    const failingPlanner = new PlannerAgent({ provider: failingProvider });

    runtime.registerAgent(failingPlanner);

    const task = createTask({
      project_id: 'proj-fail',
      type: 'planning',
      description: 'Will fail',
      creator_agent: 'test',
      input: { hackathon_description: 'Test' },
    });

    const result = await runtime.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.error?.message).toContain('Provider offline');
  });

  it('produces sample planner output matching the schema', async () => {
    // Direct execution without runtime for a clean output sample
    const outputPlanner = new PlannerAgent({
      provider: new MockPlanningProvider(),
    });

    const task = createTask({
      project_id: 'proj-output',
      type: 'planning',
      description:
        'Sample: Build for Social Good Hackathon\nTheme: Social Impact\nDeadline: Aug 1, 2026\nUse sponsor APIs from Google and Meta.',
      creator_agent: 'test',
      input: {
        hackathon_description:
          'Sample: Build for Social Good Hackathon\nTheme: Social Impact\nDeadline: Aug 1, 2026\nUse sponsor APIs from Google and Meta.',
        preferences: {
          team_size: 'small',
          platform: 'web',
          experience: 'advanced',
          preferred_stack: ['python', 'react', 'postgres'],
          sponsor_apis_allowed: true,
        },
      },
    });

    const result = await outputPlanner.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('Social');
    expect(result.summary).toContain('project ideas');
  });
});
