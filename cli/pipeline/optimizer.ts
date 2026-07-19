import type { CompetitionAnalysis, ReviewFeedback, ImprovementAction } from './types.js';

export class HackathonOptimizer {
  /**
   * Analyze review feedback and competition context to produce targeted
   * optimizations aimed at maximizing judge scores.
   */
  optimize(feedback: ReviewFeedback, analysis?: CompetitionAnalysis): ImprovementAction[] {
    const optimizations: ImprovementAction[] = [];

    // Strategy: optimize for judge presentation
    optimizations.push({
      category: 'judgeAlignment',
      action: 'Create a 2-minute demo script that walks through each judging criterion explicitly, showing how the project addresses it',
      expectedImpact: 20,
      effortDays: 0.25,
      priority: 'high',
    });

    // Strategy: wow moment amplification
    if (feedback.score.innovation < 80) {
      optimizations.push({
        category: 'innovation',
        action: 'Add a self-contained interactive demo that works without setup — use a hosted playground, embedded video, or live preview link',
        expectedImpact: 18,
        effortDays: 0.5,
        priority: 'high',
      });
    }

    // Strategy: sponsor API showcase
    if (analysis?.sponsorAPIs && analysis.sponsorAPIs.length > 0) {
      const mustUse = analysis.sponsorAPIs.filter(a => a.strategicValue === 'must_use');
      if (mustUse.length > 0) {
        optimizations.push({
          category: 'sponsorAlignment',
          action: `Highlight sponsor API usage: add visible indicators in the UI showing ${mustUse.map(a => a.name).join(', ')} integration — judges look for sponsor usage`,
          expectedImpact: 15,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
    }

    // Strategy: deployment polish
    if (feedback.score.feasibility < 75) {
      optimizations.push({
        category: 'feasibility',
        action: 'Ensure zero-config deployment: add a Deploy to Vercel/Netlify button that works on first click — judges will try to access the demo immediately',
        expectedImpact: 25,
        effortDays: 0.3,
        priority: 'critical',
      });
    }

    // Strategy: UX polish
    if (feedback.score.presentation < 75) {
      optimizations.push({
        category: 'presentation',
        action: 'Add onboarding experience: a hero section explaining what the project does in under 5 seconds, with clear call-to-action',
        expectedImpact: 15,
        effortDays: 0.25,
        priority: 'high',
      });
    }

    // Strategy: criteria targeting
    if (analysis?.judgingCriteria && analysis.judgingCriteria.length > 0) {
      const topCrit = [...analysis.judgingCriteria].sort((a, b) => b.weight - a.weight)[0]!;
      optimizations.push({
        category: 'judgeAlignment',
        action: `Directly target the highest-weighted criterion (${topCrit.name}: ${topCrit.weight}%) — ensure the demo leads with this strength`,
        expectedImpact: 20,
        effortDays: 0.25,
        priority: 'high',
      });
    }

    // Strategy: completeness drive
    const missingFeatures = feedback.weaknesses.filter(w => w.toLowerCase().includes('complete') || w.toLowerCase().includes('missing'));
    if (missingFeatures.length > 0) {
      optimizations.push({
        category: 'completeness',
        action: 'Prioritize must-have features over nice-to-haves: complete the core user flow end-to-end before adding extras',
        expectedImpact: 18,
        effortDays: 0.5,
        priority: 'high',
      });
    }

    // Strategy: presentation-ready README
    optimizations.push({
      category: 'presentation',
      action: 'Generate a judges-ready README with project description, demo link, tech stack, sponsor API usage, and judging criteria alignment table',
      expectedImpact: 12,
      effortDays: 0.2,
      priority: 'medium',
    });

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    optimizations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return optimizations;
  }

  /**
   * Format optimizations as markdown.
   */
  formatOptimizations(optimizations: ImprovementAction[]): string {
    const lines: string[] = [];
    lines.push('## Hackathon Optimizations');
    lines.push('');
    lines.push('Actions to maximize judge score:');
    lines.push('');
    for (const opt of optimizations) {
      const priorityTag = opt.priority === 'critical' ? '🔴 [CRITICAL]' : opt.priority === 'high' ? '🟡 [HIGH]' : '🟢 [MEDIUM]';
      lines.push(`- **${priorityTag}** ${opt.action}`);
      lines.push(`  - Impact: +${opt.expectedImpact} pts, Effort: ${opt.effortDays} day(s)`);
    }
    lines.push('');
    return lines.join('\n');
  }
}
