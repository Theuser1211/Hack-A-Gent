import { describe, it, expect, beforeEach, vi } from 'vitest';

import { PlannerAgent } from '../../agents/planner-v1.js';
import type {
  HackathonInput,
  ProjectIdea,
  Risk,
  Unknown,
  RecommendedQuestion,
  HackathonData,
} from '../../kernel/planning/planner-types.js';
import type { PlanningProvider } from '../../kernel/planning/planning-provider.js';
import { createTask } from '../../kernel/tasks/task-entity.js';

function createMockProvider(): PlanningProvider {
  return {
    ingestHackathon: vi.fn().mockResolvedValue({
      hackathon_name: 'Test Hackathon',
      theme: 'AI',
      tracks: [
        { name: 'General', description: 'Open' },
        { name: 'AI/ML', description: 'AI' },
      ],
      judging_criteria: [{ name: 'Creativity', weight: 50 }],
      sponsor_technologies: [],
      timeline: { submission_deadline: 'June 30' },
      submission_requirements: [],
      description: 'Test hackathon',
    } as HackathonData),
    generateProjectIdeas: vi.fn().mockResolvedValue([
      {
        id: 'idea-001',
        title: 'AI Assistant',
        description: 'An AI assistant',
        tracks: ['General', 'AI/ML'],
        difficulty: 7,
        innovation: 8,
        estimated_build_time_hours: 24,
        risks: ['Complexity'],
        key_features: ['NLP'],
        required_skills: ['TypeScript'],
        sponsor_technology_used: [],
      } as ProjectIdea,
    ]),
    assessRisks: vi.fn().mockResolvedValue([{ category: 'time', description: 'Time risk', severity: 'high' } as Risk]),
    identifyUnknowns: vi.fn().mockResolvedValue([{ category: 'team', question: 'Solo?', impact: 'high' } as Unknown]),
    generateQuestions: vi
      .fn()
      .mockResolvedValue([
        { id: 'q-001', question: 'What stack?', context: 'Helps decide', priority: 'essential' } as RecommendedQuestion,
      ]),
  };
}

function createTaskWithInput(overrides?: Record<string, unknown>): ReturnType<typeof createTask> {
  return createTask({
    project_id: 'proj-planner-test',
    type: 'planning',
    description: 'Plan for test hackathon',
    creator_agent: 'test',
    input: {
      hackathon_url: 'https://test.devpost.com',
      preferences: { team_size: 'solo', platform: 'web' },
      ...overrides,
    },
  });
}

describe('PlannerAgent', () => {
  let provider: ReturnType<typeof createMockProvider>;
  let agent: PlannerAgent;

  beforeEach(() => {
    provider = createMockProvider();
    agent = new PlannerAgent({ provider });
  });

  it('has correct manifest', () => {
    expect(agent.manifest.agent_id).toBe('agent.planner.v1');
    expect(agent.manifest.agent_type).toBe('planner');
    expect(agent.manifest.accepted_tasks).toContain('planning');
    expect(agent.manifest.accepted_tasks).toContain('analysis');
    expect(agent.manifest.capabilities).toHaveLength(4);
  });

  it('initializes and shuts down without error', async () => {
    await expect(agent.initialize()).resolves.not.toThrow();
    await expect(agent.shutdown()).resolves.not.toThrow();
  });

  it('handles onEvent for HACKATHON_DATA_READY', async () => {
    await expect(agent.onEvent({ type: 'HACKATHON_DATA_READY', payload: { task_id: 't-1' } })).resolves.not.toThrow();
  });

  it('completes planning with URL input', async () => {
    const task = createTaskWithInput();
    const result = await agent.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(provider.ingestHackathon).toHaveBeenCalledOnce();
    expect(provider.generateProjectIdeas).toHaveBeenCalledOnce();
    expect(provider.assessRisks).toHaveBeenCalledOnce();
    expect(provider.identifyUnknowns).toHaveBeenCalledOnce();
    expect(provider.generateQuestions).toHaveBeenCalledOnce();
    expect(result.summary).toContain('Test Hackathon');
    expect(result.summary).toContain('AI Assistant');
  });

  it('completes planning with description-only input', async () => {
    const task = createTask({
      project_id: 'proj-2',
      type: 'planning',
      description: 'Theme: Climate Hackathon 2026\nBuild something green',
      creator_agent: 'test',
    });
    const result = await agent.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(provider.ingestHackathon).toHaveBeenCalledOnce();
  });

  it('handles provider failure gracefully', async () => {
    provider.ingestHackathon = vi.fn().mockRejectedValue(new Error('API unavailable'));

    const task = createTaskWithInput();
    const result = await agent.executeTask(task);

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe('AGENT_FAIL');
    expect(result.error?.message).toContain('API unavailable');
  });

  it('generates assumptions based on preferences', async () => {
    const task = createTaskWithInput({ preferences: { team_size: 'solo', platform: 'web' } });
    await agent.executeTask(task);

    // Provider was called with the input containing preferences
    expect(provider.ingestHackathon).toHaveBeenCalledWith(
      expect.objectContaining({
        preferences: expect.objectContaining({ team_size: 'solo', platform: 'web' }),
      }),
    );
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

    const eventAgent = new PlannerAgent({ provider, eventBus: mockBus as any });
    const task = createTaskWithInput();
    await eventAgent.executeTask(task);

    expect(events).toContain('PLANNING_STARTED');
    expect(events).toContain('HACKATHON_INGESTED');
    expect(events).toContain('IDEAS_GENERATED');
    expect(events).toContain('RISKS_ASSESSED');
    expect(events).toContain('UNKNOWNS_IDENTIFIED');
    expect(events).toContain('QUESTIONS_GENERATED');
    expect(events).toContain('PLANNING_COMPLETE');
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

    const memAgent = new PlannerAgent({ provider, memoryWriter: mockWriter as any });
    const task = createTaskWithInput();
    await memAgent.executeTask(task);

    expect(mockWriter.appendLog).toHaveBeenCalled();
    expect(mockWriter.appendDecision).toHaveBeenCalledOnce();
    expect(logs.some((l) => l.includes('Planning complete'))).toBe(true);
  });

  it('uses custom agent ID when provided', () => {
    const customAgent = new PlannerAgent({ provider, agentId: 'agent.planner.custom' });
    expect(customAgent.manifest.agent_id).toBe('agent.planner.custom');
  });
});
