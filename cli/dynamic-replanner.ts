import type { LivingProjectState, ProjectTask, Decision } from './project-state.js';
import type { RiskDetector } from './risk-detector.js';
import type { HackathonContext } from './hackathon-context.js';

export interface ReplanResult {
  replanned: boolean;
  reason: string;
  changes: string[];
  newTasks: ProjectTask[];
  removedTasks: ProjectTask[];
  decisions: Decision[];
}

/**
 * Dynamic replanning engine.
 * After every major milestone, checks if conditions have changed
 * and automatically adjusts the plan. No user restart needed.
 *
 * Triggers: build failed, API unavailable, deployment failed,
 * time estimate changed, sponsor requirement missing.
 */
export class DynamicReplanner {
  private readonly state: LivingProjectState;
  private readonly ctx: HackathonContext;
  private readonly riskDetector: RiskDetector;
  private planVersion = 0;

  constructor(state: LivingProjectState, ctx: HackathonContext, riskDetector: RiskDetector) {
    this.state = state;
    this.ctx = ctx;
    this.riskDetector = riskDetector;
  }

  /** Check if replanning is needed and perform it */
  evaluateAndReplan(): ReplanResult {
    const result: ReplanResult = {
      replanned: false,
      reason: '',
      changes: [],
      newTasks: [],
      removedTasks: [],
      decisions: [],
    };

    // Run risk detection first
    this.riskDetector.detect();

    // Check if the state itself thinks replanning is needed
    const shouldReplan = this.shouldReplan();

    if (!shouldReplan.needed) return result;

    result.replanned = true;
    result.reason = shouldReplan.reason;

    // Update remaining time estimate
    this.updateTimeEstimate(result);

    // Prune low-value tasks under time pressure
    const pruned = this.state.pruneLowValueTasks();
    result.removedTasks.push(...pruned);
    for (const t of pruned) {
      result.changes.push(`Removed low-priority task: ${t.description}`);
    }

    // Check sponsor requirements
    this.checkSponsorRequirements(result);

    // Adjust architecture if needed (e.g., if deployment failed, simplify)
    this.adjustArchitecture(result);

    // Generate new tasks if gaps were found
    this.fillPlanningGaps(result);

    this.planVersion++;
    this.state.lastReplanAt = Date.now();

    const replanDecision = this.state.recordDecision(
      'replanned',
      `Replanned (v${this.planVersion}): ${result.reason}`,
      `Triggers: ${result.changes.join('; ')}`,
      `${result.changes.length} changes applied`,
    );
    result.decisions.push(replanDecision);

    return result;
  }

  private shouldReplan(): { needed: boolean; reason: string } {
    // Check for build failures
    const failedBuilds = this.state.tasks.filter(t =>
      t.category === 'feature' && t.status === 'failed',
    );
    if (failedBuilds.length > 0) {
      const reasons = failedBuilds.map(f => `${f.description}: ${f.error}`).join('; ');
      return { needed: true, reason: `Build failures detected: ${reasons}` };
    }

    // Check for deployment failures
    const failedDeploys = this.state.tasks.filter(t =>
      t.category === 'deployment' && t.status === 'failed',
    );
    if (failedDeploys.length > 0) {
      return { needed: true, reason: 'Deployment failed, adjusting plan' };
    }

    // Check for unblocked critical risks
    const criticalRisks = this.state.risks.filter(
      r => !r.resolved && r.severity === 'critical',
    );
    if (criticalRisks.length > 0) {
      return { needed: true, reason: `${criticalRisks.length} critical risk(s) unresolved` };
    }

    // Check if time remaining has changed significantly
    const elapsed = (Date.now() - this.state.startedAt) / 3600000;
    const expectedRemaining = this.ctx.hoursRemaining - elapsed;
    const diff = Math.abs(expectedRemaining - this.state.remainingHours);
    if (diff > 0.5) {
      return { needed: true, reason: `Time estimate changed by ${Math.round(diff * 60)}m` };
    }

    // Delegate to the living state's built-in checks
    return this.state.shouldReplan();
  }

  private updateTimeEstimate(result: ReplanResult): void {
    const elapsed = (Date.now() - this.state.startedAt) / 3600000;
    const remaining = Math.max(0, this.ctx.hoursRemaining - elapsed);
    const oldRemaining = this.state.remainingHours;
    this.state.remainingHours = remaining;

    if (Math.abs(oldRemaining - remaining) > 0.25) {
      result.changes.push(`Time estimate: ${oldRemaining.toFixed(1)}h → ${remaining.toFixed(1)}h`);
    }
  }

  private checkSponsorRequirements(result: ReplanResult): void {
    if (this.ctx.requiredAPIs.length === 0) return;

    // Check if we have a task for each required API
    for (const api of this.ctx.requiredAPIs) {
      const hasTask = this.state.tasks.some(t =>
        t.description.toLowerCase().includes(api.toLowerCase()) ||
        t.category === 'sponsor_api',
      );

      if (!hasTask) {
        const task = this.state.addTask(
          `Integrate ${api} API (required for sponsor eligibility)`,
          'sponsor_api',
          'critical',
          [],
          `Required by competition: must use ${api}`,
        );
        this.state.recordDecision(
          'feature_added',
          `Added sponsor API task: ${api}`,
          `Required for ${api} prize eligibility`,
          'Sponsor requirement check',
        );
        result.newTasks.push(task);
        result.changes.push(`Added required sponsor API task: ${api}`);
      }
    }
  }

  private adjustArchitecture(result: ReplanResult): void {
    // If deployment failed, simplify to a static deployment
    const failedDeploys = this.state.tasks.filter(t =>
      t.category === 'deployment' && t.status === 'failed',
    );

    if (failedDeploys.length > 0) {
      const existingSimplification = this.state.decisions.some(d =>
        d.description.includes('Simplified deployment'),
      );
      if (!existingSimplification) {
        this.state.recordDecision(
          'architecture_changed',
          'Simplified deployment strategy',
          'Previous deployment failed. Switching to static export for reliable deployment.',
          `Failed deployment tasks: ${failedDeploys.map(d => d.description).join(', ')}`,
        );
        result.changes.push('Architecture adjusted: switching to static deployment');
      }
    }

    // If too many features failed, simplify scope
    const failedCount = this.state.failedCount;
    const taskCount = this.state.tasks.length;
    if (taskCount > 5 && failedCount > taskCount * 0.3) {
      const existing = this.state.decisions.some(d => d.description.includes('Scope reduction'));
      if (!existing) {
        this.state.recordDecision(
          'architecture_changed',
          'Scope reduction due to high failure rate',
          `${failedCount}/${taskCount} tasks failed. Reducing scope to core functionality.`,
          `Failure rate: ${(failedCount / taskCount * 100).toFixed(0)}%`,
        );
        result.changes.push(`Scope reduced: ${failedCount}/${taskCount} tasks failed`);
      }
    }
  }

  private fillPlanningGaps(result: ReplanResult): void {
    // Check if we have a deployment task
    const hasDeployTask = this.state.tasks.some(t => t.category === 'deployment');
    if (!hasDeployTask) {
      const task = this.state.addTask(
        'Deploy to production (Vercel/Netlify)',
        'deployment',
        'critical',
        [],
        'Required for live demo access by judges',
      );
      result.newTasks.push(task);
      result.changes.push('Added missing deployment task');
    }

    // Check if we have documentation
    const hasDocsTask = this.state.tasks.some(t => t.category === 'documentation');
    if (!hasDocsTask && this.ctx.hoursRemaining > 2) {
      const task = this.state.addTask(
        'Create README with demo link and judging criteria alignment',
        'documentation',
        'high',
        [],
        'Judges evaluate README quality',
      );
      result.newTasks.push(task);
      result.changes.push('Added documentation task');
    }
  }
}
