/**
 * Devpost Intelligence — Command
 * ==============================
 *
 * Implements `hag analyze <devpost-url>` and its alias
 * `hag inspect <devpost-url>`. Fully independent from `hag run`:
 * it fetches/parses a Devpost page and produces a 20-dimension
 * strategic analysis in human (Markdown) or JSON form.
 *
 * Deterministic and offline-friendly: the analysis never requires an LLM.
 * (An optional `--enrich` path can call an injected LLM hook, but the
 * structural analysis does not depend on it.)
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

import {
  header,
  labeled,
  log,
  success,
  error,
  info,
  dim,
  color,
} from '../../cli/output.js';
import type { CLIContext, CLIArgs, CLIResult } from '../../cli/types.js';

import { fetchDevpostHtml, extractDevpostData } from './parser.js';
import { analyzeDevpost, type AnalyzerContext } from './analyzer.js';
import { formatAnalysisHuman, formatAnalysisJson } from './formatter.js';
import { assertSafeDevpostUrl } from './parser.js';

export interface AnalyzeCommandDeps {
  /** Optional deterministic LLM hook for enrichment. */
  llmCall?: AnalyzerContext['llmCall'];
}

/**
 * Entry point used by the CLI feature-command loader. `mode` selects
 * between `analyze` and `inspect` (identical logic, different label).
 */
export async function analyzeCommand(
  ctx: CLIContext,
  args: CLIArgs,
  deps: AnalyzeCommandDeps = {},
): Promise<CLIResult> {
  const url = args.positional[0];
  const htmlFlag = typeof args.flags.html === 'string' ? args.flags.html : undefined;
  const outFlag = typeof args.flags.out === 'string' ? args.flags.out : undefined;
  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const asJson = ctx.outputFormat === 'json' || args.flags.json === true;

  if (!url && !htmlFlag) {
    return {
      success: false,
      message: 'Usage: hag analyze <devpost-url>  (or --html <file.html>)',
    };
  }

  // ── Resolve source HTML (URL fetch OR local file) ──────────────
  let html: string;
  let sourceUrl = url ?? 'local-file';

  try {
    if (htmlFlag) {
      const htmlPath = path.resolve(htmlFlag);
      if (!existsSync(htmlPath)) {
        return { success: false, message: `HTML file not found: ${htmlFlag}` };
      }
      html = readFileSync(htmlPath, 'utf-8');
      info('Loaded HTML from local file (offline mode)');
    } else if (url) {
      // Validate host up-front (clear error before any network call).
      assertSafeDevpostUrl(url);
      log(`Fetching ${color(url, 'cyan')} ...`);
      html = await fetchDevpostHtml(url);
    } else {
      return { success: false, message: 'No URL or --html provided.' };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(msg);
    return { success: false, message: `Failed to obtain Devpost HTML: ${msg}` };
  }

  // ── Parse + analyze (deterministic) ───────────────────────────
  try {
    const parsed = extractDevpostData(html, sourceUrl, seed);
    const analysis = analyzeDevpost(parsed, { seed, llmCall: deps.llmCall });

    const body = asJson ? formatAnalysisJson(analysis) : formatAnalysisHuman(analysis);

    if (asJson) {
      if (outFlag) {
        writeOut(outFlag, body);
      } else {
        console.log(body);
      }
    } else {
      if (outFlag) {
        writeOut(outFlag, body);
        success(`Analysis written to ${outFlag}`);
      } else {
        header(`Devpost Intelligence — ${analysis.meta.analysisId}`);
        console.log(body);
      }
      labeled('confidence', analysis.meta.confidence);
      labeled('difficulty', `${analysis.difficulty} (${analysis.difficultyScore}/10)`);
      labeled('sponsors', String(analysis.sponsorAPIs.length));
      labeled('criteria', String(analysis.judgingPriorities.length));
      dim(`seed=${seed} · analysisId=${analysis.meta.analysisId}`);
    }

    return {
      success: true,
      message: `Analyzed "${parsed.title}" — ${analysis.difficulty} difficulty, ${analysis.sponsorAPIs.length} sponsor APIs.`,
      data: analysis as unknown as Record<string, unknown>,
      metrics: {
        difficulty: analysis.difficultyScore,
        sponsorCount: analysis.sponsorAPIs.length,
        criteriaCount: analysis.judgingPriorities.length,
        teamSize: analysis.recommendedTeamSize,
      },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    error(`Analysis failed: ${msg}`);
    return { success: false, message: `Analysis failed: ${msg}` };
  }
}

function writeOut(filePath: string, content: string): void {
  const dir = path.dirname(path.resolve(filePath));
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path.resolve(filePath), content, 'utf-8');
}
