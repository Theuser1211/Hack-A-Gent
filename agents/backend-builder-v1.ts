import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';
import type { BuilderProvider } from '../kernel/builders/builder-provider.js';
import type {
  GeneratedFile,
  GeneratedModule,
  BuildResult,
  BuildIssue,
} from '../kernel/builders/builder-types.js';
import { BuildResultSchema } from '../kernel/builders/builder-types.js';

export interface BackendBuilderConfig {
  provider: BuilderProvider;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

export class BackendBuilderAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: BuilderProvider;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: BackendBuilderConfig) {
    this.provider = config.provider;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.builder.backend.v1',
      agent_name: 'Backend Builder V1',
      agent_type: 'execution',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'api_generation',
          description: 'Generates API endpoints and route handlers from blueprint contracts',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'service_generation',
          description: 'Generates business logic services and data access layers',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'controller_generation',
          description: 'Generates request controllers with validation and error handling',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'middleware_generation',
          description: 'Generates authentication, logging, and error middleware',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'backend_config_generation',
          description: 'Generates backend configuration files (package.json, tsconfig, etc.)',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['Node.js', 'TypeScript', 'REST'],
      event_subscriptions: ['ARCHITECTURE_COMPLETE', 'TASK_ASSIGNED'],
      accepted_tasks: ['implementation'],
      produced_outputs: [
        {
          output_id: 'backend_build',
          description: 'Generated backend module with APIs, services, controllers, middleware, and configs',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.builder.backend.v1/output/{task_id}-backend.json',
        },
      ],
      accessible_tools: [
        { tool_name: 'tool.filesystem', access_level: 'read' },
      ],
      accessible_memories: [
        { file: 'AGENT_LOG.md', access: 'append' },
        { file: 'DECISIONS.md', access: 'append' },
      ],
      escalation_rules: [
        {
          condition: 'invalid_input',
          action: 'request_human_checkpoint',
          message: 'Backend builder needs a complete architecture blueprint',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Backend builder retry limit reached',
        },
      ],
      timeout_ms: 300000,
      max_retries: 3,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'ARCHITECTURE_COMPLETE') {
      await this.log('partial', `Received ARCHITECTURE_COMPLETE event: ${JSON.stringify(event.payload)}`);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();
    const startedAtISO = new Date(startedAt).toISOString();

    const blueprint = this.parseInput(task);
    const projectName = blueprint?.project_name ?? 'unknown';

    await this.log('partial', `Starting backend build for: ${projectName}`);
    await this.emitEvent('BUILD_STARTED', { task_id: task.task_id, project_name: projectName, module_type: 'backend' });

    try {
      if (!blueprint) {
        throw new Error('Invalid or missing architecture blueprint');
      }

      const issues: BuildIssue[] = [];
      const modules: GeneratedModule[] = [];

      await this.log('success', `Generating backend module from blueprint (stack: ${blueprint.recommended_stack.backend.map((t) => t.name).join(', ')})`);
      await this.writeDecision({
        id: `dec-be-${task.task_id.slice(0, 8)}`,
        decision: `Generating backend for ${projectName}`,
        context: `Stack: ${blueprint.recommended_stack.backend.map((t) => `${t.name} ${t.version}`).join(', ')}. Endpoints: ${blueprint.api_contracts.endpoints.length}. Database: ${blueprint.database_schema.engine}.`,
        alternatives: [],
        rationale: 'Backend generated based on architecture blueprint stack recommendation and API contracts.',
        consequences: 'Generated backend files will be written to the project workspace. Manual wiring of routes to controllers may be needed.',
      });

      const backendModule = await this.provider.generateBackend(blueprint);
      modules.push(backendModule);

      for (const file of backendModule.files) {
        await this.emitEvent('FILE_GENERATED', {
          task_id: task.task_id,
          module_name: backendModule.name,
          file_path: file.path,
          language: file.language ?? 'unknown',
        });
      }

      await this.log('success', `Generated ${backendModule.files.length} backend files in module "${backendModule.name}"`);
      await this.emitEvent('MODULE_GENERATED', {
        task_id: task.task_id,
        module_name: backendModule.name,
        file_count: backendModule.files.length,
      });

      const summary = this.buildSummary(blueprint, modules, issues);
      const elapsed = Date.now() - startedAt;
      const completedAt = new Date().toISOString();

      const buildResult: BuildResult = {
        success: true,
        modules,
        issues,
        summary,
        started_at: startedAtISO,
        completed_at: completedAt,
      };

      BuildResultSchema.parse(buildResult);

      await this.log('success', `Backend build complete in ${elapsed}ms. ${modules.reduce((s, m) => s + m.files.length, 0)} files across ${modules.length} modules.`);
      await this.emitEvent('BUILD_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        module_type: 'backend',
        module_count: modules.length,
        file_count: modules.reduce((s, m) => s + m.files.length, 0),
        summary,
      });

      return {
        task_id: task.task_id,
        status: 'COMPLETED',
        exit_code: 'AGENT_OK',
        artifacts: [],
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: true,
          evidence: `Backend builder completed: ${c.description}`,
        })),
        summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Backend build failed: ${errorMessage}`);
      await this.emitEvent('BUILD_FAILED', { task_id: task.task_id, module_type: 'backend', error: errorMessage });

      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Backend build failed: ${errorMessage}`,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Backend Builder V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Backend Builder V1 shutting down');
  }

  private parseInput(task: Task): ArchitectureBlueprint | null {
    const input = task.input ?? {};
    if (input.blueprint) {
      return input.blueprint as ArchitectureBlueprint;
    }
    if (input.project_name || input.recommended_stack) {
      return input as unknown as ArchitectureBlueprint;
    }
    return null;
  }

  private buildSummary(blueprint: ArchitectureBlueprint, modules: GeneratedModule[], issues: BuildIssue[]): string {
    const totalFiles = modules.reduce((s, m) => s + m.files.length, 0);
    const totalLines = modules.reduce((s, m) => s + m.files.reduce((fs, f) => fs + f.content.split('\n').length, 0), 0);
    const beStack = blueprint.recommended_stack.backend.map((t) => t.name).join(', ');

    return [
      `# Backend Build for "${blueprint.project_name}"`,
      '',
      `**Stack:** ${beStack}`,
      `**Files generated:** ${totalFiles} (${totalLines} lines)`,
      `**API Endpoints:** ${blueprint.api_contracts.endpoints.length}`,
      '',
      '**Modules:**',
      ...modules.map((m) => `- ${m.name} (${m.files.length} files): ${m.description ?? 'N/A'}`),
      '',
      issues.length > 0 ? '**Issues:**' : '',
      ...issues.map((i) => `- [${i.type}] ${i.message}${i.file ? ` (${i.file})` : ''}`),
      '',
      '**Next steps:** Review generated backend files, install dependencies, run server.',
    ].filter(Boolean).join('\n');
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    await this.memoryWriter.appendLog({
      timestamp: new Date().toISOString(),
      phase: 'BACKEND_BUILD',
      agent_id: this.manifest.agent_id,
      action: 'backend_build',
      task_id: null,
      correlation_id: '',
      body,
      result,
      artifacts: [],
    });
  }

  private async writeDecision(opts: {
    id: string;
    decision: string;
    context: string;
    alternatives: Array<{ name: string; analysis: string }>;
    rationale: string;
    consequences: string;
  }): Promise<void> {
    if (!this.memoryWriter) return;
    await this.memoryWriter.appendDecision({
      id: opts.id,
      timestamp: new Date().toISOString(),
      decision: opts.decision,
      agent_id: this.manifest.agent_id,
      task_id: null,
      phase: 'BACKEND_BUILD',
      context: opts.context,
      alternatives: opts.alternatives,
      rationale: opts.rationale,
      consequences: opts.consequences,
      status: 'active',
      superseded_by: null,
    });
  }

  private async emitEvent(type: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.eventBus) return;
    await this.eventBus.publish(
      createEvent({
        type,
        source: this.manifest.agent_id,
        target: '*',
        payload,
      }),
    );
  }
}
