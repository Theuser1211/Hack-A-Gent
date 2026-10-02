/**
 * Hackathon Knowledge Base — Store
 * =================================
 *
 * Append-only JSONL persistence under `<dataDir>/knowledge/entries.jsonl`.
 * Knowledge is stored SEPARATELY from any user project tree; this module
 * never reads or writes inside a user's codebase, so user code can never be
 * overwritten by the knowledge base.
 *
 * IDs/timestamps are deterministic (no wall clock, no Math.random) so that
 * re-running ingestion is reproducible and diff-friendly.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid, deterministicNow } from '../../benchmarks/determinism-kernel.js';

import type { KnowledgeEntry, KnowledgeCategory } from './types.js';

const KNOWLEDGE_DIR = 'knowledge';
const ENTRIES_FILE = 'entries.jsonl';

function knowledgeDir(dataDir: string): string {
  return path.resolve(dataDir, KNOWLEDGE_DIR);
}

function entriesPath(dataDir: string): string {
  return path.resolve(knowledgeDir(dataDir), ENTRIES_FILE);
}

function tokenizeForIndex(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9+\-#.]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 1);
}

export interface UpsertInput {
  category: KnowledgeEntry['category'];
  title: string;
  body: string;
  why: string;
  source: KnowledgeEntry['source'];
  evidence: string;
  confidence?: number;
  tags?: string[];
  snippet?: string;
  /** When provided, an existing entry with the same dedupKey is updated. */
  dedupKey?: string;
}

export class KnowledgeStore {
  private readonly dataDir: string;
  private cache: KnowledgeEntry[] | null = null;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /** The knowledge data directory (read-only access for callers). */
  getDataDir(): string {
    return this.dataDir;
  }

  private load(): KnowledgeEntry[] {
    if (this.cache) return this.cache;
    const file = entriesPath(this.dataDir);
    if (!existsSync(file)) {
      this.cache = [];
      return this.cache;
    }
    const lines = readFileSync(file, 'utf-8').split('\n').filter((l) => l.trim().length > 0);
    this.cache = lines.map((l) => JSON.parse(l) as KnowledgeEntry);
    return this.cache;
  }

  private persistAll(entries: KnowledgeEntry[]): void {
    const dir = knowledgeDir(this.dataDir);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(entriesPath(this.dataDir), entries.map((e) => JSON.stringify(e)).join('\n') + '\n', 'utf-8');
    this.cache = entries;
  }

  /** Append a new entry, or update an existing one matched by dedupKey.
   *  Returns true if a NEW entry was inserted, false if an existing one was updated. */
  upsert(input: UpsertInput): boolean {
    const entries = this.load();
    const key = input.dedupKey ?? `${input.category}:${input.title}`.toLowerCase();
    const existing = entries.find((e) => e.dedupKey === key);
    const now = new Date(deterministicNow(0)).toISOString();

    if (existing) {
      const updated: KnowledgeEntry = {
        ...existing,
        body: input.body,
        why: input.why,
        source: input.source,
        evidence: input.evidence,
        confidence: input.confidence ?? existing.confidence,
        tags: input.tags ?? existing.tags,
        snippet: input.snippet ?? existing.snippet,
        keywords: tokenizeForIndex(`${input.title} ${input.body} ${input.why} ${input.tags?.join(' ') ?? ''}`),
        updatedAt: now,
      };
      const idx = entries.indexOf(existing);
      entries[idx] = updated;
      this.persistAll(entries);
      return false;
    }

    const entry: KnowledgeEntry = {
      id: 'kb-' + createDeterministicUuid(0, entries.length + 1).slice(0, 10),
      dedupKey: key,
      category: input.category,
      title: input.title,
      body: input.body,
      why: input.why,
      source: input.source,
      evidence: input.evidence,
      confidence: input.confidence ?? 0.7,
      tags: input.tags ?? [],
      snippet: input.snippet,
      keywords: tokenizeForIndex(`${input.title} ${input.body} ${input.why} ${input.tags?.join(' ') ?? ''}`),
      createdAt: now,
      updatedAt: now,
    };
    entries.push(entry);
    this.persistAll(entries);
    return true;
  }

  all(): KnowledgeEntry[] {
    return this.load();
  }

  byCategory(category: KnowledgeCategory): KnowledgeEntry[] {
    return this.load().filter((e) => e.category === category);
  }

  count(): number {
    return this.load().length;
  }

  stats(): {
    total: number;
    byCategory: Record<string, number>;
    bySource: Record<string, number>;
    avgConfidence: number;
  } {
    const all = this.load();
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let confSum = 0;
    for (const e of all) {
      byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
      bySource[e.source] = (bySource[e.source] ?? 0) + 1;
      confSum += e.confidence;
    }
    return {
      total: all.length,
      byCategory,
      bySource,
      avgConfidence: all.length ? confSum / all.length : 0,
    };
  }

  clear(): void {
    const dir = knowledgeDir(this.dataDir);
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    this.cache = null;
  }

  /** List of source URLs/paths already ingested (for incremental updates). */
  ingestedEvidence(): Set<string> {
    return new Set(this.load().map((e) => e.evidence));
  }
}

export { knowledgeDir, ENTRIES_FILE };
