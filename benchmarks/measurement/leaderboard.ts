/**
 * Benchmark Leaderboards, Comparison & Suggestions
 * =================================================
 *
 * Turns the raw history ledger into:
 *   - Leaderboards grouped by model / provider / promptVersion / architecture
 *     (mean of real composite scores + sample size).
 *   - A grounded diff between two configurations or two specific runs.
 *   - Suggestions ("suggest better prompts / models / architecture") derived
 *     ONLY from recorded deltas — never invented numbers.
 *
 * Every figure printed here traces back to a measured BenchmarkRun.
 */

import type { BenchmarkHistory, BenchmarkRun, RunConfig } from './history.js';
import type { DimensionName } from './measure.js';

export type GroupKey = 'model' | 'provider' | 'promptVersion' | 'architecture' | 'repairStrategy' | 'agentStrategy';

export interface LeaderboardEntry {
  key: string;
  group: GroupKey;
  runs: number;
  meanComposite: number;
  bestComposite: number;
  /** Mean per-dimension score (only comparable dimensions). */
  meanByDimension: Partial<Record<DimensionName, number>>;
}

function cfgValue(run: BenchmarkRun, group: GroupKey): string | undefined {
  return run.config[group];
}

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

export function buildLeaderboard(history: BenchmarkHistory, group: GroupKey): LeaderboardEntry[] {
  const runs = history.all();
  const byKey = new Map<string, BenchmarkRun[]>();
  for (const r of runs) {
    const k = cfgValue(r, group);
    if (!k) continue;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(r);
  }
  const entries: LeaderboardEntry[] = [];
  for (const [key, rs] of byKey) {
    const composites = rs.map((r) => r.compositeScore);
    const dims = new Map<DimensionName, number[]>();
    for (const r of rs) {
      for (const [dname, d] of Object.entries(r.dimensions)) {
        if (d.measured && typeof d.score === 'number') {
          if (!dims.has(dname as DimensionName)) dims.set(dname as DimensionName, []);
          dims.get(dname as DimensionName)!.push(d.score as number);
        }
      }
    }
    const meanByDimension: Partial<Record<DimensionName, number>> = {};
    for (const [d, vals] of dims) meanByDimension[d] = Number(mean(vals).toFixed(3));
    entries.push({
      key,
      group,
      runs: rs.length,
      meanComposite: Number(mean(composites).toFixed(3)),
      bestComposite: Number(Math.max(...composites).toFixed(3)),
      meanByDimension,
    });
  }
  entries.sort((a, b) => b.meanComposite - a.meanComposite);
  return entries;
}

export interface ComparisonResult {
  baseline: RunConfig;
  candidate: RunConfig;
  baselineRuns: number;
  candidateRuns: number;
  baselineComposite: number;
  candidateComposite: number;
  deltaComposite: number;
  /** Per-dimension mean deltas (candidate - baseline), comparable only. */
  dimensionDeltas: Array<{ dimension: DimensionName; baseline: number; candidate: number; delta: number }>;
}

export function compareConfigs(history: BenchmarkHistory, baseline: RunConfig, candidate: RunConfig): ComparisonResult {
  const baseRuns = history.query(baseline as never);
  const candRuns = history.query(candidate as never);

  const baseComposite = mean(baseRuns.map((r) => r.compositeScore));
  const candComposite = mean(candRuns.map((r) => r.compositeScore));

  const allDims = new Set<DimensionName>();
  for (const r of [...baseRuns, ...candRuns]) for (const d of Object.keys(r.dimensions)) allDims.add(d as DimensionName);

  const dimensionDeltas: ComparisonResult['dimensionDeltas'] = [];
  for (const d of allDims) {
    const bVals = baseRuns.map((r) => r.dimensions[d]).filter((x) => x && x.measured && typeof x.score === 'number').map((x) => x!.score as number);
    const cVals = candRuns.map((r) => r.dimensions[d]).filter((x) => x && x.measured && typeof x.score === 'number').map((x) => x!.score as number);
    if (!bVals.length || !cVals.length) continue;
    const b = mean(bVals);
    const c = mean(cVals);
    dimensionDeltas.push({ dimension: d, baseline: Number(b.toFixed(3)), candidate: Number(c.toFixed(3)), delta: Number((c - b).toFixed(3)) });
  }
  dimensionDeltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return {
    baseline,
    candidate,
    baselineRuns: baseRuns.length,
    candidateRuns: candRuns.length,
    baselineComposite: Number(baseComposite.toFixed(3)),
    candidateComposite: Number(candComposite.toFixed(3)),
    deltaComposite: Number((candComposite - baseComposite).toFixed(3)),
    dimensionDeltas,
  };
}

export interface Suggestion {
  type: 'prompt' | 'model' | 'architecture' | 'repair' | 'agent';
  text: string;
  /** Strength of evidence: number of runs backing the claim. */
  evidence: number;
}

/**
 * Generate grounded suggestions from history. Only emits claims we can
 * support with recorded runs; returns [] when there is not enough data.
 */
export function suggestImprovements(history: BenchmarkHistory): Suggestion[] {
  const out: Suggestion[] = [];
  const runs = history.all();
  if (runs.length < 2) {
    return [{ type: 'prompt', text: 'Not enough benchmark history yet — run more benchmarks to generate grounded suggestions.', evidence: runs.length }];
  }

  const groups: GroupKey[] = ['promptVersion', 'model', 'architecture', 'repairStrategy', 'agentStrategy'];
  for (const g of groups) {
    const boards = buildLeaderboard(history, g);
    if (boards.length >= 2) {
      const best = boards[0]!;
      const worst = boards[boards.length - 1]!;
      const lift = ((best.meanComposite - worst.meanComposite) * 100).toFixed(1);
      if (Number(lift) > 0.5) {
        out.push({
          type: g === 'promptVersion' ? 'prompt' : (g as Suggestion['type']),
          text: `Use ${g}=${best.key} over ${g}=${worst.key}: +${lift}% composite across ${best.runs} runs.`,
          evidence: best.runs + worst.runs,
        });
      }
    }
  }

  // Dim-specific guidance: find the dimension with the largest spread and the
  // config that wins it.
  for (const g of groups) {
    const boards = buildLeaderboard(history, g);
    if (boards.length < 2) continue;
    const dims = Object.keys(boards[0]!.meanByDimension) as DimensionName[];
    for (const d of dims) {
      const vals = boards.map((b) => ({ k: b.key, v: b.meanByDimension[d] ?? 0 }));
      vals.sort((a, b) => b.v - a.v);
      const top = vals[0]!;
      const bot = vals[vals.length - 1]!;
      const lift = ((top.v - bot.v) * 100).toFixed(1);
      if (Number(lift) > 1) {
        out.push({
          type: g === 'promptVersion' ? 'prompt' : (g as Suggestion['type']),
          text: `For ${d}, ${g}=${top.k} leads by +${lift}% vs ${bot.k}.`,
          evidence: boards.reduce((s, b) => s + b.runs, 0),
        });
      }
    }
  }

  out.sort((a, b) => b.evidence - a.evidence);
  return out;
}
