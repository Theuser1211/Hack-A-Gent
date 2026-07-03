import { describe, it, expect, beforeEach, vi } from 'vitest';

import { ArchitectAgent } from '../../agents/architect-v1.js';
import type { ArchitectProvider } from '../../kernel/planning/architect-provider.js';
import type {
  RecommendedStack,
  FolderStructure,
  RequestSchema,
  Component,
  BackendModule,
  Milestone,
  SkillRequirement,
  HumanCheckpoint,
} from '../../kernel/planning/architect-types.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';
import { createTask } from '../../kernel/tasks/task-entity.js';

function createSamplePlan(): PlannerOutput {
  return {
    summary: 'Planning complete',
    hackathon_data: {
      hackathon_name: 'AI Innovation Hackathon',
      theme: 'AI/ML',
      tracks: [{ name: 'General', description: 'Open' }],
      judging_criteria: [{ name: 'Creativity', weight: 50 }],
      sponsor_technologies: [],
      timeline: { submission_deadline: 'July 15, 2026' },
      submission_requirements: [],
      description: 'Build AI solutions.',
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
    risks: [],
    assumptions: ['Team is comfortable with TypeScript'],
    unknowns: [],
    recommended_questions: [],
    generated_at: new Date().toISOString(),
    planner_version: '1.0.0',
  };
}

function createMockProvider(): ArchitectProvider {
  return {
    selectStack: vi.fn().mockResolvedValue({
      frontend: [{ name: 'React', version: '18.x', purpose: 'UI', alternatives: ['Vue'] }],
      backend: [{ name: 'Node.js', version: '20.x', purpose: 'API', alternatives: ['Express'] }],
      database: [{ name: 'PostgreSQL', version: '16.x', purpose: 'Data', alternatives: ['MySQL'] }],
      infrastructure: [{ name: 'Docker', version: '24.x', purpose: 'Container', alternatives: [] }],
      tooling: [{ name: 'Vitest', version: '1.x', purpose: 'Testing', alternatives: [] }],
    } as RecommendedStack),
    designFolderStructure: vi.fn().mockResolvedValue({
      root: '/project',
      entries: [
        { path: 'src/', type: 'dir', description: 'Source', children: [] },
        { path: 'tests/', type: 'dir', description: 'Tests', children: [] },
      ],
    } as FolderStructure),
    designDatabaseSchema: vi.fn().mockResolvedValue({
      engine: 'PostgreSQL',
      tables: [
        {
          name: 'users',
          columns: [{ name: 'id', type: 'UUID', primary_key: true }],
          indexes: [],
          description: 'Users table',
        },
      ],
      relationships: [],
    }),
    defineApiContracts: vi
      .fn()
      .mockResolvedValue([
        {
          method: 'GET',
          path: '/api/health',
          description: 'Health check',
          auth_required: false,
          query_params: [],
          path_params: [],
          error_responses: [],
        } as RequestSchema,
      ]),
    defineFrontendModules: vi
      .fn()
      .mockResolvedValue([{ name: 'AuthModule', description: 'Auth', props: [], dependencies: [] } as Component]),
    defineBackendModules: vi
      .fn()
      .mockResolvedValue([
        {
          name: 'AuthService',
          description: 'Auth service',
          endpoints: ['POST /api/auth/login'],
          dependencies: [],
          environment_variables: [],
        } as BackendModule,
      ]),
    planMilestones: vi
      .fn()
      .mockResolvedValue([
        {
          id: 'ms-1',
          name: 'Foundation',
          description: 'Setup',
          due_offset_hours: 4,
          tasks: [{ id: 't1', description: 'Init', estimated_hours: 2, depends_on: [] }],
          deliverables: ['Running'],
          verification: 'Check /health',
        } as Milestone,
      ]),
    buildExecutionGraph: vi.fn().mockResolvedValue({
      nodes: [{ id: 'start', label: 'Start', type: 'task', estimated_duration_minutes: 30, depends_on: [] }],
      entryPoint: 'start',
    }),
    identifySkills: vi
      .fn()
      .mockResolvedValue([{ skill: 'TypeScript', level: 'intermediate', required: true } as SkillRequirement]),
    assessArchitectureRisks: vi
      .fn()
      .mockResolvedValue([
        {
          category: 'technical',
          description: 'TypeScript complexity',
          severity: 'medium',
          mitigation: 'Use strict mode',
        },
      ]),
    identifyCheckpoints: vi
      .fn()
      .mockResolvedValue([
        {
          id: 'cp-1',
          phase: 'Planning',
          question: 'Proceed?',
          options: ['Yes', 'No'],
          required: true,
        } as HumanCheckpoint,
      ]),
  };
}

function createTaskWithInput(): ReturnType<typeof createTask> {
  return createTask({
    project_id: 'proj-arch-test',
    type: 'architecture',
    description: 'Design architecture for AI Innovation Hackathon',
    creator_agent: 'test',
    input: {
      planner_output: createSamplePlan(),
    },
  });
}

describe('ArchitectAgent', () => {
  let provider: ReturnType<typeof createMockProvider>;
  let agent: ArchitectAgent;

  beforeEach(() => {
    provider = createMockProvider();
    agent = new ArchitectAgent({ provider });
  });

  it('has correct manifest', () => {
    expect(agent.manifest.agent_id).toBe('agent.architect.v1');
    expect(agent.manifest.agent_type).toBe('architect');
    expect(agent.manifest.accepted_tasks).toContain('architecture');
    expect(agent.manifest.accepted_tasks).toContain('planning');
    expect(agent.manifest.capabilities).toHaveLength(4);
  });

  it('initializes and shuts down without error', async () => {
    await expect(agent.initialize()).resolves.not.toThrow();
    await expect(agent.shutdown()).resolves.not.toThrow();
  });

  it('handles onEvent for PLANNING_COMPLETE', async () => {
    await expect(agent.onEvent({ type: 'PLANNING_COMPLETE', payload: { task_id: 't-1' } })).resolves.not.toThrow();
  });

  it('completes architecture design with planner output', async () => {
    const task = createTaskWithInput();
    const result = await agent.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(provider.selectStack).toHaveBeenCalledOnce();
    expect(provider.designFolderStructure).toHaveBeenCalledOnce();
    expect(provider.designDatabaseSchema).toHaveBeenCalledOnce();
    expect(provider.defineApiContracts).toHaveBeenCalledOnce();
    expect(provider.defineFrontendModules).toHaveBeenCalledOnce();
    expect(provider.defineBackendModules).toHaveBeenCalledOnce();
    expect(provider.planMilestones).toHaveBeenCalledOnce();
    expect(provider.buildExecutionGraph).toHaveBeenCalledOnce();
    expect(provider.identifySkills).toHaveBeenCalledOnce();
    expect(provider.assessArchitectureRisks).toHaveBeenCalledOnce();
    expect(provider.identifyCheckpoints).toHaveBeenCalledOnce();
    expect(result.summary).toContain('AI Innovation Hackathon');
  });

  it('handles provider failure gracefully', async () => {
    provider.selectStack = vi.fn().mockRejectedValue(new Error('Provider unavailable'));

    const task = createTaskWithInput();
    const result = await agent.executeTask(task);

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe('AGENT_FAIL');
    expect(result.error?.message).toContain('Provider unavailable');
  });

  it('handles missing planner output gracefully', async () => {
    const task = createTask({
      project_id: 'proj-no-plan',
      type: 'architecture',
      description: 'No plan provided',
      creator_agent: 'test',
      input: {},
    });
    const result = await agent.executeTask(task);

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe('AGENT_FAIL');
    expect(result.error?.message).toContain('Invalid or missing planner output');
  });

  it('publishes events when event bus is provided', async () => {
    const events: string[] = [];
    const mockBus = {
      publish: vi.fn(async (event: { type: string }) => {
        events.push(event.type);
      }),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      publishAndWait: vi.fn(),
      getDeadLetterQueue: vi.fn(),
      replay: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      isRunning: vi.fn(),
    };

    const eventAgent = new ArchitectAgent({ provider, eventBus: mockBus as any });
    const task = createTaskWithInput();
    await eventAgent.executeTask(task);

    expect(events).toContain('ARCHITECTURE_STARTED');
    expect(events).toContain('STACK_SELECTED');
    expect(events).toContain('SCHEMA_CREATED');
    expect(events).toContain('MODULES_DEFINED');
    expect(events).toContain('EXECUTION_GRAPH_CREATED');
    expect(events).toContain('ARCHITECTURE_COMPLETE');
  });

  it('writes to memory when memory writer is provided', async () => {
    const logs: string[] = [];
    const mockWriter = {
      appendLog: vi.fn(async (entry: { result: string; body: string }) => {
        logs.push(`[${entry.result}] ${entry.body}`);
      }),
      appendDecision: vi.fn(async () => {}),
      appendBug: vi.fn(),
      updateTodo: vi.fn(),
      readFile: vi.fn(),
      searchLog: vi.fn(),
    };

    const memAgent = new ArchitectAgent({ provider, memoryWriter: mockWriter as any });
    const task = createTaskWithInput();
    await memAgent.executeTask(task);

    expect(mockWriter.appendLog).toHaveBeenCalled();
    expect(mockWriter.appendDecision).toHaveBeenCalledOnce();
    expect(logs.some((l) => l.includes('Architecture complete'))).toBe(true);
  });

  it('uses custom agent ID when provided', () => {
    const customAgent = new ArchitectAgent({ provider, agentId: 'agent.architect.custom' });
    expect(customAgent.manifest.agent_id).toBe('agent.architect.custom');
  });

  it('parses planner output from individual fields', async () => {
    const plan = createSamplePlan();
    const task = createTask({
      project_id: 'proj-fields',
      type: 'architecture',
      description: 'Fields test',
      creator_agent: 'test',
      input: {
        hackathon_data: plan.hackathon_data,
        project_ideas: plan.project_ideas,
        summary: plan.summary,
      },
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
  });

  it('includes acceptance criteria results on success', async () => {
    const task = createTask({
      project_id: 'proj-criteria',
      type: 'architecture',
      description: 'Criteria test',
      creator_agent: 'test',
      input: { planner_output: createSamplePlan() },
      acceptance_criteria: [
        {
          criterion_id: 'c1',
          description: 'Design architecture',
          verification_method: 'automated_test',
          verified: false,
        },
      ],
    });

    const result = await agent.executeTask(task);
    expect(result.criteria_results).toHaveLength(1);
    expect(result.criteria_results[0]?.passed).toBe(true);
  });
});
