/**
 * Real Benchmark Categories — Command
 * ===================================
 *
 * Implements `hag categories`:
 *   list                       — list the 16 categories
 *   run <id> [dir] [--generate] — eval a project (or a generated starter)
 *   run-all [--generate]       — eval every category's starter
 *   compare <runA> <runB>    — diff two stored runs
 *   history                    — list stored runs
 *
 * All runs are deterministic (keyed by category+model+seed) and stored
 * in the data dir so they can be compared across models/iterations.
 */

import { existsSync, mkdirSync, readdirSync } from 'node:fs';
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

import { CATEGORY_SUITE, getCategory, ALL_DIMENSIONS } from './category-suite.js';
import {
  evaluateProject,
  generateStarter,
  saveRun,
  listHistory,
  compareRuns,
  type CategoryRunResult,
} from './framework.js';

function shortId(runId: string): string {
  return runId.slice(0, 10);
}

function formatRun(result: CategoryRunResult): string {
  const icon = result.passed ? '✅' : '❌';
  const lines = [
    `${icon} ${color(result.categoryName, 'white')} [${result.grade}] — ${result.score}/100 (seed ${result.seed}, ${result.model})`,
  ];
  for (const d of result.dimensions) {
    const mark = d.passed ? '  ✓' : '  ✗';
    lines.push(`${mark} ${d.label.padEnd(20)} ${String(d.score).padStart(3)}/100  ${d.evidence[0] ?? ''}`.slice(0, 120));
  }
  return lines.join('\n');
}

function summarize(results: CategoryRunResult[]): string {
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const avg = total > 0 ? Math.round(results.reduce((s, r) => s + r.score, 0) / total) : 0;
  const grades = results.map((r) => r.grade);
  return [
    '',
    '═══════════════════════════════════════════',
    '  Category Benchmark Results',
    '═══════════════════════════════════════════',
    '',
    `  Categories:  ${total}`,
    `  Passed:     ${passed}`,
    `  Avg score:  ${avg}/100`,
    `  Grades:     ${grades.join(' ')}`,
    '',
  ].join('\n');
}

export async function categoriesCommand(
  ctx: CLIContext,
  args: CLIArgs,
): Promise<CLIResult> {
  const sub: string = args.positional[0] ?? 'list';
  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
  const model = typeof args.flags.model === 'string' ? args.flags.model : 'baseline';
  const generate = args.flags.generate === true;
  const allowShell = args.flags['no-shell'] !== true;

  switch (sub) {
    case 'list': {
      logRaw('');
      logRaw(`  ${color('Available Categories', 'cyan')} (${CATEGORY_SUITE.length})`);
      logRaw('');
      for (const c of CATEGORY_SUITE) {
        logRaw(`  ${color(c.id.padEnd(16), 'white')} ${c.name.padEnd(16)} [${c.difficulty}] ${c.description}`);
      }
      logRaw('');
      logRaw(`  ${color('Dimensions evaluated (15):', 'gray')} ${ALL_DIMENSIONS.join(', ')}`);
      logRaw('');
      return {
        success: true,
        message: `${CATEGORY_SUITE.length} categories available`,
        data: { categories: CATEGORY_SUITE.map((c) => c.id) },
      };
    }

    case 'run': {
      const id = args.positional[1];
      if (!id) return { success: false, message: 'Usage: hag categories run <id> [project-dir] [--generate]' };
      const spec = getCategory(id);
      if (!spec) return { success: false, message: `Unknown category: ${id}` };

      let projectDir: string;
      if (generate || !args.positional[2]) {
        projectDir = path.join(ctx.dataDir, 'starters', id);
        if (existsSync(projectDir)) {
          let entries: string[];
          try { entries = readdirSync(projectDir); } catch { entries = []; }
          if (entries.length > 0 && !args.flags.force) {
            return { success: false, message: `Starter dir '${projectDir}' already exists and is non-empty — use --force to overwrite.` };
          }
        }
        mkdirSync(projectDir, { recursive: true });
        if (generate) generateStarter(id, projectDir);
        else {
          // Default: generate a starter so the benchmark always has a real project.
          generateStarter(id, projectDir);
        }
      } else {
        projectDir = path.resolve(args.positional[2]!);
      }

      if (!existsSync(projectDir)) return { success: false, message: `Project dir not found: ${projectDir}` };

      log(`Evaluating category "${spec.name}" → ${projectDir}`);
      const result = evaluateProject(id, projectDir, { seed, model, allowShell, dataDir: ctx.dataDir });
      saveRun(result, ctx.dataDir);
      log(formatRun(result));
      log('');
      labeled('score', `${result.score}/100 (${result.grade})`);
      labeled('passed', String(result.passed));
      dim(`runId=${shortId(result.runId)} · saved to history`);
      return {
        success: result.passed,
        message: `Category ${id}: ${result.passed ? 'PASS' : 'FAIL'} (${result.score}/100)`,
        data: result as unknown as Record<string, unknown>,
        metrics: { score: result.score, passed: result.passed ? 1 : 0 },
      };
    }

    case 'run-all': {
      const results: CategoryRunResult[] = [];
      for (const c of CATEGORY_SUITE) {
        const projectDir = path.join(ctx.dataDir, 'starters', c.id);
        if (existsSync(projectDir)) {
          let entries: string[];
          try { entries = readdirSync(projectDir); } catch { entries = []; }
          if (entries.length > 0 && !args.flags.force) {
            return { success: false, message: `Starter dir '${projectDir}' already exists and is non-empty — use --force to overwrite.` };
          }
        }
        mkdirSync(projectDir, { recursive: true });
        generateStarter(c.id, projectDir);
        const r = evaluateProject(c.id, projectDir, { seed, model, allowShell, dataDir: ctx.dataDir });
        saveRun(r, ctx.dataDir);
        results.push(r);
      }
      log(summarize(results));
      for (const r of results) log(formatRun(r));
      const passed = results.filter((r) => r.passed).length;
      return {
        success: passed === results.length,
        message: `${passed}/${results.length} categories passed`,
        data: { results: results.map((r) => ({ id: r.categoryId, score: r.score, grade: r.grade })) },
      };
    }

    case 'compare': {
      const aId = args.positional[1];
      const bId = args.positional[2];
      if (!aId || !bId) return { success: false, message: 'Usage: hag categories compare <runA> <runB>' };
      const cmp = compareRuns(aId, bId, ctx.dataDir);
      if (!cmp) return { success: false, message: `Could not find both runs (${aId}, ${bId}) in history` };
      logRaw('');
      logRaw(`  ${color('Comparison', 'cyan')} ${shortId(cmp.aRunId)} vs ${shortId(cmp.bRunId)}`);
      logRaw('');
      for (const row of cmp.rows) {
        const delta = row.delta > 0 ? color(`+${row.delta}`, 'green') : row.delta < 0 ? color(`${row.delta}`, 'red') : color(' 0', 'gray');
        logRaw(`  ${row.dimension.padEnd(20)} ${String(row.a).padStart(3)} → ${String(row.b).padStart(3)}  ${delta}`);
      }
      logRaw('');
      const agg = cmp.aggregateDelta;
      logRaw(`  ${color('Aggregate', 'white')}: ${agg >= 0 ? '+' : ''}${agg}`);
      logRaw('');
      return {
        success: true,
        message: `Aggregate delta: ${agg >= 0 ? '+' : ''}${agg}`,
        data: cmp as unknown as Record<string, unknown>,
      };
    }

    case 'history': {
      const runs = listHistory(ctx.dataDir);
      if (runs.length === 0) {
        info('No benchmark runs stored yet. Run `hag categories run <id> --generate`.');
        return { success: true, message: 'No history', data: { runs: [] } };
      }
      logRaw('');
      logRaw(`  ${color('Stored Runs', 'cyan')} (${runs.length})`);
      logRaw('');
      for (const r of runs) {
        logRaw(`  ${shortId(r.runId)}  ${r.categoryName.padEnd(16)} ${String(r.score).padStart(3)}/100 [${r.grade}] ${r.model}`);
      }
      logRaw('');
      return { success: true, message: `${runs.length} runs stored`, data: { runs: runs.map((r) => shortId(r.runId)) } };
    }

    default:
      return { success: false, message: `Unknown categories subcommand: ${sub}. Use: list, run, run-all, compare, history` };
  }
}

// Small re-export so the CLI wrapper can import cleanly with a stable name.
function logRaw(s: string): void {
  // eslint-disable-next-line no-console
  console.log(s);
}
