import { hashSeed, seededInt } from '../ideation/rng.js';
import type { ScoredIdea } from '../ideation/types.js';
import type { OptimizationBudget } from '../interview/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import type { FeasibilityAnalysis } from './types.js';

const COMPLEXITY_SIGNALS = /marketplace|multi.?party|logistics|fleet|swarm|mesh|supply|inventory|scheduling|real.?time sync|live sync|two.?sided/;
const DATA_SIGNALS = /transcript|data feed|public data|api|scanner|sensor|wearable|stream|ledger|records|history|calendar|inbox|email|voice note/;
const EXTERNAL_DEP_SIGNALS = /marketplace|payment|checkout|delivery|logistics|hardware|sensor|wearable|bluetooth|scan/;

const BUDGET_HOURS: Record<OptimizationBudget, number> = {
  minimal: 6,
  balanced: 8,
  aggressive: 12,
};

/** Technical feasibility for a 24–48h hackathon window, derived from content. */
export function analyzeFeasibility(
  idea: ScoredIdea,
  analysis: CompetitionAnalysis,
  budget: OptimizationBudget = 'balanced',
  seed = 0,
): FeasibilityAnalysis {
  const base = hashSeed([idea.id, idea.title, 'feasibility', seed]);
  const line = `${idea.line} ${idea.concept}`.toLowerCase();

  const complexity = COMPLEXITY_SIGNALS.test(line);
  const needsData = DATA_SIGNALS.test(line);
  const externalDeps = EXTERNAL_DEP_SIGNALS.test(line) || (analysis.sponsorAPIs ?? []).length > 0;

  const buildability = clamp10(8 - (complexity ? 2 : 0) + seededInt(base, -1, 1));
  const dependencyRisk = clamp10(externalDeps ? 6 : 9 + seededInt(base + 1, -1, 0));
  const scopeRisk = clamp10(7 - (needsData ? 1 : 0) - (complexity ? 1 : 0) + seededInt(base + 2, -1, 1));
  const dataComplexity = needsData ? clamp10(5 + seededInt(base + 3, 0, 2)) : 9;

  const baseHours = BUDGET_HOURS[budget];
  const estimateHours = Math.max(4, baseHours + (complexity ? 2 : 0) + (needsData ? 1 : 0) + (externalDeps ? 1 : 0));

  const total = Math.round((buildability * 0.3 + dependencyRisk * 0.25 + scopeRisk * 0.25 + dataComplexity * 0.2) * 10);

  const summary =
    `${idea.title} is ${estimateHours}h of focused work in a ${budget} budget. ` +
    (complexity
      ? 'The core mechanic involves coordination across parties — trim it to a single-user slice for the demo. '
      : 'The core loop is a single-screen flow — very buildable. ') +
    (needsData ? 'It leans on live data; ship seed data so the demo never depends on a flaky feed.' : '');

  return {
    buildability,
    dependencyRisk,
    scopeRisk,
    dataComplexity,
    estimateHours,
    total,
    summary,
  };
}

function clamp10(n: number): number {
  return Math.max(1, Math.min(10, n));
}
