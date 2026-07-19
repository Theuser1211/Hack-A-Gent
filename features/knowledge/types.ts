/**
 * Hackathon Knowledge Base — Type Definitions
 * ============================================
 *
 * A structured, searchable corpus of hackathon engineering knowledge that
 * improves future planning. Entries are learned from many sources
 * (Devpost, GitHub, official docs, sponsor docs, previous Hack-A-Gent
 * projects, benchmarks, templates, successful architectures, public APIs,
 * open-source projects) and span the categories the brief asks for:
 *
 *   sponsor APIs · winning technologies · architecture patterns ·
 *   folder structures · boilerplates · authentication patterns ·
 *   database patterns · deployment patterns · accessibility ·
 *   performance · security · testing · common pitfalls
 *
 * Design invariants:
 *  - Append-only JSONL storage. Knowledge is NEVER written into a user's
 *    project tree; ingestion only READS external sources and writes to the
 *    data dir. User code is never overwritten.
 *  - Every entry carries `evidence` (where the claim came from) and a
 *    `confidence` so planners can weigh it.
 *  - Deterministic ids/timestamps (no wall-clock, no Math.random).
 */

export type KnowledgeCategory =
  | 'sponsor-api'
  | 'winning-technology'
  | 'architecture-pattern'
  | 'folder-structure'
  | 'boilerplate'
  | 'auth-pattern'
  | 'database-pattern'
  | 'deployment-pattern'
  | 'accessibility'
  | 'performance'
  | 'security'
  | 'testing'
  | 'common-pitfall';

export type KnowledgeSource =
  | 'devpost'
  | 'github'
  | 'official-docs'
  | 'sponsor-docs'
  | 'previous-project'
  | 'benchmark'
  | 'template'
  | 'architecture'
  | 'public-api'
  | 'open-source'
  | 'seed'
  | 'security'
  | 'winning-technology';

export interface KnowledgeEntry {
  id: string;
  category: KnowledgeCategory;
  title: string;
  /** The actual knowledge payload. */
  body: string;
  /** Why this matters / how to apply it (the "so what"). */
  why: string;
  source: KnowledgeSource;
  /** Human-readable provenance, e.g. a URL, file path, or project name. */
  evidence: string;
  /** 0..1 — how much we trust this claim. */
  confidence: number;
  /** Free-form tags used for faceted search. */
  tags: string[];
  /** Pre-tokenized lowercased terms for fast search (filled on ingest). */
  keywords: string[];
  /** Optional structured code/content snippet (never injected into user code). */
  snippet?: string;
  /** Stable key used for idempotent upserts (category:slug). */
  dedupKey: string;
  createdAt: string;
  updatedAt: string;
}

export const KNOWLEDGE_CATEGORIES: KnowledgeCategory[] = [
  'sponsor-api',
  'winning-technology',
  'architecture-pattern',
  'folder-structure',
  'boilerplate',
  'auth-pattern',
  'database-pattern',
  'deployment-pattern',
  'accessibility',
  'performance',
  'security',
  'testing',
  'common-pitfall',
];

export const CATEGORY_LABELS: Record<KnowledgeCategory, string> = {
  'sponsor-api': 'Sponsor APIs',
  'winning-technology': 'Winning Technologies',
  'architecture-pattern': 'Architecture Patterns',
  'folder-structure': 'Folder Structures',
  boilerplate: 'Boilerplates',
  'auth-pattern': 'Authentication Patterns',
  'database-pattern': 'Database Patterns',
  'deployment-pattern': 'Deployment Patterns',
  accessibility: 'Accessibility',
  performance: 'Performance',
  security: 'Security',
  testing: 'Testing',
  'common-pitfall': 'Common Pitfalls',
};

export interface KnowledgeQueryOptions {
  query: string;
  category?: KnowledgeCategory;
  source?: KnowledgeSource;
  limit?: number;
  /** Minimum relevance score (0..1) to include. */
  minScore?: number;
}

export interface KnowledgeSearchResult {
  entry: KnowledgeEntry;
  score: number;
  /** Which matched terms drove the score (for explainability). */
  matched: string[];
}
