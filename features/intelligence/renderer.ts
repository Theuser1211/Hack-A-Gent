/**
 * Hackathon Intelligence Engine — Renderer
 * ========================================
 *
 * Renders a `HackathonIntelligence` object into three contracts:
 *   - `toJson`       — stable JSON (full object) for `--json` / web API.
 *   - `toTerminal`   — human-friendly Markdown/terminal view.
 *   - `toView`       — a focused slice for a specific command
 *                     (analyze | inspect | compare | opportunities |
 *                      sponsors | timeline | strategy), keeping each
 *                     command's output coherent and WHY-centric.
 *
 * All three are deterministic. The terminal view uses the shared
 * `cli/output.ts` helpers so it respects TTY/CI coloring.
 */

import { header, labeled, log, success, color, dim, divider } from '../../cli/output.js';
import type { IntelligenceEngineOutput } from './types.js';

export function toJson(out: IntelligenceEngineOutput): string {
  return JSON.stringify(out, null, 2);
}

/** Structured, web-UI-friendly contract (same shape as JSON minus prose). */
export function toData(out: IntelligenceEngineOutput): Record<string, unknown> {
  return out as unknown as Record<string, unknown>;
}

function recLine(r: { title: string; why: string; priority: string }): string {
  const tag = r.priority === 'must' ? color('MUST', 'red') : r.priority === 'should' ? color('SHOULD', 'yellow') : color('NICE', 'green');
  return `  [${tag}] ${r.title}\n      ↳ why: ${r.why}`;
}

function section(title: string): string {
  return `\n## ${title}`;
}

/** Full human-readable terminal report. */
export function toTerminal(out: IntelligenceEngineOutput, opts: { verbose?: boolean } = {}): string {
  const L: string[] = [];
  L.push(`# Hackathon Intelligence — ${out.analysisId}`);
  L.push('');
  L.push(`> ${out.core.projectOverview}`);
  L.push(`> confidence=${out.confidence} · seed=${out.seed} · difficulty=${out.core.difficulty} (${out.core.difficultyScore}/10)`);

  L.push(section('Competition Estimate'));
  L.push(`${out.competition.level.toUpperCase()} (${out.competition.score}/100) — ${out.competition.why}`);

  L.push(section('Probability'));
  L.push(`Completion: ${out.probability.completion}% · Competitiveness: ${out.probability.competitiveness}%`);
  L.push(out.probability.why);
  L.push('Levers: ' + out.probability.levers.map((l) => `• ${l}`).join('  '));

  L.push(section('Judges'));
  L.push(`Primary focus: ${out.judges.primaryFocus.name} — ${out.judges.primaryFocus.why}`);
  for (const c of out.judges.criteria) {
    L.push(`  • ${c.name} (${c.weight}%)${c.inferred ? ' [inferred]' : ''}: ${c.whyItMatters}`);
  }

  L.push(section('Requirements'));
  for (const h of out.requirements.hard) L.push(`  🔴 ${h.requirement} — ${h.why}`);
  for (const s of out.requirements.soft) L.push(`  🟡 ${s.requirement} — ${s.why}`);
  if (out.requirements.gaps.length) L.push('Gaps: ' + out.requirements.gaps.join('  '));

  L.push(section('Sponsors & APIs'));
  for (const s of out.sponsors) {
    L.push(`  • ${s.name} (value ${s.strategicValue}/5)${s.mustUse ? ' [MUST-USE]' : ''} — ${s.judgingImpact}`);
  }
  for (const a of out.apis) {
    L.push(`    ↳ ${a.name}: ${a.why} (effort: ${a.integrationEffort})`);
  }

  if (opts.verbose) {
    L.push(section('Winners Playbook'));
    L.push(...out.winners.playbook.map((p) => `  • ${p}`));
    L.push(section('Risk Analysis'));
    for (const r of out.core.riskAnalysis) L.push(`  [${r.severity.toUpperCase()}] ${r.category}: ${r.description} → ${r.mitigation}`);
  }

  L.push(section('Recommendations'));
  L.push('### Technology');
  L.push(out.recommendTechnology.map(recLine).join('\n'));
  L.push('### Architecture');
  L.push(out.recommendArchitecture.map(recLine).join('\n'));
  L.push('### MVP');
  L.push(out.recommendMvp.map(recLine).join('\n'));
  L.push('### Milestones');
  L.push(out.recommendMilestones.map(recLine).join('\n'));
  L.push('### Differentiators');
  L.push(out.recommendDifferentiators.map(recLine).join('\n'));

  return L.join('\n');
}

export type IntelligenceView = 'analyze' | 'inspect' | 'opportunities' | 'sponsors' | 'timeline' | 'strategy';

/** Focused slice for a command-specific view. */
export function toView(out: IntelligenceEngineOutput, view: IntelligenceView): string {
  const L: string[] = [];
  switch (view) {
    case 'analyze':
    case 'inspect':
      return toTerminal(out, { verbose: view === 'inspect' });

    case 'opportunities': {
      L.push(`# Scoring Opportunities — ${out.analysisId}`);
      L.push('');
      L.push(`Optimize the top-weighted criterion first: ${out.judges.primaryFocus.name}`);
      L.push(out.judges.primaryFocus.why);
      L.push('');
      L.push(out.core.scoringOpportunities.map((s) => `• ${s}`).join('\n'));
      L.push('');
      L.push('## Recommended MVP (where points are won)');
      L.push(out.recommendMvp.map(recLine).join('\n'));
      break;
    }

    case 'sponsors': {
      L.push(`# Sponsors & APIs — ${out.analysisId}`);
      L.push('');
      if (out.sponsors.length === 0) {
        L.push('_No sponsor APIs detected — self-differentiate on problem fit, design, and story._');
      }
      for (const s of out.sponsors) {
        L.push(`## ${s.name} (value ${s.strategicValue}/5)${s.mustUse ? ' [MUST-USE]' : ''}`);
        L.push(s.notes);
        L.push(`Judging impact: ${s.judgingImpact}`);
      }
      L.push('');
      L.push('## Integration effort');
      L.push(out.apis.map((a) => `• ${a.name}: ${a.why} (effort: ${a.integrationEffort})`).join('\n'));
      break;
    }

    case 'timeline': {
      L.push(`# Timeline & Milestones — ${out.analysisId}`);
      L.push('');
      L.push(out.core.timeline);
      L.push(`Estimated completion: ${out.core.estimatedCompletionTime}`);
      L.push(`Recommended team size: ${out.core.recommendedTeamSize}`);
      L.push(`Probability of on-time, demonstrable completion: ${out.probability.completion}%`);
      L.push('');
      L.push(out.core.suggestedMilestones.map((m) => `### ${m.name} (~${m.durationHours}h)\n${m.goals.map((g) => `  - ${g}`).join('\n')}`).join('\n\n'));
      break;
    }

    case 'strategy': {
      L.push(`# Winning Strategy — ${out.analysisId}`);
      L.push('');
      L.push(out.core.winningStrategy);
      L.push('');
      L.push(`Primary judge focus: ${out.judges.primaryFocus.name} — ${out.judges.primaryFocus.why}`);
      L.push('');
      L.push('## Why this wins');
      L.push(out.recommendDifferentiators.map(recLine).join('\n'));
      L.push('');
      L.push('## Past-winner playbook');
      L.push(out.winners.playbook.map((p) => `• ${p}`).join('\n'));
      L.push('');
      L.push(`Competition level: ${out.competition.level} (${out.competition.score}/100) — ${out.competition.why}`);
      break;
    }
  }
  return L.join('\n');
}

/** Print the focused view to the terminal using shared output helpers. */
export function printView(out: IntelligenceEngineOutput, view: IntelligenceView): void {
  header(`Hackathon Intelligence · ${view}`);
  console.log(toView(out, view));
  divider();
  labeled('confidence', out.confidence);
  labeled('difficulty', `${out.core.difficulty} (${out.core.difficultyScore}/10)`);
  labeled('competition', `${out.competition.level} (${out.competition.score}/100)`);
  labeled('completion', `${out.probability.completion}%`);
  labeled('competitiveness', `${out.probability.competitiveness}%`);
  dim(`seed=${out.seed} · analysisId=${out.analysisId}`);
}
