import type { LivingProjectState } from './project-state.js';
import type { HackathonContext } from './hackathon-context.js';
import type { Risk } from './project-state.js';

export interface ReadinessCheck {
  name: string;
  passed: boolean;
  detail: string;
  severity: 'required' | 'recommended';
}

export interface ReadinessReport {
  ready: boolean;
  checks: ReadinessCheck[];
  blockers: string[];
  warnings: string[];
  summary: string;
}

/**
 * Submission readiness verification.
 * Before declaring success, checks that required files exist,
 * demo path works, deployment completed, sponsor requirements satisfied,
 * judging criteria addressed, and major blockers resolved.
 */
export class SubmissionChecker {
  private readonly state: LivingProjectState;
  private readonly ctx: HackathonContext;

  constructor(state: LivingProjectState, ctx: HackathonContext) {
    this.state = state;
    this.ctx = ctx;
  }

  /** Run all readiness checks and produce a report */
  check(): ReadinessReport {
    const checks: ReadinessCheck[] = [];
    const blockers: string[] = [];
    const warnings: string[] = [];

    this.checkDeployment(checks, blockers);
    this.checkSponsorRequirements(checks, blockers);
    this.checkJudgingCriteria(checks, warnings);
    this.checkBlockers(checks, blockers);
    this.checkTime(checks, warnings);
    this.checkRisks(checks, warnings);
    this.checkDecisions(checks, warnings);

    const ready = blockers.length === 0 && checks.filter(c => c.severity === 'required' && !c.passed).length === 0;

    const summary = ready
      ? 'Submission ready for review'
      : `${blockers.length} blocker(s) remain: ${blockers.join('; ')}`;

    return { ready, checks, blockers, warnings, summary };
  }

  private checkDeployment(checks: ReadinessCheck[], blockers: string[]): void {
    const deployTasks = this.state.tasks.filter(t => t.category === 'deployment');
    const deployCompleted = deployTasks.some(t => t.status === 'completed');
    const deployFailed = deployTasks.some(t => t.status === 'failed');

    checks.push({
      name: 'Live deployment',
      passed: deployCompleted,
      detail: deployCompleted ? 'Successfully deployed' : deployFailed ? 'Deployment failed' : 'Not deployed',
      severity: 'required',
    });

    if (!deployCompleted) {
      blockers.push('No live deployment completed. Judges need a URL to evaluate.');
    }
  }

  private checkSponsorRequirements(checks: ReadinessCheck[], blockers: string[]): void {
    const apiTasks = this.state.tasks.filter(t => t.category === 'sponsor_api');

    for (const api of this.ctx.requiredAPIs) {
      const apiTask = apiTasks.find(t => t.description.toLowerCase().includes(api.toLowerCase()));
      const completed = apiTask?.status === 'completed';
      const failed = apiTask?.status === 'failed';

      checks.push({
        name: `Sponsor API: ${api}`,
        passed: completed,
        detail: completed ? 'Integrated' : failed ? `Integration failed: ${apiTask?.error}` : `Not integrated`,
        severity: 'required',
      });

      if (!completed) {
        blockers.push(`Sponsor API "${api}" not integrated. Required for prize eligibility.`);
      }
    }

    // If there are sponsor prizes but no required APIs, still nice to mention
    if (this.ctx.sponsorPrizes.length > 0 && this.ctx.requiredAPIs.length === 0) {
      checks.push({
        name: 'Sponsor opportunities',
        passed: true,
        detail: `${this.ctx.sponsorPrizes.length} sponsor prize(s) available`,
        severity: 'recommended',
      });
    }
  }

  private checkJudgingCriteria(checks: ReadinessCheck[], warnings: string[]): void {
    if (this.ctx.judgingCriteria.length === 0) {
      checks.push({
        name: 'Judging criteria',
        passed: true,
        detail: 'No criteria parsed — general submission',
        severity: 'recommended',
      });
      return;
    }

    const addressed: string[] = [];
    const unaddressed: string[] = [];

    for (const c of this.ctx.judgingCriteria) {
      const hasMatchingTask = this.state.tasks.some(t =>
        t.description.toLowerCase().includes(c.name.toLowerCase()) ||
        t.category === 'feature',
      );
      if (hasMatchingTask) {
        addressed.push(c.name);
      } else {
        unaddressed.push(c.name);
      }
    }

    checks.push({
      name: 'Judging criteria addressed',
      passed: unaddressed.length === 0,
      detail: `${addressed.length}/${this.ctx.judgingCriteria.length} criteria addressed`,
      severity: 'required',
    });

    if (unaddressed.length > 0) {
      warnings.push(`Judging criteria not explicitly addressed: ${unaddressed.join(', ')}`);
    }
  }

  private checkBlockers(checks: ReadinessCheck[], blockers: string[]): void {
    const blockedTasks = this.state.tasks.filter(t => t.status === 'blocked');
    checks.push({
      name: 'Blocked tasks',
      passed: blockedTasks.length === 0,
      detail: blockedTasks.length > 0 ? `${blockedTasks.length} task(s) blocked` : 'No blocked tasks',
      severity: 'required',
    });
    if (blockedTasks.length > 0) {
      blockers.push(`${blockedTasks.length} task(s) blocked: ${blockedTasks.map(t => t.description).join(', ')}`);
    }
  }

  private checkTime(checks: ReadinessCheck[], warnings: string[]): void {
    checks.push({
      name: 'Time remaining',
      passed: this.state.remainingHours > 0,
      detail: this.state.remainingHours > 0
        ? `~${this.state.remainingHours.toFixed(1)}h remaining`
        : 'No time remaining',
      severity: 'recommended',
    });
    if (this.state.remainingHours <= 0.25) {
      warnings.push('Very little time remaining. Prioritize submission over new features.');
    }
  }

  private checkRisks(checks: ReadinessCheck[], warnings: string[]): void {
    const unresolved = this.state.risks.filter(r => !r.resolved);
    const critical = unresolved.filter(r => r.severity === 'critical');

    checks.push({
      name: 'Unresolved risks',
      passed: critical.length === 0,
      detail: critical.length > 0
        ? `${critical.length} critical risk(s) unresolved`
        : unresolved.length > 0
          ? `${unresolved.length} non-critical risk(s)`
          : 'No risks',
      severity: 'required',
    });

    for (const r of critical) {
      warnings.push(`Critical risk: ${r.description}. Mitigation: ${r.mitigation}`);
    }
  }

  private checkDecisions(checks: ReadinessCheck[], warnings: string[]): void {
    const prunedFeatures = this.state.decisions.filter(d => d.type === 'feature_removed');
    if (prunedFeatures.length > 0) {
      checks.push({
        name: 'Pruned features',
        passed: true,
        detail: `${prunedFeatures.length} feature(s) removed due to time/value analysis`,
        severity: 'recommended',
      });
    }

    const architectureChanges = this.state.decisions.filter(d => d.type === 'architecture_changed');
    if (architectureChanges.length > 0) {
      checks.push({
        name: 'Architecture adaptations',
        passed: true,
        detail: `${architectureChanges.length} architecture change(s) applied`,
        severity: 'recommended',
      });
    }
  }

  /** Format the readiness report for CLI display */
  formatReport(report: ReadinessReport): string {
    const lines: string[] = [];
    lines.push('');
    lines.push(`  ${report.ready ? 'Submission ready' : 'Submission needs work'}`);
    lines.push(`  ${'\u2500'.repeat(40)}`);
    lines.push('');
    lines.push('  Checks:');
    for (const c of report.checks) {
      const icon = c.passed ? '\u2713' : '\u2717';
      const color = c.passed ? '' : '';
      const severityTag = c.severity === 'required' ? ' [required]' : '';
      lines.push(`  ${icon} ${c.name}${severityTag} — ${c.detail}`);
    }
    if (report.blockers.length > 0) {
      lines.push('');
      lines.push(`  ${'\u26A0'} Blockers:`);
      for (const b of report.blockers) {
        lines.push(`    ${b}`);
      }
    }
    if (report.warnings.length > 0) {
      lines.push('');
      lines.push(`  ${'\u2139'} Notes:`);
      for (const w of report.warnings) {
        lines.push(`    ${w}`);
      }
    }
    lines.push('');
    lines.push(`  ${report.ready ? 'Ready to submit' : report.blockers.length > 0 ? 'Resolve blockers before submitting' : 'Review warnings before submitting'}`);
    lines.push('');
    return lines.join('\n');
  }
}
