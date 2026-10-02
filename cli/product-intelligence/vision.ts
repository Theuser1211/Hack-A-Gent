import type { ScoredIdea } from '../ideation/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import type {
  ArchitecturePlan,
  FeasibilityAnalysis,
  JudgeSimulation,
  ProductVision,
  SponsorOpportunity,
  ViabilityAnalysis,
} from './types.js';

/**
 * Product vision document — the "what are we building and why" written
 * before a single line of code. Sections map to the product-planning brief:
 * vision, target user, core journey, MVP scope, wow moment, differentiator,
 * architecture summary and demo strategy.
 */
export function generateVision(
  idea: ScoredIdea,
  analysis: CompetitionAnalysis,
  viability: ViabilityAnalysis,
  feasibility: FeasibilityAnalysis,
  judgeSim: JudgeSimulation,
  sponsorOpportunities: SponsorOpportunity[],
  architecture: ArchitecturePlan,
): ProductVision {
  const theme = analysis.challenge?.theme ?? 'technology';
  const shortProblem = shortLine(idea.line);
  const mustApi = sponsorOpportunities.find((s) => s.strategicValue === 'must_use');

  const visionStatement = `${idea.brandName} is ${idea.line} — built so ${idea.user} no longer has to ${problemVerb(idea.line)}.`;
  const oneLiner = `${idea.brandName} — ${idea.line}.`;
  const tagline = `${idea.title}: ${shortProblem}`;

  const coreUserJourney = [
    `Open ${idea.brandName} — one screen, no setup, the ${idea.domain} context already loaded`,
    `${idea.user} trigger the core mechanic with a single action (${shortProblem})`,
    `Watch the ${idea.domain} output appear live — the scorecard, match, or plan`,
    `Refine it: adjust one input and see the result update in place`,
    `Leave with the artifact — the shareable moment that doubles as the demo close`,
  ];

  const mvpScope = [
    ...idea.keyFeatures.slice(0, 3),
    'One polished, scripted live path with seed data',
    'Graceful empty/loading/error states for every screen',
    'Deployed demo URL reachable from the judging room',
  ];

  const topCriterion = judgeSim.topCriterion;
  const differentiator = `${idea.title} is not another ${idea.domain} dashboard — it turns "${shortProblem}" into a live, demo-able moment and leads with the criterion judges weight most (${topCriterion}).`;

  const demoStrategy = [
    `Open on the wow moment: ${idea.wowMoment}.`,
    `(0-10s) Name the problem in one sentence: "${shortProblem}"`,
    `(10-30s) Show the single-screen UI doing the core mechanic live`,
    `(30-50s) One adversarial demo — throw an edge case at it and let it handle it`,
    mustApi
      ? `(50-60s) Close on the ${mustApi.name} integration working on stage`
      : '(50-60s) Close by quantifying the outcome in one number',
    'Recorded fallback ready in case the network or a dependency fails on stage',
  ].join(' ');

  const risks: Array<{ risk: string; mitigation: string }> = [];
  if (feasibility.estimateHours > 10) {
    risks.push({ risk: 'Scope outgrows the build window', mitigation: 'Ship the single-user slice first; add depth only after the demo path works' });
  }
  if (feasibility.dataComplexity < 6) {
    risks.push({ risk: 'Demo depends on live data', mitigation: 'Bake in believable seed data so the pitch never waits on a feed' });
  }
  if (mustApi) {
    risks.push({ risk: `${mustApi.name} integration fails on stage`, mitigation: 'Integrate and verify in hour one; keep a recorded fallback clip' });
  }
  risks.push({ risk: 'Demo depends on a live network', mitigation: 'Pre-record a 60s walkthrough as insurance' });

  return {
    visionStatement,
    oneLiner,
    tagline,
    targetUser: idea.user,
    problem: `Today ${idea.user} ${problemVerb(idea.line)} — ${shortProblem}. The workaround is slow, manual, or just doesn't exist.`,
    whyNow: whyNow(theme),
    coreUserJourney,
    mvpScope,
    wowMoment: idea.wowMoment,
    differentiator,
    architectureSummary: architecture.summary,
    demoStrategy,
    successMetrics: [
      'Core loop completed live in the demo, end to end',
      'Deployed URL loads in under a second in the judging room',
      mustApi ? `${mustApi.name} working on stage` : 'No external dependency blocks the demo',
      'One-sentence answer to "who is this for?"',
    ],
    risks,
  };
}

function shortLine(line: string): string {
  const cut = line.slice(0, 100);
  const idx = cut.lastIndexOf(' ');
  const base = idx > 40 ? cut.slice(0, idx) : cut;
  return line.length > 100 ? `${base}…` : base;
}

function problemVerb(line: string): string {
  const l = line.toLowerCase();
  if (/(match|find|track|catch|sort|schedule|plan|save|share|translate|translate|digest|turns)/.test(l)) {
    return 'keep track of it manually';
  }
  if (/(translate|re-?explain|rewrite|read)/.test(l)) return 'decipher it alone';
  if (/(answer|question|coach|grill|practice)/.test(l)) return 'prepare alone';
  return 'do it by hand';
}

function whyNow(theme: string): string {
  const t = theme.toLowerCase();
  if (/(ai|ml|llm|intelligence)/.test(t)) {
    return 'LLM APIs just crossed the quality/price point where this mechanic is practical for a weekend build — and judges are explicitly rewarding applied AI this season.';
  }
  if (/(data|climate|health|financ)/.test(t)) {
    return 'The underlying data and free tiers (maps, health, payments, open data) only recently became cheap and accessible enough for a two-day team to assemble.';
  }
  return 'The tools to build this (hosted backends, AI, free API tiers) are now cheap enough that a two-day team can ship it — and that is exactly what judges are looking for.';
}
