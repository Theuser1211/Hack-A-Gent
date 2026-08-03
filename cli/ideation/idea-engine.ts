import type { InterviewResult } from '../interview/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import { IDEA_DOMAINS, detectDomains, matchesKeyword, normalizeKeywords, scoreDomains, type IdeaAngle, type IdeaDomain } from './idea-library.js';
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
  themeFit: number;
}

/** A draft with the resolved theme/adjective baked in for deterministic scoring. */
interface Draft extends IdeaDraft {
  adj: string;
  lcTheme: string;
  /** How well the idea maps to the challenge theme/problem statement. */
  themeFit: number;
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
  const matches = scoreDomains(theme, problemStatement);
  const domainScore = new Map(matches.map((m) => [m.domain.id, m.score]));
  const topDomainId = matches[0]?.domain.id ?? null;
  const topScore = matches[0]?.score ?? 0;
  const pool = buildAnglePool(domains);
  const drafts = generateDrafts(pool, theme, problemStatement, domainScore, topScore, topDomainId, focusName, apiName, seed);

  const weights = dimensionWeights(criteria);
  const ranked = drafts
    .map((draft) => scoreIdea(draft, weights, apiName, seed))
    .sort(
      (a, b) =>
        b.totalScore - a.totalScore ||
        b.themeFit - a.themeFit ||
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

function buildAnglePool(domains: IdeaDomain[]): { strong: IdeaAngle[]; rest: IdeaAngle[] } {
  const strongIds = new Set(domains.map((d) => d.id));
  const strong = domains.flatMap((d) => d.angles);
  // Top up with the rest of the library so a narrow theme still gets 20 ideas.
  const rest = IDEA_DOMAINS.filter((d) => !strongIds.has(d.id)).flatMap((d) => d.angles);
  return { strong, rest };
}

/**
 * Draft the 20-idea pool. Theme-matched domains are guaranteed the majority
 * share (up to 60%) so the brainstorm itself is on-theme — an idea from an
 * unrelated domain can no longer crowd out the challenge's own angles.
 */
function generateDrafts(
  pool: { strong: IdeaAngle[]; rest: IdeaAngle[] },
  theme: string,
  problemStatement: string,
  domainScore: Map<string, number>,
  topScore: number,
  topDomainId: string | null,
  focusName: string,
  apiName: string | null,
  seed: number,
): Draft[] {
  const adj = criterionAdjective(focusName);
  const lcTheme = (theme || 'technology').toLowerCase();
  const strongBudget = Math.min(pool.strong.length, Math.round(IDEATION_POOL_SIZE * 0.6));
  const strongOrder = seededShuffle(pool.strong, hashSeed([theme, problemStatement, apiName, focusName, seed, 'strong']));
  const restOrder = seededShuffle(pool.rest, hashSeed([theme, problemStatement, apiName, focusName, seed, 'rest']));
  const chosen = [
    ...strongOrder.slice(0, strongBudget),
    ...restOrder.slice(0, IDEATION_POOL_SIZE - strongBudget),
  ];

  return chosen.map((angle, i) => {
    const domain = domainForAngle(angle);
    return {
      id: `idea-${String(i + 1).padStart(2, '0')}`,
      title: angle.title,
      domain,
      user: angle.user,
      line: angle.line,
      adj,
      lcTheme,
      themeFit: computeThemeFit(angle, theme, problemStatement, domainScore.get(domain) ?? 0, topScore, domain === topDomainId),
    };
  });
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
  // deep, and feasible it reads. A tiny deterministic jitter only breaks ties.
  const novelty = clamp10(6 + (NOVEL_SIGNALS.test(line) ? 2 : 0) + seededInt(base, 0, 1));
  const feasibility = clamp10(6 + (COMPLEX_SIGNALS.test(line) ? -2 : 0) + seededInt(base + 1, 0, 1));
  const technicalDepth = clamp10(5 + (DEPTH_SIGNALS.test(line) ? 3 : 0) + seededInt(base + 2, 0, 1));
  const demoAppeal = clamp10(7 + wowBoost(line) + seededInt(base + 3, 0, 1));
  const sponsorFit = computeSponsorFit(draft.domain, apiName);
  const themeFit = draft.themeFit;

  const totalScore = Math.round(
    100 *
      ((w.novelty * novelty + w.feasibility * feasibility + w.technicalDepth * technicalDepth +
        w.demoAppeal * demoAppeal + w.sponsorFit * sponsorFit + w.themeFit * themeFit) /
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
    themeFit,
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
  // AI-flavored sponsors are broadly useful to almost every idea.
  if (/openai|gemini|anthropic|hugging|cohere|llm/.test(lower)) return 8;
  // A specific sponsor (Twilio, Plaid, Mapbox...) that the idea simply does
  // not touch is a real opportunity cost — especially for must_use APIs.
  return 4;
}

function dimensionWeights(criteria: CompetitionAnalysis['judgingCriteria']): DimensionWeights {
  // Relevance to the challenge is a structural part of every judge's rubric,
  // so themeFit always holds a meaningful share of the total weight — enough
  // to beat a brilliant off-theme idea whose novelty/depth scores are higher.
  // (When the challenge is generic, themeFit is near-constant across ideas, so
  // the high weight costs nothing and the other dimensions decide.)
  const THEME_FIT_WEIGHT = 0.4;
  const CORE_BUDGET = 1 - THEME_FIT_WEIGHT;
  // Sponsor alignment keeps a fixed share of the core budget so the chosen
  // sponsor API can actually move rankings. (It was previously normalized to
  // zero — acc.sponsorFit is never incremented — so sponsors had no influence.)
  const SPONSOR_SHARE = 0.12;
  const CRITERIA_BUDGET = CORE_BUDGET * (1 - SPONSOR_SHARE);

  const acc = { novelty: 0, feasibility: 0, technicalDepth: 0, demoAppeal: 0 };
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
  const sum = acc.novelty + acc.feasibility + acc.technicalDepth + acc.demoAppeal;
  const sponsorFit = CORE_BUDGET * SPONSOR_SHARE;
  if (sum <= 0) {
    return { novelty: 0.209, feasibility: 0.077, technicalDepth: 0.11, demoAppeal: 0.132, sponsorFit, themeFit: THEME_FIT_WEIGHT };
  }
  return {
    novelty: (acc.novelty / sum) * CRITERIA_BUDGET,
    feasibility: (acc.feasibility / sum) * CRITERIA_BUDGET,
    technicalDepth: (acc.technicalDepth / sum) * CRITERIA_BUDGET,
    demoAppeal: (acc.demoAppeal / sum) * CRITERIA_BUDGET,
    sponsorFit,
    themeFit: THEME_FIT_WEIGHT,
  };
}

// Stopwords that carry no thematic signal in a challenge statement.
const THEME_STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'you', 'are',
  'using', 'use', 'build', 'help', 'into', 'their', 'them', 'they', 'our',
  'all', 'its', 'not', 'can', 'will', 'have', 'has', 'who', 'what', 'when',
  'how', 'make', 'made', 'get', 'out', 'one', 'new', 'more', 'than', 'also',
  'these', 'those', 'over', 'under', 'such', 'which', 'while', 'should',
  'would', 'could', 'about', 'across', 'through', 'between', 'toward',
]);

/** Distinct, meaningful keywords in the theme/problem statement. */
function themeKeywords(theme: string, problemStatement: string): string[] {
  const tokens = normalizeKeywords(`${theme} ${problemStatement}`)
    .split(' ')
    .filter((w) => w.length > 3 && !THEME_STOPWORDS.has(w));
  return [...new Set(tokens)];
}

/**
 * 1-10 relevance score: how strongly the idea addresses the challenge.
 * Domain match is the dominant signal, and it is scored relative to the
 * strongest matched domain so the theme's own domain always outranks a
 * merely-adjacent one even when both match (without this, both saturate at 10
 * and the ranking forgets which idea is actually on-theme). Domain-keyword
 * overlap and challenge-statement lexical overlap refine it. Purely
 * content-driven (no jitter) so identical challenges rank identically.
 */
function computeThemeFit(
  angle: IdeaAngle,
  theme: string,
  problemStatement: string,
  domainScore: number,
  topScore: number,
  isTopDomain: boolean,
): number {
  const keywords = themeKeywords(theme, problemStatement);
  const haystack = normalizeKeywords(`${angle.title} ${angle.line} ${angle.user}`);
  let challengeHits = 0;
  for (const kw of keywords) {
    if (matchesKeyword(haystack, kw)) challengeHits++;
  }
  const challengeLexical = keywords.length > 0 ? Math.min(1, (challengeHits / keywords.length) * 2) : 0;

  // Reward the idea speaking its own domain's language (e.g. "carbon ledger"
  // for climate): an idea that cannot name the problem domain reads off-theme.
  // The bonus is gated on the domain actually matching the challenge, so a
  // generic "anything goes" hackathon stays theme-neutral — no idea is rewarded
  // purely for flavor when the challenge gives no thematic signal.
  const domain = IDEA_DOMAINS.find((d) => d.angles.some((a) => a.title === angle.title));
  const domainHits = domainScore > 0 && domain
    ? Math.min(2, domain.keywords.filter((kw) => matchesKeyword(haystack, kw)).length)
    : 0;

  // A matching domain is the strongest signal, scaled by how strongly it
  // matches RELATIVE to the top domain (0.5x → ~4, 1x → ~6). The top-matched
  // domain adds +1 so the theme's own domain always wins over an adjacent one.
  const ratio = topScore > 0 && domainScore > 0 ? Math.min(1, domainScore / topScore) : 0;
  const domainComponent = domainScore > 0 ? 1 + 5 * ratio : 0;
  const topBonus = domainScore > 0 && isTopDomain ? 1 : 0;
  const base = 3 + domainComponent + topBonus + domainHits + challengeLexical;
  return clamp10(Math.round(base));
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
    ['theme fit', idea.themeFit],
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
