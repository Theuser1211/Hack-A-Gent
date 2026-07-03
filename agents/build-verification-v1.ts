import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import type { RepositoryMaterializer } from '../kernel/execution/repository-materializer.js';
import type { WorkspaceProvisioner } from '../kernel/execution/workspace-provisioner.js';
import type { BuildExecutor } from '../kernel/execution/build-executor.js';
import type { DevServerExecutor } from '../kernel/execution/dev-server-executor.js';
import type { BuildReport, BuildSummary, BuildFailure } from '../kernel/execution/execution-types.js';
import { BuildReportSchema } from '../kernel/execution/execution-types.js';
import type { GeneratedRepository } from '../kernel/builders/builder-types.js';

export interface BuildVerificationConfig {
  materializer: RepositoryMaterializer;
  provisioner: WorkspaceProvisioner;
  buildExecutor: BuildExecutor;
  devServerExecutor: DevServerExecutor;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

export class BuildVerificationAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly materializer: RepositoryMaterializer;
  private readonly provisioner: WorkspaceProvisioner;
  private readonly buildExecutor: BuildExecutor;
  private readonly devServerExecutor: DevServerExecutor;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: BuildVerificationConfig) {
    this.materializer = config.materializer;
    this.provisioner = config.provisioner;
    this.buildExecutor = config.buildExecutor;
    this.devServerExecutor = config.devServerExecutor;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.build.verification.v1',
      agent_name: 'Build Verification V1',
      agent_type: 'execution',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'build_verification',
          description: 'Materializes generated code to disk, installs dependencies, executes build/lint/test commands, starts the dev server, and produces a structured BuildReport',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['Node.js', 'npm', 'CLI', 'Build Systems'],
      event_subscriptions: ['BUILD_COMPLETED', 'REPOSITORY_CREATED'],
      accepted_tasks: ['implementation'],
      produced_outputs: [
        {
          output_id: 'build_report',
          description: 'Build verification report with materialization, dependency, build, lint, test, and dev server results',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.build.verification.v1/output/{task_id}-build-report.json',
        },
      ],
      accessible_tools: [
        { tool_name: 'tool.filesystem', access_level: 'write' },
      ],
      accessible_memories: [
        { file: 'AGENT_LOG.md', access: 'append' },
        { file: 'BUGS.md', access: 'append' },
        { file: 'DECISIONS.md', access: 'append' },
      ],
      escalation_rules: [
        {
          condition: 'invalid_input',
          action: 'request_human_checkpoint',
          message: 'Build verification needs a GeneratedRepository in task input',
        },
        {
          condition: 'tool_failure',
          action: 'emit_error_event',
          message: 'Build/install command failed — check environment and retry',
        },
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Build verification exceeded retries',
        },
      ],
      timeout_ms: 600000,
      max_retries: 2,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'BUILD_COMPLETED' || event.type === 'REPOSITORY_CREATED') {
      await this.log('partial', `Received ${event.type}: ${JSON.stringify(event.payload)}`);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();
    const startedAtISO = new Date(startedAt).toISOString();

    const repository = task.input?.repository as GeneratedRepository | undefined;
    const projectName = task.input?.project_name as string ?? repository?.project_name ?? 'unknown';

    if (!repository) {
      await this.log('failure', 'Missing GeneratedRepository in task input');
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: 'Build verification requires a GeneratedRepository in task input',
        error: { code: 'VALIDATION_FAILURE', message: 'Missing GeneratedRepository', timestamp: new Date().toISOString() },
      };
    }

    await this.log('partial', `Starting build verification for: ${projectName}`);
    await this.emitEvent('BUILD_VERIFICATION_STARTED', {
      task_id: task.task_id,
      project_name: projectName,
      total_files: repository.total_files,
      modules: repository.modules.map((m) => m.name),
    });

    try {
      await this.writeDecision({
        id: `dec-build-verify-${task.task_id.slice(0, 8)}`,
        decision: `Running build verification for "${projectName}"`,
        context: `Project: ${projectName}. Files: ${repository.total_files}. Modules: ${repository.modules.length}.`,
        alternatives: [],
        rationale: 'Build verification materializes generated code, installs dependencies, builds, lints, tests, and starts the dev server to ensure the project is runnable.',
        consequences: 'Build failures are filed as bugs. The BuildReport is used by the judge panel and repair coordinator.',
      });

      const workspace = await this.provisioner.createWorkspace(`build-${projectName}`);
      const projectPath = workspace.project_path;

      const materialized = await this.materializer.materialize(repository, projectPath);
      await this.log('success', `Materialized ${materialized.files_written.length} files to ${projectPath}`);
      await this.emitEvent('REPOSITORY_MATERIALIZED', {
        task_id: task.task_id,
        project_name: projectName,
        files_written: materialized.files_written.length,
        directories_created: materialized.directories_created.length,
        root_path: projectPath,
      });

      const depResult = await this.buildExecutor.installDependencies(projectPath);
      const depFailures = depResult.success ? [] : this.buildExecutor.detectFailures(depResult);
      await this.log(depResult.success ? 'success' : 'failure',
        `Dependencies ${depResult.success ? 'installed' : 'failed'}: ${depResult.duration_ms}ms`);
      await this.emitEvent(depResult.success ? 'DEPENDENCIES_INSTALLED' : 'BUILD_FAILED', {
        task_id: task.task_id, project_name: projectName, duration_ms: depResult.duration_ms,
      });

      const buildResult = await this.buildExecutor.runBuild(projectPath);
      const buildFailures = buildResult.success ? [] : this.buildExecutor.detectFailures(buildResult);
      await this.log(buildResult.success ? 'success' : 'failure',
        `Build ${buildResult.success ? 'succeeded' : 'failed'}: ${buildResult.duration_ms}ms`);
      await this.emitEvent(buildResult.success ? 'BUILD_SUCCEEDED' : 'BUILD_FAILED', {
        task_id: task.task_id, project_name: projectName, duration_ms: buildResult.duration_ms,
      });

      const lintResult = await this.buildExecutor.runLint(projectPath);
      const lintFailures = lintResult.success ? [] : this.buildExecutor.detectFailures(lintResult);
      await this.log(lintResult.success ? 'success' : 'partial',
        `Lint ${lintResult.success ? 'passed' : 'had issues'}: ${lintResult.duration_ms}ms`);

      const testResult = await this.buildExecutor.runTests(projectPath);
      const testFailures = testResult.success ? [] : this.buildExecutor.detectFailures(testResult);
      await this.log(testResult.success ? 'success' : 'partial',
        `Tests ${testResult.success ? 'passed' : 'had failures'}: ${testResult.duration_ms}ms`);

      const app = await this.devServerExecutor.start(projectPath);
      await this.log(app.ready ? 'success' : 'failure',
        `Dev server ${app.ready ? 'started' : 'failed to start'} at ${app.url}`);
      await this.emitEvent(app.ready ? 'APPLICATION_STARTED' : 'APPLICATION_FAILED', {
        task_id: task.task_id, project_name: projectName, url: app.url, port: app.port, ready: app.ready,
      });

      if (app.ready) {
        await this.devServerExecutor.stop(app);
      }

      const allFailures: BuildFailure[] = [
        ...depFailures, ...buildFailures, ...lintFailures, ...testFailures,
      ];
      const allWarnings = [
        ...this.buildExecutor.detectWarnings(depResult),
        ...this.buildExecutor.detectWarnings(buildResult),
        ...this.buildExecutor.detectWarnings(lintResult),
        ...this.buildExecutor.detectWarnings(testResult),
      ];

      const passedCommands = [depResult, buildResult, lintResult, testResult].filter((r) => r.success).length;
      const totalCommands = 4;
      const failedCommands = totalCommands - passedCommands;

      const summary: BuildSummary = {
        total_commands: totalCommands,
        passed: passedCommands,
        failed: failedCommands,
        warnings: allWarnings.length,
        duration_ms: Date.now() - startedAt,
        success: failedCommands === 0 && app.ready,
      };

      const report: BuildReport = {
        project_name: projectName,
        repository_path: projectPath,
        materialized: {
          files_written: materialized.files_written,
          directories_created: materialized.directories_created,
          success: materialized.success,
          timestamp: materialized.timestamp,
          root_path: materialized.root_path,
          error: materialized.error,
        },
        dependency_installation: depResult,
        build_command: buildResult,
        lint_command: lintResult,
        test_command: testResult,
        failures: allFailures,
        warnings: allWarnings,
        artifacts: [],
        summary,
        generated_at: new Date().toISOString(),
      };

      BuildReportSchema.parse(report);

      await this.fileBuildBugs(allFailures, task.task_id, projectName);

      const reportSummary = this.buildSummaryText(projectName, report);

      await this.log(summary.success ? 'success' : 'failure',
        `Build verification ${summary.success ? 'passed' : 'failed'}. ${passedCommands}/${totalCommands} commands passed. ${app.ready ? 'App started.' : 'App did not start.'} ${allFailures.length} failure(s), ${allWarnings.length} warning(s).`,
      );

      await this.emitEvent('BUILD_VERIFICATION_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        success: summary.success,
        passed_commands: passedCommands,
        total_commands: totalCommands,
        failures: allFailures.length,
        warnings: allWarnings.length,
        app_started: app.ready,
        duration_ms: summary.duration_ms,
        summary: reportSummary,
      });

      await this.provisioner.cleanup(workspace.root_path);

      return {
        task_id: task.task_id,
        status: summary.success ? 'COMPLETED' : (failedCommands < totalCommands ? 'COMPLETED' : 'FAILED'),
        exit_code: summary.success ? 'AGENT_OK' : (failedCommands < totalCommands ? 'AGENT_OK' : 'AGENT_FAIL'),
        artifacts: [],
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: summary.success,
          evidence: summary.success
            ? `Build verification passed: ${c.description}`
            : `Build verification had ${allFailures.length} failures: ${c.description}`,
        })),
        summary: reportSummary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Build verification failed: ${errorMessage}`);
      await this.emitEvent('BUILD_VERIFICATION_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        success: false,
        error: errorMessage,
      });
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Build verification failed: ${errorMessage}`,
        error: { code: 'INTERNAL_ERROR', message: errorMessage, timestamp: new Date().toISOString() },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Build Verification V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Build Verification V1 shutting down');
  }

  private buildSummaryText(projectName: string, report: BuildReport): string {
    const lines: string[] = [
      `# Build Verification Report for "${projectName}"`,
      '',
      `**Result:** ${report.summary.success ? 'PASSED' : 'FAILED'}`,
      `**Duration:** ${report.summary.duration_ms}ms`,
      `**Commands:** ${report.summary.passed}/${report.summary.total_commands} passed (${report.summary.failed} failed)`,
      `**Warnings:** ${report.summary.warnings}`,
      `**Failures:** ${report.failures.length}`,
      '',
      '## Steps',
      `- Materialize: ${report.materialized.files_written} files written ✓`,
      `- Install: ${report.dependency_installation?.success ? '✓' : '✗'} (${report.dependency_installation?.duration_ms ?? 0}ms)`,
      `- Build: ${report.build_command?.success ? '✓' : '✗'} (${report.build_command?.duration_ms ?? 0}ms)`,
      `- Lint: ${report.lint_command?.success ? '✓' : '✗'} (${report.lint_command?.duration_ms ?? 0}ms)`,
      `- Test: ${report.test_command?.success ? '✓' : '✗'} (${report.test_command?.duration_ms ?? 0}ms)`,
      '',
      report.failures.length > 0 ? '## Failures' : '',
      ...report.failures.map((f) => `- [${f.type}] ${f.message}${f.file ? ` (${f.file})` : ''}`),
      '',
      '## Next Steps',
      report.summary.success
        ? 'All checks passed. Proceed to testing and judging.'
        : 'Review failures above. The repair coordinator will generate fix tasks for high-severity issues.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  private async fileBuildBugs(failures: BuildFailure[], taskId: string, projectName: string): Promise<void> {
    if (!this.memoryWriter) return;
    for (const failure of failures) {
      try {
        await this.memoryWriter.appendBug({
          id: `BUG-BUILD-${taskId.slice(0, 4)}-${failures.indexOf(failure)}`,
          timestamp: new Date().toISOString(),
          severity: failure.type === 'compilation' || failure.type === 'dependency' ? 'critical' : 'high',
          found_by: this.manifest.agent_id,
          phase: 'BUILDING',
          task_id: taskId,
          type: 'functional',
          description: `Build failure [${failure.type}]: ${failure.message}${failure.file ? ` in ${failure.file}` : ''}`,
          files: failure.file ? [failure.file] : [],
          steps_to_reproduce: `1. Run \`${failure.command ?? 'build'}\`\n2. Observe error: ${failure.message}`,
          status: 'open',
          assigned_to: null,
          fix_commit: null,
          retest_status: 'pending',
        });
      } catch {
        // swallow
      }
    }
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      await this.memoryWriter.appendLog({
        timestamp: new Date().toISOString(),
        phase: 'BUILDING',
        agent_id: this.manifest.agent_id,
        action: 'build_verification',
        task_id: null,
        correlation_id: '',
        body,
        result,
        artifacts: [],
      });
    } catch {
      // swallow
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
        phase: 'BUILDING',
        context: opts.context,
        alternatives: opts.alternatives,
        rationale: opts.rationale,
        consequences: opts.consequences,
        status: 'active',
        superseded_by: null,
      });
    } catch {
      // swallow
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
