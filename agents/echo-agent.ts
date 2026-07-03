import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';

export class EchoAgent implements Agent {
  public readonly manifest: AgentManifest;

  constructor() {
    this.manifest = {
      agent_id: 'agent.echo',
      agent_name: 'Echo Agent',
      agent_type: 'utility',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'echo',
          description: 'Echo back task input as output for testing',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: [],
      event_subscriptions: ['TASK_CREATED'],
      accepted_tasks: ['analysis', 'planning', 'architecture', 'implementation', 'testing', 'documentation'],
      produced_outputs: [
        {
          output_id: 'echo_result',
          description: 'Echoed task result for testing',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.echo/output/{task_id}.json',
        },
      ],
      accessible_tools: [{ tool_name: 'tool.filesystem', access_level: 'read' }],
      accessible_memories: [{ file: 'AGENT_LOG.md', access: 'read' }],
      escalation_rules: [
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Echo agent retry limit reached',
        },
      ],
      timeout_ms: 5000,
      max_retries: 3,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    // Echo agent simply logs events
    console.log(`[EchoAgent] Received event: ${event.type}`);
  }

  async executeTask(task: Task): Promise<TaskResult> {
    return {
      task_id: task.task_id,
      status: 'COMPLETED',
      exit_code: 'AGENT_OK',
      artifacts: [],
      criteria_results: task.acceptance_criteria.map((c) => ({
        criterion_id: c.criterion_id,
        passed: true,
        evidence: `Echo agent processed: ${task.description}`,
      })),
      summary: `Echo agent completed task: ${task.description}`,
      error: null,
    };
  }

  async initialize(): Promise<void> {
    // No-op for mock agent
  }

  async shutdown(): Promise<void> {
    // No-op for mock agent
  }
}
