import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { PlaywrightTestAgent } from '../../agents/playwright-test-v1.js';
import { AgentRegistry } from '../../kernel/agents/agent-registry.js';
import { AgentRuntime } from '../../kernel/agents/agent-runtime.js';
import { EventBus } from '../../kernel/events/event-bus.js';
import { MemoryWriter } from '../../kernel/memory/memory-writer.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import { TaskLifecycleManager } from '../../kernel/tasks/task-lifecycle.js';
import { TaskQueue } from '../../kernel/tasks/task-queue.js';
import { TaskRepository } from '../../kernel/tasks/task-repository.js';
import { MockTestProvider } from '../../kernel/test/test-provider.js';
import type { TestPlan } from '../../kernel/test/test-types.js';

function createPassingPlan(): TestPlan {
  return {
    name: 'Passing Test Plan',
    base_url: 'http://localhost:3000',
    steps: [
      {
        id: 's1',
        description: 'Load home page',
        action: 'navigate',
        url: '/',
        assertions: [{ type: 'title', expected: 'Home', passed: true, message: 'Home page loaded' }],
      },
      {
        id: 's2',
        description: 'Verify login button',
        action: 'assert',
        selector: '#login-btn',
        assertions: [{ type: 'element_exists', expected: true, passed: true, message: 'Login button present' }],
      },
    ],
    screenshots: ['s1'],
    timeout_ms: 15000,
  };
}

function createFailingPlan(): TestPlan {
  return {
    name: 'Failing Test Plan',
    base_url: 'http://localhost:3000',
    steps: [
      { id: 'f1', description: 'Load home page', action: 'navigate', url: '/', assertions: [] },
      { id: 'f2', description: 'Trigger 404 page', action: 'navigate', url: '/nonexistent', assertions: [] },
    ],
    screenshots: ['f1', 'f2'],
    timeout_ms: 15000,
  };
}

describe('Testing Workflow Integration', () => {
  let tmpDir: string;
  let memoryWriter: MemoryWriter;
  let eventBus: EventBus;
  let repo: TaskRepository;
  let queue: TaskQueue;
  let lifecycle: TaskLifecycleManager;
  let registry: AgentRegistry;
  let runtime: AgentRuntime;
  let agent: PlaywrightTestAgent;
  let provider: MockTestProvider;

  beforeEach(async () => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-testing-'));

    memoryWriter = new MemoryWriter(tmpDir);
    eventBus = new EventBus(path.join(tmpDir, 'events'));
    await eventBus.start();

    repo = new TaskRepository(tmpDir);
    queue = new TaskQueue(repo);
    lifecycle = new TaskLifecycleManager(repo, queue);
    registry = new AgentRegistry();
    runtime = new AgentRuntime({ eventBus, taskLifecycle: lifecycle, registry });

    provider = new MockTestProvider();
    agent = new PlaywrightTestAgent({
      provider,
      memoryWriter,
      eventBus,
      agentId: 'agent.test.playwright.integration',
    });
  });

  afterEach(async () => {
    await runtime.shutdown();
    lifecycle.disposeAll();
    await eventBus.stop();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('executes a passing test plan via AgentRuntime', async () => {
    runtime.registerAgent(agent);

    const task = createTask({
      project_id: 'proj-int-1',
      type: 'testing',
      description: 'Run passing test plan',
      creator_agent: 'agent.test.playwright.integration',
      input: { test_plan: createPassingPlan() },
      acceptance_criteria: [
        { criterion_id: 'c1', description: 'Tests executed', verification_method: 'automated_test', verified: false },
      ],
    });

    const result = await runtime.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(result.summary).toContain('Passing Test Plan');
  });

  it('handles a failing test plan gracefully', async () => {
    runtime.registerAgent(agent);

    const task = createTask({
      project_id: 'proj-int-2',
      type: 'testing',
      description: 'Run failing test plan',
      creator_agent: 'agent.test.playwright.integration',
      input: { test_plan: createFailingPlan() },
      acceptance_criteria: [
        { criterion_id: 'c1', description: 'Tests executed', verification_method: 'automated_test', verified: false },
      ],
    });

    const result = await runtime.executeTask(task);

    expect(result.status).toBe('COMPLETED');
    expect(result.summary).toContain('Failing Test Plan');
    expect(result.summary).toContain('Bugs Filed');
    expect(result.summary).toContain('1 failed');
  });

  it('receives TESTING_STARTED and TESTING_COMPLETED events', async () => {
    const events: string[] = [];

    eventBus.subscribe('test-listener', ['TESTING_STARTED', 'TESTING_COMPLETED'], async (event) => {
      events.push(event.type);
    });

    runtime.registerAgent(agent);

    const task = createTask({
      project_id: 'proj-int-3',
      type: 'testing',
      description: 'Event test',
      creator_agent: 'agent.test.playwright.integration',
      input: { test_plan: createPassingPlan() },
      acceptance_criteria: [],
    });

    await runtime.executeTask(task);

    expect(events).toContain('TESTING_STARTED');
    expect(events).toContain('TESTING_COMPLETED');
  });

  it('receives PAGE_LOADED event', async () => {
    const events: string[] = [];

    eventBus.subscribe('page-listener', ['PAGE_LOADED'], async (event) => {
      events.push(event.type);
    });

    runtime.registerAgent(agent);

    const task = createTask({
      project_id: 'proj-int-4',
      type: 'testing',
      description: 'Page load event test',
      creator_agent: 'agent.test.playwright.integration',
      input: { test_plan: createPassingPlan() },
      acceptance_criteria: [],
    });

    await runtime.executeTask(task);

    expect(events).toContain('PAGE_LOADED');
  });

  it('writes to AGENT_LOG.md during execution', async () => {
    runtime.registerAgent(agent);

    const task = createTask({
      project_id: 'proj-int-5',
      type: 'testing',
      description: 'Memory writer test',
      creator_agent: 'agent.test.playwright.integration',
      input: { test_plan: createPassingPlan() },
      acceptance_criteria: [],
    });

    await runtime.executeTask(task);

    const logContent = await memoryWriter.readFile('AGENT_LOG.md');
    expect(logContent).toContain('Starting browser testing');
    expect(logContent).toContain('browser_testing');
  });

  it('writes to BUGS.md when tests fail', async () => {
    runtime.registerAgent(agent);

    const task = createTask({
      project_id: 'proj-int-6',
      type: 'testing',
      description: 'Bug filing test',
      creator_agent: 'agent.test.playwright.integration',
      input: { test_plan: createFailingPlan() },
      acceptance_criteria: [],
    });

    await runtime.executeTask(task);

    const bugsContent = await memoryWriter.readFile('BUGS.md');
    expect(bugsContent).toContain('BUG');
    expect(bugsContent).toContain('open');
  });

  it('does not write to BUGS.md when all tests pass', async () => {
    runtime.registerAgent(agent);

    const task = createTask({
      project_id: 'proj-int-7',
      type: 'testing',
      description: 'No bugs test',
      creator_agent: 'agent.test.playwright.integration',
      input: { test_plan: createPassingPlan() },
      acceptance_criteria: [],
    });

    await runtime.executeTask(task);

    const bugsContent = await memoryWriter.readFile('BUGS.md');
    expect(bugsContent).toBe('');
  });
});
