/**
 * Devpost Intelligence — Analyzer
 * ==============================
 *
 * Turns parsed Devpost data into a 20-dimension strategic analysis.
 * Fully deterministic: same input + seed ⇒ same output. No LLM is
 * required; an optional `llmCall` hook can enrich free-text fields, but
 * the structural analysis never depends on it.
 */

import { getSeededRandom, createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type {
  ParsedDevpost,
  DevpostAnalysis,
  Difficulty,
  FeatureRecommendation,
  RiskItem,
  Milestone,
  SponsorAPI,
  JudgingCriterion,
} from './types.js';

export interface AnalyzerContext {
  seed?: number;
  /** Optional LLM enrichment hook (must be deterministic-friendly). */
  llmCall?: (system: string, user: string) => Promise<string | null>;
}

const TOP_MODELS = [
  'anthropic/claude-opus-4-8 (planning, architecture, hardest reasoning)',
  'anthropic/claude-sonnet-4-6 (fast planning + strong code)',
  'openai/gpt-4.1 (balanced code-gen + tooling)',
  'google/gemini-2.5-pro (long-context, multimodal RAG)',
  'nvidia/nim-llama-3.1-nemotron (local/free NIM inference)',
];

function difficultyFromScore(score: number): Difficulty {
  if (score <= 2) return 'trivial';
  if (score <= 4) return 'easy';
  if (score <= 6) return 'medium';
  if (score <= 8) return 'hard';
  return 'extreme';
}

function topCriteria(c: JudgingCriterion[]): JudgingCriterion[] {
  return [...c].sort((a, b) => b.weight - a.weight);
}

/**
 * Compute the 1-10 difficulty score from structural signals.
 * Deterministic: every term is an integer derived from the parsed data.
 */
function computeDifficultyScore(d: ParsedDevpost): number {
  let score = 2; // baseline
  score += Math.min(3, d.sponsorAPIs.length); // more required integrations ⇒ harder
  score += Math.min(2, Math.floor(d.judgingCriteria.length / 2)); // more axes ⇒ harder
  const aiHeavy = d.sponsorAPIs.some((s) => s.category === 'ai' || s.category === 'ml');
  if (aiHeavy) score += 1;
  if (d.themes.length > 3) score += 1;
  if (d.themes.some((t) => /ai|ml|blockchain|ar|vr/i.test(t))) score += 1;
  return Math.max(1, Math.min(10, score));
}

function recommendStack(d: ParsedDevpost): string[] {
  const stack = ['Next.js (App Router)', 'TypeScript', 'Tailwind CSS', 'React Server Components'];
  const hasPay = d.sponsorAPIs.some((s) => s.category === 'payments');
  const hasData = d.sponsorAPIs.some((s) => s.category === 'data');
  const hasAI = d.sponsorAPIs.some((s) => s.category === 'ai' || s.category === 'ml');
  if (hasData || hasPay) stack.push('Prisma + SQLite/Postgres');
  if (hasAI) stack.push('Vercel AI SDK + a hosted LLM');
  if (d.sponsorAPIs.some((s) => /supabase/i.test(s.name))) stack.push('Supabase (Postgres + Auth + Storage)');
  if (d.sponsorAPIs.some((s) => /firebase/i.test(s.name))) stack.push('Firebase (Auth + Firestore)');
  if (d.sponsorAPIs.some((s) => /vercel/i.test(s.name))) stack.push('Vercel (deploy target)');
  return stack;
}

function requiredIntegrations(d: ParsedDevpost): string[] {
  const out = new Set<string>();
  for (const s of d.sponsorAPIs) {
    out.add(`${s.name} — ${s.notes.split('.')[0]}`);
  }
  if (out.size === 0) out.add('None detected — build a self-contained demo.');
  return [...out];
}

function featureRecommendations(d: ParsedDevpost, mustUse: SponsorAPI[]): FeatureRecommendation[] {
  const feats: FeatureRecommendation[] = [];

  for (const s of mustUse) {
    feats.push({
      title: `${s.name} integration as a headline feature`,
      rationale: `Sponsor APIs marked must-use are frequently weighted heavily by judges; showcase ${s.name} end-to-end.`,
      priority: 'must',
    });
  }

  const top = topCriteria(d.judgingCriteria)[0];
  if (top) {
    feats.push({
      title: `Make "${top.name}" visibly excellent`,
      rationale: `Top-weighted judging axis (${top.weight}%). A judge should feel this within 10 seconds of the demo.`,
      priority: 'must',
    });
  }

  feats.push({
    title: 'One-click demo / seed script',
    rationale: 'Judges have minutes. A reproducible, zero-friction demo is the highest-leverage "should".',
    priority: 'should',
  });
  feats.push({
    title: 'Polished landing + clear value prop',
    rationale: 'First impressions dominate; a crisp hero + problem statement helps every judging axis.',
    priority: 'should',
  });
  if (d.sponsorAPIs.some((s) => s.category === 'ai')) {
    feats.push({
      title: 'Explainable AI output (show the prompt + result)',
      rationale: 'AI projects win when the magic is legible to non-experts.',
      priority: 'should',
    });
  }
  feats.push({
    title: 'Dark-mode + responsive + a11y pass',
    rationale: 'Cheap, broad quality signal across UX/design axes.',
    priority: 'nice',
  });
  feats.push({
    title: 'Live metrics / "wow" moment in the demo script',
    rationale: 'Memorable moments are recalled during deliberation.',
    priority: 'nice',
  });
  return feats;
}

function riskAnalysis(d: ParsedDevpost, diffScore: number): RiskItem[] {
  const risks: RiskItem[] = [];

  if (d.sponsorAPIs.length >= 2) {
    risks.push({
      category: 'integration',
      description: `${d.sponsorAPIs.length} sponsor APIs to wire before they add value.`,
      severity: 'high',
      mitigation: 'Pick ONE must-use API to showcase; stub the rest behind a clean interface.',
    });
  }
  risks.push({
    category: 'time',
    description: `Estimated build load is ${diffScore}/10; over-scope is the #1 cause of non-submission.`,
    severity: diffScore >= 6 ? 'high' : 'medium',
    mitigation: 'Ship a thin vertical slice first; expand only after it demos.',
  });
  if (d.judgingCriteria.some((c) => /innovation|novel/i.test(c.name)) && d.themes.includes('AI')) {
    risks.push({
      category: 'scope',
      description: 'AI + innovation axes tempt teams into research instead of a shippable demo.',
      severity: 'medium',
      mitigation: 'Use an off-the-shelf model; differentiate on UX/problem fit, not model novely.',
    });
  }
  risks.push({
    category: 'team',
    description: 'Unclear ownership of design vs backend causes merge conflict + drift.',
    severity: 'medium',
    mitigation: 'Assign one owner per milestone; integrate hourly.',
  });
  for (const s of d.sponsorAPIs.filter((x) => x.category === 'ai' || x.category === 'ml')) {
    risks.push({
      category: 'integration',
      description: `${s.name} rate limits / keys may block the live demo.`,
      severity: 'medium',
      mitigation: 'Cache responses; ship a pre-recorded fallback demo.',
    });
  }
  return risks;
}

function recommendedTeamSize(diffScore: number): number {
  if (diffScore <= 3) return 2;
  if (diffScore <= 6) return 3;
  if (diffScore <= 8) return 4;
  return 5;
}

function estimateHours(diffScore: number): number {
  // Total person-hours a typical team should budget.
  return 12 + diffScore * 4;
}

function folderStructure(d: ParsedDevpost): string {
  const tree = [
    'my-hack/',
    '├─ app/                 # Next.js App Router',
    '│  ├─ page.tsx          # landing / hero',
    '│  ├─ demo/page.tsx     # the live demo surface',
    '│  └─ api/              # route handlers',
    '├─ components/          # UI primitives',
    '├─ lib/                # clients: LLM, sponsor APIs, db',
    '├─ server/             # services + data access',
    '├─ scripts/seed.ts     # reproducible demo data',
    '├─ tests/              # unit + smoke',
    '├─ public/',
    '└─ README.md           # how to run + demo script',
  ];
  void d;
  return tree.join('\n');
}

function milestones(d: ParsedDevpost, totalHours: number): Milestone[] {
  const per = Math.max(2, Math.round(totalHours / 5));
  return [
    {
      name: 'M1 — Skeleton + deploy',
      durationHours: per,
      goals: ['Scaffold Next.js + Tailwind', 'Empty app live on Vercel', 'README + run script'],
    },
    {
      name: 'M2 — Core feature slice',
      durationHours: per,
      goals: ['One end-to-end happy path', `Showcase ${d.sponsorAPIs[0]?.name ?? 'the headline API'}`, 'Seed data script'],
    },
    {
      name: 'M3 — Polish + differentiator',
      durationHours: per,
      goals: ['Responsive + a11y pass', 'WoW moment in demo', 'Error/empty states'],
    },
    {
      name: 'M4 — Judging alignment',
      durationHours: per,
      goals: ['Hit top-weighted criteria', 'Record demo video', 'Final QA pass'],
    },
    {
      name: 'M5 — Buffer',
      durationHours: per,
      goals: ['Fix surprises', 'Practice the pitch', 'Submit early'],
    },
  ];
}

function differentiators(d: ParsedDevpost): string[] {
  const out: string[] = [
    'A crisp, problem-first narrative (judges recall stories, not features).',
    'A single, undeniable "wow" moment rehearsed into the demo.',
  ];
  if (d.sponsorAPIs.some((s) => s.category === 'ai')) {
    out.push('Show the model input AND output so the AI feels tangible.');
  }
  if (d.sponsorAPIs.length > 0) {
    out.push(`Genuinely use ${d.sponsorAPIs[0]!.name} in a way competitors fake with mocks.`);
  }
  out.push('Ship a reproducible demo (seed script) so judges can re-run it themselves.');
  out.push('Accessibility + responsiveness as a quiet quality signal across all axes.');
  return out;
}

function commonMistakes(d: ParsedDevpost): string[] {
  const out: string[] = [
    'Building for "perfect" instead of "demonstrable" — submit a thin slice over a broad failure.',
    'Wiring every sponsor API and finishing none.',
    'Discovering the deploy target at hour 23.',
    'No fallback when the live API/LLM is rate-limited during judging.',
  ];
  if (d.judgingCriteria.some((c) => /design|ui|ux/i.test(c.name))) {
    out.push('Treating design as decoration rather than a scored axis.');
  }
  out.push('Letting the demo depend on data that only exists on one laptop.');
  return out;
}

function scoringOpportunities(d: ParsedDevpost): string[] {
  return topCriteria(d.judgingCriteria).slice(0, 3).map(
    (c) => `${c.name} (${c.weight}%${c.inferred ? ', weight inferred' : ''}) — optimize here first.`,
  );
}

/**
 * Run the full analysis. Deterministic for a given (data, seed) pair.
 */
export function analyzeDevpost(
  data: ParsedDevpost,
  ctx: AnalyzerContext = {},
): DevpostAnalysis {
  const seed = ctx.seed ?? 42;
  const rng = getSeededRandom(seed);
  void rng; // kept for stable tie-breaks in future heuristics

  const diffScore = computeDifficultyScore(data);
  const mustUse = data.sponsorAPIs.filter((s) => s.mustUse);
  const totalHours = estimateHours(diffScore);

  const analysis: DevpostAnalysis = {
    projectOverview: `${data.title}: ${data.tagline || data.description.slice(0, 160) || 'No description extracted.'} Themes: ${data.themes.join(', ')}. Organizer: ${data.organizer}.`,
    technologyStack: recommendStack(data),
    sponsorAPIs: data.sponsorAPIs,
    requiredIntegrations: requiredIntegrations(data),
    difficulty: difficultyFromScore(diffScore),
    difficultyScore: diffScore,
    judgingPriorities: topCriteria(data.judgingCriteria),
    winningStrategy:
      `Win on the top-weighted axis (${topCriteria(data.judgingCriteria)[0]?.name ?? 'overall quality'}) ` +
      `with a demonstrable, reproducible demo. ${mustUse.length > 0 ? `Headline ${mustUse[0]!.name} end-to-end rather than faking all sponsors. ` : ''}` +
      `Lead with the problem story; reserve a rehearsed "wow" moment for the live demo; ship a seed script so judges can re-run it.`,
    featureRecommendations: featureRecommendations(data, mustUse),
    timeline: `≈ ${totalHours} person-hours across ${recommendedTeamSize(diffScore)} people ⇒ budget ${Math.ceil(totalHours / recommendedTeamSize(diffScore))}h of focused work, split into 5 milestones.`,
    architectureRecommendation:
      `Monolithic Next.js App Router app: UI in app/ + components/, external clients (LLM, sponsor APIs, DB) isolated in lib/, business logic in server/. ` +
      `Keep the demo surface (app/demo) decoupled from the landing page so a broken integration never takes down the hero. Deploy to Vercel from commit #1.`,
    riskAnalysis: riskAnalysis(data, diffScore),
    recommendedModels: TOP_MODELS,
    suggestedFolderStructure: folderStructure(data),
    suggestedMilestones: milestones(data, totalHours),
    complexityEstimate:
      diffScore <= 3
        ? 'Low — a focused CRUD/UI build.'
        : diffScore <= 6
          ? 'Moderate — one or two external integrations with real glue code.'
          : 'High — multiple sponsor integrations, AI orchestration, and tight time budget.',
    estimatedCompletionTime: `Plan for ${Math.ceil(totalHours / recommendedTeamSize(diffScore))} focused hours; submit with ≥1 milestone of buffer.`,
    recommendedTeamSize: recommendedTeamSize(diffScore),
    scoringOpportunities: scoringOpportunities(data),
    commonMistakes: commonMistakes(data),
    potentialDifferentiators: differentiators(data),
    meta: {
      source: data.url,
      seed,
      generatedAt: new Date(1700000000000 + seed * 1000).toISOString(), // deterministic, no Date.now()
      confidence:
        data.sponsorAPIs.length > 0 || data.judgingCriteria.length > 0
          ? 'high'
          : data.description.length > 100
            ? 'medium'
            : 'low',
      analysisId: createDeterministicUuid(seed, data.title.length + data.url.length).slice(0, 12),
    },
  };

  return analysis;
}

/** Optional LLM enrichment of a single free-text field, if a hook is provided. */
export async function enrichField(
  ctx: AnalyzerContext,
  system: string,
  user: string,
): Promise<string | null> {
  if (!ctx.llmCall) return null;
  try {
    return await ctx.llmCall(system, user);
  } catch {
    return null;
  }
}
