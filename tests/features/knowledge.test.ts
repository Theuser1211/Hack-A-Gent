import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { KnowledgeStore } from '../../features/knowledge/store.js';
import { searchKnowledge, tokenize, scoreEntry } from '../../features/knowledge/search.js';
import { runIngestion } from '../../features/knowledge/ingest.js';
import { knowledgeCommand } from '../../features/knowledge/command.js';
import { CATEGORY_LABELS, KNOWLEDGE_CATEGORIES, type KnowledgeEntry } from '../../features/knowledge/types.js';
import { createContext } from '../../cli/context.js';
import type { CLIArgs, CLIResult } from '../../cli/types.js';

function tmpDataDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'hag-kb-'));
}

const created: string[] = [];
afterEach(() => {
  for (const d of created) {
    if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  }
  created.length = 0;
});

function baseArgs(over: Partial<CLIArgs>): CLIArgs {
  return { command: 'knowledge' as never, positional: [], flags: {}, ...over };
}

function ctxWith(dataDir: string) {
  const ctx = createContext(42);
  (ctx as unknown as { dataDir: string }).dataDir = dataDir;
  (ctx as unknown as { outputFormat: string }).outputFormat = 'quiet';
  // quiet mode: stub logger to avoid console noise
  (ctx as unknown as { contextLogger?: { log: (s: string) => void } }).contextLogger = { log: () => {} };
  return ctx;
}

describe('knowledge store', () => {
  it('upserts idempotently and stores under dataDir/knowledge', () => {
    const dir = tmpDataDir();
    created.push(dir);
    const store = new KnowledgeStore(dir);
    const a = store.upsert({ category: 'security', title: 'No secrets in code', body: 'x', why: 'y', source: 'security', evidence: 'e', dedupKey: 'k:1' });
    const b = store.upsert({ category: 'security', title: 'No secrets in code', body: 'updated', why: 'y', source: 'security', evidence: 'e', dedupKey: 'k:1' });
    expect(store.count()).toBe(1);
    expect(b).toBe(false);
    expect(a).toBe(true);
    expect(existsSync(path.join(dir, 'knowledge', 'entries.jsonl'))).toBe(true);
  });
});

describe('knowledge search', () => {
  it('tokenizes and finds synonym matches', () => {
    const entry: KnowledgeEntry = {
      id: 'kb-1', dedupKey: 'k', category: 'auth-pattern', title: 'Use OAuth for login',
      body: 'Drop-in auth avoids hand-rolled sessions.', why: 'fast + safe', source: 'official-docs',
      evidence: 'docs', confidence: 0.9, tags: ['auth', 'login'], keywords: [], snippet: undefined,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const r = searchKnowledge([entry], { query: 'authentication login', limit: 5 });
    expect(r.length).toBe(1);
    expect(r[0]!.matched.length).toBeGreaterThan(0);
  });

  it('scoreEntry is deterministic and bounded 0..1', () => {
    const entry: KnowledgeEntry = {
      id: 'kb', dedupKey: 'k', category: 'security', title: 'x', body: 'x', why: 'y',
      source: 'security', evidence: 'e', confidence: 0.5, tags: [], keywords: [], snippet: undefined,
      createdAt: '2020-01-01T00:00:00.000Z', updatedAt: '2020-01-01T00:00:00.000Z',
    };
    const opts = { query: 'x' };
    const s1 = scoreEntry(entry, new Set(['x']), opts);
    const s2 = scoreEntry(entry, new Set(['x']), opts);
    expect(s1.score).toBe(s2.score);
    expect(s1.score).toBeGreaterThanOrEqual(0);
    expect(s1.score).toBeLessThanOrEqual(1);
  });

  it('tokenize drops stopwords', () => {
    const t = tokenize('How to use the authentication and login');
    expect(t).not.toContain('the');
    expect(t).toContain('authentication');
  });
});

describe('knowledge ingestion', () => {
  it('seeds curated + sponsor + strategy + package entries', async () => {
    const dir = tmpDataDir();
    created.push(dir);
    const store = new KnowledgeStore(dir);
    const res = await runIngestion(store, { includePreviousProjects: false });
    expect(res.inserted).toBeGreaterThan(20);
    expect(res.bySource.curated).toBeGreaterThan(0);
    expect(res.bySource.sponsor).toBeGreaterThan(0);
    expect(res.bySource.strategy).toBeGreaterThan(0);
    // Idempotent re-run
    const res2 = await runIngestion(store, { includePreviousProjects: false });
    expect(res2.inserted).toBe(0);
    expect(store.count()).toBe(res.inserted);
  });
});

describe('knowledge command', () => {
  it('update + stats + search + explain + export round-trip', async () => {
    const dir = tmpDataDir();
    created.push(dir);
    const ctx = ctxWith(dir);

    const up = await knowledgeCommand(ctx, baseArgs({ positional: ['update', '--no-prev'] }));
    expect(up.success).toBe(true);
    const store = new KnowledgeStore(dir);
    expect(store.count()).toBeGreaterThan(0);

    const stats = await knowledgeCommand(ctx, baseArgs({ positional: ['stats'] }));
    expect(stats.success).toBe(true);

    const search = await knowledgeCommand(ctx, baseArgs({ positional: ['search', 'authentication'] }));
    expect(search.success).toBe(true);

    const first = store.all()[0]!;
    const explain = await knowledgeCommand(ctx, baseArgs({ positional: ['explain', first.id] }));
    expect(explain.success).toBe(true);

    const exp = await knowledgeCommand(ctx, baseArgs({ positional: ['export', '--format', 'md'] }));
    expect(exp.success).toBe(true);
  });

  it('rejects unknown subcommand', async () => {
    const dir = tmpDataDir();
    created.push(dir);
    const ctx = ctxWith(dir);
    const r: CLIResult = await knowledgeCommand(ctx, baseArgs({ positional: ['bogus'] }));
    expect(r.success).toBe(false);
  });

  it('knows all 13 categories have labels', () => {
    for (const c of KNOWLEDGE_CATEGORIES) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });
});
