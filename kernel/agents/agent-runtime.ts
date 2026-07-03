import type { EventBus } from '../events/event-bus.js';
import type { Task } from '../tasks/task-entity.js';
import type { TaskResult } from '../tasks/task-entity.js';
import type { TaskLifecycleManager } from '../tasks/task-lifecycle.js';

import type { AgentManifest } from './agent-manifest.js';
import type { AgentRegistry } from './agent-registry.js';

// ── Agent Interface ────────────────────────────────────────────────────

export interface Agent {
  readonly manifest: AgentManifest;

  onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void>;
  executeTask(task: Task): Promise<TaskResult>;
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
}

// ── Agent Runtime ─────────────────────────────────────────────────────

export interface AgentRuntimeConfig {
  eventBus: EventBus;
  taskLifecycle: TaskLifecycleManager;
  registry: AgentRegistry;
}

export class AgentRuntime {
  private agents: Map<string, Agent> = new Map();
  private readonly config: AgentRuntimeConfig;

  constructor(config: AgentRuntimeConfig) {
    this.config = config;
  }

  registerAgent(agent: Agent): void {
    this.agents.set(agent.manifest.agent_id, agent);
    this.config.registry.register({
      manifest: agent.manifest,
      endpoint: `agent://${agent.manifest.agent_id}`,
      health_check: { type: 'heartbeat', interval_ms: 30000 },
    });

    // Subscribe agent to its event types
    for (const eventType of agent.manifest.event_subscriptions) {
      this.config.eventBus.subscribe(agent.manifest.agent_id, eventType, async (event) => {
        await agent.onEvent({
          type: event.type,
          payload: event.payload,
        });
      });
    }
  }

  getAgent(agentId: string): Agent | null {
    return this.agents.get(agentId) ?? null;
  }

  async executeTask(task: Task): Promise<TaskResult> {
    await this.config.taskLifecycle.transition(task, { type: 'ASSIGN' });
    await this.config.taskLifecycle.transition(task, { type: 'START' });

    const agent = this.config.registry.findAvailable(task.type);
    if (!agent) {
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FATAL',
        artifacts: [],
        criteria_results: [],
        summary: 'No available agent found for task type: ' + task.type,
        error: {
          code: 'INTERNAL_ERROR',
          message: `No agent registered that accepts task type: ${task.type}`,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const agentInstance = this.agents.get(agent.manifest.agent_id);
    if (!agentInstance) {
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FATAL',
        artifacts: [],
        criteria_results: [],
        summary: 'Agent instance not found: ' + agent.manifest.agent_id,
        error: {
          code: 'INTERNAL_ERROR',
          message: `Agent ${agent.manifest.agent_id} is registered but not loaded in runtime`,
          timestamp: new Date().toISOString(),
        },
      };
    }

    const assignedTask: Task = { ...task, assigned_agent: agent.manifest.agent_id };
    return agentInstance.executeTask(assignedTask);
  }

  async heartbeat(agentId: string): Promise<void> {
    this.config.registry.heartbeat(agentId);
  }

  async initialize(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.initialize();
    }
  }

  async shutdown(): Promise<void> {
    for (const agent of this.agents.values()) {
      await agent.shutdown();
    }
    this.agents.clear();
  }
}
