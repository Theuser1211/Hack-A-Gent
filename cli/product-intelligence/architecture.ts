import type { ScoredIdea } from '../ideation/types.js';
import type { CompetitionAnalysis } from '../pipeline/types.js';

import type { ArchitecturePlan, SponsorOpportunity } from './types.js';

/**
 * Architecture plan produced before code generation: stack, module
 * decomposition, data model, API surfaces, deployment target and the sponsor
 * integrations that must land. Mirrors how Devin/Manus decompose a plan into
 * bounded, buildable units before writing code.
 */
export function generateArchitecture(
  idea: ScoredIdea,
  analysis: CompetitionAnalysis,
  sponsorOpportunities: SponsorOpportunity[],
): ArchitecturePlan {
  const mustApi = sponsorOpportunities.find((s) => s.strategicValue === 'must_use');
  const stack = selectStack(analysis, mustApi);
  const db = databaseFor(stack);
  const fe = frameworkFor(stack);

  const modules = [
    { name: `${idea.brandName} App Shell`, responsibility: `${fe} frontend with one-screen core loop and polished states` },
    { name: 'Core Mechanic Engine', responsibility: `The ${idea.domain} logic: ${idea.line}` },
    { name: `${idea.domain} Data Layer`, responsibility: `Persistence in ${db} + seed data + graceful empty states` },
    ...(sponsorOpportunities.length > 0
      ? [{ name: 'Sponsor Integration Layer', responsibility: `Thin adapters for ${sponsorOpportunities.map((s) => s.name).join(', ')} behind one interface` }]
      : []),
    { name: 'Demo & Deploy Scripts', responsibility: 'Seed script, env template, and one-command deploy' },
  ];

  const dataModel = [
    `${capitalize(idea.domain)}Context (userId, inputs, timestamps)`,
    'WorkItem/Result (id, type, status, output snapshot)',
    'UserPrefs (seedable for the demo)',
  ];

  const apiSurfaces = [
    `POST /api/${idea.domain.toLowerCase()}/run — trigger the core mechanic`,
    `GET /api/${idea.domain.toLowerCase()}/history — load previous results`,
    `POST /api/feedback — accept the "adjust one input" refinement`,
  ];

  const deployment = fe.includes('Next') ? 'Vercel (zero-config)' : fe.includes('Vite') ? 'Netlify' : 'Vercel/Netlify';

  return {
    summary: `${fe} single-repo app on ${db}, deployed to ${deployment}. One screen owns the core loop; sponsor APIs sit behind adapters.`,
    recommendedStack: stack,
    modules,
    dataModel,
    apiSurfaces,
    deployment,
    sponsorIntegrations: sponsorOpportunities.map((s) => s.name),
  };
}

function frameworkFor(stack: string[]): string {
  const flat = stack.join(' ').toLowerCase();
  if (flat.includes('next')) return 'Next.js';
  if (flat.includes('react')) return 'React + Vite';
  if (flat.includes('svelte')) return 'SvelteKit';
  return 'Next.js';
}

function databaseFor(stack: string[]): string {
  const flat = stack.join(' ').toLowerCase();
  if (flat.includes('firebase')) return 'Firebase Firestore';
  if (flat.includes('supabase')) return 'Supabase';
  if (flat.includes('sqlite')) return 'SQLite (better-sqlite3)';
  return 'SQLite (better-sqlite3)';
}

function selectStack(analysis: CompetitionAnalysis, mustApi?: SponsorOpportunity): string[] {
  const theme = analysis.challenge?.theme?.toLowerCase() ?? '';
  const api = mustApi?.name?.toLowerCase() ?? '';

  if (api.includes('firebase')) return ['Vanilla JS', 'Firebase', 'Firebase Hosting'];
  if (/openai|gemini|anthropic|cohere|hugging/.test(api)) return ['Next.js', 'TypeScript', 'Tailwind CSS', 'Vercel'];
  if (api.includes('twilio')) return ['Node.js', 'Express', 'SQLite', 'Render'];
  if (api.includes('stripe')) return ['Next.js', 'Stripe', 'SQLite', 'Vercel'];
  if (theme.includes('mobile')) return ['React', 'Vite', 'Netlify'];
  if (theme.includes('data') || theme.includes('dashboard') || theme.includes('analytics')) return ['Next.js', 'Chart.js', 'SQLite', 'Vercel'];
  if (/ai|ml|llm/.test(theme)) return ['Next.js', 'TypeScript', 'Tailwind CSS', 'Vercel'];
  return ['Next.js', 'TypeScript', 'Tailwind CSS', 'Vercel'];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
