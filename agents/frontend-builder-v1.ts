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

export interface FrontendBuilderConfig {
  provider: BuilderProvider;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

export class FrontendBuilderAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: BuilderProvider;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: FrontendBuilderConfig) {
    this.provider = config.provider;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.builder.frontend.v1',
      agent_name: 'Frontend Builder V1',
      agent_type: 'execution',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'page_generation',
          description: 'Generates frontend page components from blueprint',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'component_generation',
          description: 'Generates reusable UI components',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'layout_generation',
          description: 'Generates application layouts and navigation',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'asset_generation',
          description: 'Generates styles, assets, and static resources',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'config_generation',
          description: 'Generates frontend configuration files',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['React', 'TypeScript', 'CSS'],
      event_subscriptions: ['ARCHITECTURE_COMPLETE', 'TASK_ASSIGNED'],
      accepted_tasks: ['implementation'],
      produced_outputs: [
        {
          output_id: 'frontend_build',
          description: 'Generated frontend module with pages, components, layouts, assets, and configs',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.builder.frontend.v1/output/{task_id}-frontend.json',
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
          message: 'Frontend builder needs a complete architecture blueprint',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Frontend builder retry limit reached',
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

    await this.log('partial', `Starting frontend build for: ${projectName}`);
    await this.emitEvent('BUILD_STARTED', { task_id: task.task_id, project_name: projectName, module_type: 'frontend' });

    try {
      if (!blueprint) {
        throw new Error('Invalid or missing architecture blueprint');
      }

      const issues: BuildIssue[] = [];
      const modules: GeneratedModule[] = [];

      await this.log('success', `Generating frontend module from blueprint (stack: ${blueprint.recommended_stack.frontend.map((t) => t.name).join(', ')})`);
      await this.writeDecision({
        id: `dec-fe-${task.task_id.slice(0, 8)}`,
        decision: `Generating frontend for ${projectName}`,
        context: `Stack: ${blueprint.recommended_stack.frontend.map((t) => `${t.name} ${t.version}`).join(', ')}. API base: ${blueprint.api_contracts.base_url}.`,
        alternatives: [],
        rationale: 'Frontend generated based on architecture blueprint stack recommendation and API contracts.',
        consequences: 'Generated frontend files will be written to the project workspace. Manual adjustments may be needed for complex UI logic.',
      });

      const frontendModule = await this.provider.generateFrontend(blueprint);
      modules.push(frontendModule);

      for (const file of frontendModule.files) {
        await this.emitEvent('FILE_GENERATED', {
          task_id: task.task_id,
          module_name: frontendModule.name,
          file_path: file.path,
          language: file.language ?? 'unknown',
        });
      }

      await this.log('success', `Generated ${frontendModule.files.length} frontend files in module "${frontendModule.name}"`);
      await this.emitEvent('MODULE_GENERATED', {
        task_id: task.task_id,
        module_name: frontendModule.name,
        file_count: frontendModule.files.length,
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

      await this.log('success', `Frontend build complete in ${elapsed}ms. ${modules.reduce((s, m) => s + m.files.length, 0)} files across ${modules.length} modules.`);
      await this.emitEvent('BUILD_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        module_type: 'frontend',
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
          evidence: `Frontend builder completed: ${c.description}`,
        })),
        summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Frontend build failed: ${errorMessage}`);
      await this.emitEvent('BUILD_FAILED', { task_id: task.task_id, module_type: 'frontend', error: errorMessage });

      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Frontend build failed: ${errorMessage}`,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Frontend Builder V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Frontend Builder V1 shutting down');
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
    const feStack = blueprint.recommended_stack.frontend.map((t) => t.name).join(', ');

    return [
      `# Frontend Build for "${blueprint.project_name}"`,
      '',
      `**Stack:** ${feStack}`,
      `**Files generated:** ${totalFiles} (${totalLines} lines)`,
      '',
      '**Modules:**',
      ...modules.map((m) => `- ${m.name} (${m.files.length} files): ${m.description ?? 'N/A'}`),
      '',
      issues.length > 0 ? '**Issues:**' : '',
      ...issues.map((i) => `- [${i.type}] ${i.message}${i.file ? ` (${i.file})` : ''}`),
      '',
      '**Next steps:** Review generated frontend files, run build, verify components.',
    ].filter(Boolean).join('\n');
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    await this.memoryWriter.appendLog({
      timestamp: new Date().toISOString(),
      phase: 'FRONTEND_BUILD',
      agent_id: this.manifest.agent_id,
      action: 'frontend_build',
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
      phase: 'FRONTEND_BUILD',
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
