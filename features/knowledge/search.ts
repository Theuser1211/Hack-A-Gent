/**
 * Hackathon Knowledge Base — Search
 * =================================
 *
 * Dependency-free semantic-ish search. We deliberately avoid pulling in a
 * vector/ML dependency (none is installed and the corpus is small). Instead
 * we use a transparent, explainable hybrid:
 *
 *   1. Tokenize query + entry (lowercase, strip punctuation, drop stopwords).
 *   2. Field-weighted term overlap: title > tags > why > body > snippet.
 *   3. A lightweight synonym map widens recall (e.g. "auth" ⇄ "login",
 *      "db" ⇄ "database" ⇄ "postgres").
 *   4. Category/source boosts nudge relevant facets without hiding others.
 *
 * The returned `matched` terms make every result explainable, and the score
 * (0..1) is deterministic. This is the seam where a real embedding model
 * could later replace `scoreTermOverlap` without changing the API.
 */

import type { KnowledgeEntry, KnowledgeSearchResult, KnowledgeQueryOptions } from './types.js';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'for', 'with', 'is',
  'are', 'be', 'as', 'at', 'by', 'from', 'that', 'this', 'it', 'use', 'using',
  'can', 'how', 'when', 'what', 'which', 'should', 'must', 'we', 'you', 'your',
  'into', 'out', 'up', 'down', 'not', 'no', 'do', 'does', 'did', 'has', 'have',
  'will', 'would', 'could', 'may', 'might', 'than', 'then', 'them', 'they',
  'their', 'our', 'its', 'if', 'so', 'but', 'about', 'over', 'under', 'also',
]);

/** Cheap synonym expansion for semantic-ish recall. */
const SYNONYMS: Record<string, string[]> = {
  auth: ['authentication', 'login', 'oauth', 'session', 'jwt', 'clerk', 'auth0'],
  login: ['auth', 'authentication', 'oauth', 'session'],
  db: ['database', 'postgres', 'sqlite', 'prisma', 'sql', 'data'],
  database: ['db', 'postgres', 'sqlite', 'prisma', 'sql', 'data', 'supabase', 'firebase'],
  deploy: ['deployment', 'vercel', 'netlify', 'hosting', 'ci', 'cd', 'pipeline'],
  deployment: ['deploy', 'vercel', 'netlify', 'hosting', 'ci', 'cd'],
  api: ['rest', 'graphql', 'endpoint', 'sdk', 'integration'],
  accessibility: ['a11y', 'aria', 'screen', 'reader', 'keyboard', 'contrast'],
  a11y: ['accessibility', 'aria', 'screen', 'reader', 'keyboard'],
  perf: ['performance', 'speed', 'latency', 'cache', 'optimization'],
  performance: ['perf', 'speed', 'latency', 'cache', 'optimization', 'lighthouse'],
  sec: ['security', 'cors', 'xss', 'csrf', 'secret', 'token', 'env'],
  security: ['sec', 'cors', 'xss', 'csrf', 'secret', 'token', 'env', 'auth'],
  test: ['testing', 'vitest', 'jest', 'e2e', 'spec', 'coverage'],
  testing: ['test', 'vitest', 'jest', 'e2e', 'spec', 'coverage'],
  pitfall: ['mistake', 'anti', 'pattern', 'avoid', 'bug', 'error'],
  'common-pitfall': ['mistake', 'anti', 'pattern', 'avoid', 'bug', 'error'],
  arch: ['architecture', 'structure', 'pattern', 'monolith', 'microservice'],
  architecture: ['arch', 'structure', 'pattern', 'monolith', 'layering'],
  folder: ['structure', 'layout', 'tree', 'directories'],
  boilerplate: ['scaffold', 'template', 'starter', 'skeleton'],
  template: ['boilerplate', 'scaffold', 'starter', 'skeleton'],
  sponsor: ['api', 'integration', 'openai', 'stripe', 'vercel', 'twilio'],
  win: ['winning', 'strategy', 'judge', 'score', 'differentiator'],
  winning: ['win', 'strategy', 'judge', 'score', 'differentiator'],
  react: ['next', 'nextjs', 'component', 'spa', 'frontend'],
  next: ['nextjs', 'react', 'app', 'router', 'vercel'],
};

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\-#.]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function expand(terms: string[]): Set<string> {
  const out = new Set<string>(terms);
  for (const t of terms) {
    const syn = SYNONYMS[t];
    if (syn) for (const s of syn) out.add(s);
  }
  return out;
}

/** Normalize + weight an entry's searchable fields into weighted term bags. */
function fieldTerms(entry: KnowledgeEntry): Array<{ term: string; weight: number }> {
  const bags: Array<[string, number]> = [
    [entry.title, 3.0],
    [entry.tags.join(' '), 2.5],
    [entry.why, 1.5],
    [entry.body, 1.0],
    [entry.snippet ?? '', 1.0],
    [entry.evidence, 0.5],
  ];
  const out: Array<{ term: string; weight: number }> = [];
  for (const [text, weight] of bags) {
    for (const term of tokenize(text)) {
      out.push({ term, weight });
    }
  }
  return out;
}

/** Category/source nudge so relevant facets rank a touch higher. */
function facetBoost(entry: KnowledgeEntry, opts: KnowledgeQueryOptions): number {
  let b = 1.0;
  if (opts.category && entry.category === opts.category) b += 0.15;
  if (opts.source && entry.source === opts.source) b += 0.1;
  // Searches that name a category get a tighter match.
  if (opts.query) {
    const q = opts.query.toLowerCase();
    if (q.includes(entry.category.replace('-', ' ')) || q.includes(entry.category)) b += 0.1;
  }
  return b;
}

/**
 * Score one entry against a query. Returns 0 if no term overlap.
 * Deterministic, no randomness.
 */
export function scoreEntry(
  entry: KnowledgeEntry,
  queryTerms: Set<string>,
  opts: KnowledgeQueryOptions,
): { score: number; matched: string[] } {
  const fields = fieldTerms(entry);
  const matched = new Set<string>();
  let weightedHits = 0;
  let totalWeight = 0;

  for (const { term, weight } of fields) {
    totalWeight += weight;
    if (queryTerms.has(term)) {
      weightedHits += weight;
      matched.add(term);
    }
  }

  if (weightedHits === 0) return { score: 0, matched: [] };

  // Normalized field coverage (how much of the entry's weighted text matched).
  const coverage = weightedHits / Math.max(1, totalWeight);
  // Term recall (how many distinct query terms hit something).
  const recall = matched.size / Math.max(1, queryTerms.size);

  let score = 0.7 * coverage + 0.3 * recall;
  score *= facetBoost(entry, opts);
  // Confidence gently scales the final score — low-trust entries sink.
  score *= 0.6 + 0.4 * entry.confidence;
  score = Math.max(0, Math.min(1, score));
  return { score, matched: [...matched] };
}

export function searchKnowledge(
  entries: KnowledgeEntry[],
  opts: KnowledgeQueryOptions,
): KnowledgeSearchResult[] {
  const limit = opts.limit ?? 10;
  const minScore = opts.minScore ?? 0.02;
  const queryTerms = expand(tokenize(opts.query));

  const results: KnowledgeSearchResult[] = [];
  for (const entry of entries) {
    const { score, matched } = scoreEntry(entry, queryTerms, opts);
    if (score >= minScore) results.push({ entry, score, matched });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}
