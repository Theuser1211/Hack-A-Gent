import type { Task, TaskResult } from '../kernel/tasks/task-entity.js';
import type { Agent } from '../kernel/agents/agent-runtime.js';
import type { AgentManifest } from '../kernel/agents/agent-manifest.js';
import type { MemoryWriter } from '../kernel/memory/memory-writer.js';
import type { EventBus } from '../kernel/events/event-bus.js';
import { createEvent } from '../kernel/events/event-envelope.js';
import type { JudgeProvider } from '../kernel/judge/judge-provider.js';
import type { JudgeReport, OverallJudgeReport, JudgeIssue } from '../kernel/judge/judge-types.js';
import { OverallJudgeReportSchema } from '../kernel/judge/judge-types.js';
import type { ArchitectureBlueprint } from '../kernel/planning/architect-types.js';
import type { GeneratedRepository } from '../kernel/builders/builder-types.js';
import type { TestReport } from '../kernel/test/test-types.js';

export interface JudgePanelConfig {
  judges: JudgeProvider[];
  memoryWriter?: MemoryWriter;
  eventBus?: EventBus;
  agentId?: string;
}

function aggregateReports(projectName: string, reports: JudgeReport[]): OverallJudgeReport {
  const totalScore = reports.reduce((s, r) => s + r.score.percentage, 0);
  const avgPercentage = reports.length > 0 ? Math.round(totalScore / reports.length) : 100;
  const allIssues: JudgeIssue[] = reports.flatMap((r) => r.issues);
  const criticalIssues = allIssues.filter((i) => i.severity === 'critical').length;
  const highIssues = allIssues.filter((i) => i.severity === 'high').length;
  const failedReports = reports.filter((r) => r.verdict === 'fail' || r.verdict === 'critical');
  const hasPass = reports.some((r) => r.verdict === 'pass');
  const allPass = reports.every((r) => r.verdict === 'pass');

  let aggregatedVerdict: OverallJudgeReport['aggregated_verdict'];
  if (allPass) {
    aggregatedVerdict = 'pass';
  } else if (failedReports.length === 0 && hasPass) {
    aggregatedVerdict = 'pass_with_concerns';
  } else if (failedReports.length <= Math.ceil(reports.length / 2)) {
    aggregatedVerdict = 'fail';
  } else {
    aggregatedVerdict = 'critical';
  }

  return {
    project_name: projectName,
    judge_reports: reports,
    aggregated_score: {
      total: Math.round(avgPercentage),
      max: 100,
      percentage: avgPercentage,
      criteria: reports.flatMap((r) => r.score.criteria),
    },
    aggregated_verdict: aggregatedVerdict,
    generated_at: new Date().toISOString(),
    total_issues: allIssues.length,
    critical_issues: criticalIssues,
    high_issues: highIssues,
  };
}

export class JudgePanelAgent implements Agent {
  public readonly manifest: AgentManifest;
  private readonly judges: JudgeProvider[];
  private readonly memoryWriter?: MemoryWriter;
  private readonly eventBus?: EventBus;

  constructor(config: JudgePanelConfig) {
    this.judges = config.judges;
    this.memoryWriter = config.memoryWriter;
    this.eventBus = config.eventBus;

    this.manifest = {
      agent_id: config.agentId ?? 'agent.judge.panel.v1',
      agent_name: 'Judge Panel V1',
      agent_type: 'judge',
      contract_version: '1.0.0',
      capabilities: [
        {
          capability_id: 'judge_evaluation',
          description: 'Evaluates generated projects using product, code, UX, and hackathon judges, aggregates reports, and files issues to BUGS.md',
          input_schema: {},
          output_schema: {},
        },
      ],
      required_skills: ['Code Review', 'UX Evaluation', 'Architecture Review', 'Hackathon Judging'],
      event_subscriptions: ['TESTING_COMPLETED'],
      accepted_tasks: ['judging'],
      produced_outputs: [
        {
          output_id: 'judge_report',
          description: 'Overall judge report with evaluations from all judges',
          mime_type: 'application/json',
          path_template: '.workspace/agents/agent.judge.panel.v1/output/{task_id}-judge-report.json',
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
          condition: 'invalid_input',
          action: 'request_human_checkpoint',
          message: 'Judge panel needs a blueprint and optional test report to evaluate',
        },
        {
          condition: 'tool_failure',
          action: 'emit_error_event',
          message: 'Judging failed — check that source data is available',
        },
      ],
      timeout_ms: 300000,
      max_retries: 2,
    };
  }

  async onEvent(event: { type: string; payload: Record<string, unknown> }): Promise<void> {
    if (event.type === 'TESTING_COMPLETED') {
      await this.log('partial', `Received TESTING_COMPLETED: ${JSON.stringify(event.payload)}`);
    }
  }

  async executeTask(task: Task): Promise<TaskResult> {
    const startedAt = Date.now();
    const startedAtISO = new Date(startedAt).toISOString();

    const blueprint = task.input?.blueprint as ArchitectureBlueprint | undefined;
    const repository = task.input?.repository as GeneratedRepository | undefined;
    const testReport = task.input?.test_report as TestReport | undefined;
    const projectName = task.input?.project_name as string ?? blueprint?.project_name ?? 'unknown';

    if (!blueprint) {
      await this.log('failure', 'Missing blueprint in task input');
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: 'Judge panel requires blueprint in task input',
        error: { code: 'VALIDATION_FAILURE', message: 'Missing blueprint', timestamp: new Date().toISOString() },
      };
    }

    await this.log('partial', `Starting judging for project: ${projectName}`);
    await this.emitEvent('JUDGING_STARTED', {
      task_id: task.task_id,
      project_name: projectName,
      judge_count: this.judges.length,
      has_test_report: !!testReport,
      has_repository: !!repository,
    });

    try {
      await this.writeDecision({
        id: `dec-judge-${task.task_id.slice(0, 8)}`,
        decision: `Running ${this.judges.length} judges on project "${projectName}"`,
        context: `Project: ${projectName}. Judges: ${this.judges.map((j) => j.judgeName).join(', ')}. Blueprint version: ${blueprint.version}.`,
        alternatives: [],
        rationale: 'Judge panel evaluates architecture, code, UX, and hackathon readiness through multiple specialized judges. Each judge produces a score, issues, and recommendations.',
        consequences: 'Issues found are filed in BUGS.md. The aggregated verdict determines whether the project proceeds to submission or enters the repair loop.',
      });

      const reports: JudgeReport[] = [];

      for (const judge of this.judges) {
        await this.log('partial', `Running judge: ${judge.judgeName}`);

        try {
          const archReport = await judge.evaluateArchitecture(blueprint);
          reports.push(archReport);
          await this.emitEvent('JUDGE_COMPLETED', {
            task_id: task.task_id,
            project_name: projectName,
            judge_id: judge.judgeId,
            judge_name: judge.judgeName,
            verdict: archReport.verdict,
            score: archReport.score.percentage,
            aspect: 'architecture',
          });
          await this.log(archReport.verdict === 'pass' ? 'success' : 'failure',
            `${judge.judgeName} architecture: ${archReport.verdict} (${archReport.score.percentage}%) — ${archReport.summary}`,
          );

          if (judge.judgeId !== 'judge.code.v1') {
            const codeReport = await judge.evaluateCode(repository ?? {
              project_name: projectName,
              blueprint_version: '1.0.0',
              modules: [],
              total_files: 0,
              total_lines: 0,
              generated_at: new Date().toISOString(),
              build_results: [],
            });
            reports.push(codeReport);
            await this.emitEvent('JUDGE_COMPLETED', {
              task_id: task.task_id,
              project_name: projectName,
              judge_id: judge.judgeId,
              judge_name: judge.judgeName,
              verdict: codeReport.verdict,
              score: codeReport.score.percentage,
              aspect: 'code',
            });
          }
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : String(err);
          await this.log('failure', `${judge.judgeName} evaluation failed: ${errMsg}`);
        }
      }

      const overall = aggregateReports(projectName, reports);
      OverallJudgeReportSchema.parse(overall);

      for (const issue of overall.judge_reports.flatMap((r) => r.issues)) {
        await this.fileIssue(issue, task.task_id);
        await this.emitEvent('ISSUE_FOUND', {
          task_id: task.task_id,
          project_name: projectName,
          category: issue.category,
          severity: issue.severity,
          message: issue.message,
          recommendation: issue.recommendation,
        });
      }

      const allPassed = overall.aggregated_verdict === 'pass';
      const elapsed = Date.now() - startedAt;

      const summary = this.buildSummary(projectName, overall);

      await this.log(allPassed ? 'success' : 'partial',
        `Judging ${allPassed ? 'complete' : 'completed with issues'} in ${elapsed}ms. ${overall.aggregated_score.percentage}% overall score. ${overall.total_issues} issue(s) found (${overall.critical_issues} critical, ${overall.high_issues} high).`,
      );

      await this.emitEvent('JUDGING_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        aggregated_verdict: overall.aggregated_verdict,
        aggregated_score: overall.aggregated_score.percentage,
        total_issues: overall.total_issues,
        critical_issues: overall.critical_issues,
        high_issues: overall.high_issues,
        judge_reports: reports.map((r) => ({ judge_id: r.judge_id, verdict: r.verdict, score: r.score.percentage })),
        duration_ms: elapsed,
        summary,
      });

      return {
        task_id: task.task_id,
        status: allPassed ? 'COMPLETED' : (overall.aggregated_verdict !== 'critical' ? 'COMPLETED' : 'FAILED'),
        exit_code: allPassed ? 'AGENT_OK' : (overall.aggregated_verdict !== 'critical' ? 'AGENT_OK' : 'AGENT_FAIL'),
        artifacts: [],
        criteria_results: task.acceptance_criteria.map((c) => ({
          criterion_id: c.criterion_id,
          passed: allPassed,
          evidence: allPassed
            ? `Judging passed: ${c.description}`
            : `Judging found ${overall.total_issues} issues: ${c.description}`,
        })),
        summary,
        error: null,
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      await this.log('failure', `Judging failed: ${errorMessage}`);
      await this.emitEvent('JUDGING_COMPLETED', {
        task_id: task.task_id,
        project_name: projectName,
        aggregated_verdict: 'critical',
        error: errorMessage,
      });
      return {
        task_id: task.task_id,
        status: 'FAILED',
        exit_code: 'AGENT_FAIL',
        artifacts: [],
        criteria_results: [],
        summary: `Judging failed: ${errorMessage}`,
        error: { code: 'INTERNAL_ERROR', message: errorMessage, timestamp: new Date().toISOString() },
      };
    }
  }

  async initialize(): Promise<void> {
    await this.log('partial', 'Judge Panel V1 initialized');
  }

  async shutdown(): Promise<void> {
    await this.log('partial', 'Judge Panel V1 shutting down');
  }

  private buildSummary(projectName: string, report: OverallJudgeReport): string {
    const lines: string[] = [
      `# Judge Report for "${projectName}"`,
      '',
      `**Aggregated Verdict:** ${report.aggregated_verdict}`,
      `**Overall Score:** ${report.aggregated_score.percentage}%`,
      `**Judges Run:** ${report.judge_reports.length}`,
      `**Total Issues:** ${report.total_issues}`,
      `**Critical Issues:** ${report.critical_issues}`,
      `**High Issues:** ${report.high_issues}`,
      '',
      '## Judge Results',
      '',
      ...report.judge_reports.map((r) => [
        `### ${r.judge_name} (${r.judge_id})`,
        `- **Verdict:** ${r.verdict}`,
        `- **Score:** ${r.score.percentage}% (${r.score.total}/${r.score.max})`,
        `- **Issues:** ${r.issues.length}`,
        `- **Summary:** ${r.summary}`,
      ].join('\n')),
      '',
      report.total_issues > 0 ? '## Issues Found' : '',
      ...report.judge_reports.flatMap((r) => r.issues.map((i) =>
        `- [${i.severity.toUpperCase()}] [${i.category}] ${i.message} — ${i.recommendation}${i.file ? ` (${i.file})` : ''}`
      )),
      '',
      '**Next steps:** Review issues, generate fix tasks, and re-enter the build-test-judge cycle.',
    ].filter(Boolean);

    return lines.join('\n');
  }

  private async fileIssue(issue: JudgeIssue, taskId: string): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      await this.memoryWriter.appendBug({
        id: `BUG-JUDGE-${taskId.slice(0, 4)}-${issue.category.slice(0, 4)}`,
        timestamp: new Date().toISOString(),
        severity: issue.severity === 'critical' ? 'critical' : issue.severity === 'high' ? 'high' : 'medium',
        found_by: this.manifest.agent_id,
        phase: 'JUDGING',
        task_id: taskId,
        type: issue.category === 'security' ? 'security' : issue.category === 'performance' ? 'performance' : issue.category === 'ux' ? 'ux' : 'code_quality',
        description: `[${issue.category}] ${issue.message}`,
        files: issue.file ? [issue.file] : [],
        steps_to_reproduce: `1. Run the judge evaluation\n2. Review the ${issue.category} issue\n3. Apply fix: ${issue.recommendation}`,
        status: 'open',
        assigned_to: null,
        fix_commit: null,
        retest_status: 'pending',
      });
    } catch {
      // swallow
    }
  }

  private async log(result: 'success' | 'failure' | 'partial', body: string): Promise<void> {
    if (!this.memoryWriter) return;
    try {
      await this.memoryWriter.appendLog({
        timestamp: new Date().toISOString(),
        phase: 'JUDGING',
        agent_id: this.manifest.agent_id,
        action: 'judge_evaluation',
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
        phase: 'JUDGING',
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
