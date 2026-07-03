import { describe, it, expect } from 'vitest';

import { EchoAgent } from '../../agents/echo-agent.js';
import { createTask } from '../../kernel/tasks/task-entity.js';

describe('EchoAgent', () => {
  it('has correct manifest', () => {
    const agent = new EchoAgent();
    expect(agent.manifest.agent_id).toBe('agent.echo');
    expect(agent.manifest.agent_name).toBe('Echo Agent');
    expect(agent.manifest.agent_type).toBe('utility');
    expect(agent.manifest.accepted_tasks).toContain('implementation');
    expect(agent.manifest.accepted_tasks).toContain('testing');
  });

  it('executes a task and returns completed result', async () => {
    const agent = new EchoAgent();
    const task = createTask({
      project_id: 'proj-1',
      type: 'testing',
      description: 'Run unit tests',
      creator_agent: 'orchestrator',
      acceptance_criteria: [
        { criterion_id: 'c1', description: 'All tests pass', verification_method: 'automated_test', verified: false },
      ],
    });

    const result = await agent.executeTask(task);
    expect(result.status).toBe('COMPLETED');
    expect(result.exit_code).toBe('AGENT_OK');
    expect(result.summary).toContain('Run unit tests');
    expect(result.criteria_results).toHaveLength(1);
    expect(result.criteria_results[0]!.passed).toBe(true);
  });

  it('handles events without error', async () => {
    const agent = new EchoAgent();
    await expect(agent.onEvent({ type: 'TEST_EVENT', payload: { value: 42 } })).resolves.not.toThrow();
  });

  it('initializes and shuts down without error', async () => {
    const agent = new EchoAgent();
    await expect(agent.initialize()).resolves.not.toThrow();
    await expect(agent.shutdown()).resolves.not.toThrow();
  });
});
