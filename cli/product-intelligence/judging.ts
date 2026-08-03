import type { CompetitionAnalysis } from '../pipeline/types.js';

import type { FocusDimension, JudgingPriority, SponsorOpportunity } from './types.js';

/** Map a judging criterion name to the dimension it rewards. */
export function criterionFocus(name: string): FocusDimension {
  const lc = name.toLowerCase();
  if (/(innovation|creativity|originality|novel|wow|disruptive|memorable)/.test(lc)) return 'wow';
  if (/(technical|complexity|depth|engineering|algorithm|sophistication|implement)/.test(lc)) return 'technical';
  if (/(impact|social|benefit|community|reach|outcome|value|real.?world)/.test(lc)) return 'impact';
  if (/(design|ux|usability|presentation|polish|experience|aesthetic)/.test(lc)) return 'design';
  if (/(feasibility|practical|viable|complete)/.test(lc)) return 'feasibility';
  if (/(functionality|quality|robust|reliability)/.test(lc)) return 'completeness';
  return 'wow';
}

const APPROACH_BY_FOCUS: Record<FocusDimension, string> = {
  wow: 'Lead the demo with this — open on the moment that makes judges say "wait, how?"',
  technical: 'Show the hard part first — surface the architecture and the one non-trivial problem solved',
  impact: 'Quantify the outcome — put the number of people affected on the screen in the first 10 seconds',
  design: 'Make the first screen pixel-perfect — judges decide polish in seconds',
  feasibility: 'Prove it runs — a live, deployed demo beats a grand idea that crashes',
  completeness: 'Finish the loop end-to-end — no dead buttons, no empty states in the walkthrough',
};

export function extractJudgingPriorities(analysis: CompetitionAnalysis): JudgingPriority[] {
  const criteria = analysis.judgingCriteria ?? [];
  return criteria
    .slice()
    .sort((a, b) => b.weight - a.weight)
    .map((c) => ({
      name: c.name,
      weight: c.weight,
      weightRaw: c.weightRaw ?? `${c.weight}%`,
      focus: criterionFocus(c.name),
      approach: APPROACH_BY_FOCUS[criterionFocus(c.name)],
    }));
}

/** Map a sponsor API to the opportunity it unlocks and its integration risk. */
export function extractSponsorOpportunities(analysis: CompetitionAnalysis): SponsorOpportunity[] {
  const apis = analysis.sponsorAPIs ?? [];
  return apis.map((api) => ({
    name: api.name,
    provider: api.provider,
    strategicValue: api.strategicValue,
    description: api.description,
    opportunity: sponsorOpportunity(api.name, api.description),
    risk: sponsorRisk(api.name, api.strategicValue),
  }));
}

function sponsorOpportunity(name: string, description: string): string {
  const d = description?.trim() ?? '';
  if (d) return `Unlocks ${name}: ${d}`;
  return `Unlocks ${name} — sponsor-prize eligibility plus a headline integration for the demo`;
}

function sponsorRisk(name: string, strategicValue: string): string {
  if (strategicValue === 'must_use') {
    return `Required by the rules — integrate and verify in the first hour; prepare a recorded fallback`;
  }
  const lower = name.toLowerCase();
  if (/(auth|payment|stripe|plaid)/.test(lower)) return 'Needs sandbox keys and careful error handling — budget extra setup time';
  if (/(vision|speech|voice|whisper)/.test(lower)) return 'Model latency/rate limits can hurt the live demo — cache results';
  return 'Low integration risk — wrap it behind a thin adapter';
}
