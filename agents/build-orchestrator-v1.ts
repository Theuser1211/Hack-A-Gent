import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';
import type { BuilderProvider } from '../kernel/builders/builder-provider.js';
import type {
  GeneratedModule,
  BuildResult,
  GeneratedRepository,
} from '../kernel/builders/builder-types.js';
import { GeneratedRepositorySchema } from '../kernel/builders/builder-types.js';
import { RepositoryValidator } from '../kernel/builders/repository-validator.js';
import type { ValidationReport } from '../kernel/builders/repository-validator.js';

export interface BuildOrchestratorConfig {
  provider: BuilderProvider;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

interface ModuleBuildResult {
  module: GeneratedModule | null;
  error: string | null;
  durationMs: number;
}

export class BuildOrchestratorAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly provider: BuilderProvider;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;
  private readonly validator: RepositoryValidator;

  constructor(config: BuildOrchestratorConfig) {
    this.provider = config.provider;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;
    this.validator = new RepositoryValidator();

    this.manifest = {
      agent_id: config.agentId ?? 'agent.builder.orchestrator.v1',
      agent_name: 'Build Orchestrator V1',
      agent_type: 'execution',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'build_orchestration',
          description: 'Orchestrates full project build from architecture blueprint, aggregating frontend, backend, database, config, docs, and test modules',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['React', 'Node.js', 'TypeScript', 'SQL', 'PostgreSQL', 'REST', 'CSS', 'ORM'],
      event_subscriptions: ['ARCHITECTURE_COMPLETE'],
      accepted_tasks: ['implementation'],
      produced_outputs: [
        {
          output_id: 'generated_repository',
          description: 'Complete generated repository with all modules validated and aggregated',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.builder.orchestrator.v1/output/{task_id}-repository.json',
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
          message: 'Build orchestrator needs a complete architecture blueprint',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Some modules failed to build, review warnings before proceeding',
        },
      ],
      timeout_ms: 600000,
      max_retries: 2,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'ARCHITECTURE_COMPLETE') {
      await this.log('partial', `Received ARCHITECTURE_COMPLETE: ${JSON.stringify(event.payload)}`);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();
    const startedAtISO = new Date(startedAt).toISOString();

    const blueprint = this.parseInput(task);
    const projectName = blueprint?.project_name ?? 'unknown';

    await this.log('partial', `Starting full build orchestration for: ${projectName}`);
    await this.emitEvent('BUILD_ORCHESTRATION_STARTED', {
      task_id: task.task_id,
      project_name: projectName,
    });

    try {
      if (!blueprint) {
        throw new Error('Invalid or missing architecture blueprint');
      }

      await this.writeDecision({
        id: `dec-orch-${task.task_id.slice(0, 8)}`,
        decision: `Orchestrating full build for ${projectName}`,
        context: `Frontend: ${blueprint.recommended_stack.frontend.map((t) => t.name).join(', ')}. Backend: ${blueprint.recommended_stack.backend.map((t) => t.name).join(', ')}. Database: ${blueprint.database_schema.engine}. Endpoints: ${blueprint.api_contracts.endpoints.length}.`,
        alternatives: [],
        rationale: 'Build orchestrator generates all project modules from the architecture blueprint and aggregates them into a validated repository.',
        consequences: 'All generated files are validated for duplicates, path traversal, and empty content. Partial failures produce warnings.',
      });

      const buildResults: BuildResult[] = [];
      const allModules: GeneratedModule[] = [];

      const moduleDefs: Array<{ key: string; label: string; generator: (b: ArchitectureBlueprint) => Promise<GeneratedModule> }> = [
        { key: 'frontend', label: 'Frontend', generator: (b) => this.provider.generateFrontend(b) },
        { key: 'backend', label: 'Backend', generator: (b) => this.provider.generateBackend(b) },
        { key: 'database', label: 'Database', generator: (b) => this.provider.generateDatabase(b) },
        { key: 'config', label: 'Configuration', generator: (b) => this.provider.generateConfig(b) },
        { key: 'docs', label: 'Documentation', generator: (b) => this.provider.generateDocumentation(b) },
        { key: 'tests', label: 'Tests', generator: (b) => this.provider.generateTests(b) },
      ];

      for (const def of moduleDefs) {
        const moduleResult = await this.buildModule(task.task_id, blueprint, def.key, def.label, def.generator);
        buildResults.push(moduleResult.buildResult);
        if (moduleResult.buildResult.success && moduleResult.buildResult.modules.length > 0) {
          allModules.push(...moduleResult.buildResult.modules);
        }
      }

      const totalFiles = allModules.reduce((s, m) => s + m.files.length, 0);
      const totalLines = allModules.reduce((s, m) => s + m.files.reduce((fs, f) => fs + f.content.split('\n').length, 0), 0);

      const repository: GeneratedRepository = {
        project_name: projectName,
        blueprint_version: '1.0.0',
        modules: allModules,
        total_files: totalFiles,
        total_lines: totalLines,
        generated_at: new Date().toISOString(),
        build_results: buildResults,
      };

      GeneratedRepositorySchema.parse(repository);

      const validation: ValidationReport = this.validator.validate(repository);

      const elapsed = Date.now() - startedAt;
      const completedAt = new Date().toISOString();
      const failedCount = buildResults.filter((r) => !r.success).length;
      const allSucceeded = failedCount === 0;

      const summary = this.buildFullSummary(projectName, blueprint, allModules, buildResults, validation);

      await this.log(allSucceeded ? 'success' : 'partial',
        `Build orchestration ${allSucceeded ? 'complete' : 'completed with issues'} in ${elapsed}ms. ${totalFiles} files across ${allModules.length} modules. ${failedCount} failed. Validation: ${validation.valid ? 'PASSED' : `${validation.issues.length} issues`}.`,
      );

      if (!validation.valid) {
        for (const issue of validation.issues) {
          await this.log('partial', `Validation ${issue.type}: ${issue.message}`);
        }
      }

      await this.writeDecision({
        id: `dec-orch-fin-${task.task_id.slice(0, 8)}`,
        decision: `Build orchestration ${allSucceeded ? 'completed' : 'completed with issues'}`,
        context: `Modules: ${allModules.length}. Files: ${totalFiles}. Lines: ${totalLines}. Validation: ${validation.valid ? 'PASSED' : `${validation.issues.length} issues`}. Build results: ${buildResults.filter((r) => r.success).length}/${buildResults.length} succeeded.`,
        alternatives: [],
        rationale: 'All modules generated via BuilderProvider and validated with RepositoryValidator.',
        consequences: validation.valid
          ? 'Repository is ready for deployment. All files validated and no conflicts detected.'
          : `Repository has ${validation.issues.length} validation issues that should be reviewed.`,
      });

      const eventType = allModules.length === 0 ? 'BUILD_ORCHESTRATION_FAILED' : 'BUILD_ORCHESTRATION_COMPLETED';
      await this.emitEvent(eventType, {
        task_id: task.task_id,
        project_name: projectName,
        module_count: allModules.length,
        file_count: totalFiles,
        succeeded: buildResults.filter((r) => r.success).length,
        failed: failedCount,
        validation_valid: validation.valid,
        validation_issues: validation.issues.length,
        summary,
      });

      const allCriteriaPassed = allSucceeded && validation.valid;

      return {
        task_id: task.task_id,
        status: allSucceeded ? 'COMPLETED' : (allModules.length > 0 ? 'COMPLETED' : 'FAILED'),
        exit_code: allSucceeded ? 'AGENT_OK' : (allModules.length > 0 ? 'AGENT_OK' : 'AGENT_FAIL'),
        artifacts: [],
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: allCriteriaPassed,
          evidence: allCriteriaPassed
            ? `Build orchestration completed: ${c.description}`
            : `Build orchestration had issues: ${c.description} (${buildResults.filter((r) => !r.success).length} module failures, ${validation.issues.length} validation issues)`,
        })),
        summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Build orchestration failed: ${errorMessage}`);
      await this.emitEvent('BUILD_ORCHESTRATION_FAILED', {
        task_id: task.task_id,
        project_name: projectName,
        error: errorMessage,
      });

      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Build orchestration failed: ${errorMessage}`,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  private async buildModule(
    taskId: string,
    blueprint: ArchitectureBlueprint,
    key: string,
    label: string,
    generator: (b: ArchitectureBlueprint) => Promise<GeneratedModule>,
  ): Promise<{ buildResult: BuildResult }> {
    const startedAt = Date.now();
    const startedAtISO = new Date(startedAt).toISOString();

    await this.log('partial', `Building ${label} module...`);
    await this.emitEvent('BUILD_ORCHESTRATION_PROGRESS', {
      task_id: taskId,
      module: key,
      label,
      status: 'building',
    });

    try {
      const module = await generator(blueprint);
      const elapsed = Date.now() - startedAt;
      const completedAt = new Date().toISOString();

      for (const file of module.files) {
        await this.emitEvent('FILE_GENERATED', {
          task_id: taskId,
          module_name: module.name,
          file_path: file.path,
          language: file.language ?? 'unknown',
        });
      }

      await this.log('success', `${label} module built: ${module.files.length} files in ${elapsed}ms`);
      await this.emitEvent('BUILD_ORCHESTRATION_PROGRESS', {
        task_id: taskId,
        module: key,
        label,
        status: 'completed',
        file_count: module.files.length,
      });

      return {
        buildResult: {
          success: true,
          modules: [module],
          issues: [],
          summary: `${label} build succeeded: ${module.files.length} files`,
          started_at: startedAtISO,
          completed_at: completedAt,
        },
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const completedAt = new Date().toISOString();

      await this.log('failure', `${label} module failed: ${errorMessage}`);
      await this.emitEvent('BUILD_ORCHESTRATION_PROGRESS', {
        task_id: taskId,
        module: key,
        label,
        status: 'failed',
        error: errorMessage,
      });

      return {
        buildResult: {
          success: false,
          modules: [],
          issues: [{ type: 'error', message: errorMessage, code: key }],
          summary: `${label} build failed: ${errorMessage}`,
          started_at: startedAtISO,
          completed_at: completedAt,
        },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Build Orchestrator V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Build Orchestrator V1 shutting down');
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

  private buildFullSummary(
    projectName: string,
    blueprint: ArchitectureBlueprint,
    modules: GeneratedModule[],
    buildResults: BuildResult[],
    validation: ValidationReport,
  ): string {
    const totalFiles = modules.reduce((s, m) => s + m.files.length, 0);
    const totalLines = modules.reduce((s, m) => s + m.files.reduce((fs, f) => fs + f.content.split('\n').length, 0), 0);
    const succeeded = buildResults.filter((r) => r.success).length;
    const failed = buildResults.filter((r) => !r.success).length;

    return [
      `# Build Orchestration for "${projectName}"`,
      '',
      `**Modules generated:** ${modules.length} (${succeeded}/${buildResults.length} succeeded${failed > 0 ? `, ${failed} failed` : ''})`,
      `**Files generated:** ${totalFiles} (${totalLines} lines)`,
      `**Validation:** ${validation.valid ? 'PASSED' : `${validation.issues.filter((i) => i.type === 'error').length} errors, ${validation.issues.filter((i) => i.type === 'warning').length} warnings`}`,
      '',
      '**Modules:**',
      ...modules.map((m) => `- ${m.name} (${m.files.length} files): ${m.description ?? 'N/A'}`),
      '',
      '**Build Results:**',
      ...buildResults.map((r) => `- ${r.success ? 'OK' : 'FAIL'}: ${r.summary.split('\n')[0]}`),
      '',
      validation.issues.length > 0 ? '**Validation Issues:**' : '',
      ...validation.issues.map((i) => `- [${i.type}] ${i.message}${i.file ? ` (${i.file})` : ''}${i.module ? ` [${i.module}]` : ''}`),
      '',
      '**Next steps:** Review generated repository, resolve any validation issues, and deploy.',
    ].filter(Boolean).join('\n');
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      await this.memoryWriter.appendLog({
        timestamp: new Date().toISOString(),
        phase: 'BUILD_ORCHESTRATION',
        agent_id: this.manifest.agent_id,
        action: 'build_orchestration',
        task_id: null,
        correlation_id: '',
        body,
        result,
        artifacts: [],
      });
    } catch {
      // swallow memory writer errors — non-critical
    }
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
    try {
      await this.memoryWriter.appendDecision({
        id: opts.id,
        timestamp: new Date().toISOString(),
        decision: opts.decision,
        agent_id: this.manifest.agent_id,
        task_id: null,
        phase: 'BUILD_ORCHESTRATION',
        context: opts.context,
        alternatives: opts.alternatives,
        rationale: opts.rationale,
        consequences: opts.consequences,
        status: 'active',
        superseded_by: null,
      });
    } catch {
      // swallow memory writer errors — non-critical
    }
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
