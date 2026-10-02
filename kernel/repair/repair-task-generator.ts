import { v4 as uuid } from 'uuid';

import type { BuildReport, BuildFailure } from '../execution/execution-types.js';
import type { OverallJudgeReport, JudgeIssue } from '../judge/judge-types.js';

import type { FixTask } from './repair-types.js';

export interface RepairTaskGenerator {
  generateFixTasks(report: OverallJudgeReport): FixTask[];
  fromBuildReport(buildReport: BuildReport): FixTask[];
}

export class DefaultRepairTaskGenerator implements RepairTaskGenerator {
  generateFixTasks(report: OverallJudgeReport): FixTask[] {
    const now = new Date().toISOString();
    const fixTasks: FixTask[] = [];

    const allIssues: JudgeIssue[] = report.judge_reports.flatMap((jr) => jr.issues);

    for (const issue of allIssues) {
      if (issue.severity === 'low' || issue.severity === 'medium') {
        continue;
      }

      const targetFile = issue.file ?? this.inferTargetFile(issue.category);
      const acceptanceCriteria = this.generateAcceptanceCriteria(issue);

      fixTasks.push({
        id: `FIX-${uuid().slice(0, 8)}`,
        target_file: targetFile,
        issue: issue.message,
        severity: issue.severity,
        recommendation: issue.recommendation,
        acceptance_criteria: acceptanceCriteria,
        task_id: null,
        status: 'pending',
        created_at: now,
        completed_at: null,
      });
    }

    return fixTasks;
  }

  fromBuildReport(buildReport: BuildReport): FixTask[] {
    const now = new Date().toISOString();
    const fixTasks: FixTask[] = [];

    for (const failure of buildReport.failures) {
      if (failure.type === 'unknown' || failure.type === 'timeout') {
        continue;
      }

      const targetFile = failure.file ?? 'src/';
      fixTasks.push({
        id: `FIX-BUILD-${uuid().slice(0, 8)}`,
        target_file: targetFile,
        issue: `Build ${failure.type} error: ${failure.message}`,
        severity: failure.type === 'compilation' || failure.type === 'dependency' ? 'critical' : 'high',
        recommendation: `Fix ${failure.type} issue: ${failure.message}`,
        acceptance_criteria: [
          `Resolve build error: ${failure.message}`,
          `${failure.type} check passes without errors`,
          `No regressions in other build steps`,
        ],
        task_id: null,
        status: 'pending',
        created_at: now,
        completed_at: null,
      });
    }

    return fixTasks;
  }

  private inferTargetFile(category: string): string {
    const fileMap: Record<string, string> = {
      code_quality: 'src/',
      security: 'src/auth/',
      performance: 'src/',
      ux: 'src/components/',
      completeness: 'src/',
      best_practices: 'src/',
      accessibility: 'src/components/',
      maintainability: 'src/',
      functionality: 'src/',
      innovation: 'src/',
    };
    return fileMap[category] ?? 'src/';
  }

  private generateAcceptanceCriteria(issue: JudgeIssue): string[] {
    return [
      `Resolve: ${issue.message}`,
      `Apply fix: ${issue.recommendation}`,
      `Verify fix does not introduce regressions`,
    ];
  }
}
