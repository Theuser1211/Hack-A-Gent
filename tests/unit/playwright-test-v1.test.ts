import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PlaywrightTestAgent } from '../../agents/playwright-test-v1.js';
import { createTask } from '../../kernel/tasks/task-entity.js';
import type { Task } from '../../kernel/tasks/task-entity.js';
import { MockTestProvider } from '../../kernel/test/test-provider.js';
import type { TestPlan } from '../../kernel/test/test-types.js';

function createSamplePlan(): TestPlan {
  return {
    name: 'Sample Test Plan',
    base_url: 'http://localhost:3000',
    steps: [
      { id: 'step-1', description: 'Load landing page', action: 'navigate', url: '/', assertions: [] },
      { id: 'step-2', description: 'Click get started', action: 'click', selector: '#get-started', assertions: [] },
      {
        id: 'step-3',
        description: 'Verify title',
        action: 'assert',
        assertions: [{ type: 'title', expected: 'Welcome', passed: true, message: 'Title matches' }],
      },
    ],
    screenshots: ['step-1', 'step-3'],
    timeout_ms: 30000,
  };
}

function createTestTask(plan: TestPlan): Task {
  return createTask({
    project_id: 'proj-test-1',
    type: 'testing',
    description: 'Run browser tests',
    creator_agent: 'agent.test.playwright.v1',
    input: { test_plan: plan },
    acceptance_criteria: [
      {
        criterion_id: 'c1',
        description: 'All test steps executed',
        verification_method: 'automated_test',
        verified: false,
      },
      {
        criterion_id: 'c2',
        description: 'Test report generated',
        verification_method: 'automated_test',
        verified: false,
      },
    ],
  });
}

describe('PlaywrightTestAgent', () => {
  let agent: PlaywrightTestAgent;
  let provider: MockTestProvider;

  beforeEach(() => {
    provider = new MockTestProvider();
    agent = new PlaywrightTestAgent({ provider });
  });

  describe('manifest', () => {
    it('has correct agent_id', () => {
      expect(agent.manifest.agent_id).toBe('agent.test.playwright.v1');
    });

    it('has browser_testing capability', () => {
      expect(agent.manifest.capabilities.some((c) => c.capability_id === 'browser_testing')).toBe(true);
    });

    it('accepts testing task type', () => {
      expect(agent.manifest.accepted_tasks).toContain('testing');
    });

    it('subscribes to BUILD_COMPLETED', () => {
      expect(agent.manifest.event_subscriptions).toContain('BUILD_COMPLETED');
    });

    it('has BUGS.md memory access', () => {
      expect(agent.manifest.accessible_memories.some((m) => m.file === 'BUGS.md')).toBe(true);
    });
  });

  describe('executeTask', () => {
    it('returns COMPLETED when all tests pass', async () => {
      const plan = createSamplePlan();
      const task = createTestTask(plan);

      const result = await agent.executeTask(task);

      expect(result.status).toBe('COMPLETED');
      expect(result.exit_code).toBe('AGENT_OK');
      expect(result.summary).toContain('Sample Test Plan');
    });

    it('returns FAILED when input is missing', async () => {
      const task = createTask({
        project_id: 'proj-test-1',
        type: 'testing',
        description: 'Invalid test',
        creator_agent: 'agent.test.playwright.v1',
        input: {},
        acceptance_criteria: [],
      });

      const result = await agent.executeTask(task);

      expect(result.status).toBe('FAILED');
      expect(result.exit_code).toBe('AGENT_FAIL');
    });

    it('produces a valid test report on success', async () => {
      const plan = createSamplePlan();
      const task = createTestTask(plan);

      const result = await agent.executeTask(task);

      expect(result.summary).toContain(`${plan.steps.length}/${plan.steps.length} passed`);
      expect(result.summary).toContain('Bugs Filed');
    });

    it('captures screenshots for configured steps', async () => {
      const screenshotSpy = vi.spyOn(provider, 'captureScreenshot');
      const plan = createSamplePlan();
      const task = createTestTask(plan);

      await agent.executeTask(task);

      expect(screenshotSpy).toHaveBeenCalledTimes(plan.screenshots.length);
    });

    it('passes acceptance criteria on success', async () => {
      const plan = createSamplePlan();
      const task = createTestTask(plan);

      const result = await agent.executeTask(task);

      expect(result.criteria_results.every((c) => c.passed)).toBe(true);
    });

    it('calls initialize, launchApplication, openBrowser, and close', async () => {
      const initSpy = vi.spyOn(provider, 'initialize');
      const launchSpy = vi.spyOn(provider, 'launchApplication');
      const openSpy = vi.spyOn(provider, 'openBrowser');
      const closeSpy = vi.spyOn(provider, 'close');

      const plan = createSamplePlan();
      const task = createTestTask(plan);

      await agent.executeTask(task);

      expect(initSpy).toHaveBeenCalledOnce();
      expect(launchSpy).toHaveBeenCalledOnce();
      expect(openSpy).toHaveBeenCalledWith(plan.base_url);
      expect(closeSpy).toHaveBeenCalledOnce();
    });
  });

  describe('onEvent', () => {
    it('handles BUILD_COMPLETED event', async () => {
      await expect(
        agent.onEvent({ type: 'BUILD_COMPLETED', payload: { project_name: 'Test' } }),
      ).resolves.not.toThrow();
    });
  });

  describe('lifecycle', () => {
    it('initialize does not throw', async () => {
      await expect(agent.initialize()).resolves.not.toThrow();
    });

    it('shutdown does not throw', async () => {
      await expect(agent.shutdown()).resolves.not.toThrow();
    });
  });
});
