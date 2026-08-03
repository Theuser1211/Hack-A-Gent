import { hashSeed, seededInt } from '../ideation/rng.js';
import type { ScoredIdea } from '../ideation/types.js';

import type {
  FeasibilityAnalysis,
  JudgeCriterionScore,
  JudgeSimulation,
  JudgingPriority,
  SimulatedJudge,
  ViabilityAnalysis,
} from './types.js';

interface JudgeLens {
  name: string;
  lens: string;
  /** Amplifiers applied to each focus dimension (default 1.0). */
  amps: Partial<Record<JudgeCriterionFocus, number>>;
  jitter: number;
}

type JudgeCriterionFocus =
  | 'wow'
  | 'technical'
  | 'impact'
  | 'design'
  | 'feasibility'
  | 'completeness';

const JUDGES: JudgeLens[] = [
  {
    name: 'The Investor',
    lens: 'Innovation + business upside',
    amps: { wow: 1.3, impact: 1.1 },
    jitter: 1,
  },
  {
    name: 'The Engineer',
    lens: 'Technical depth + buildability',
    amps: { technical: 1.3, feasibility: 1.2 },
    jitter: 1,
  },
  {
    name: 'The User',
    lens: 'Demo appeal + real impact',
    amps: { impact: 1.2, design: 1.1, wow: 1.1 },
    jitter: 1,
  },
];

const NOTE_BY_FOCUS: Record<JudgeCriterionFocus, string> = {
  wow: 'Feels novel — the mechanic is not the usual chat/dashboard pattern',
  technical: 'Has a real technical center of gravity, not just CRUD',
  impact: 'Names a concrete user with a felt problem — demo can show the outcome',
  design: 'First screen can carry the polish; interactions are demo-able',
  feasibility: 'Core loop is shippable inside the window with a fallback path',
  completeness: 'End-to-end flow fits in scope without dead ends',
};

/**
 * Score a criterion from the idea's dimension scores through a judge's lens.
 * Relevance to the challenge (`themeFit`) is blended into every criterion so a
 * brilliant idea for the wrong problem cannot beat a good idea for this one.
 */
function scoreCriterion(
  focus: JudgeCriterionFocus,
  idea: ScoredIdea,
  viability: ViabilityAnalysis,
  feasibility: FeasibilityAnalysis,
  amp: number,
  seed: number,
): number {
  const relevance = idea.themeFit * 0.2;
  const base =
    focus === 'wow' ? idea.novelty * 0.5 + idea.demoAppeal * 0.3 + relevance :
    focus === 'technical' ? idea.technicalDepth * 0.6 + feasibility.buildability * 0.2 + relevance :
    focus === 'impact' ? viability.urgency * 0.4 + idea.demoAppeal * 0.2 + idea.novelty * 0.1 + relevance :
    focus === 'design' ? idea.demoAppeal * 0.5 + idea.feasibility * 0.2 + relevance :
    focus === 'feasibility' ? feasibility.buildability * 0.5 + feasibility.scopeRisk * 0.3 + relevance :
    feasibility.buildability * 0.4 + feasibility.scopeRisk * 0.2 + feasibility.dataComplexity * 0.2 + relevance;
  return clamp10(Math.round(base * amp + seededInt(seed, -1, 1)));
}

/**
 * Simulate a three-judge panel scoring the idea against the hackathon's real
 * judging criteria. Deterministic; jitter is small so the ranking is driven by
 * the idea's actual dimensions.
 */
/** Fallback criteria when the hackathon lists none — the panel still evaluates. */
const DEFAULT_PRIORITIES: JudgingPriority[] = [
  { name: 'Innovation', weight: 40, weightRaw: '40%', focus: 'wow', approach: 'Lead with the novel mechanic' },
  { name: 'Technical Depth', weight: 30, weightRaw: '30%', focus: 'technical', approach: 'Show the hard part' },
  { name: 'Impact', weight: 30, weightRaw: '30%', focus: 'impact', approach: 'Quantify the outcome' },
];

export function simulateJudges(
  idea: ScoredIdea,
  priorities: JudgingPriority[],
  viability: ViabilityAnalysis,
  feasibility: FeasibilityAnalysis,
  seed = 0,
): JudgeSimulation {
  const criteria = priorities.length > 0 ? priorities : DEFAULT_PRIORITIES;
  const focusMap = new Map<JudgeCriterionFocus, string>([
    ['wow', 'wow'],
    ['technical', 'technical'],
    ['impact', 'impact'],
    ['design', 'design'],
    ['feasibility', 'feasibility'],
    ['completeness', 'completeness'],
  ]);

  const judges: SimulatedJudge[] = JUDGES.map((lens) => {
    const scores: JudgeCriterionScore[] = criteria.map((p, i) => {
      const focus = (focusMap.get(p.focus as JudgeCriterionFocus) ?? 'wow') as JudgeCriterionFocus;
      const amp = lens.amps[focus] ?? 1;
      const score = scoreCriterion(focus, idea, viability, feasibility, amp, hashSeed([idea.id, lens.name, p.name, seed, i]));
      return {
        criterion: p.name,
        weight: p.weight,
        score,
        note: NOTE_BY_FOCUS[focus],
      };
    });
    const overall = weightedOverall(scores);
    const best = [...scores].sort((a, b) => b.score - a.score)[0];
    return {
      name: lens.name,
      lens: lens.lens,
      scores,
      overall,
      verdict: `${lens.name} sees a strong ${best?.criterion.toLowerCase() ?? 'core'} story (${best?.score}/10) and scores the concept ${overall}/100.`,
    };
  });

  // Panel average per criterion → identify the strongest/weakest criteria.
  const perCriterion = criteria.map((p, i) => {
    const avg = Math.round(judges.reduce((s, j) => s + j.scores[i]!.score, 0) / judges.length);
    return { name: p.name, weight: p.weight, score: avg };
  });
  const sorted = [...perCriterion].sort((a, b) => b.score - a.score);
  const top = sorted[0]!;
  const weak = sorted[sorted.length - 1]!;

  const total = Math.round(judges.reduce((s, j) => s + j.overall, 0) / judges.length);

  return {
    judges,
    total,
    topCriterion: top.name,
    weakestCriterion: weak.name,
    summary: `Panel verdict: ${total}/100. Judges reward the ${top.name.toLowerCase()} angle most and would probe the ${weak.name.toLowerCase()} angle in Q&A.`,
  };
}

function weightedOverall(scores: JudgeCriterionScore[]): number {
  const totalWeight = scores.reduce((s, c) => s + c.weight, 0) || 1;
  const weighted = scores.reduce((s, c) => s + c.score * c.weight, 0);
  return Math.round((weighted / totalWeight) * 10);
}

function clamp10(n: number): number {
  return Math.max(1, Math.min(10, n));
}
