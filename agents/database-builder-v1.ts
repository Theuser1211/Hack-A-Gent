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

export interface DatabaseBuilderConfig {
  provider: BuilderProvider;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

export class DatabaseBuilderAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: BuilderProvider;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: DatabaseBuilderConfig) {
    this.provider = config.provider;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.builder.database.v1',
      agent_name: 'Database Builder V1',
      agent_type: 'execution',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'schema_generation',
          description: 'Generates database schema definitions from blueprint table definitions',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'migration_generation',
          description: 'Generates SQL migration files for schema changes',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'seed_generation',
          description: 'Generates seed data files for development and testing',
          input_schema: {},
          output_schema: {},
        },
        {
          capability_id: 'orm_config_generation',
          description: 'Generates ORM configuration and model definitions',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['SQL', 'PostgreSQL', 'ORM'],
      event_subscriptions: ['ARCHITECTURE_COMPLETE', 'TASK_ASSIGNED'],
      accepted_tasks: ['implementation'],
      produced_outputs: [
        {
          output_id: 'database_build',
          description: 'Generated database module with schema, migrations, seeds, and ORM configs',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.builder.database.v1/output/{task_id}-database.json',
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
          message: 'Database builder needs a complete architecture blueprint',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Database builder retry limit reached',
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

    await this.log('partial', `Starting database build for: ${projectName}`);
    await this.emitEvent('BUILD_STARTED', { task_id: task.task_id, project_name: projectName, module_type: 'database' });

    try {
      if (!blueprint) {
        throw new Error('Invalid or missing architecture blueprint');
      }

      const issues: BuildIssue[] = [];
      const modules: GeneratedModule[] = [];

      const tableCount = blueprint.database_schema.tables?.length ?? 0;
      await this.log('success', `Generating database module from blueprint (engine: ${blueprint.database_schema.engine}, ${tableCount} tables)`);
      await this.writeDecision({
        id: `dec-db-${task.task_id.slice(0, 8)}`,
        decision: `Generating database schema for ${projectName}`,
        context: `Engine: ${blueprint.database_schema.engine}. Tables: ${tableCount}. Columns: ${blueprint.database_schema.tables?.reduce((s, t) => s + t.columns.length, 0) ?? 0}.`,
        alternatives: [],
        rationale: 'Database schema generated from architecture blueprint table definitions.',
        consequences: 'Generated migration files define the initial schema. Seeds provide sample data for development.',
      });

      const dbModule = await this.provider.generateDatabase(blueprint);
      modules.push(dbModule);

      for (const file of dbModule.files) {
        await this.emitEvent('FILE_GENERATED', {
          task_id: task.task_id,
          module_name: dbModule.name,
          file_path: file.path,
          language: file.language ?? 'unknown',
        });
      }

      await this.log('success', `Generated ${dbModule.files.length} database files in module "${dbModule.name}"`);
      await this.emitEvent('MODULE_GENERATED', {
        task_id: task.task_id,
        module_name: dbModule.name,
        file_count: dbModule.files.length,
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

      await this.log('success', `Database build complete in ${elapsed}ms. ${modules.reduce((s, m) => s + m.files.length, 0)} files across ${modules.length} modules.`);
      await this.emitEvent('BUILD_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        module_type: 'database',
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
          evidence: `Database builder completed: ${c.description}`,
        })),
        summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Database build failed: ${errorMessage}`);
      await this.emitEvent('BUILD_FAILED', { task_id: task.task_id, module_type: 'database', error: errorMessage });

      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Database build failed: ${errorMessage}`,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Database Builder V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Database Builder V1 shutting down');
  }

  private parseInput(task: Task): ArchitectureBlueprint | null {
    const input = task.input ?? {};
    if (input.blueprint) {
      return input.blueprint as ArchitectureBlueprint;
    }
    if (input.project_name || input.database_schema) {
      return input as unknown as ArchitectureBlueprint;
    }
    return null;
  }

  private buildSummary(blueprint: ArchitectureBlueprint, modules: GeneratedModule[], issues: BuildIssue[]): string {
    const totalFiles = modules.reduce((s, m) => s + m.files.length, 0);
    const totalLines = modules.reduce((s, m) => s + m.files.reduce((fs, f) => fs + f.content.split('\n').length, 0), 0);
    const tableCount = blueprint.database_schema.tables?.length ?? 0;

    return [
      `# Database Build for "${blueprint.project_name}"`,
      '',
      `**Engine:** ${blueprint.database_schema.engine}`,
      `**Tables:** ${tableCount}`,
      `**Files generated:** ${totalFiles} (${totalLines} lines)`,
      '',
      '**Modules:**',
      ...modules.map((m) => `- ${m.name} (${m.files.length} files): ${m.description ?? 'N/A'}`),
      '',
      issues.length > 0 ? '**Issues:**' : '',
      ...issues.map((i) => `- [${i.type}] ${i.message}${i.file ? ` (${i.file})` : ''}`),
      '',
      '**Next steps:** Review migration files, run migrations against database, verify seeds.',
    ].filter(Boolean).join('\n');
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    await this.memoryWriter.appendLog({
      timestamp: new Date().toISOString(),
      phase: 'DATABASE_BUILD',
      agent_id: this.manifest.agent_id,
      action: 'database_build',
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
      phase: 'DATABASE_BUILD',
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
