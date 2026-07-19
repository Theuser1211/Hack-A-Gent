/**
 * Hackathon Knowledge Base — Command Entry Point
 * ===============================================
 *
 *   hag knowledge update [--url <devpost|github> ...] [--no-prev]
 *       Seed + augment the KB from curated corpus, internal sources, previous
 *       projects, and optional live URLs. Idempotent (dedup by key).
 *
 *   hag knowledge search <query> [--category <c>] [--source <s>] [--limit n] [--json]
 *       Hybrid semantic-ish search across all entries.
 *
 *   hag knowledge stats [--json]
 *       Totals, breakdown by category and source, average confidence.
 *
 *   hag knowledge explain <id|title> [--json]
 *       Show a single entry in full with evidence/why/confidence.
 *
 *   hag knowledge export [--format json|md] [--out <file>]
 *       Export the whole KB (useful for review / version control).
 *
 * Writes only under <dataDir>/knowledge/ — never touches user code.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

import { success, info, labeled, header, divider, color, dim, log } from '../../cli/output.js';
import type { CLIContext, CLIArgs, CLIResult } from '../../cli/types.js';

import { runIngestion } from './ingest.js';
import { searchKnowledge } from './search.js';
import { KnowledgeStore } from './store.js';
import { CATEGORY_LABELS, KNOWLEDGE_CATEGORIES, type KnowledgeSource } from './types.js';

function storeFor(ctx: CLIContext): KnowledgeStore {
  return new KnowledgeStore(ctx.dataDir);
}

function asJson(args: CLIArgs, ctx: CLIContext): boolean {
  return ctx.outputFormat === 'json' || args.flags.json === true;
}

function writeOut(outFlag: string | undefined, text: string): void {
  if (!outFlag) return;
  const p = path.resolve(outFlag);
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, text, 'utf-8');
}

// ── update ──────────────────────────────────────────────────────────────
export async function knowledgeUpdateCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const store = storeFor(ctx);
  const urls = Array.isArray(args.flags.url)
    ? (args.flags.url as string[])
    : typeof args.flags.url === 'string'
      ? [args.flags.url]
      : [];
  const sources = Array.isArray(args.flags.source)
    ? (args.flags.source as string[])
    : typeof args.flags.source === 'string'
      ? [args.flags.source]
      : undefined;
  const includePrev = args.flags.prev !== false;

  try {
    const result = await runIngestion(store, {
      includePreviousProjects: includePrev,
      externalUrls: urls.length ? urls : undefined,
      sources: sources as KnowledgeSource[] | undefined,
    });
    if (asJson(args, ctx)) {
      return { success: true, message: 'Knowledge base updated', data: result as unknown as Record<string, unknown> };
    }
    header('Knowledge Base — Update');
    labeled('Inserted', String(result.inserted));
    labeled('Sources', JSON.stringify(result.bySource));
    if (result.failed) labeled('Failed fetches', String(result.failed));
    divider();
    success(`Knowledge base updated: ${result.inserted} entries inserted.`);
    info(`Storage: ${path.resolve(ctx.dataDir, 'knowledge', 'entries.jsonl')}`);
    return { success: true, message: 'Knowledge base updated', data: result as unknown as Record<string, unknown> };
  } catch (e) {
    return { success: false, message: `Update failed: ${(e as Error).message}` };
  }
}

// ── search ──────────────────────────────────────────────────────────────
export async function knowledgeSearchCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const query = args.positional[0];
  if (!query) {
    return { success: false, message: 'Usage: hag knowledge search <query> [--category <c>] [--source <s>] [--limit n]' };
  }
  const store = storeFor(ctx);
  const category = typeof args.flags.category === 'string' ? (args.flags.category as never) : undefined;
  const source = typeof args.flags.source === 'string' ? (args.flags.source as never) : undefined;
  const limit = typeof args.flags.limit === 'number' ? args.flags.limit : 10;

  const results = searchKnowledge(store.all(), {
    query,
    category,
    source,
    limit,
  });

  if (asJson(args, ctx)) {
    return { success: true, message: 'search', data: { query, count: results.length, results } as unknown as Record<string, unknown> };
  }
  header(`Knowledge Search — "${query}"`);
  if (!results.length) {
    info('No matching entries.');
    return { success: true, message: 'search', data: { results: [] } as unknown as Record<string, unknown> };
  }
  for (const r of results) {
    const c = COLORS[r.entry.category] ?? 'white';
    labeled(color(`${CATEGORY_LABELS[r.entry.category] ?? r.entry.category}`, c), r.entry.title);
    dim(`  score=${r.score.toFixed(2)} conf=${r.entry.confidence} src=${r.entry.source}`);
    if (r.entry.snippet) dim(`  ${r.entry.snippet.slice(0, 90)}`);
  }
  divider();
  info(`${results.length} result(s). Use "hag knowledge explain <id>" for full detail.`);
  return { success: true, message: 'search', data: { query, results } };
}

// ── stats ───────────────────────────────────────────────────────────────
export async function knowledgeStatsCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const store = storeFor(ctx);
  const stats = store.stats();
  if (asJson(args, ctx)) {
    return { success: true, message: 'stats', data: stats as unknown as Record<string, unknown> };
  }
  header('Knowledge Base — Stats');
  labeled('Total entries', String(stats.total));
  labeled('Avg confidence', stats.avgConfidence.toFixed(2));
  divider();
  info('By category:');
  for (const cat of KNOWLEDGE_CATEGORIES) {
    const n = stats.byCategory[cat] ?? 0;
    if (n) labeled(`  ${CATEGORY_LABELS[cat] ?? cat}`, String(n));
  }
  divider();
  info('By source:');
  for (const [src, n] of Object.entries(stats.bySource)) {
    labeled(`  ${src}`, String(n));
  }
  return { success: true, message: 'stats', data: stats };
}

// ── explain ─────────────────────────────────────────────────────────────
export async function knowledgeExplainCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const idOrTitle = args.positional[0];
  if (!idOrTitle) {
    return { success: false, message: 'Usage: hag knowledge explain <id|title>' };
  }
  const store = storeFor(ctx);
  const entry =
    store.all().find((e) => e.id === idOrTitle || e.dedupKey === idOrTitle || e.title.toLowerCase().includes(idOrTitle.toLowerCase())) ??
    undefined;

  if (!entry) {
    return { success: false, message: `No entry matching "${idOrTitle}".` };
  }
  if (asJson(args, ctx)) {
    return { success: true, message: 'explain', data: entry as unknown as Record<string, unknown> };
  }
  header(`Knowledge — ${entry.title}`);
  labeled('ID', entry.id);
  labeled('Category', CATEGORY_LABELS[entry.category] ?? entry.category);
  labeled('Source', entry.source);
  labeled('Confidence', String(entry.confidence));
  labeled('Evidence', entry.evidence);
  divider();
  info('WHY:');
  log(entry.why);
  info('BODY:');
  log(entry.body);
  if (entry.tags.length) labeled('Tags', entry.tags.join(', '));
  return { success: true, message: 'explain', data: entry as unknown as Record<string, unknown> };
}

// ── export ──────────────────────────────────────────────────────────────
export async function knowledgeExportCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const store = storeFor(ctx);
  const format = typeof args.flags.format === 'string' ? (args.flags.format as 'json' | 'md') : 'json';
  const outFlag = typeof args.flags.out === 'string' ? args.flags.out : undefined;

  const entries = store.all();
  const text =
    format === 'md'
      ? entries
          .map(
            (e) =>
              `## ${e.title} (${e.category})\n\n**Why:** ${e.why}\n\n${e.body}\n\n*Source: ${e.source} · Evidence: ${e.evidence} · Confidence: ${e.confidence}*\n`,
          )
          .join('\n')
      : JSON.stringify(entries, null, 2);

  if (asJson(args, ctx) && !outFlag) {
    return { success: true, message: 'export', data: { count: entries.length, format } as unknown as Record<string, unknown> };
  }
  writeOut(outFlag, text);
  if (outFlag) {
    success(`Exported ${entries.length} entries to ${path.resolve(outFlag)} (${format}).`);
  } else {
    log(text);
  }
  return { success: true, message: 'export', data: { count: entries.length, format } as unknown as Record<string, unknown> };
}

const COLORS: Record<string, 'green' | 'cyan' | 'yellow' | 'magenta' | 'blue' | 'red' | 'white'> = {
  'architecture-pattern': 'cyan',
  'folder-structure': 'blue',
  boilerplate: 'blue',
  'auth-pattern': 'yellow',
  'database-pattern': 'yellow',
  'deployment-pattern': 'green',
  accessibility: 'magenta',
  performance: 'magenta',
  security: 'red',
  testing: 'green',
  'common-pitfall': 'red',
  'winning-technology': 'green',
  'sponsor-api': 'yellow',
};

// ── dispatcher ────────────────────────────────────────────────────────────
export async function knowledgeCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const sub = args.positional[0];
  const rest: CLIArgs = { ...args, positional: args.positional.slice(1) };
  switch (sub) {
    case 'update':
      return knowledgeUpdateCommand(ctx, rest);
    case 'search':
      return knowledgeSearchCommand(ctx, rest);
    case 'stats':
      return knowledgeStatsCommand(ctx, rest);
    case 'explain':
      return knowledgeExplainCommand(ctx, rest);
    case 'export':
      return knowledgeExportCommand(ctx, rest);
    case undefined:
    case 'help':
      if (!asJson(args, ctx)) {
        header('Knowledge Base');
        info('Commands: update, search <query>, stats, explain <id>, export [--format json|md]');
      }
      return { success: true, message: 'knowledge help' };
    default:
      return { success: false, message: `Unknown knowledge subcommand "${sub}". Try: update, search, stats, explain, export.` };
  }
}
