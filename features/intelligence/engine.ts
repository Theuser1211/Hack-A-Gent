/**
 * Hackathon Intelligence Engine — Core
 * ====================================
 *
 * Turns a Devpost URL / HTML file / raw text into a `HackathonIntelligence`
 * object. It reuses the existing deterministic analyzer (`analyzeDevpost`)
 * and parser (`extractDevpostData` / `fetchDevpostHtml`) and layers the
 * additional dimensions the brief requires:
 *
 *   - estimate competition  (competition)
 *   - estimate probability of completion / competitiveness (probability)
 *   - analyze judges        (judges)
 *   - analyze requirements  (requirements)
 *   - analyze winners       (winners)
 *   - analyze APIs          (apis)
 *   - analyze sponsors      (sponsors)
 *   - recommend technology / architecture / milestones / MVP / differentiators
 *
 * Every recommendation carries a `why`. The whole pipeline is deterministic
 * (seeded) and never requires an LLM; an optional hook may enrich text.
 */

import { getSeededRandom, createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import {
  fetchDevpostHtml,
  extractDevpostData,
  assertSafeDevpostUrl,
  normalizeWeights,
} from '../analyze/parser.js';
import { analyzeDevpost, type AnalyzerContext } from '../analyze/analyzer.js';
import type { DevpostAnalysis, JudgingCriterion, SponsorAPI, ParsedDevpost, Milestone } from '../analyze/types.js';
import type {
  IntelligenceEngineOutput,
  IntelligenceInput,
  CompetitionEstimate,
  ProbabilityEstimate,
  JudgesAnalysis,
  RequirementsAnalysis,
  WinnersAnalysis,
  ApiBreakdown,
  SponsorBreakdown,
  ExplainedRecommendation,
} from './types.js';

const ALLOWED_HOSTS = ['devpost.com', 'www.devpost.com'];

function isAllowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.includes(h) || h.endsWith('.devpost.com');
}

/** Resolve the input into HTML (network, local file, or inline text). */
async function resolveHtml(input: IntelligenceInput): Promise<{ html: string; source: string }> {
  if (input.htmlOverride !== undefined) {
    return { html: input.htmlOverride, source: input.source };
  }
  const src = input.source.trim();
  if (src.startsWith('http://') || src.startsWith('https://')) {
    assertSafeDevpostUrl(src); // SSRF guard (throws on non-Devpost host)
    const html = await fetchDevpostHtml(src);
    return { html, source: src };
  }
  // Local file path?
  try {
    const { existsSync, readFileSync } = await import('node:fs');
    if (existsSync(src)) {
      return { html: readFileSync(src, 'utf-8'), source: src };
    }
  } catch {
    /* fall through to raw text */
  }
  // Raw text spec — wrap so the existing parser has something to chew on.
  return { html: `<title>${src.slice(0, 80)}</title><meta property="og:description" content="${src.slice(0, 400)}">`, source: 'text' };
}

function estimateCompetition(d: DevpostAnalysis, participants: number): CompetitionEstimate {
  // Signals derived from structure.
  const signals: string[] = [];
  let score = 20;

  if (participants >= 2000) {
    score += 35;
    signals.push(`Large field (≈${participants} participants).`);
  } else if (participants >= 500) {
    score += 22;
    signals.push(`Mid-size field (≈${participants} participants).`);
  } else if (participants >= 100) {
    score += 12;
    signals.push(`Small field (≈${participants} participants).`);
  } else {
    signals.push('Field size unknown — assume moderate.');
  }

  const sponsorCount = d.sponsorAPIs.length;
  if (sponsorCount >= 3) {
    score += 15;
    signals.push(`${sponsorCount} sponsor APIs ⇒ many teams chasing the same integrations.`);
  } else if (sponsorCount > 0) {
    score += 7;
    signals.push(`${sponsorCount} sponsor API(s) create a shared differentiator race.`);
  }

  if (d.judgingPriorities.some((c) => /ai|ml|innovation/i.test(c.name))) {
    score += 10;
    signals.push('AI/innovation axes attract the highest volume of entries.');
  }

  const level: CompetitionEstimate['level'] =
    score >= 75 ? 'fierce' : score >= 55 ? 'high' : score >= 35 ? 'moderate' : 'low';

  return {
    level,
    score: Math.max(0, Math.min(100, score)),
    why: `Competition is ${level} because ${signals.join(' ')} Differentiate on execution + story, not just on using a sponsor API.`,
    signals,
  };
}

function estimateProbability(
  d: DevpostAnalysis,
  competition: CompetitionEstimate,
): ProbabilityEstimate {
  // Completion: start high, subtract for difficulty/integration load.
  let completion = 88;
  const levers: string[] = [];

  completion -= (d.difficultyScore - 2) * 5; // 2..10 → 0..-40
  if (d.sponsorAPIs.length >= 2) {
    completion -= 8;
    levers.push('Wire only ONE must-use sponsor API end-to-end; stub the rest.');
  }
  if (d.difficultyScore >= 7) {
    levers.push('Cut scope to a thin vertical slice that demos within the first 4 hours.');
  }
  levers.push('Deploy from commit #1 so submission is never blocked by infra.');
  levers.push('Keep a recorded fallback demo for when live APIs rate-limit.');

  // Competitiveness: completion is necessary but not sufficient.
  const competitiveness = Math.max(
    5,
    Math.min(95, Math.round(completion - competition.score * 0.35)),
  );

  return {
    completion: Math.max(10, Math.min(100, Math.round(completion))),
    competitiveness,
    why: `Completion is driven by difficulty (${d.difficultyScore}/10) and integration load; competitiveness is further discounted by field strength (${competition.level}). The biggest levers are scope discipline and a reproducible demo.`,
    levers,
  };
}

function analyzeJudges(d: DevpostAnalysis): JudgesAnalysis {
  const criteria = d.judgingPriorities.map((c) => ({
    ...c,
    whyItMatters:
      c.weight >= 30
        ? `Highest-weighted axis (${c.weight}%) — judges will consciously score this first.`
        : c.weight >= 15
          ? `Material axis (${c.weight}%) — a strong showing here moves the total noticeably.`
          : `Secondary axis (${c.weight}%) — table stakes; avoid losing points here, don't over-invest.`,
  }));

  const top = criteria[0];
  const primaryFocus = {
    name: top?.name ?? 'overall quality',
    why: top
      ? `Optimizing "${top.name}" (${top.weight}%) yields the largest expected point gain per unit of effort.`
      : 'No explicit criteria extracted; optimize for a polished, demonstrable end-to-end experience.',
  };

  const antiPatterns = [
    'Spreading effort evenly across all axes instead of maxing the top-weighted one.',
    'Treating a low-weight axis as a differentiator.',
    'Assuming judges read your code — they judge the demo.',
  ];

  return { count: criteria.length, criteria, primaryFocus, antiPatterns };
}

function analyzeRequirements(d: DevpostAnalysis, html: string): RequirementsAnalysis {
  const text = html.replace(/<[^>]+>/g, ' ');
  const hard: Array<{ requirement: string; why: string }> = [];
  const soft: Array<{ requirement: string; why: string }> = [];

  if (d.sponsorAPIs.some((s) => s.mustUse)) {
    const names = d.sponsorAPIs.filter((s) => s.mustUse).map((s) => s.name).join(', ');
    hard.push({ requirement: `Use ${names}`, why: 'Sponsor APIs flagged must-use are frequently a hard judging gate; non-use risks disqualification.' });
  }
  const deployMention = /demo|live|deploy|url|website|submi/i.test(text);
  if (deployMention) {
    hard.push({ requirement: 'Ship a live, accessible demo', why: 'Submission language implies judges interact with the running product, not a slide.' });
  }
  const videoMention = /video|demo video|walkthrough/i.test(text);
  if (videoMention) {
    soft.push({ requirement: 'Record a demo video', why: 'A video is often required or strongly preferred for asynchronous judging.' });
  }
  const repoMention = /repo|github|source code|open source/i.test(text);
  if (repoMention) {
    soft.push({ requirement: 'Provide a clean, runnable repository', why: 'Judges may inspect code; a reproducible build avoids penalties.' });
  }

  const gaps: string[] = [];
  if (!deployMention) gaps.push('No explicit demo requirement detected — confirm before assuming a slide deck suffices.');
  if (d.sponsorAPIs.length === 0) gaps.push('No sponsor APIs detected — you must self-differentiate (problem fit, design, story).');

  return {
    hard,
    soft,
    gaps,
    deliverables: [...hard.map((h) => h.requirement), ...soft.map((s) => s.requirement)],
    submissionDeadline: d.meta && (text.match(/(?:submission|due|deadline)[^.]*?(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/i)?.[1] ?? null),
  };
}

/** Past-winner patterns are heuristic (no live winner corpus is fetched). */
function analyzeWinners(d: DevpostAnalysis): WinnersAnalysis {
  const commonTraits: Array<{ trait: string; why: string }> = [
    { trait: 'A single, obvious "wow" moment in the demo', why: 'Judges remember one striking moment during deliberation; breadth is forgotten.' },
    { trait: 'Live, reproducible demo (not a video alone)', why: 'Hands-on interaction builds confidence the thing actually works.' },
    { trait: 'Clear problem-first narrative', why: 'A story frames every feature as necessary, lifting perceived impact.' },
  ];
  if (d.sponsorAPIs.some((s) => s.category === 'ai')) {
    commonTraits.push({ trait: 'Legible AI (show input + output)', why: 'AI projects win when the magic is explainable to non-expert judges.' });
  }

  const losingTraits = [
    'Ambitious scope that never reaches a working demo.',
    'Six sponsor APIs wired, none demonstrable.',
    'Polished landing page with no functioning core.',
  ];

  const playbook = [
    'Pick ONE must-use sponsor API and showcase it end-to-end.',
    'Build the thinnest vertical slice that demos the top-weighted criterion.',
    'Rehearse a 60-second "wow" and a 30-second fallback.',
    'Submit 1–2 hours early with a seed script judges can re-run.',
  ];

  return {
    commonTraits,
    losingTraits,
    playbook,
    confidence: 'low',
  };
}

function breakdownApis(apis: SponsorAPI[]): ApiBreakdown[] {
  return apis.map((s) => {
    const effort: ApiBreakdown['integrationEffort'] =
      s.category === 'ai' || s.category === 'ml' ? 'high' : s.category === 'data' ? 'medium' : 'low';
    return {
      name: s.name,
      category: s.category,
      strategicValue: s.strategicValue,
      mustUse: s.mustUse,
      why: s.mustUse
        ? `Marked must-use — skip it and you risk failing a hard judging gate. ${s.notes}`
        : `Value ${s.strategicValue}/5. Use it only if it maps directly to a top-weighted criterion; otherwise it is a distraction.`,
      integrationEffort: effort,
    };
  });
}

function breakdownSponsors(apis: SponsorAPI[]): SponsorBreakdown[] {
  return apis.map((s) => ({
    name: s.name,
    strategicValue: s.strategicValue,
    mustUse: s.mustUse,
    notes: s.notes,
    judgingImpact: s.mustUse
      ? 'Likely a hard requirement — directly tied to sponsor-prize judging.'
      : `Contributes to sponsor alignment; strongest when it serves the top-weighted criterion.`,
  }));
}

function recommendTechnology(d: DevpostAnalysis): ExplainedRecommendation[] {
  return d.technologyStack.map((tech, i) => ({
    title: tech,
    priority: i === 0 ? 'must' : 'should',
    confidence: 0.8 - i * 0.05,
    why:
      i === 0
        ? 'Next.js is the default deploy target Hack-A-Gent optimizes for; it maximizes demo accessibility and zero-config hosting on Vercel.'
        : `Selected because it directly serves a detected need (sponsor API, data layer, or AI orchestration) in the parsed brief.`,
  }));
}

function recommendArchitecture(d: DevpostAnalysis): ExplainedRecommendation[] {
  return [
    {
      title: 'Monolithic Next.js App Router, integration clients isolated in lib/',
      priority: 'must',
      confidence: 0.85,
      why: 'Isolating LLM/sponsor/DB clients keeps the demo surface decoupled from integrations, so a broken API never takes down the hero page.',
    },
    {
      title: 'Deploy from commit #1 to Vercel',
      priority: 'must',
      confidence: 0.9,
      why: 'Submission is never blocked by last-minute infra; preview URLs enable live judging.',
    },
    {
      title: 'Seed script for reproducible demo data',
      priority: 'should',
      confidence: 0.8,
      why: 'Judges can re-run the demo themselves, removing the "works on my machine" risk.',
    },
  ];
}

function recommendMilestones(d: DevpostAnalysis): ExplainedRecommendation[] {
  return d.suggestedMilestones.map((m: Milestone, i: number) => ({
    title: m.name,
    priority: i === 0 ? 'must' : 'should',
    why: `≈${m.durationHours}h — goals: ${m.goals.join('; ')}. Front-loading deploy + a vertical slice de-risks the timeline.`,
  }));
}

function recommendMvp(d: DevpostAnalysis): ExplainedRecommendation[] {
  const top = d.judgingPriorities[0];
  return [
    {
      title: 'One end-to-end happy path hitting the top-weighted criterion',
      priority: 'must',
      confidence: 0.85,
      why: `The top axis (${top?.name ?? 'overall quality'}, ${top ? top.weight + '%' : 'unknown'}) is where points are won; the MVP must demonstrate it live.`,
    },
    {
      title: `Showcase ${d.sponsorAPIs[0]?.name ?? 'the headline sponsor API'} end-to-end`,
      priority: d.sponsorAPIs[0]?.mustUse ? 'must' : 'should',
      confidence: 0.8,
      why: 'A genuine integration beats a mocked one for sponsor-aligned judging.',
    },
    {
      title: 'Reproducible demo (seed script) + fallback recording',
      priority: 'should',
      confidence: 0.75,
      why: 'Guarantees a working demo even if live APIs rate-limit during judging.',
    },
  ];
}

function recommendDifferentiators(d: DevpostAnalysis): ExplainedRecommendation[] {
  return d.potentialDifferentiators.map((diff, i) => ({
    title: diff,
    priority: i === 0 ? 'must' : 'should',
    why: 'Differentiators are what judges recall in deliberation; the first one is the rehearsed "wow".',
  }));
}

function estimateParticipants(d: ParsedDevpost): number {
  // No live participant count is fetched; infer a bracket from signals.
  let p = 150;
  if (d.sponsorAPIs.some((s) => /openai|anthropic|google|microsoft|aws/i.test(s.name))) p += 600;
  if (d.themes.some((t) => /ai|ml/i.test(t))) p += 400;
  if (d.themes.length > 3) p += 200;
  return p;
}

/**
 * Run the full intelligence pipeline. Deterministic for a given input + seed.
 */
export async function runIntelligence(input: IntelligenceInput): Promise<IntelligenceEngineOutput> {
  const seed = input.seed ?? 42;
  const rng = getSeededRandom(seed);
  void rng; // reserved for stable tie-breaks

  const { html, source } = await resolveHtml(input);
  const parsed = extractDevpostData(html, source, seed);
  const core: DevpostAnalysis = analyzeDevpost(parsed, { seed, llmCall: input.llmCall } as AnalyzerContext);

  const participants = estimateParticipants(parsed);
  const competition = estimateCompetition(core, participants);
  const probability = estimateProbability(core, competition);
  const judges = analyzeJudges(core);
  const requirements = analyzeRequirements(core, html);
  const winners = analyzeWinners(core);
  const apis = breakdownApis(core.sponsorAPIs);
  const sponsors = breakdownSponsors(core.sponsorAPIs);

  const analysisId = createDeterministicUuid(seed, parsed.title.length + source.length).slice(0, 12);

  return {
    analysisId,
    source,
    seed,
    confidence: core.meta.confidence,
    generatedAt: new Date(1700000000000 + seed * 1000).toISOString(),
    core,
    competition,
    probability,
    judges,
    requirements,
    winners,
    apis,
    sponsors,
    recommendTechnology: recommendTechnology(core),
    recommendArchitecture: recommendArchitecture(core),
    recommendMilestones: recommendMilestones(core),
    recommendMvp: recommendMvp(core),
    recommendDifferentiators: recommendDifferentiators(core),
  };
}

/** Compare two analyses and return a structured diff (used by `hag compare`). */
export function compareIntelligence(
  a: IntelligenceEngineOutput,
  b: IntelligenceEngineOutput,
): {
  labels: { a: string; b: string };
  difficulty: { a: number; b: number; delta: number };
  competition: { a: number; b: number; delta: number };
  probability: { a: number; b: number; delta: number };
  sponsorOverlap: string[];
  uniqueSponsorsA: string[];
  uniqueSponsorsB: string[];
  topCriterionA: string;
  topCriterionB: string;
  notes: string[];
} {
  const sa = new Set(a.sponsors.map((s) => s.name));
  const sb = new Set(b.sponsors.map((s) => s.name));
  const overlap = [...sa].filter((s) => sb.has(s));
  const uniqueA = [...sa].filter((s) => !sb.has(s));
  const uniqueB = [...sb].filter((s) => !sa.has(s));

  const notes: string[] = [];
  notes.push(
    a.competition.score > b.competition.score
      ? `A is the fiercer field (${a.competition.score} vs ${b.competition.score}).`
      : `B is the fiercer field (${b.competition.score} vs ${a.competition.score}).`,
  );
  if (overlap.length > 0) notes.push(`Shared sponsors: ${overlap.join(', ')} — same API skills transfer.`);
  if (uniqueA.length > 0) notes.push(`Only in A: ${uniqueA.join(', ')}.`);
  if (uniqueB.length > 0) notes.push(`Only in B: ${uniqueB.join(', ')}.`);

  return {
    labels: { a: a.core.projectOverview.slice(0, 40), b: b.core.projectOverview.slice(0, 40) },
    difficulty: { a: a.core.difficultyScore, b: b.core.difficultyScore, delta: a.core.difficultyScore - b.core.difficultyScore },
    competition: { a: a.competition.score, b: b.competition.score, delta: a.competition.score - b.competition.score },
    probability: {
      a: a.probability.competitiveness,
      b: b.probability.competitiveness,
      delta: a.probability.competitiveness - b.probability.competitiveness,
    },
    sponsorOverlap: overlap,
    uniqueSponsorsA: uniqueA,
    uniqueSponsorsB: uniqueB,
    topCriterionA: a.judges.primaryFocus.name,
    topCriterionB: b.judges.primaryFocus.name,
    notes,
  };
}

/** Re-export for callers that only need the underlying weights helper. */
export { normalizeWeights };
export type { IntelligenceInput };
