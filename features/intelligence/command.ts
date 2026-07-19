/**
 * Hackathon Intelligence Engine — Command Entry Point
 * ===================================================
 *
 * Implements the intelligence commands:
 *   hag analyze <url|file|text>     full 20+ dimension analysis (terminal)
 *   hag inspect <url|file|text>     same, but verbose (risks, winners)
 *   hag opportunities <...>         scoring opportunities + MVP focus
 *   hag sponsors <...>              sponsor & API breakdown
 *   hag timeline <...>              timeline & milestones
 *   hag strategy <...>              winning strategy + differentiators
 *   hag compare <a> <b>             diff two hackathons
 *
 * All support `--json` (full structured output) and `--out <file>` to save.
 * The structural analysis is deterministic and needs no LLM; an optional
 * `--enrich` flag would call an injected LLM hook (not wired by default).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

import { success, error, info, labeled } from '../../cli/output.js';
import type { CLIContext, CLIArgs, CLIResult } from '../../cli/types.js';

import { runIntelligence, compareIntelligence, type IntelligenceInput } from './engine.js';
import { toJson, toView, printView } from './renderer.js';

export type IntelligenceCommandName =
  | 'analyze'
  | 'inspect'
  | 'opportunities'
  | 'sponsors'
  | 'timeline'
  | 'strategy';

export interface IntelligenceCommandDeps {
  llmCall?: (system: string, user: string) => Promise<string | null>;
}

/** Shared engine runner for the single-source commands. */
async function runEngine(
  ctx: CLIContext,
  args: CLIArgs,
  mode: IntelligenceCommandName,
  deps: IntelligenceCommandDeps = {},
): Promise<CLIResult> {
  const source = args.positional[0];
  const outFlag = typeof args.flags.out === 'string' ? args.flags.out : undefined;
  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const asJson = ctx.outputFormat === 'json' || args.flags.json === true;

  if (!source) {
    return { success: false, message: `Usage: hag ${mode} <devpost-url | file.html | "text spec">` };
  }

  const input: IntelligenceInput = { source, seed, llmCall: deps.llmCall };
  // Allow `--html <file>` to inject pre-fetched HTML (offline / tests).
  if (typeof args.flags.html === 'string' && existsSync(path.resolve(args.flags.html))) {
    input.htmlOverride = readFileSync(path.resolve(args.flags.html), 'utf-8');
    input.source = path.resolve(args.flags.html);
  }

  try {
    const out = await runIntelligence(input);

    if (asJson) {
      // In JSON mode, main() serializes the returned CLIResult (with `data`).
      // Only write a file here if --out is given; otherwise rely on main().
      if (outFlag) {
        writeOut(outFlag, toJson(out));
        success(`Analysis written to ${outFlag}`);
      }
    } else {
      if (outFlag) {
        const body = toView(out, mode);
        writeOut(outFlag, body);
        success(`Report written to ${outFlag}`);
      } else {
        printView(out, mode);
      }
    }

    return {
      success: true,
      message: `Analyzed "${out.core.projectOverview.slice(0, 60)}…" — ${out.competition.level} competition, ${out.probability.competitiveness}% competitiveness.`,
      data: out as unknown as Record<string, unknown>,
      metrics: {
        difficulty: out.core.difficultyScore,
        competition: out.competition.score,
        completion: out.probability.completion,
        competitiveness: out.probability.competitiveness,
        sponsorCount: out.sponsors.length,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Intelligence failed: ${msg}`);
    return { success: false, message: `Intelligence failed: ${msg}` };
  }
}

export async function analyzeCommand(ctx: CLIContext, args: CLIArgs, deps: IntelligenceCommandDeps = {}): Promise<CLIResult> {
  return runEngine(ctx, args, 'analyze', deps);
}

export async function inspectCommand(ctx: CLIContext, args: CLIArgs, deps: IntelligenceCommandDeps = {}): Promise<CLIResult> {
  return runEngine(ctx, args, 'inspect', deps);
}

export async function opportunitiesCommand(ctx: CLIContext, args: CLIArgs, deps: IntelligenceCommandDeps = {}): Promise<CLIResult> {
  return runEngine(ctx, args, 'opportunities', deps);
}

export async function sponsorsCommand(ctx: CLIContext, args: CLIArgs, deps: IntelligenceCommandDeps = {}): Promise<CLIResult> {
  return runEngine(ctx, args, 'sponsors', deps);
}

export async function timelineCommand(ctx: CLIContext, args: CLIArgs, deps: IntelligenceCommandDeps = {}): Promise<CLIResult> {
  return runEngine(ctx, args, 'timeline', deps);
}

export async function strategyCommand(ctx: CLIContext, args: CLIArgs, deps: IntelligenceCommandDeps = {}): Promise<CLIResult> {
  return runEngine(ctx, args, 'strategy', deps);
}

/** Compare two hackathons: `hag compare <a> <b>`. */
export async function compareCommand(ctx: CLIContext, args: CLIArgs, deps: IntelligenceCommandDeps = {}): Promise<CLIResult> {
  const [aSrc, bSrc] = args.positional;
  const outFlag = typeof args.flags.out === 'string' ? args.flags.out : undefined;
  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const asJson = ctx.outputFormat === 'json' || args.flags.json === true;

  if (!aSrc || !bSrc) {
    return { success: false, message: 'Usage: hag compare <url-a|file-a|text-a> <url-b|file-b|text-b>' };
  }

  try {
    const [a, b] = await Promise.all([
      runIntelligence({ source: aSrc, seed, llmCall: deps.llmCall }),
      runIntelligence({ source: bSrc, seed, llmCall: deps.llmCall }),
    ]);
    const diff = compareIntelligence(a, b);

    if (asJson) {
      if (outFlag) {
        writeOut(outFlag, JSON.stringify(diff, null, 2));
        success(`Comparison written to ${outFlag}`);
      }
    } else {
      const L: string[] = [];
      L.push(`# Hackathon Comparison`);
      L.push('');
      L.push(`A: ${diff.labels.a} (difficulty ${diff.difficulty.a}, competition ${diff.competition.a}, competitiveness ${diff.probability.a}%)`);
      L.push(`B: ${diff.labels.b} (difficulty ${diff.difficulty.b}, competition ${diff.competition.b}, competitiveness ${diff.probability.b}%)`);
      L.push('');
      L.push(`Difficulty Δ: ${diff.difficulty.delta}  ·  Competition Δ: ${diff.competition.delta}  ·  Competitiveness Δ: ${diff.probability.delta}`);
      L.push(`Top criterion A: ${diff.topCriterionA}  ·  Top criterion B: ${diff.topCriterionB}`);
      L.push('');
      L.push(`Shared sponsors: ${diff.sponsorOverlap.join(', ') || 'none'}`);
      if (diff.uniqueSponsorsA.length) L.push(`Only in A: ${diff.uniqueSponsorsA.join(', ')}`);
      if (diff.uniqueSponsorsB.length) L.push(`Only in B: ${diff.uniqueSponsorsB.join(', ')}`);
      L.push('');
      L.push(diff.notes.map((n) => `• ${n}`).join('\n'));
      const body = L.join('\n');
      if (outFlag) {
        writeOut(outFlag, body);
        success(`Comparison written to ${outFlag}`);
      } else {
        console.log(body);
      }
      labeled('competitiveness Δ', String(diff.probability.delta));
    }

    return {
      success: true,
      message: `Compared two hackathons — competitiveness Δ ${diff.probability.delta}%.`,
      data: diff as unknown as Record<string, unknown>,
      metrics: { competitivenessDelta: diff.probability.delta, competitionDelta: diff.competition.delta },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Comparison failed: ${msg}`);
    return { success: false, message: `Comparison failed: ${msg}` };
  }
}

function writeOut(filePath: string, content: string): void {
  const dir = path.dirname(path.resolve(filePath));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path.resolve(filePath), content, 'utf-8');
}
