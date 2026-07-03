import { describe, it, expect } from 'vitest';

import type { AgentManifest, AgentRegistration } from '../../kernel/agents/agent-manifest.js';
import { AgentRegistry } from '../../kernel/agents/agent-registry.js';

function createTestManifest(overrides?: Partial<AgentManifest>): AgentManifest {
  return {
    agent_id: overrides?.agent_id ?? 'test.agent',
    agent_name: overrides?.agent_name ?? 'Test Agent',
    agent_type: overrides?.agent_type ?? 'utility',
    contract_version: '1.0.0',
    capabilities: overrides?.capabilities ?? [],
    required_skills: [],
    event_subscriptions: ['TEST_EVENT'],
    accepted_tasks: overrides?.accepted_tasks ?? ['implementation'],
    produced_outputs: [],
    accessible_tools: [],
    accessible_memories: [],
    escalation_rules: [],
    timeout_ms: 5000,
    max_retries: 3,
  };
}

function createRegistration(manifest: AgentManifest): AgentRegistration {
  return {
    manifest,
    endpoint: `agent://${manifest.agent_id}`,
    health_check: { type: 'heartbeat', interval_ms: 30000 },
  };
}

describe('AgentRegistry', () => {
  it('registers and finds agents', () => {
    const registry = new AgentRegistry();
    const manifest = createTestManifest();
    const record = registry.register(createRegistration(manifest));

    expect(record.manifest.agent_id).toBe('test.agent');
    expect(record.status).toBe('active');

    const found = registry.findById('test.agent');
    expect(found).not.toBeNull();
  });

  it('unregisters agents', () => {
    const registry = new AgentRegistry();
    registry.register(createRegistration(createTestManifest()));

    expect(registry.unregister('test.agent')).toBe(true);
    expect(registry.findById('test.agent')).toBeNull();
    expect(registry.unregister('nonexistent')).toBe(false);
  });

  it('finds agents by type', () => {
    const registry = new AgentRegistry();

    registry.register(createRegistration(createTestManifest({ agent_id: 'a1', agent_type: 'planner' })));
    registry.register(createRegistration(createTestManifest({ agent_id: 'a2', agent_type: 'planner' })));
    registry.register(createRegistration(createTestManifest({ agent_id: 'a3', agent_type: 'judge' })));

    const planners = registry.findByType('planner');
    expect(planners).toHaveLength(2);

    const judges = registry.findByType('judge');
    expect(judges).toHaveLength(1);
  });

  it('finds agents by capability', () => {
    const registry = new AgentRegistry();
    registry.register(
      createRegistration(
        createTestManifest({
          agent_id: 'code.agent',
          capabilities: [
            { capability_id: 'code_gen', description: 'Generates code', input_schema: {}, output_schema: {} },
          ],
        }),
      ),
    );
    registry.register(
      createRegistration(
        createTestManifest({
          agent_id: 'test.agent',
          capabilities: [
            { capability_id: 'test_exec', description: 'Runs tests', input_schema: {}, output_schema: {} },
          ],
        }),
      ),
    );

    const codeAgents = registry.findByCapability('code_gen');
    expect(codeAgents).toHaveLength(1);
    expect(codeAgents[0]!.manifest.agent_id).toBe('code.agent');
  });

  it('finds available agent for task type', () => {
    const registry = new AgentRegistry();

    registry.register(
      createRegistration(
        createTestManifest({
          agent_id: 'backend',
          accepted_tasks: ['implementation', 'testing'],
        }),
      ),
    );
    registry.register(
      createRegistration(
        createTestManifest({
          agent_id: 'tester',
          accepted_tasks: ['testing'],
        }),
      ),
    );

    const implAgent = registry.findAvailable('implementation');
    expect(implAgent).not.toBeNull();
    expect(implAgent!.manifest.agent_id).toBe('backend');

    const testAgent = registry.findAvailable('testing');
    expect(testAgent).not.toBeNull();
  });

  it('tracks heartbeat', () => {
    const registry = new AgentRegistry();
    registry.register(createRegistration(createTestManifest()));

    const found = registry.findById('test.agent');
    expect(found).not.toBeNull();
    expect(found!.last_heartbeat).not.toBeNull();

    registry.heartbeat('test.agent');
    expect(found!.last_heartbeat).not.toBeNull();
  });

  it('sets agent status', () => {
    const registry = new AgentRegistry();
    registry.register(createRegistration(createTestManifest()));

    registry.setStatus('test.agent', 'draining');
    expect(registry.findById('test.agent')!.status).toBe('draining');

    registry.setStatus('test.agent', 'active');
    expect(registry.findById('test.agent')!.status).toBe('active');
  });

  it('findAvailable returns null when no active agent found', () => {
    const registry = new AgentRegistry();
    const result = registry.findAvailable('nonexistent');
    expect(result).toBeNull();
  });

  it('findAvailable handles agents with null heartbeat', () => {
    const registry = new AgentRegistry();
    const manifest = createTestManifest({ agent_id: 'a1', accepted_tasks: ['implementation'] });
    registry.register({ manifest, endpoint: 'agent://a1', health_check: { type: 'heartbeat', interval_ms: 30000 } });
    // Manually set heartbeat to null to trigger ?? 0 fallback
    const record = registry.findById('a1')!;
    record.last_heartbeat = null;

    const result = registry.findAvailable('implementation');
    expect(result).not.toBeNull();
    expect(result!.manifest.agent_id).toBe('a1');
  });

  it('counts registered agents', () => {
    const registry = new AgentRegistry();
    expect(registry.count()).toBe(0);

    registry.register(createRegistration(createTestManifest({ agent_id: 'a1' })));
    expect(registry.count()).toBe(1);

    registry.register(createRegistration(createTestManifest({ agent_id: 'a2' })));
    expect(registry.count()).toBe(2);
  });

  it('lists all agents', () => {
    const registry = new AgentRegistry();
    registry.register(createRegistration(createTestManifest({ agent_id: 'a1' })));
    registry.register(createRegistration(createTestManifest({ agent_id: 'a2' })));

    const agents = registry.listAgents();
    expect(agents).toHaveLength(2);
  });
});
