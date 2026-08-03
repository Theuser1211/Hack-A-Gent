import type { InterviewResult } from '../interview/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import { IDEA_DOMAINS, detectDomains, type IdeaAngle, type IdeaDomain } from './idea-library.js';
import { pickName } from './name-engine.js';
import { hashSeed, seededInt, seededShuffle } from './rng.js';
import type { IdeaDraft, IdeationResult, ScoredIdea } from './types.js';

export const IDEATION_POOL_SIZE = 20;
export const IDEATION_SHORTLIST_SIZE = 5;

interface DimensionWeights {
  novelty: number;
  feasibility: number;
  technicalDepth: number;
  demoAppeal: number;
  sponsorFit: number;
}

/** A draft with the resolved theme/adjective baked in for deterministic scoring. */
interface Draft extends IdeaDraft {
  adj: string;
  lcTheme: string;
}

/**
 * Full ideation pipeline:
 *   20 ideas → self-rank → expand top 5 → select winner → explain why it wins.
 *
 * Deterministic: same analysis + interview result (and optional seed) always
 * produce the same 20 ideas, ranking, and winner.
 */
export function brainstormIdeas(
  analysis: CompetitionAnalysis,
  result?: InterviewResult | null,
  seed = 0,
): IdeationResult {
  const theme = analysis.challenge?.theme ?? 'technology';
  const problemStatement = analysis.challenge?.problemStatement ?? '';
  const criteria = analysis.judgingCriteria ?? [];
  const topCriterion = criteria.slice().sort((a, b) => b.weight - a.weight)[0];
  const focusName = topCriterion?.name ?? 'innovation';
  const apiName = selectApiName(analysis, result);

  const domains = detectDomains(theme, problemStatement);
  const pool = buildAnglePool(domains);
  const drafts = generateDrafts(pool, theme, focusName, apiName, seed);

  const weights = dimensionWeights(criteria);
  const ranked = drafts
    .map((draft) => scoreIdea(draft, weights, apiName, seed))
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        b.novelty - a.novelty ||
        b.demoAppeal - a.demoAppeal ||
        a.title.localeCompare(b.title),
    );

  const rankedIds = ranked.map((i) => i.id);
  const shortlist = expandShortlist(ranked.slice(0, IDEATION_SHORTLIST_SIZE), criteria, apiName);
  const winner = shortlist[0]!;

  return {
    generated: ranked,
    rankedIds,
    shortlist,
    winner,
    rationale: buildRationale(winner, ranked.length, topCriterion, apiName),
  };
}

/** Backward-compatible entry: the winner's one-liner. */
export function generateProjectIdea(
  analysis: CompetitionAnalysis,
  result: InterviewResult,
): string {
  return brainstormIdeas(analysis, result).winner.oneLiner;
}

// ---------------------------------------------------------------------------
// Idea drafting
// ---------------------------------------------------------------------------

function buildAnglePool(domains: IdeaDomain[]): IdeaAngle[] {
  const fromMatched = domains.flatMap((d) => d.angles);
  if (fromMatched.length >= IDEATION_POOL_SIZE) return fromMatched;
  // Top up with the rest of the library so a narrow theme still gets 20 ideas.
  const matchedIds = new Set(domains.map((d) => d.id));
  const rest = IDEA_DOMAINS.filter((d) => !matchedIds.has(d.id)).flatMap((d) => d.angles);
  return [...fromMatched, ...rest];
}

function generateDrafts(
  pool: IdeaAngle[],
  theme: string,
  focusName: string,
  apiName: string | null,
  seed: number,
): Draft[] {
  const adj = criterionAdjective(focusName);
  const lcTheme = (theme || 'technology').toLowerCase();
  const order = seededShuffle(pool, hashSeed([theme, apiName, focusName, seed, 'drafts']));
  const chosen = order.slice(0, IDEATION_POOL_SIZE);

  return chosen.map((angle, i) => ({
    id: `idea-${String(i + 1).padStart(2, '0')}`,
    title: angle.title,
    domain: domainForAngle(angle),
    user: angle.user,
    line: angle.line,
    adj,
    lcTheme,
  }));
}

function domainForAngle(angle: IdeaAngle): string {
  for (const domain of IDEA_DOMAINS) {
    if (domain.angles.some((a) => a.title === angle.title)) return domain.id;
  }
  return 'ai';
}

// ---------------------------------------------------------------------------
// Self-ranking
// ---------------------------------------------------------------------------

function scoreIdea(draft: Draft, w: DimensionWeights, apiName: string | null, seed: number): ScoredIdea {
  const base = hashSeed([draft.id, draft.title, seed]);
  const line = draft.line;
  // Content-derived signals: an idea's own mechanic determines how novel,
  // deep, and feasible it reads. A small deterministic jitter breaks ties.
  const novelty = clamp10(6 + (NOVEL_SIGNALS.test(line) ? 2 : 0) + seededInt(base, 0, 2));
  const feasibility = clamp10(6 + (COMPLEX_SIGNALS.test(line) ? -2 : 0) + seededInt(base + 1, 0, 2));
  const technicalDepth = clamp10(5 + (DEPTH_SIGNALS.test(line) ? 3 : 0) + seededInt(base + 2, 0, 2));
  const demoAppeal = clamp10(7 + wowBoost(line) + seededInt(base + 3, 0, 2));
  const sponsorFit = computeSponsorFit(draft.domain, apiName);

  const totalScore = Math.round(
    100 *
      ((w.novelty * novelty + w.feasibility * feasibility + w.technicalDepth * technicalDepth +
        w.demoAppeal * demoAppeal + w.sponsorFit * sponsorFit) /
        10),
  );

  return {
    ...draft,
    oneLiner: buildOneLiner(draft, apiName),
    novelty,
    feasibility,
    technicalDepth,
    demoAppeal,
    sponsorFit,
    totalScore,
    concept: `${draft.title} is ${draft.line} for ${draft.user}.`,
    keyFeatures: [],
    wowMoment: '',
    whyItWins: '',
    brandName: pickName(draft.title, draft.lcTheme, base).displayName,
  };
}

function buildOneLiner(draft: Draft, apiName: string | null): string {
  const apiClause = apiName
    ? ` Built around ${apiName} to stay in the running for the ${apiName} sponsor prize.`
    : '';
  return `${draft.title} — an ${draft.adj} ${draft.lcTheme} idea: ${draft.line}.${apiClause}`;
}

function computeSponsorFit(domainId: string, apiName: string | null): number {
  if (!apiName) return 5;
  const lower = apiName.toLowerCase();
  const domain = IDEA_DOMAINS.find((d) => d.id === domainId);
  if (domain?.techHints.some((hint) => lower.includes(hint))) return 10;
  // AI-flavored sponsors are broadly useful.
  if (/openai|gemini|anthropic|hugging|cohere|llm/.test(lower)) return 8;
  return 7;
}

function dimensionWeights(criteria: CompetitionAnalysis['judgingCriteria']): DimensionWeights {
  const acc = { novelty: 0, feasibility: 0, technicalDepth: 0, demoAppeal: 0, sponsorFit: 0 };
  for (const c of criteria ?? []) {
    const name = c.name.toLowerCase();
    const weight = c.weight;
    if (/(innovation|creativity|originality|novel|disruptive)/.test(name)) acc.novelty += weight;
    else if (/(technical|complexity|depth|engineering|algorithm|sophistication)/.test(name)) acc.technicalDepth += weight;
    else if (/(impact|social|benefit|reach|community|outcome|value)/.test(name)) acc.demoAppeal += weight;
    else if (/(design|ux|usability|presentation|polish|experience)/.test(name)) acc.demoAppeal += weight;
    else if (/(feasibility|practical|viable)/.test(name)) acc.feasibility += weight;
    else if (/(complete|functionality|quality|robust)/.test(name)) acc.feasibility += weight;
    else {
      // Unknown criteria spread across the core dimensions.
      acc.novelty += weight / 3;
      acc.technicalDepth += weight / 3;
      acc.demoAppeal += weight / 3;
    }
  }
  const sum = acc.novelty + acc.feasibility + acc.technicalDepth + acc.demoAppeal + acc.sponsorFit;
  if (sum <= 0) return { novelty: 0.35, feasibility: 0.15, technicalDepth: 0.2, demoAppeal: 0.2, sponsorFit: 0.1 };
  return {
    novelty: acc.novelty / sum,
    feasibility: acc.feasibility / sum,
    technicalDepth: acc.technicalDepth / sum,
    demoAppeal: acc.demoAppeal / sum,
    sponsorFit: acc.sponsorFit / sum,
  };
}

function selectApiName(analysis: CompetitionAnalysis, result?: InterviewResult | null): string | null {
  const selected = result?.selectedSponsorApis ?? [];
  if (selected.length > 0) return selected[0]!;
  const sponsorApis = analysis.sponsorAPIs ?? [];
  if (sponsorApis.length === 0) return null;
  return sponsorApis
    .slice()
    .sort((a, b) => priorityRank(a.strategicValue) - priorityRank(b.strategicValue))[0]!.name;
}

function priorityRank(p: string): number {
  if (p === 'must_use') return 0;
  if (p === 'should_use') return 1;
  return 2;
}

function criterionAdjective(focusName: string): string {
  const lc = focusName.toLowerCase();
  if (/(innovation|creativity|originality|novel)/.test(lc)) return 'innovative';
  if (/(technical|complexity|depth|engineering|algorithm)/.test(lc)) return 'technically sophisticated';
  if (/(impact|social|benefit|community|reach)/.test(lc)) return 'impactful';
  if (/(design|ux|usability|presentation|polish)/.test(lc)) return 'beautifully designed';
  if (/(complete|functionality|quality|robust)/.test(lc)) return 'fully featured';
  return 'compelling';
}

// ---------------------------------------------------------------------------
// Expansion of the top 5
// ---------------------------------------------------------------------------

function expandShortlist(
  ideas: ScoredIdea[],
  criteria: CompetitionAnalysis['judgingCriteria'],
  apiName: string | null,
): ScoredIdea[] {
  const topCriterion = criteria.slice().sort((a, b) => b.weight - a.weight)[0];
  return ideas.map((idea, rank) => {
    const [topDim, topScore, secondDim, secondScore] = topDimensions(idea);
    const criteriaLine = topCriterion
      ? ` Targets the top judging criterion "${topCriterion.name}" (${topCriterion.weight}%).`
      : '';
    const sponsorLine = apiName
      ? ` Uses ${apiName}, keeping the sponsor prize track in reach.`
      : ' Needs no sponsor API, so the demo path stays short.';
    return {
      ...idea,
      keyFeatures: buildKeyFeatures(idea, apiName),
      wowMoment: deriveWow(idea.line),
      whyItWins:
        `#${rank + 1} overall (${idea.totalScore}/100) — leads on ${topDim} (${topScore}/10) and ` +
        `${secondDim} (${secondScore}/10).${criteriaLine} ${sponsorLine}`,
    };
  });
}

function buildKeyFeatures(idea: ScoredIdea, apiName: string | null): string[] {
  return [
    `${idea.title} core loop: one screen from first click to result`,
    `Live ${idea.domain} data with graceful empty and loading states`,
    apiName
      ? `${apiName} integration driving the main mechanic`
      : 'Seeded demo data so the pitch works fully offline',
    'Deployable inside the hackathon window with a fallback path',
  ];
}

function deriveWow(line: string): string {
  const l = line.toLowerCase();
  if (/(live|real.?time|instant|updates itself)/.test(l)) return 'a live, real-time moment judges can demo in seconds';
  if (/(scorecard|streak|score|radar|map|board|ledger|ticket)/.test(l)) return 'a visual scorecard that updates as judges watch';
  if (/(voice|speak|note|call|say)/.test(l)) return 'a voice interaction that works on the first try, live';
  return 'a crisp on-screen demo that lands in the first 30 seconds';
}

function topDimensions(idea: ScoredIdea): [string, number, string, number] {
  const dims: Array<[string, number]> = [
    ['novelty', idea.novelty],
    ['feasibility', idea.feasibility],
    ['technical depth', idea.technicalDepth],
    ['demo appeal', idea.demoAppeal],
  ];
  dims.sort((a, b) => b[1] - a[1]);
  return [dims[0]![0], dims[0]![1], dims[1]![0], dims[1]![1]];
}

// ---------------------------------------------------------------------------
// Rationale
// ---------------------------------------------------------------------------

function buildRationale(
  winner: ScoredIdea,
  poolSize: number,
  topCriterion: CompetitionAnalysis['judgingCriteria'][number] | undefined,
  apiName: string | null,
): string {
  const [topDim, topScore, secondDim, secondScore] = topDimensions(winner);
  const criterionLine = topCriterion
    ? ` It maps directly to the top judging criterion "${topCriterion.name}" (${topCriterion.weight}%).`
    : '';
  const sponsorLine = apiName
    ? ` It is built around ${apiName}, which keeps it eligible for the sponsor prize track.`
    : ' It needs no sponsor API, keeping the build path short and reliable.';
  const wowLine = ` Its demo moment — ${winner.wowMoment} — lands within the first minute.`;
  return (
    `${winner.title} wins the brainstorm. Out of ${poolSize} concepts it scored #1 overall ` +
    `(${winner.totalScore}/100), strongest on ${topDim} (${topScore}/10) and ${secondDim} ` +
    `(${secondScore}/10).${criterionLine}${sponsorLine}${wowLine}`
  );
}

function clamp10(n: number): number {
  return Math.max(1, Math.min(10, n));
}

function wowBoost(line: string): number {
  const l = line.toLowerCase();
  let boost = 0;
  if (/(live|real.?time|instant|updates itself|scorecard|streak|radar|map)/.test(l)) boost += 1;
  if (/(voice|call|speak)/.test(l)) boost += 1;
  return boost;
}

// Mechanic signals used to derive dimension scores from an idea's content.
const NOVEL_SIGNALS =
  /reverse|replays|extracts|surfaces|translates|invents|radar|scorecard|matcher|router|forecaster|interpreter|detective|hotline|re.?explains|scanner/;
const DEPTH_SIGNALS =
  /engine|agent|real.?time|api|data|model|protocol|ledger|forecast|prediction|analytics|synthesis|monitor|scheduler|network|machine|stream/;
const COMPLEX_SIGNALS =
  /marketplace|platform|logistics|multi.?party|fleet|swarm|mesh|supply|inventory|scheduling/;
