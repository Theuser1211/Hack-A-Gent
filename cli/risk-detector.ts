import { deterministicNow } from '../benchmarks/determinism-kernel.js';
import type { LivingProjectState, Risk, RiskSeverity } from './project-state.js';
import type { HackathonContext } from './hackathon-context.js';

/**
 * Continuously detects actionable risks during execution.
 * Every surfaced risk has a concrete mitigation.
 * No generic warnings, no fabricated data.
 */
export class RiskDetector {
  private readonly state: LivingProjectState;
  private readonly ctx: HackathonContext;

  constructor(state: LivingProjectState, ctx: HackathonContext) {
    this.state = state;
    this.ctx = ctx;
  }

  /** Run all risk checks and return newly detected risks */
  detect(): Risk[] {
    const newRisks: Risk[] = [];

    this.detectSponsorRisks(newRisks);
    this.detectTimeRisks(newRisks);
    this.detectScopeRisks(newRisks);
    this.detectDeploymentRisks(newRisks);
    this.detectAuthRisks(newRisks);
    this.detectComplexityRisks(newRisks);

    for (const r of newRisks) {
      const existing = this.state.risks.find(e => e.description === r.description);
      if (!existing) {
        this.state.addRisk(r.description, r.severity, r.category, r.mitigation);
      }
    }

    return newRisks;
  }

  private detectSponsorRisks(risks: Risk[]): void {
    if (this.ctx.requiredAPIs.length === 0) return;

    const hasApiTask = this.state.tasks.some(t =>
      t.description.toLowerCase().includes(this.ctx.requiredAPIs[0]!.toLowerCase()) ||
      t.category === 'sponsor_api',
    );

    if (!hasApiTask) {
      const names = this.ctx.requiredAPIs.join(', ');
      risks.push(this.createRisk(
        `Missing sponsor API integration: ${names} required for eligibility`,
        'high',
        'sponsor_api',
        `Add a dedicated task to integrate ${names} before deployment`,
      ));
    }

    // Check if sponsor tasks failed
    const failedApiTasks = this.state.tasks.filter(t =>
      t.category === 'sponsor_api' && t.status === 'failed',
    );
    for (const t of failedApiTasks) {
      risks.push(this.createRisk(
        `Sponsor API integration failed: ${t.description}`,
        'critical',
        'sponsor_api',
        `Check API credentials and documentation for ${t.description}. Consider fallback approach.`,
      ));
    }
  }

  private detectTimeRisks(risks: Risk[]): void {
    const elapsed = (Date.now() - this.state.startedAt) / 3600000; // hours
    const remaining = this.ctx.hoursRemaining - elapsed;
    const pendingCount = this.state.tasks.filter(t => t.status === 'pending').length;
    const completionRate = this.state.completedCount / Math.max(this.state.tasks.length, 1);

    if (remaining <= 1 && pendingCount > 2) {
      risks.push(this.createRisk(
        `Critical time pressure: ~${Math.round(remaining * 60)}m left with ${pendingCount} pending tasks`,
        'critical',
        'time',
        `Prune all non-essential tasks. Focus only on deployment and core features.`,
      ));
    } else if (remaining <= 3 && completionRate < 0.3) {
      risks.push(this.createRisk(
        `Time pressure: ${Math.round(remaining)}h left but only ${Math.round(completionRate * 100)}% complete`,
        'high',
        'time',
        `Prioritize remaining work: drop low-value features, focus on demo-visible functionality.`,
      ));
    }

    // Detect if time estimate was overly optimistic
    if (elapsed > 1 && completionRate < 0.1) {
      risks.push(this.createRisk(
        `Progress slower than expected: ${Math.round(elapsed * 60)}m elapsed, ${Math.round(completionRate * 100)}% done`,
        'high',
        'time',
        `Re-estimate remaining work. Consider simplifying architecture or reducing feature scope.`,
      ));
    }
  }

  private detectScopeRisks(risks: Risk[]): void {
    const highValuePending = this.state.tasks.filter(t =>
      t.status === 'pending' && t.valueScore >= 70,
    ).length;

    // If there's too much high-value work left and not enough time, flag it
    if (highValuePending >= 3 && this.ctx.hoursRemaining <= 2) {
      risks.push(this.createRisk(
        `Unrealistic scope: ${highValuePending} high-value features remain with only ${this.ctx.hoursRemaining}h left`,
        'critical',
        'scope',
        `Reduce scope to 1-2 features maximum. Focus on demo quality over feature count.`,
      ));
    }
  }

  private detectDeploymentRisks(risks: Risk[]): void {
    const hasDeployTask = this.state.tasks.some(t =>
      t.description.toLowerCase().includes('deploy') ||
      t.category === 'deployment',
    );

    if (!hasDeployTask) {
      risks.push(this.createRisk(
        'No deployment task in plan',
        'high',
        'deployment',
        'Add deployment as a critical task. Without a live URL, judges cannot evaluate the demo.',
      ));
    }

    const failedDeploys = this.state.tasks.filter(t =>
      t.category === 'deployment' && t.status === 'failed',
    );
    for (const d of failedDeploys) {
      risks.push(this.createRisk(
        `Deployment failed: ${d.error || 'Unknown error'}`,
        'critical',
        'deployment',
        'Check deployment configuration, API tokens, and build output. Try alternative deployment platform.',
      ));
    }

    // Check if we have deployment tokens
    if (!process.env.GITHUB_TOKEN && !process.env.VERCEL_TOKEN && !process.env.NETLIFY_TOKEN) {
      risks.push(this.createRisk(
        'No deployment tokens configured (GITHUB_TOKEN, VERCEL_TOKEN, NETLIFY_TOKEN)',
        'high',
        'deployment',
        'Set deployment tokens via environment variables or `hag config --github-token <token>`. Without these, deployment will be simulated.',
      ));
    }
  }

  private detectAuthRisks(risks: Risk[]): void {
    const hasAuth = this.state.tasks.some(t =>
      t.description.toLowerCase().includes('auth') ||
      t.description.toLowerCase().includes('login') ||
      t.description.toLowerCase().includes('sign'),
    );

    // Only flag auth if it's explicitly required (e.g. by sponsor or judging criteria)
    const authRequired = this.ctx.judgingCriteria.some(c =>
      c.name.toLowerCase().includes('auth') ||
      c.name.toLowerCase().includes('user'),
    ) || this.ctx.requiredAPIs.some(a => a.toLowerCase().includes('auth'));

    if (authRequired && !hasAuth) {
      risks.push(this.createRisk(
        'Authentication not implemented but may be required by the challenge',
        'medium',
        'auth',
        'Consider adding a simple auth flow (email/password or OAuth) if judging criteria require user accounts.',
      ));
    }
  }

  private detectComplexityRisks(risks: Risk[]): void {
    // Detect if we're building something overly complex for the time available
    const complexFeatures = this.state.tasks.filter(t =>
      t.status === 'pending' &&
      t.costScore > 70 &&
      t.priority !== 'critical',
    );
    if (complexFeatures.length > 0 && this.ctx.hoursRemaining <= 4) {
      for (const f of complexFeatures) {
        risks.push(this.createRisk(
          `High complexity feature with limited time: "${f.description}" (cost: ${f.costScore})`,
          'medium',
          'complexity',
          `Consider simplifying "${f.description}" or replacing with a lower-cost alternative. Demo-ready > complex.`,
        ));
      }
    }
  }

  private createRisk(
    description: string,
    severity: RiskSeverity,
    category: Risk['category'],
    mitigation: string,
  ): Risk {
    const idx = this.state.risks.length;
    return {
      id: 'risk-' + (description.length * 31 + (idx + 1) * 17).toString(16).slice(0, 8),
      description,
      severity,
      category,
      actionable: true,
      mitigation,
      detectedAt: Date.parse(deterministicNow(Math.round(this.ctx.hoursRemaining * 60) + idx)),
      resolved: false,
    };
  }

  /** Get risks grouped by severity for display */
  getGroupedRisks(): Record<RiskSeverity, Risk[]> {
    return {
      critical: this.state.risks.filter(r => !r.resolved && r.severity === 'critical'),
      high: this.state.risks.filter(r => !r.resolved && r.severity === 'high'),
      medium: this.state.risks.filter(r => !r.resolved && r.severity === 'medium'),
      low: this.state.risks.filter(r => !r.resolved && r.severity === 'low'),
    };
  }
}
