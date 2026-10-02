/**
 * Hackathon Knowledge Base — Curated Seed Corpus
 * ===============================================
 *
 * Hand-authored, evidence-backed knowledge distilled from: sponsor
 * documentation, official framework docs, the project's own battle-tested
 * `LLM_GENERATION_SYSTEM_PROMPT`, the `KNOWN_PATTERNS` failure catalog, and
 * widely-accepted hackathon engineering practice. Every entry cites its
 * `evidence` so planners can trust and audit it.
 *
 * This is the *seed*; `ingest.ts` augments it with learned entries from
 * previous projects, benchmarks, and (optionally) live Devpost/GitHub. The
 * seed guarantees the KB is useful even on a fresh install with no history.
 */

import type { KnowledgeEntry, KnowledgeCategory, KnowledgeSource } from './types.js';

interface SeedSpec {
  category: KnowledgeCategory;
  title: string;
  body: string;
  why: string;
  source: KnowledgeSource;
  evidence: string;
  confidence?: number;
  tags?: string[];
  snippet?: string;
}

function makeSeed(spec: SeedSpec): Omit<KnowledgeEntry, 'id' | 'keywords' | 'createdAt' | 'updatedAt'> {
  return {
    category: spec.category,
    title: spec.title,
    body: spec.body,
    why: spec.why,
    source: spec.source,
    evidence: spec.evidence,
    confidence: spec.confidence ?? 0.8,
    tags: spec.tags ?? [],
    snippet: spec.snippet,
    dedupKey: '',
  };
}

export const CURATED_SEED: Omit<KnowledgeEntry, 'id' | 'keywords' | 'createdAt' | 'updatedAt'>[] = [
  // ── Architecture Patterns ───────────────────────────────────────────
  makeSeed({
    category: 'architecture-pattern',
    title: 'Monolithic Next.js App Router with isolated integration clients',
    body: 'Keep UI in app/ + components/, external clients (LLM, sponsor APIs, DB) isolated in lib/, business logic in server/. Decouple the demo surface (app/demo) from the landing page so a broken integration never takes down the hero.',
    why: 'Hackathon judges interact with the running demo; a single failing API should never blank the whole app. Isolation localizes blast radius and speeds repair.',
    source: 'architecture',
    evidence: 'benchmarks/orchestrator-templates.ts#LLM_GENERATION_SYSTEM_PROMPT',
    tags: ['nextjs', 'monolith', 'separation', 'resilience'],
    snippet: 'app/ → UI · lib/ → clients · server/ → business logic',
  }),
  makeSeed({
    category: 'architecture-pattern',
    title: 'Thin vertical slice before breadth',
    body: 'Build one end-to-end path that demos the top-weighted judging criterion first; expand only after it is demonstrable and deployed.',
    why: 'Over-scope is the #1 cause of non-submission. A thin slice that works beats a broad failure.',
    source: 'template',
    evidence: 'benchmarks/winning-strategy-templates.ts (single_flow)',
    tags: ['scope', 'mvp', 'vertical-slice'],
  }),
  makeSeed({
    category: 'architecture-pattern',
    title: 'Deploy from commit #1',
    body: 'Wire CI/CD and a preview deployment (Vercel/Netlify) on the first commit so submission is never blocked by last-minute infra.',
    why: 'Discovery of the deploy target at hour 23 is a classic, avoidable failure. Early deploy de-risks the entire timeline.',
    source: 'architecture',
    evidence: 'features/analyze/analyzer.ts#milestones',
    tags: ['deploy', 'ci', 'vercel', 'netlify'],
  }),

  // ── Folder Structures ───────────────────────────────────────────────
  makeSeed({
    category: 'folder-structure',
    title: 'Recommended Next.js hackathon tree',
    body: 'my-hack/ ├─ app/ (page.tsx, demo/page.tsx, api/) ├─ components/ ├─ lib/ (clients) ├─ server/ (services) ├─ scripts/seed.ts ├─ tests/ ├─ public/ └─ README.md',
    why: 'A predictable tree shortens onboarding for teammates and judges, and keeps integration clients out of UI code.',
    source: 'template',
    evidence: 'benchmarks/orchestrator-templates.ts#LLM_GENERATION_SYSTEM_PROMPT',
    tags: ['nextjs', 'tree', 'layout', 'scaffold'],
    snippet: 'app/ components/ lib/ server/ scripts/ tests/ public/',
  }),

  // ── Boilerplates ────────────────────────────────────────────────────
  makeSeed({
    category: 'boilerplate',
    title: 'Always-generate boilerplate files',
    body: 'Every scaffold should include package.json, tsconfig.json, next.config.js, src/app/layout.tsx, src/app/page.tsx, .gitignore, .env.example, src/config.ts, .eslintrc.json, tailwind.config.js, postcss.config.js, src/app/globals.css.',
    why: 'Missing config/boilerplate is the most common cause of "builds locally but fails in CI". Standardizing it removes a whole class of failures.',
    source: 'template',
    evidence: 'benchmarks/orchestrator-templates.ts#LLM_TASK_DESCRIPTIONS',
    tags: ['scaffold', 'config', 'boilerplate', 'ci'],
  }),
  makeSeed({
    category: 'boilerplate',
    title: 'Ship a .env.example, never commit secrets',
    body: 'Generate .env.example with placeholder keys; load real values via dotenv. Keep .env out of git via .gitignore.',
    why: 'Secrets leakage is a disqualifier and a security risk; an example file documents required integrations for judges and teammates.',
    source: 'security',
    evidence: 'benchmarks/orchestrator-templates.ts#LLM_GENERATION_SYSTEM_PROMPT',
    tags: ['env', 'secrets', 'security', 'gitignore'],
  }),

  // ── Authentication Patterns ─────────────────────────────────────────
  makeSeed({
    category: 'auth-pattern',
    title: 'Use drop-in auth (NextAuth/Clerk/Auth0) instead of hand-rolled',
    body: 'Prefer next-auth or Clerk/Auth0 over a custom JWT/session implementation during a hackathon.',
    why: 'Hand-rolled auth consumes scarce time and is a frequent source of security bugs; drop-in providers ship working, safe flows fast.',
    source: 'official-docs',
    evidence: 'KNOWN_SPONSORS (Auth0 / Clerk); next-auth docs',
    tags: ['auth', 'next-auth', 'clerk', 'oauth', 'jwt'],
  }),
  makeSeed({
    category: 'auth-pattern',
    title: 'Protect API routes, not just the UI',
    body: 'Gate server-side route handlers; never trust client-side hiding of buttons as access control.',
    why: 'UI-only "protection" is trivially bypassed and fails security review; enforce on the server.',
    source: 'security',
    evidence: 'OWASP API Security Top 10 (Broken Object Level Authorization)',
    tags: ['auth', 'api', 'security', 'authorization'],
  }),

  // ── Database Patterns ──────────────────────────────────────────────
  makeSeed({
    category: 'database-pattern',
    title: 'Prisma + SQLite/Postgres for hackathon data',
    body: 'Use Prisma with SQLite for zero-config local dev and Postgres (or Supabase) for deployed demos.',
    why: 'Prisma gives typed access and migrations with minimal setup; SQLite avoids provisioning during the sprint.',
    source: 'template',
    evidence: 'benchmarks/orchestrator-templates.ts#KNOWN_PACKAGE_VERSIONS',
    tags: ['db', 'prisma', 'postgres', 'sqlite', 'supabase'],
  }),
  makeSeed({
    category: 'database-pattern',
    title: 'Seed script for reproducible demo data',
    body: 'Provide scripts/seed.ts that populates the DB so judges can re-run the demo identically.',
    why: 'Judges value a reproducible demo; seed data removes "works only on my machine" risk and showcases the product instantly.',
    source: 'architecture',
    evidence: 'features/analyze/analyzer.ts#milestones',
    tags: ['db', 'seed', 'demo', 'reproducible'],
  }),

  // ── Deployment Patterns ────────────────────────────────────────────
  makeSeed({
    category: 'deployment-pattern',
    title: 'Zero-config Vercel deploy with preview URLs',
    body: 'Deploy Next.js to Vercel from the first commit; use preview deployments for live judging.',
    why: 'Vercel is the default Hack-A-Gent target and gives a public URL with minimal config — required for most judging.',
    source: 'template',
    evidence: 'features/analyze/parser.ts#KNOWN_SPONSORS (Vercel)',
    tags: ['deploy', 'vercel', 'hosting', 'preview'],
  }),
  makeSeed({
    category: 'deployment-pattern',
    title: 'Record a fallback demo video',
    body: 'Capture a short demo video in case live APIs/LLMs rate-limit during judging.',
    why: 'Live integrations fail at the worst moments; a fallback keeps the demo unbroken and de-risks the submission.',
    source: 'architecture',
    evidence: 'features/analyze/analyzer.ts#riskAnalysis',
    tags: ['deploy', 'demo', 'fallback', 'video'],
  }),

  // ── Accessibility ───────────────────────────────────────────────────
  makeSeed({
    category: 'accessibility',
    title: 'Keyboard paths, ARIA labels, and semantic HTML',
    body: 'Use semantic elements (<button>, <nav>), label all inputs, ensure focus order, and provide alt text. Avoid div-as-button.',
    why: 'Accessibility is a quiet quality signal across UX/design judging axes and broadens who can use the demo.',
    source: 'official-docs',
    evidence: 'kernel/prompts/templates.ts (accessibility rules)',
    tags: ['a11y', 'aria', 'keyboard', 'semantic'],
  }),
  makeSeed({
    category: 'accessibility',
    title: 'Sufficient color contrast and reduced-motion support',
    body: 'Meet WCAG AA contrast; honor prefers-reduced-motion to disable heavy animations.',
    why: 'Low contrast and motion sensitivity exclude judges and users; cheap wins on design axes.',
    source: 'official-docs',
    evidence: 'WCAG 2.1 AA',
    tags: ['a11y', 'contrast', 'motion', 'wcag'],
  }),

  // ── Performance ────────────────────────────────────────────────────
  makeSeed({
    category: 'performance',
    title: 'Cache external API/LLM responses',
    body: 'Memoize and persist LLM/sponsor-API responses; serve cached results when rate-limited.',
    why: 'Rate limits are the top cause of broken live demos; caching keeps the demo fast and resilient.',
    source: 'architecture',
    evidence: 'features/analyze/analyzer.ts#riskAnalysis',
    tags: ['perf', 'cache', 'llm', 'rate-limit'],
  }),
  makeSeed({
    category: 'performance',
    title: 'Ship a lean client bundle',
    body: 'Prefer dynamic imports for heavy deps (markdown, syntax highlighters, charts); lazy-load below-the-fold.',
    why: 'Large bundles slow first paint, hurting the 5-second judge impression that drives scores.',
    source: 'official-docs',
    evidence: 'web performance best practice (code-splitting)',
    tags: ['perf', 'bundle', 'lazy-load', 'lighthouse'],
  }),

  // ── Security ───────────────────────────────────────────────────────
  makeSeed({
    category: 'security',
    title: 'Never hardcode secrets; validate and sanitize inputs',
    body: 'Read keys from env; escape user input; validate types at API boundaries; set CORS deliberately.',
    why: 'Hardcoded secrets leak via public repos and XSS/SSRF sink judges/automated checks; boundary validation prevents data corruption.',
    source: 'security',
    evidence: 'OWASP Top 10 (XSS, SSRF, secrets management)',
    tags: ['sec', 'secrets', 'cors', 'xss', 'validation'],
  }),
  makeSeed({
    category: 'security',
    title: 'Scope API keys to least privilege',
    body: 'Use restricted keys/tokens with narrow permissions; rotate if exposed.',
    why: 'Over-broad keys amplify blast radius if leaked during a public hackathon.',
    source: 'security',
    evidence: 'cloud provider key-management guidance',
    tags: ['sec', 'keys', 'least-privilege'],
  }),

  // ── Testing ────────────────────────────────────────────────────────
  makeSeed({
    category: 'testing',
    title: 'One happy-path smoke test beats a full suite',
    body: 'Add at least one end-to-end smoke test of the core flow (e.g., Vitest + a Playwright check) before adding unit tests.',
    why: 'A passing smoke test proves the demo works end-to-end; during a sprint, breadth of tests is lower priority than one trusted path.',
    source: 'benchmark',
    evidence: 'benchmarks/real-benchmark-suite.ts (evaluation criteria)',
    tags: ['test', 'smoke', 'e2e', 'vitest', 'playwright'],
  }),
  makeSeed({
    category: 'testing',
    title: 'Test the integration boundary, not the mock',
    body: 'If you mock a sponsor API for the demo, keep at least one test (or script) against the real client path.',
    why: 'Mocks hide integration regressions; a real-boundary check catches auth/schema drift before judging.',
    source: 'benchmark',
    evidence: 'kernel/learning/failure-tracker.ts (integration failures)',
    tags: ['test', 'integration', 'mock', 'boundary'],
  }),

  // ── Common Pitfalls ────────────────────────────────────────────────
  makeSeed({
    category: 'common-pitfall',
    title: 'Building for "perfect" instead of "demonstrable"',
    body: 'Teams often over-engineer and miss the submission. Submit a thin slice over a broad failure.',
    why: 'Non-submission scores zero; a finished, mediocre demo beats an unfinished masterpiece.',
    source: 'previous-project',
    evidence: 'features/analyze/analyzer.ts#commonMistakes',
    tags: ['pitfall', 'scope', 'submission'],
  }),
  makeSeed({
    category: 'common-pitfall',
    title: 'Wiring every sponsor API and finishing none',
    body: 'Picking ONE must-use API to showcase end-to-end beats half-integrating many.',
    why: 'Partial integrations look broken to judges; one genuine integration reads as real.',
    source: 'previous-project',
    evidence: 'features/analyze/analyzer.ts#riskAnalysis',
    tags: ['pitfall', 'sponsor', 'focus'],
  }),
  makeSeed({
    category: 'common-pitfall',
    title: 'Named export instead of default export for page components',
    body: 'Next.js App Router page/layout files expect default exports; a named export yields a blank page.',
    why: 'This is a top recurring build/runtime failure in generated projects; default exports avoid it.',
    source: 'benchmark',
    evidence: 'kernel/learning/failure-tracker.ts#KNOWN_PATTERNS',
    tags: ['pitfall', 'nextjs', 'export', 'build'],
  }),
  makeSeed({
    category: 'common-pitfall',
    title: 'Missing children prop type on React components',
    body: 'Type components to accept React.ReactNode children; omitting it breaks TS builds.',
    why: 'A frequent TypeScript compile error that blocks the build minutes before submission.',
    source: 'benchmark',
    evidence: 'kernel/learning/failure-tracker.ts#KNOWN_PATTERNS',
    tags: ['pitfall', 'react', 'typescript', 'children'],
  }),
  makeSeed({
    category: 'common-pitfall',
    title: 'Discovering the deploy target at hour 23',
    body: 'Teams leave deployment until the end and hit auth/token/config surprises.',
    why: 'Late deploy is a leading cause of "works locally, fails to submit". Deploy from commit #1.',
    source: 'previous-project',
    evidence: 'features/analyze/analyzer.ts#commonMistakes',
    tags: ['pitfall', 'deploy', 'timeline'],
  }),

  // ── Winning Technologies ────────────────────────────────────────────
  makeSeed({
    category: 'winning-technology',
    title: 'Next.js App Router + TypeScript + Tailwind as the default stack',
    body: 'This stack maximizes demo accessibility and zero-config hosting, and is what Hack-A-Gent optimizes generation for.',
    why: 'Judges need to run/interact with the product; this stack deploys fast and looks polished with little effort.',
    source: 'winning-technology',
    evidence: 'features/analyze/analyzer.ts#recommendStack',
    tags: ['nextjs', 'typescript', 'tailwind', 'stack'],
  }),
  makeSeed({
    category: 'winning-technology',
    title: 'Lead with a rehearsed "wow" moment',
    body: 'Engineer one undeniable, memorable interaction in the first 5–10 seconds of the demo.',
    why: 'Judges recall moments during deliberation; a wow differentiates more than feature breadth.',
    source: 'winning-technology',
    evidence: 'benchmarks/winning-strategy-templates.ts (wow_first)',
    tags: ['wow', 'demo', 'differentiator'],
  }),
  makeSeed({
    category: 'winning-technology',
    title: 'Explainable AI: show the model input AND output',
    body: 'For AI projects, surface the prompt/input and the result so the magic is legible to non-expert judges.',
    why: 'AI demos win when the intelligence is tangible; black-box outputs feel like fakery.',
    source: 'winning-technology',
    evidence: 'features/analyze/analyzer.ts#featureRecommendations',
    tags: ['ai', 'explainability', 'demo'],
  }),
];
