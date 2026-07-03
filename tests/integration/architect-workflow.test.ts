import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { ArchitectAgent } from '../../agents/architect-v1.js';
import { AgentRegistry } from '../../kernel/agents/agent-registry.js';
import { AgentRuntime } from '../../kernel/agents/agent-runtime.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import { MockArchitectProvider } from '../../kernel/planning/architect-provider.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import { TaskLifecycleManager } from '../../kernel/tasks/task-lifecycle.js';
import { TaskQueue } from '../../kernel/tasks/task-queue.js';
import { TaskRepository } from '../../kernel/tasks/task-repository.js';

function createSamplePlannerOutput(): PlannerOutput {
  return {
    summary: 'Planning complete for AI Innovation Hackathon',
    hackathon_data: {
      hackathon_name: 'AI Innovation Hackathon',
      theme: 'AI/ML',
      tracks: [
        { name: 'General', description: 'Open track' },
        { name: 'AI/ML', description: 'AI/ML track' },
      ],
      judging_criteria: [
        { name: 'Creativity', weight: 25, description: 'Originality' },
        { name: 'Technical', weight: 25, description: 'Complexity' },
        { name: 'Impact', weight: 30, description: 'Real-world impact' },
        { name: 'Polish', weight: 20, description: 'Quality' },
      ],
      sponsor_technologies: [],
      timeline: { submission_deadline: 'July 15, 2026' },
      submission_requirements: [
        { category: 'Code', description: 'GitHub link', required: true },
        { category: 'Demo', description: 'Video demo', required: true },
      ],
      description: 'Build innovative AI solutions for real-world problems.',
    },
    project_ideas: [
      {
        id: 'idea-001',
        title: 'AI Assistant',
        description: 'An AI assistant',
        tracks: ['AI/ML'],
        difficulty: 7,
        innovation: 8,
        estimated_build_time_hours: 24,
        risks: ['LLM complexity'],
        key_features: ['NLP'],
        required_skills: ['TypeScript', 'React'],
        sponsor_technology_used: [],
      },
    ],
    risks: [
      { category: 'technical', description: 'LLM complexity', severity: 'high', mitigation: 'Use existing APIs' },
    ],
    assumptions: ['Team has TypeScript experience'],
    unknowns: [{ category: 'team', question: 'Team size?', impact: 'high' }],
    recommended_questions: [{ id: 'q-001', question: 'What stack?', context: 'Decide', priority: 'essential' }],
    generated_at: new Date().toISOString(),
    planner_version: '1.0.0',
  };
}

describe('Architect Workflow Integration', () => {
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let eventBus: EventBus;
  let repo: TaskRepository;
  let queue: TaskQueue;
  let lifecycle: TaskLifecycleManager;
  let registry: AgentRegistry;
  let runtime: AgentRuntime;
  let architect: ArchitectAgent;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-architect-'));

    memoryWriter = new MemoryWriter(tmpDir);
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    repo = new TaskRepository(tmpDir);
    queue = new TaskQueue(repo);
    lifecycle = new TaskLifecycleManager(repo, queue);
    registry = new AgentRegistry();
    runtime = new AgentRuntime({ eventBus, taskLifecycle: lifecycle, registry });

    architect = new ArchitectAgent({
      provider: new MockArchitectProvider(),
      memoryWriter,
      eventBus,
      agentId: 'agent.architect.integration',
    });
  });

  afterEach(async () => {
    await runtime.shutdown();
    lifecycle.disposeAll();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes a full architecture workflow via AgentRuntime', async () => {
    runtime.registerAgent(architect);

    const plan = createSamplePlannerOutput();
    const task = createTask({
      project_id: 'proj-arch-integration',
      type: 'architecture',
      description: 'Design architecture for AI Innovation Hackathon',
      creator_agent: 'test-orchestrator',
      input: {
        planner_output: plan,
      },
      acceptance_criteria: [
        {
          criterion_id: 'c1',
          description: 'Select technology stack',
          verification_method: 'automated_test',
          verified: false,
        },
        {
          criterion_id: 'c2',
          description: 'Design database schema',
          verification_method: 'automated_test',
          verified: false,
        },
        {
          criterion_id: 'c3',
          description: 'Define API contracts',
          verification_method: 'automated_test',
          verified: false,
        },
      ],
    });

    const result = await runtime.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(result.summary).toContain('AI Innovation Hackathon');
    expect(result.error).toBeNull();

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('ARCHITECTURE');
    expect(logContent).toContain('stack');
    expect(logContent).toContain('database');

    const decisionsContent = await memoryWriter.readFile('DECISIONS.md');
    expect(decisionsContent).toContain('Selected technology stack');
  });

  it('receives events published during architecture', async () => {
    const receivedEvents: string[] = [];
    eventBus.subscribe('test-watcher', 'ARCHITECTURE_STARTED', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'ARCHITECTURE_COMPLETE', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'STACK_SELECTED', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'SCHEMA_CREATED', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'MODULES_DEFINED', async (event) => {
      receivedEvents.push(event.type);
    });
    eventBus.subscribe('test-watcher', 'EXECUTION_GRAPH_CREATED', async (event) => {
      receivedEvents.push(event.type);
    });

    runtime.registerAgent(architect);

    const plan = createSamplePlannerOutput();
    const task = createTask({
      project_id: 'proj-arch-events',
      type: 'architecture',
      description: 'Event test',
      creator_agent: 'test',
      input: { planner_output: plan },
    });

    await runtime.executeTask(task);

    await new Promise((r) => setTimeout(r, 200));

    expect(receivedEvents).toContain('ARCHITECTURE_STARTED');
    expect(receivedEvents).toContain('STACK_SELECTED');
    expect(receivedEvents).toContain('SCHEMA_CREATED');
    expect(receivedEvents).toContain('MODULES_DEFINED');
    expect(receivedEvents).toContain('EXECUTION_GRAPH_CREATED');
    expect(receivedEvents).toContain('ARCHITECTURE_COMPLETE');
  });

  it('fails gracefully when provider throws', async () => {
    const failingProvider: import('../../kernel/planning/architect-provider.js').ArchitectProvider = {
      selectStack: async () => {
        throw new Error('Provider offline');
      },
      designFolderStructure: async () => ({ root: '/', entries: [] }),
      designDatabaseSchema: async () => ({ engine: '', tables: [] }),
      defineApiContracts: async () => [],
      defineFrontendModules: async () => [],
      defineBackendModules: async () => [],
      planMilestones: async () => [],
      buildExecutionGraph: async () => ({ nodes: [], entryPoint: '' }),
      identifySkills: async () => [],
      assessArchitectureRisks: async () => [],
      identifyCheckpoints: async () => [],
    };
    const failingArchitect = new ArchitectAgent({ provider: failingProvider });

    runtime.registerAgent(failingArchitect);

    const plan = createSamplePlannerOutput();
    const task = createTask({
      project_id: 'proj-arch-fail',
      type: 'architecture',
      description: 'Will fail',
      creator_agent: 'test',
      input: { planner_output: plan },
    });

    const result = await runtime.executeTask(task);
    expect(result.status).toBe('FAILED');
    expect(result.error?.message).toContain('Provider offline');
  });

  it('produces a complete architecture blueprint matching the schema', async () => {
    const directAgent = new ArchitectAgent({
      provider: new MockArchitectProvider(),
    });

    const plan = createSamplePlannerOutput();
    const task = createTask({
      project_id: 'proj-arch-output',
      type: 'architecture',
      description: 'Sample architecture design',
      creator_agent: 'test',
      input: { planner_output: plan },
    });

    const result = await directAgent.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('AI Innovation');
    expect(result.summary).toContain('Stack');
    expect(result.summary).toContain('Milestones');
  });
});
