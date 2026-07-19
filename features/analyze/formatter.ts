/**
 * Devpost Intelligence — Formatter
 * ==============================
 *
 * Renders a `DevpostAnalysis` as either a human-readable Markdown
 * report or a stable JSON document. Both are deterministic.
 */

import type { DevpostAnalysis, SponsorAPI, JudgingCriterion, FeatureRecommendation, RiskItem, Milestone } from './types.js';

function sponsorLine(s: SponsorAPI): string {
  const tag = s.mustUse ? ' [MUST-USE]' : '';
  return `- **${s.name}** (${s.category}, value ${s.strategicValue}/5)${tag} — ${s.notes}`;
}

function criterionLine(c: JudgingCriterion): string {
  return `- ${c.name}: **${c.weight}%**${c.inferred ? ' _(weight inferred)_' : ''}`;
}

function featureLine(f: FeatureRecommendation): string {
  const icon = f.priority === 'must' ? '🔴' : f.priority === 'should' ? '🟡' : '🟢';
  return `${icon} **${f.title}** _(${f.priority})_ — ${f.rationale}`;
}

function riskLine(r: RiskItem): string {
  const sev = r.severity.toUpperCase();
  return `- [${sev}] **${r.category}**: ${r.description} → _mitigation:_ ${r.mitigation}`;
}

function milestoneLine(m: Milestone): string {
  return `### ${m.name} _(~${m.durationHours}h)_\n${m.goals.map((g) => `  - ${g}`).join('\n')}`;
}

export function formatAnalysisHuman(a: DevpostAnalysis): string {
  const L: string[] = [];
  L.push(`# Devpost Intelligence — ${a.meta.analysisId}`);
  L.push('');
  L.push(`> Source: ${a.meta.source}`);
  L.push(`> Confidence: ${a.meta.confidence} | Seed: ${a.meta.seed} | Difficulty: ${a.difficulty} (${a.difficultyScore}/10)`);
  L.push('');

  L.push('## 1. Project Overview');
  L.push(a.projectOverview);
  L.push('');

  L.push('## 2. Recommended Technology Stack');
  L.push(a.technologyStack.map((s) => `- ${s}`).join('\n'));
  L.push('');

  L.push('## 3. Sponsor APIs');
  L.push(a.sponsorAPIs.length > 0 ? a.sponsorAPIs.map(sponsorLine).join('\n') : '_None detected — build a self-contained demo._');
  L.push('');

  L.push('## 4. Required Integrations');
  L.push(a.requiredIntegrations.map((r) => `- ${r}`).join('\n'));
  L.push('');

  L.push(`## 5. Difficulty Estimate — ${a.difficulty} (${a.difficultyScore}/10)`);
  L.push(a.complexityEstimate);
  L.push('');

  L.push('## 6. Expected Judging Priorities');
  L.push(a.judgingPriorities.length > 0 ? a.judgingPriorities.map(criterionLine).join('\n') : '_No explicit criteria extracted; infer from the brief._');
  L.push('');

  L.push('## 7. Winning Strategy');
  L.push(a.winningStrategy);
  L.push('');

  L.push('## 8. Feature Recommendations');
  L.push(a.featureRecommendations.map(featureLine).join('\n'));
  L.push('');

  L.push('## 9. Timeline');
  L.push(a.timeline);
  L.push('');

  L.push('## 10. Architecture Recommendation');
  L.push('```');
  L.push(a.suggestedFolderStructure);
  L.push('```');
  L.push('');
  L.push(a.architectureRecommendation);
  L.push('');

  L.push('## 11. Risk Analysis');
  L.push(a.riskAnalysis.map(riskLine).join('\n'));
  L.push('');

  L.push('## 12. Recommended AI Models');
  L.push(a.recommendedModels.map((m) => `- ${m}`).join('\n'));
  L.push('');

  L.push('## 13. Suggested Folder Structure');
  L.push('```');
  L.push(a.suggestedFolderStructure);
  L.push('```');
  L.push('');

  L.push('## 14. Suggested Milestones');
  L.push(a.suggestedMilestones.map(milestoneLine).join('\n\n'));
  L.push('');

  L.push('## 15. Complexity Estimate');
  L.push(a.complexityEstimate);
  L.push('');

  L.push('## 16. Estimated Completion Time');
  L.push(a.estimatedCompletionTime);
  L.push('');

  L.push(`## 17. Recommended Team Size — ${a.recommendedTeamSize}`);
  L.push('');
  L.push('## 18. Scoring Opportunities');
  L.push(a.scoringOpportunities.map((s) => `- ${s}`).join('\n'));
  L.push('');

  L.push('## 19. Common Mistakes');
  L.push(a.commonMistakes.map((m) => `- ${m}`).join('\n'));
  L.push('');

  L.push('## 20. Potential Differentiators');
  L.push(a.potentialDifferentiators.map((d) => `- ${d}`).join('\n'));
  L.push('');

  return L.join('\n');
}

export function formatAnalysisJson(a: DevpostAnalysis): string {
  return JSON.stringify(a, null, 2);
}
