import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { measureProject, ALL_DIMENSIONS, type DimensionName, type MeasuredDimension } from '../../benchmarks/measurement/measure.js';
import { BenchmarkHistory } from '../../benchmarks/measurement/history.js';
import { buildLeaderboard, compareConfigs, suggestImprovements } from '../../benchmarks/measurement/leaderboard.js';

const created: string[] = [];
afterEach(() => {
  for (const d of created) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  created.length = 0;
});

function tmp(): string {
  const d = mkdtempSync(path.join(tmpdir(), 'hag-bench-'));
  created.push(d);
  return d;
}

function dim(res: { dimensions: MeasuredDimension[] }, name: DimensionName): MeasuredDimension {
  return res.dimensions.find((d) => d.name === name)!;
}

function fixtureProject(dir: string, opts: { withTests?: boolean; withEslint?: boolean; broken?: boolean } = {}): void {
  writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ name: 'fx', scripts: { test: 'vitest run' } }, null, 2));
  writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify({ compilerOptions: { strict: true, noEmit: true, skipLibCheck: true, lib: ['es2020'] }, include: ['src'] }, null, 2),
  );
  if (opts.withEslint) {
    writeFileSync(path.join(dir, '.eslintrc.json'), JSON.stringify({ root: true, parser: '@typescript-eslint/parser', rules: {} }, null, 2));
  }
  mkdirSync(path.join(dir, 'src'), { recursive: true });
  const code = opts.broken
    ? `export const x: number = "not a number";\n`
    : `export const greet = (n: string): string => \`hi \${n}\`;\n`;
  writeFileSync(path.join(dir, 'src', 'index.ts'), code);
}

describe('ALL_DIMENSIONS', () => {
  it('covers the 12 required engineering dimensions', () => {
    expect(ALL_DIMENSIONS.sort()).toEqual([
      'accessibility', 'architecture', 'bundleSize', 'compilation', 'deployment',
      'documentation', 'lint', 'maintainability', 'performance', 'tests',
      'typeSafety', 'userExperience',
    ].sort());
  });
});

describe('measureProject', () => {
  it('measures a clean project and never fabricates', () => {
    const dir = tmp();
    fixtureProject(dir, { withEslint: true });
    const res = measureProject(dir, { skipSlow: true });
    expect(res.dimensions.length).toBe(12);
    expect(dim(res, 'compilation').measured).toBe(true);
    expect(dim(res, 'compilation').score).toBe(1);
    expect(dim(res, 'lint').measured).toBe(true);
    expect(dim(res, 'performance').measured).toBe(false);
  });

  it('reports real errors for a broken project', () => {
    const dir = tmp();
    fixtureProject(dir, { broken: true });
    const res = measureProject(dir, { skipSlow: true });
    expect(dim(res, 'compilation').score!).toBeLessThan(1);
    expect(dim(res, 'typeSafety').score!).toBeLessThan(1);
  });

  it('marks lint unmeasured when no eslint config (no fabrication)', () => {
    const dir = tmp();
    fixtureProject(dir);
    const res = measureProject(dir, { skipSlow: true });
    expect(dim(res, 'lint').measured).toBe(false);
    expect(dim(res, 'lint').score).toBeNull();
  });
});

describe('BenchmarkHistory + leaderboards', () => {
  it('records runs and builds grounded leaderboards/compare/suggest', () => {
    const dir = tmp();
    const hist = new BenchmarkHistory(dir);

    const mkDims = (comp: number, type: number, test: number) => [
      { name: 'compilation' as const, score: comp, raw: 0, measured: true, detail: '' },
      { name: 'typeSafety' as const, score: type, raw: 0, measured: true, detail: '' },
      { name: 'tests' as const, score: test, raw: 0, measured: true, detail: '' },
    ];

    hist.record({ config: { model: 'A', promptVersion: 'p1', architecture: 'next' }, benchmarks: ['real-cli-tool'], dimensions: mkDims(1, 1, 1) });
    hist.record({ config: { model: 'A', promptVersion: 'p1', architecture: 'next' }, benchmarks: ['real-cli-tool'], dimensions: mkDims(1, 0.8, 1) });
    hist.record({ config: { model: 'B', promptVersion: 'p2', architecture: 'vite' }, benchmarks: ['real-cli-tool'], dimensions: mkDims(0.6, 0.5, 0.4) });
    hist.record({ config: { model: 'B', promptVersion: 'p2', architecture: 'vite' }, benchmarks: ['real-cli-tool'], dimensions: mkDims(0.7, 0.6, 0.5) });

    expect(hist.all().length).toBe(4);

    const byModel = buildLeaderboard(hist, 'model');
    expect(byModel.length).toBe(2);
    expect(byModel[0]!.key).toBe('A');
    expect(byModel[0]!.runs).toBe(2);

    const cmp = compareConfigs(hist, { model: 'B' }, { model: 'A' });
    expect(cmp.deltaComposite).toBeGreaterThan(0);
    expect(cmp.dimensionDeltas.length).toBeGreaterThan(0);

    const sug = suggestImprovements(hist);
    expect(sug.length).toBeGreaterThan(0);
    expect(sug.every((s) => s.evidence >= 2)).toBe(true);
  });

  it('returns a "not enough data" suggestion with <2 runs', () => {
    const dir = tmp();
    const hist = new BenchmarkHistory(dir);
    hist.record({ config: { model: 'A' }, benchmarks: [], dimensions: [{ name: 'compilation', score: 1, raw: 0, measured: true, detail: '' }] });
    const sug = suggestImprovements(hist);
    expect(sug.length).toBe(1);
    expect(sug[0]!.text).toContain('Not enough');
  });
});
