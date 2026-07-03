import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { AgentManifest, AgentRegistration } from '../../kernel/agents/agent-manifest.js';
import type { AgentRecord } from '../../kernel/agents/agent-registry.js';
import { AgentRuntime } from '../../kernel/agents/agent-runtime.js';
import type { Agent, AgentRuntimeConfig } from '../../kernel/agents/agent-runtime.js';
import type { EventHandler } from '../../kernel/events/event-bus.js';
import type { EventEnvelope } from '../../kernel/events/event-envelope.js';
import type { Task, TaskResult } from '../../kernel/tasks/task-entity.js';

function createMockManifest(overrides?: Partial<AgentManifest>): AgentManifest {
  return {
    agent_id: 'test.agent',
    agent_name: 'Test Agent',
    agent_type: 'utility',
    contract_version: '1.0.0',
    capabilities: [],
    required_skills: [],
    event_subscriptions: ['TASK_CREATED'],
    accepted_tasks: ['implementation'],
    produced_outputs: [],
    accessible_tools: [],
    accessible_memories: [],
    escalation_rules: [],
    timeout_ms: 5000,
    max_retries: 3,
    ...overrides,
  };
}

function createMockAgent(manifest?: AgentManifest): Agent {
  const m = manifest ?? createMockManifest();
  return {
    manifest: m,
    onEvent: vi.fn().mockResolvedValue(undefined),
    executeTask: vi.fn().mockResolvedValue({
      task_id: '00000000-0000-0000-0000-000000000000',
      status: 'COMPLETED' as const,
      exit_code: 'AGENT_OK' as const,
      artifacts: [],
      criteria_results: [],
      summary: 'done',
      error: null,
    } as TaskResult),
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  };
}

function createMockEventBus() {
  const subscriptions: Map<string, Array<{ subscriberId: string; handler: EventHandler }>> = new Map();
  return {
    subscribe: vi.fn((subscriberId: string, eventType: string, handler: EventHandler): string => {
      const existing = subscriptions.get(eventType) ?? [];
      existing.push({ subscriberId, handler });
      subscriptions.set(eventType, existing);
      return `${subscriberId}-mock-id`;
    }),
    unsubscribe: vi.fn(),
    publish: vi.fn(),
    publishAndWait: vi.fn(),
    getDeadLetterQueue: vi.fn(),
    replay: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    isRunning: vi.fn(),
    _subscriptions: subscriptions,
  };
}

function createMockLifecycle() {
  return {
    transition: vi.fn().mockImplementation((task: Task) => Promise.resolve(task)),
    handleResult: vi.fn(),
    checkDependencies: vi.fn(),
    setWaiting: vi.fn(),
    resume: vi.fn(),
    fail: vi.fn(),
    complete: vi.fn(),
    dispose: vi.fn(),
    disposeAll: vi.fn(),
  };
}

function createMockRegistry() {
  const records = new Map<string, AgentRecord>();
  return {
    register: vi.fn((reg: AgentRegistration): AgentRecord => {
      const record: AgentRecord = {
        manifest: reg.manifest,
        endpoint: reg.endpoint,
        status: 'active',
        last_heartbeat: new Date().toISOString(),
        registered_at: new Date().toISOString(),
      };
      records.set(reg.manifest.agent_id, record);
      return record;
    }),
    unregister: vi.fn(),
    findById: vi.fn((id: string) => records.get(id) ?? null),
    findByType: vi.fn(),
    findByCapability: vi.fn(),
    findAvailable: vi.fn((taskType: string) => {
      for (const record of records.values()) {
        const accepted = record.manifest.accepted_tasks as readonly string[];
        if (accepted.includes(taskType) && record.status === 'active') {
          return record;
        }
      }
      return null;
    }),
    heartbeat: vi.fn(),
    setStatus: vi.fn(),
    listAgents: vi.fn(),
  };
}

function createMockAgentRecord(manifest: AgentManifest): AgentRecord {
  return {
    manifest,
    endpoint: `agent://${manifest.agent_id}`,
    status: 'active',
    last_heartbeat: new Date().toISOString(),
    registered_at: new Date().toISOString(),
  };
}

describe('AgentRuntime', () => {
  let runtime: AgentRuntime;
  let mockBus: ReturnType<typeof createMockEventBus>;
  let mockLifecycle: ReturnType<typeof createMockLifecycle>;
  let mockRegistry: ReturnType<typeof createMockRegistry>;

  beforeEach(() => {
    mockBus = createMockEventBus();
    mockLifecycle = createMockLifecycle();
    mockRegistry = createMockRegistry();
    runtime = new AgentRuntime({
      eventBus: mockBus as unknown as AgentRuntimeConfig['eventBus'],
      taskLifecycle: mockLifecycle as unknown as AgentRuntimeConfig['taskLifecycle'],
      registry: mockRegistry as unknown as AgentRuntimeConfig['registry'],
    });
  });

  it('registers an agent and subscribes to its events', () => {
    const agent = createMockAgent();
    runtime.registerAgent(agent);

    expect(mockRegistry.register).toHaveBeenCalledWith(
      expect.objectContaining({
        manifest: agent.manifest,
        endpoint: `agent://${agent.manifest.agent_id}`,
      }),
    );
    expect(mockBus.subscribe).toHaveBeenCalledWith(agent.manifest.agent_id, 'TASK_CREATED', expect.any(Function));
  });

  it('returns agent via getAgent when found', () => {
    const agent = createMockAgent();
    runtime.registerAgent(agent);

    const found = runtime.getAgent('test.agent');
    expect(found).toBe(agent);
  });

  it('returns null from getAgent when not found', () => {
    const found = runtime.getAgent('nonexistent');
    expect(found).toBeNull();
  });

  it('registers agent with multiple event subscriptions', () => {
    const agent = createMockAgent(
      createMockManifest({
        agent_id: 'multi.sub',
        event_subscriptions: ['EVENT_A', 'EVENT_B', 'EVENT_C'],
      }),
    );
    runtime.registerAgent(agent);

    expect(mockBus.subscribe).toHaveBeenCalledTimes(3);
    expect(mockBus.subscribe).toHaveBeenCalledWith('multi.sub', 'EVENT_A', expect.any(Function));
    expect(mockBus.subscribe).toHaveBeenCalledWith('multi.sub', 'EVENT_B', expect.any(Function));
    expect(mockBus.subscribe).toHaveBeenCalledWith('multi.sub', 'EVENT_C', expect.any(Function));
  });

  it('executes a task through an available agent', async () => {
    const agent = createMockAgent();
    runtime.registerAgent(agent);
    mockRegistry.findAvailable.mockReturnValue(createMockAgentRecord(agent.manifest));

    const task = { task_id: 'task-1', type: 'implementation' } as Task;
    const result = await runtime.executeTask(task);

    expect(mockLifecycle.transition).toHaveBeenCalledWith(task, { type: 'ASSIGN' });
    expect(mockLifecycle.transition).toHaveBeenCalledWith(task, { type: 'START' });
    expect(agent.executeTask).toHaveBeenCalledWith(
      expect.objectContaining({ task_id: 'task-1', assigned_agent: 'test.agent' }),
    );
    expect(result.status).toBe('COMPLETED');
  });

  it('returns FAILED when no available agent for task type', async () => {
    mockRegistry.findAvailable.mockReturnValue(null);

    const task = { task_id: 'task-2', type: 'implementation' } as Task;
    const result = await runtime.executeTask(task);

    expect(mockLifecycle.transition).toHaveBeenCalledWith(task, { type: 'ASSIGN' });
    expect(mockLifecycle.transition).toHaveBeenCalledWith(task, { type: 'START' });
    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe('AGENT_FATAL');
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    expect(result.error?.message).toContain('implementation');
  });

  it('returns FAILED when agent is registered but not loaded in runtime', async () => {
    mockRegistry.findAvailable.mockReturnValue(createMockAgentRecord(createMockManifest({ agent_id: 'ghost.agent' })));

    const task = { task_id: 'task-3', type: 'implementation' } as Task;
    const result = await runtime.executeTask(task);

    expect(result.status).toBe('FAILED');
    expect(result.exit_code).toBe('AGENT_FATAL');
    expect(result.error?.code).toBe('INTERNAL_ERROR');
    expect(result.error?.message).toContain('ghost.agent');
  });

  it('delegates heartbeat to registry', async () => {
    await runtime.heartbeat('test.agent');
    expect(mockRegistry.heartbeat).toHaveBeenCalledWith('test.agent');
  });

  it('initializes all registered agents', async () => {
    const agent1 = createMockAgent(createMockManifest({ agent_id: 'agent.one' }));
    const agent2 = createMockAgent(createMockManifest({ agent_id: 'agent.two' }));
    runtime.registerAgent(agent1);
    runtime.registerAgent(agent2);

    await runtime.initialize();

    expect(agent1.initialize).toHaveBeenCalledOnce();
    expect(agent2.initialize).toHaveBeenCalledOnce();
  });

  it('shuts down all registered agents and clears the map', async () => {
    const agent1 = createMockAgent(createMockManifest({ agent_id: 'agent.one' }));
    const agent2 = createMockAgent(createMockManifest({ agent_id: 'agent.two' }));
    runtime.registerAgent(agent1);
    runtime.registerAgent(agent2);

    await runtime.shutdown();

    expect(agent1.shutdown).toHaveBeenCalledOnce();
    expect(agent2.shutdown).toHaveBeenCalledOnce();
    expect(runtime.getAgent('agent.one')).toBeNull();
    expect(runtime.getAgent('agent.two')).toBeNull();
  });

  it('subscribed event handler calls agent.onEvent', async () => {
    const agent = createMockAgent();
    runtime.registerAgent(agent);

    const subscribeCall = mockBus.subscribe.mock.calls.find(([id]) => id === 'test.agent');
    expect(subscribeCall).toBeDefined();
    const handler = subscribeCall![2] as EventHandler;

    const mockEvent: EventEnvelope = {
      event_id: '00000000-0000-0000-0000-000000000000',
      type: 'TASK_CREATED',
      source: 'orchestrator',
      target: 'test.agent',
      timestamp: new Date().toISOString(),
      schema_version: '1.0',
      correlation_id: '00000000-0000-0000-0000-000000000000',
      causation_id: null,
      payload: { task_id: 'task-1' },
      metadata: {
        priority: 'normal' as const,
        delivery_guarantee: 'at_least_once' as const,
        ttl_ms: 300000,
        retry_count: 0,
        max_retries: 3,
        blocking: false,
        persist: true,
      },
    };

    await handler(mockEvent);
    expect(agent.onEvent).toHaveBeenCalledWith({
      type: 'TASK_CREATED',
      payload: { task_id: 'task-1' },
    });
  });
});
