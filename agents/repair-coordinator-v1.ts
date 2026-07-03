import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import { createTask } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import type { OverallJudgeReport } from '../kernel/judge/judge-types.js';
import type { BuildReport } from '../kernel/execution/execution-types.js';
import type { RepairTaskGenerator } from '../kernel/repair/repair-task-generator.js';
import type { FixTask, RepairConfig, RepairIteration } from '../kernel/repair/repair-types.js';
import { RepairConfigSchema } from '../kernel/repair/repair-types.js';

export interface RepairCoordinatorConfig {
  taskGenerator: RepairTaskGenerator;
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
  config?: Partial<RepairConfig>;
}

export class RepairCoordinatorAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly taskGenerator: RepairTaskGenerator;
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;
  private readonly repairConfig: RepairConfig;
  private iterations: RepairIteration[] = [];

  constructor(config: RepairCoordinatorConfig) {
    this.taskGenerator = config.taskGenerator;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;
    this.repairConfig = RepairConfigSchema.parse(config.config ?? {});

    this.manifest = {
      agent_id: config.agentId ?? 'agent.repair.coordinator.v1',
      agent_name: 'Repair Coordinator V1',
      agent_type: 'infrastructure',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'repair_coordination',
          description: 'Consumes judge reports, generates fix tasks, creates builder tasks, and tracks repair iterations through the fix-test-judge cycle',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['Code Review', 'Bug Fixing', 'Quality Assurance'],
      event_subscriptions: ['JUDGING_COMPLETED'],
      accepted_tasks: ['fix'],
      produced_outputs: [
        {
          output_id: 'fix_tasks',
          description: 'Generated fix tasks from judge evaluation',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.repair.coordinator.v1/output/{task_id}-fix-tasks.json',
        },
      ],
      accessible_tools: [
        { tool_name: 'tool.filesystem', access_level: 'read' },
      ],
      accessible_memories: [
        { file: 'AGENT_LOG.md', access: 'append' },
        { file: 'BUGS.md', access: 'append' },
        { file: 'DECISIONS.md', access: 'append' },
      ],
      escalation_rules: [
        {
          condition: 'max_retries_exceeded',
          action: 'emit_error_event',
          message: 'Repair iteration limit reached — project requires human intervention',
        },
        {
          condition: 'invalid_input',
          action: 'request_human_checkpoint',
          message: 'Repair coordinator needs a judge report in task input',
        },
      ],
      timeout_ms: 300000,
      max_retries: 3,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'JUDGING_COMPLETED') {
      await this.log('partial', `Received JUDGING_COMPLETED: ${JSON.stringify(event.payload)}`);
    }
  }

  getIterations(): readonly RepairIteration[] {
    return this.iterations;
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();
    const startedAtISO = new Date(startedAt).toISOString();

    const report = task.input?.judge_report as OverallJudgeReport | undefined;
    const buildReport = task.input?.build_report as BuildReport | undefined;
    const currentIteration = (task.input?.iteration as number) ?? 0;
    const projectName = task.input?.project_name as string ?? report?.project_name ?? buildReport?.project_name ?? 'unknown';

    if (!report && !buildReport) {
      await this.log('failure', 'Missing judge report or build report in task input');
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: 'Repair coordinator requires a judge report or build report in task input',
        error: { code: 'VALIDATION_FAILURE', message: 'Missing report', timestamp: new Date().toISOString() },
      };
    }

    if (currentIteration >= this.repairConfig.max_iterations) {
      await this.log('failure', `Max repair iterations (${this.repairConfig.max_iterations}) reached for ${projectName}`);
      await this.emitEvent('REPAIR_FAILED', {
        task_id: task.task_id,
        project_name: projectName,
        iteration: currentIteration,
        max_iterations: this.repairConfig.max_iterations,
        reason: 'Max iterations exceeded',
      });
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Max repair iterations (${this.repairConfig.max_iterations}) reached. Project requires human intervention.`,
        error: { code: 'INTERNAL_ERROR', message: 'Repair iteration limit exceeded', timestamp: new Date().toISOString() },
      };
    }

    const variant = report ? 'judge' : 'build';
    const aggregatedVerdict = report?.aggregated_verdict ?? (buildReport?.summary.success ? 'pass' : 'fail');
    const totalIssues = report?.total_issues ?? buildReport?.failures.length ?? 0;
    const criticalIssues = report?.critical_issues ?? buildReport?.failures.filter((f) => f.type === 'compilation' || f.type === 'dependency').length ?? 0;
    const highIssues = report?.high_issues ?? (totalIssues - criticalIssues);

    await this.log('partial', `Starting repair iteration ${currentIteration + 1} for ${projectName}`);
    await this.emitEvent('REPAIR_STARTED', {
      task_id: task.task_id,
      project_name: projectName,
      iteration: currentIteration + 1,
      max_iterations: this.repairConfig.max_iterations,
      aggregated_verdict: aggregatedVerdict,
      total_issues: totalIssues,
      variant,
    });

    try {
      await this.writeDecision({
        id: `dec-repair-${task.task_id.slice(0, 8)}`,
        decision: `Starting repair iteration ${currentIteration + 1}/${this.repairConfig.max_iterations} for "${projectName}"`,
        context: `Project: ${projectName}. Iteration: ${currentIteration + 1}/${this.repairConfig.max_iterations}. Issues: ${totalIssues} (${criticalIssues} critical, ${highIssues} high). Verdict: ${aggregatedVerdict}. Variant: ${variant}.`,
        alternatives: [],
        rationale: `The repair coordinator generates fix tasks from ${variant} report issues, creates builder tasks for each fix, and tracks iterations until all issues are resolved or max iterations hit.`,
        consequences: 'Each iteration creates builder tasks for the identified issues. After fixes, the build-test-judge cycle repeats. This continues until all judges pass or max iterations reached.',
      });

      const fixTasks = report
        ? this.taskGenerator.generateFixTasks(report)
        : (buildReport ? this.taskGenerator.fromBuildReport(buildReport) : []);

      if (fixTasks.length === 0) {
        await this.log('success', `No fixable issues found for ${projectName}`);
        await this.emitEvent('REPAIR_COMPLETED', {
          task_id: task.task_id,
          project_name: projectName,
          iteration: currentIteration + 1,
          fix_tasks_created: 0,
          verdict: aggregatedVerdict,
        });
        return {
          task_id: task.task_id,
          status: 'COMPLETED',
          exit_code: 'AGENT_OK',
          artifacts: [],
          criteria_results: task.acceptance_criteria.map((c) => ({
            criterion_id: c.criterion_id,
            passed: true,
            evidence: `No fixable issues: ${c.description}`,
          })),
          summary: 'No fixable issues found.',
          error: null,
        };
      }

      for (const fixTask of fixTasks) {
        await this.log('partial', `Creating fix task for: ${fixTask.target_file} — ${fixTask.recommendation}`);
        await this.emitEvent('FIX_TASK_CREATED', {
          task_id: task.task_id,
          project_name: projectName,
          fix_task_id: fixTask.id,
          target_file: fixTask.target_file,
          severity: fixTask.severity,
          issue: fixTask.issue,
          recommendation: fixTask.recommendation,
        });

        const builderTask = createTask({
          project_id: task.project_id,
          type: 'fix',
          description: `Fix: ${fixTask.issue} — ${fixTask.recommendation}`,
          creator_agent: this.manifest.agent_id,
          parent_task_id: task.task_id,
          acceptance_criteria: fixTask.acceptance_criteria.map((desc, i) => ({
            criterion_id: `ac-fix-${fixTask.id.slice(0, 4)}-${i}`,
            description: desc,
            verification_method: 'judge_evaluation' as const,
            verified: false,
          })),
          input: {
            fix_task_id: fixTask.id,
            target_file: fixTask.target_file,
            issue: fixTask.issue,
            recommendation: fixTask.recommendation,
            blueprint: task.input?.blueprint,
            project_name: projectName,
          },
          expected_outputs: ['fixed_file'],
        });
        fixTask.task_id = builderTask.task_id;
      }

      const iteration: RepairIteration = {
        iteration_number: currentIteration + 1,
        state: 'REPAIRING',
        fix_tasks: fixTasks,
        started_at: startedAtISO,
        completed_at: null,
        summary: '',
      };

      if (currentIteration < this.iterations.length) {
        this.iterations[currentIteration] = iteration;
      } else {
        this.iterations.push(iteration);
      }

      await this.log('success', `Repair iteration ${currentIteration + 1} created ${fixTasks.length} fix task(s) for ${projectName}`);

      const elapsed = Date.now() - startedAt;
      const completedAt = new Date().toISOString();
      const completedIteration: RepairIteration = {
        ...iteration,
        state: 'REPAIR_COMPLETED',
        completed_at: completedAt,
        summary: `Iteration ${currentIteration + 1}: Created ${fixTasks.length} fix task(s). ${totalIssues} issues targeted.`,
      };
      if (currentIteration < this.iterations.length) {
        this.iterations[currentIteration] = completedIteration;
      }

      const allPassed = aggregatedVerdict === 'pass';
      const summary = this.buildSummary(projectName, report ?? buildReport, fixTasks, currentIteration, variant);

      await this.emitEvent('REPAIR_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        iteration: currentIteration + 1,
        max_iterations: this.repairConfig.max_iterations,
        fix_tasks_created: fixTasks.length,
        remaining_issues: totalIssues - fixTasks.length,
        verdict: aggregatedVerdict,
      });

      return {
        task_id: task.task_id,
        status: allPassed ? 'COMPLETED' : 'COMPLETED',
        exit_code: allPassed ? 'AGENT_OK' : 'AGENT_OK',
        artifacts: fixTasks.map((ft) => `fix-task:${ft.id}`),
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: true,
          evidence: `Repair iteration ${currentIteration + 1} completed: ${c.description}`,
        })),
        summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Repair iteration ${currentIteration + 1} failed: ${errorMessage}`);
      await this.emitEvent('REPAIR_FAILED', {
        task_id: task.task_id,
        project_name: projectName,
        iteration: currentIteration + 1,
        error: errorMessage,
      });
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Repair iteration ${currentIteration + 1} failed: ${errorMessage}`,
        error: { code: 'INTERNAL_ERROR', message: errorMessage, timestamp: new Date().toISOString() },
      };
    }
  }

  async initialize(): Promise<void> {
    this.iterations = [];
    await this.log('partial', 'Repair Coordinator V1 initialized');
  }

  async shutdown(): Promise<void> {
    this.iterations = [];
    await this.log('partial', 'Repair Coordinator V1 shutting down');
  }

  private buildSummary(projectName: string, report: OverallJudgeReport | BuildReport | undefined, fixTasks: FixTask[], currentIteration: number, variant = 'judge'): string {
    const verdict = report && 'aggregated_verdict' in report
      ? report.aggregated_verdict
      : (report && 'summary' in report ? (report.summary.success ? 'pass' : 'fail') : 'unknown');
    const score = report && 'aggregated_score' in report
      ? `${report.aggregated_score.percentage}%`
      : (report && 'summary' in report ? `${report.summary.passed}/${report.summary.total_commands} commands` : 'N/A');
    const totalIssues = report && 'total_issues' in report
      ? report.total_issues
      : (report && 'failures' in report ? report.failures.length : 0);

    return [
      `# Repair Iteration ${currentIteration + 1} for "${projectName}"`,
      '',
      `**Verdict:** ${verdict}`,
      `**Score:** ${score}`,
      `**Fix Tasks Created:** ${fixTasks.length}`,
      `**Total Issues:** ${totalIssues}`,
      `**Variant:** ${variant}`,
      '',
      '## Fix Tasks',
      ...fixTasks.map((ft) => [
        `### ${ft.id}`,
        `- **Target:** \`${ft.target_file}\``,
        `- **Issue:** ${ft.issue}`,
        `- **Severity:** ${ft.severity}`,
        `- **Recommendation:** ${ft.recommendation}`,
        `- **Task ID:** ${ft.task_id ?? 'N/A'}`,
      ].join('\n')),
      '',
      '**Next steps:** Builder agents will pick up the fix tasks, apply changes, and the build-test-judge cycle will repeat.',
    ].join('\n');
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      await this.memoryWriter.appendLog({
        timestamp: new Date().toISOString(),
        phase: 'FIX_AND_RETEST',
        agent_id: this.manifest.agent_id,
        action: 'repair_coordination',
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
        phase: 'FIX_AND_RETEST',
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
