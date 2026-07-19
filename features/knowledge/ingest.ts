/**
 * Knowledge Base — Ingestion
 * ===========================
 *
 * Seeds and augments the knowledge base from:
 *   1. Curated, evidence-backed seed corpus (curated.ts)
 *   2. Internal sponsor catalog (features/analyze/parser.ts#KNOWN_SPONSORS)
 *   3. Winning strategy templates (benchmarks/winning-strategy-templates.ts)
 *   4. Known-good package versions (benchmarks/orchestrator-templates.ts)
 *   5. Learned entries from previous Hack-A-Gent projects (<dataDir>/memory/*.jsonl)
 *   6. Optional live Devpost/GitHub fetches (host-allowlisted, timeout-guarded)
 *
 * All writes go through the KnowledgeStore (append-only JSONL), so user code
 * is never touched. Ingestion is idempotent via stable `dedupKey`s.
 */

import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import { KNOWN_PACKAGE_VERSIONS } from '../../benchmarks/orchestrator-templates.js';
import { WINNING_STRATEGIES } from '../../benchmarks/winning-strategy-templates.js';
import { KNOWN_SPONSORS } from '../analyze/parser.js';

import { CURATED_SEED } from './curated.js';
import { KnowledgeStore, type UpsertInput } from './store.js';
import type { KnowledgeCategory, KnowledgeSource } from './types.js';

const FETCH_TIMEOUT_MS = 8000;
const ALLOWED_HOSTS = new Set(['devpost.com', 'www.devpost.com', 'github.com', 'raw.githubusercontent.com']);

interface IngestResult {
  inserted: number;
  skipped: number;
  failed: number;
  bySource: Record<string, number>;
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function ingestCurated(store: KnowledgeStore): number {
  let n = 0;
  for (const seed of CURATED_SEED) {
    const key = `curated:${seed.category}:${slug(seed.title)}`;
    const input: UpsertInput = { ...seed, dedupKey: key };
    if (store.upsert(input)) n += 1;
  }
  return n;
}

function ingestSponsors(store: KnowledgeStore): number {
  let n = 0;
  for (const s of KNOWN_SPONSORS) {
    const key = `sponsor:${slug(s.name)}`;
    const input: UpsertInput = {
      category: 'sponsor-api',
      title: `${s.name} sponsor API`,
      body: `Sponsor API in category "${s.category}". Patterns: ${s.patterns.source}. Typical integration: wire it as an isolated client in lib/ and call it from a server route so UI never blocks on it.`,
      why: 'Sponsor APIs are explicit judging criteria; a genuine, working integration differentiates from teams that only name-drop the sponsor.',
      source: 'official-docs',
      evidence: 'features/analyze/parser.ts#KNOWN_SPONSORS',
      confidence: 0.85,
      tags: ['sponsor', s.category, slug(s.name)],
      snippet: s.patterns.source,
      dedupKey: key,
    };
    if (store.upsert(input)) n += 1;
  }
  return n;
}

function ingestWinningStrategies(store: KnowledgeStore): number {
  let n = 0;
  for (const s of WINNING_STRATEGIES) {
    const key = `strategy:${s.id}`;
    const input: UpsertInput = {
      category: 'winning-technology',
      title: `Strategy: ${s.name}`,
      body: `${s.description} Steps: ${s.executionSteps.join(' → ')}. Guardrails: ${s.guardrails.join('; ')}. Anti-patterns: ${s.antiPatterns.join('; ')}.`,
      why: `Proven pattern (wowFactor ${s.wowFactor}, risk ${s.riskLevel}, predicted bonus +${s.predictedScoreBonus}). Use when the top-weighted criterion favors ${s.category.replace('_', ' ')}.`,
      source: 'winning-technology',
      evidence: 'benchmarks/winning-strategy-templates.ts',
      confidence: 0.8,
      tags: ['strategy', s.category, 'wow', 'demo'],
      dedupKey: key,
    };
    if (store.upsert(input)) n += 1;
  }
  return n;
}

function ingestPackageVersions(store: KnowledgeStore): number {
  const lines = Object.entries(KNOWN_PACKAGE_VERSIONS)
    .map(([pkg, ver]) => `- ${pkg}@${ver}`)
    .join('\n');
  const input: UpsertInput = {
    category: 'boilerplate',
    title: 'Known-good package versions',
    body: `Pin these versions in package.json to avoid resolution surprises during the sprint:\n${lines}`,
    why: 'Unpinned or mismatched dependency versions are a frequent source of install/build failures minutes before submission.',
    source: 'template',
    evidence: 'benchmarks/orchestrator-templates.ts#KNOWN_PACKAGE_VERSIONS',
    confidence: 0.9,
    tags: ['deps', 'versions', 'package.json'],
    dedupKey: 'boilerplate:known-package-versions',
  };
  return store.upsert(input) ? 1 : 0;
}

interface ArchitectureRecord {
  stack?: string;
  outcome?: 'success' | 'failure';
  notes?: string;
  repo?: string;
}

function ingestPreviousProjects(store: KnowledgeStore, dataDir: string): number {
  const memoryDir = path.resolve(dataDir, 'memory');
  if (!existsSync(memoryDir)) return 0;
  let n = 0;

  // Architectures → winning technologies / architecture patterns
  const archFile = path.resolve(memoryDir, 'architectures.jsonl');
  if (existsSync(archFile)) {
    const lines = readFileSync(archFile, 'utf-8').split('\n').filter((l) => l.trim());
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as ArchitectureRecord;
        const key = `prev:arch:${rec.repo ?? rec.stack ?? line.slice(0, 16)}`;
        const ok = rec.outcome === 'success';
        const input: UpsertInput = {
          category: ok ? 'winning-technology' : 'common-pitfall',
          title: `Past project stack: ${rec.stack ?? 'unknown'}`,
          body: rec.notes ?? '',
          why: ok
            ? 'This stack previously succeeded end-to-end — reuse it as a proven baseline.'
            : 'This stack previously failed; avoid repeating the same mistake.',
          source: 'previous-project',
          evidence: 'cli/learning/organizational-memory.ts (architectures.jsonl)',
          confidence: 0.6,
          tags: ['previous', 'stack', rec.outcome ?? 'unknown'],
          dedupKey: key,
        };
        if (store.upsert(input)) n += 1;
      } catch {
        /* skip malformed lines */
      }
    }
  }

  // Bugs + repairs → common pitfalls
  for (const cat of ['bugs', 'repairs'] as const) {
    const file = path.resolve(memoryDir, `${cat}.jsonl`);
    if (!existsSync(file)) continue;
    const lines = readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim());
    for (const line of lines) {
      try {
        const rec = JSON.parse(line) as { description?: string; notes?: string; fix?: string };
        const text = (rec.description ?? rec.notes ?? rec.fix ?? '').trim();
        if (text.length < 12) continue;
        const key = `prev:${cat}:${slug(text).slice(0, 48)}`;
        const input: UpsertInput = {
          category: 'common-pitfall',
          title: `${cat === 'bugs' ? 'Past bug' : 'Past repair'}: ${text.slice(0, 60)}`,
          body: text,
          why: 'Learned from a prior Hack-A-Gent run; pre-empting this saves a repair cycle during a live sprint.',
          source: 'previous-project',
          evidence: `cli/learning/organizational-memory.ts (${cat}.jsonl)`,
          confidence: 0.55,
          tags: ['previous', cat],
          dedupKey: key,
        };
        if (store.upsert(input)) n += 1;
      } catch {
        /* skip malformed lines */
      }
    }
  }

  return n;
}

async function fetchGuarded(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    if (!ALLOWED_HOSTS.has(u.hostname)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(u.toString(), { signal: controller.signal, headers: { 'user-agent': 'hackagent-kb/1.0' } });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

/**
 * Ingest a Devpost or GitHub source. Devpost pages are parsed for sponsor/criteria
 * signals; GitHub raw markdown is ingested as-is. Failures are non-fatal.
 */
async function ingestFromUrl(store: KnowledgeStore, url: string, source: KnowledgeSource): Promise<number> {
  const html = await fetchGuarded(url);
  if (!html) return 0;
  const u = new URL(url);
  const key = `url:${u.hostname}:${slug(u.pathname).slice(0, 48)}`;
  const snippet = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 240);
  const input: UpsertInput = {
    category: 'sponsor-api',
    title: `External source: ${url}`,
    body: snippet,
    why: 'Ingested from a live source to enrich the KB with current sponsor/criteria context.',
    source,
    evidence: url,
    confidence: 0.5,
    tags: ['external', u.hostname],
    dedupKey: key,
  };
  return store.upsert(input) ? 1 : 0;
}

export interface IngestOptions {
  includePreviousProjects?: boolean; // default true
  externalUrls?: string[]; // Devpost/GitHub URLs to fetch
  sources?: KnowledgeSource[]; // per-URL source tag
}

export async function runIngestion(store: KnowledgeStore, opts: IngestOptions = {}): Promise<IngestResult> {
  const result: IngestResult = {
    inserted: 0,
    skipped: 0,
    failed: 0,
    bySource: {},
  };

  const count = (src: string, n: number) => {
    result.bySource[src] = (result.bySource[src] ?? 0) + n;
    result.inserted += n;
  };

  count('curated', ingestCurated(store));
  count('sponsor', ingestSponsors(store));
  count('strategy', ingestWinningStrategies(store));
  count('package-versions', ingestPackageVersions(store));

  if (opts.includePreviousProjects !== false) {
    count('previous-project', ingestPreviousProjects(store, store.getDataDir()));
  }

  if (opts.externalUrls?.length) {
    for (let i = 0; i < opts.externalUrls.length; i += 1) {
      const url = opts.externalUrls[i];
      if (!url) continue;
      const src = opts.sources?.[i] ?? 'devpost';
      try {
        const n = await ingestFromUrl(store, url, src);
        count(`external:${src}`, n);
      } catch {
        result.failed += 1;
      }
    }
  }

  return result;
}

export const KNOWLEDGE_CATEGORIES_INGESTED: KnowledgeCategory[] = [
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
  'winning-technology',
  'sponsor-api',
];
