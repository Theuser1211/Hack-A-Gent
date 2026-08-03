import { brainstormIdeas } from '../ideation/idea-engine.js';
import type { IdeationResult, ScoredIdea } from '../ideation/types.js';
import type { InterviewResult } from '../interview/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import { generateArchitecture } from './architecture.js';
import { analyzeFeasibility } from './feasibility.js';
import { simulateJudges } from './judge-sim.js';
import { extractJudgingPriorities, extractSponsorOpportunities } from './judging.js';
import type { EvaluatedIdea, ProductIntelligenceResult } from './types.js';
import { analyzeViability } from './viability.js';
import { generateVision } from './vision.js';

// Weighting used to combine the four evaluation signals into the final score.
const FINAL_WEIGHTS = { idea: 0.4, judge: 0.25, viability: 0.2, feasibility: 0.15 } as const;

/**
 * The full "think like a hackathon winner" pipeline, run before code
 * generation:
 *
 *   Understand Challenge → Extract Judging Priorities → Extract Sponsor
 *   Opportunities → Brainstorm 20 ideas → Self-evaluate → Expand top 5 →
 *   Business viability → Technical feasibility → Judge simulation → Select
 *   winner → Product Vision → Architecture Plan
 *
 * Deterministic for the same analysis + interview result + seed.
 */
export function runProductIntelligence(
  analysis: CompetitionAnalysis,
  result?: InterviewResult | null,
  seed = 0,
): ProductIntelligenceResult {
  const judgingPriorities = extractJudgingPriorities(analysis);
  const sponsorOpportunities = extractSponsorOpportunities(analysis);
  const budget = result?.optimizationBudget ?? 'balanced';

  // Steps 4-6: brainstorm 20, self-evaluate, expand the top 5.
  const brainstorm: IdeationResult = brainstormIdeas(analysis, result, seed);

  // Steps 7-9: deepen every shortlisted idea with viability, feasibility and a
  // simulated judge panel before picking a winner.
  const evaluatedShortlist: EvaluatedIdea[] = brainstorm.shortlist
    .map((idea) => {
      const viability = analyzeViability(idea, analysis, seed);
      const feasibilityAnalysis = analyzeFeasibility(idea, analysis, budget, seed);
      const judgeSimulation = simulateJudges(idea, judgingPriorities, viability, feasibilityAnalysis, seed);
      const finalScore = combineScores(idea.totalScore, judgeSimulation.total, viability.total, feasibilityAnalysis.total);
      return {
        ...idea,
        viability,
        feasibilityAnalysis,
        judgeSimulation,
        selfCritique: buildSelfCritique(idea, feasibilityAnalysis, judgeSimulation),
        finalScore,
      };
    })
    .sort((a, b) => b.finalScore - a.finalScore || b.totalScore - a.totalScore);

  const winner = evaluatedShortlist[0]!;

  // Steps 11-12: product vision + architecture plan for the winner.
  const architecture = generateArchitecture(winner, analysis, sponsorOpportunities);
  const vision = generateVision(winner, analysis, winner.viability, winner.feasibilityAnalysis, winner.judgeSimulation, sponsorOpportunities, architecture);

  return {
    challengeTitle: analysis.challenge?.title ?? 'Untitled hackathon',
    theme: analysis.challenge?.theme ?? 'technology',
    judgingPriorities,
    sponsorOpportunities,
    brainstorm,
    evaluatedShortlist,
    winner,
    vision,
    architecture,
    selectionRationale: buildRationale(winner, evaluatedShortlist),
  };
}

function combineScores(idea: number, judge: number, viability: number, feasibility: number): number {
  return Math.round(
    idea * FINAL_WEIGHTS.idea + judge * FINAL_WEIGHTS.judge +
    viability * FINAL_WEIGHTS.viability + feasibility * FINAL_WEIGHTS.feasibility,
  );
}

/** The planner's honest critique of its own shortlist picks. */
function buildSelfCritique(idea: ScoredIdea, feasibility: Awaited<ReturnType<typeof analyzeFeasibility>>, judge: Awaited<ReturnType<typeof simulateJudges>>): string[] {
  const critique: string[] = [];
  if (feasibility.buildability < 7) critique.push(`Core mechanic is complex — trim to a single-user slice for the demo`);
  if (feasibility.dependencyRisk < 7) critique.push('External dependencies raise the risk of a stalled demo');
  if (feasibility.dataComplexity < 6) critique.push('Lives on live data — seed it or the pitch waits on a feed');
  if (idea.novelty < 7) critique.push('Novelty is solid but not boundary-pushing');
  critique.push(`Weakest judged angle: ${judge.weakestCriterion} — prepare a Q&A answer for it`);
  return critique;
}

function buildRationale(winner: EvaluatedIdea, shortlist: EvaluatedIdea[]): string {
  const runnerUp = shortlist[1];
  const runnerUpLine = runnerUp ? ` It edged out ${runnerUp.title} (${runnerUp.finalScore}/100).` : '';
  return (
    `${winner.title} wins the product intelligence pass with a combined score of ${winner.finalScore}/100 — ` +
    `strong idea (${winner.totalScore}/100), judge panel ${winner.judgeSimulation.total}/100, ` +
    `viability ${winner.viability.total}/100 and feasibility ${winner.feasibilityAnalysis.total}/100.` +
    runnerUpLine +
    ` The demo closes on ${winner.wowMoment}, and the ${winner.judgeSimulation.topCriterion.toLowerCase()} angle is the one judges reward most.`
  );
}
