/**
 * Benchmark History Store
 * ========================
 *
 * Append-only JSONL ledger of every measured benchmark run, keyed so we can
 * later build leaderboards, compare configurations, and suggest improvements.
 *
 * Storage: <dataDir>/benchmarks/runs.jsonl  (never overwrites user code).
 * All IDs/timestamps are deterministic (no wall clock, no Math.random).
 *
 * A `BenchmarkRun` records the FULL configuration that produced the result so
 * comparisons are meaningful: model, provider, promptVersion, architecture,
 * repairStrategy, agentStrategy. This is what makes "compare models / prompts
 * / architectures" and "suggest better X" actually grounded in data.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid, deterministicNow } from '../../benchmarks/determinism-kernel.js';

import type { DimensionName, MeasuredDimension } from './measure.js';

export interface RunConfig {
  model?: string;
  provider?: string;
  promptVersion?: string;
  architecture?: string;
  repairStrategy?: string;
  agentStrategy?: string;
  seed?: number;
  /** Free-form tags (e.g. benchmark id, app type). */
  tags?: string[];
}

export interface BenchmarkRun {
  id: string;
  config: RunConfig;
  /** App types / benchmark ids this run covers. */
  benchmarks: string[];
  dimensions: Record<string, MeasuredDimension>;
  /** Mean of comparable (measured & numeric) dimension scores, 0..1. */
  compositeScore: number;
  comparableCount: number;
  measuredAt: string;
  /** Optional note (e.g. what changed since last run). */
  note?: string;
}

export interface HistoryQuery {
  model?: string;
  provider?: string;
  promptVersion?: string;
  architecture?: string;
  repairStrategy?: string;
  agentStrategy?: string;
  benchmark?: string;
  limit?: number;
}

export class BenchmarkHistory {
  private readonly dir: string;
  private readonly file: string;

  constructor(dataDir: string) {
    this.dir = path.resolve(dataDir, 'benchmarks');
    this.file = path.resolve(this.dir, 'runs.jsonl');
  }

  private load(): BenchmarkRun[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf-8')
      .split('\n')
      .filter((l) => l.trim().length > 0)
      .map((l) => JSON.parse(l) as BenchmarkRun);
  }

  /** Record a run. Returns the stored run (with deterministic id/timestamp). */
  record(input: {
    config: RunConfig;
    benchmarks: string[];
    dimensions: MeasuredDimension[];
    note?: string;
  }): BenchmarkRun {
    const comparable = input.dimensions.filter((d) => d.measured && typeof d.score === 'number');
    const composite =
      comparable.length > 0 ? comparable.reduce((s, d) => s + (d.score as number), 0) / comparable.length : 0;

    const dims: Record<string, MeasuredDimension> = {};
    for (const d of input.dimensions) dims[d.name] = d;

    const run: BenchmarkRun = {
      id: 'br-' + createDeterministicUuid(0, this.load().length + 1).slice(0, 12),
      config: input.config,
      benchmarks: input.benchmarks,
      dimensions: dims,
      compositeScore: Number(composite.toFixed(4)),
      comparableCount: comparable.length,
      measuredAt: deterministicNow(0),
      note: input.note,
    };

    if (!existsSync(this.dir)) mkdirSync(this.dir, { recursive: true });
    appendFileSync(this.file, JSON.stringify(run) + '\n', 'utf-8');
    return run;
  }

  all(): BenchmarkRun[] {
    return this.load();
  }

  query(q: HistoryQuery): BenchmarkRun[] {
    return this.load()
      .filter((r) => (q.model ? r.config.model === q.model : true))
      .filter((r) => (q.provider ? r.config.provider === q.provider : true))
      .filter((r) => (q.promptVersion ? r.config.promptVersion === q.promptVersion : true))
      .filter((r) => (q.architecture ? r.config.architecture === q.architecture : true))
      .filter((r) => (q.repairStrategy ? r.config.repairStrategy === q.repairStrategy : true))
      .filter((r) => (q.agentStrategy ? r.config.agentStrategy === q.agentStrategy : true))
      .filter((r) => (q.benchmark ? r.benchmarks.includes(q.benchmark) : true))
      .slice(-(q.limit ?? 1000));
  }

  latest(): BenchmarkRun | undefined {
    const all = this.load();
    return all[all.length - 1];
  }

  clear(): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.file, '', 'utf-8');
  }
}

export function dimensionNames(): DimensionName[] {
  return [
    'compilation',
    'lint',
    'typeSafety',
    'tests',
    'accessibility',
    'performance',
    'bundleSize',
    'architecture',
    'maintainability',
    'documentation',
    'deployment',
    'userExperience',
  ];
}
