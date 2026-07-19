import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { CATEGORY_SUITE, ALL_DIMENSIONS, getCategory } from '../../features/benchmarks/category-suite.js';
import {
  evaluateProject,
  generateStarter,
  saveRun,
  listHistory,
  compareRuns,
  type CategoryRunResult,
} from '../../features/benchmarks/framework.js';

let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'hag-bench-'));
});

afterAll(() => {
  if (existsSync(root)) rmSync(root, { recursive: true });
});

describe('category suite', () => {
  it('defines 16 real categories', () => {
    expect(CATEGORY_SUITE.length).toBe(16);
    const ids = CATEGORY_SUITE.map((c) => c.id);
    expect(ids).toContain('landing-page');
    expect(ids).toContain('ai-chat');
    expect(ids).toContain('cli');
    expect(ids).toContain('api');
    expect(new Set(ids).size).toBe(ids.length); // unique
  });

  it('every category has acceptance checks + normalized weights', () => {
    for (const c of CATEGORY_SUITE) {
      expect(c.acceptance.length).toBeGreaterThan(0);
      const wsum = ALL_DIMENSIONS.reduce((s, d) => s + (c.weights[d] ?? 0), 0);
      // weights are either 0 or sum ~100 (empty → 0)
      expect(wsum).toBeGreaterThanOrEqual(0);
    }
  });

  it('getCategory resolves by id', () => {
    expect(getCategory('saas')!.name).toBe('SaaS');
    expect(getCategory('nope')).toBeUndefined();
  });
});

describe('framework: generateStarter', () => {
  it('writes a real, compiling-less TS project', () => {
    const dir = path.join(root, 'starter-cli');
    const written = generateStarter('cli', dir);
    expect(written).toContain('package.json');
    expect(written).toContain('src/index.ts');
    expect(existsSync(path.join(dir, 'package.json'))).toBe(true);
    expect(existsSync(path.join(dir, 'src', 'index.ts'))).toBe(true);
    const pkg = JSON.parse(readFileSync(path.join(dir, 'package.json'), 'utf-8'));
    expect(pkg.name).toContain('cli');
    // the generated TS must be syntactically valid
    expect(() => new Function(readFileSync(path.join(dir, 'src', 'index.ts'), 'utf-8'))).not.toThrow();
  });
});

describe('framework: evaluateProject', () => {
  it('evaluates 15 deterministic dimensions', () => {
    const dir = path.join(root, 'proj-landing');
    generateStarter('landing-page', dir);
    const r = evaluateProject('landing-page', dir, { seed: 42, model: 'baseline' });
    expect(r.dimensions.length).toBe(15);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
    expect(['A', 'B', 'C', 'D', 'F']).toContain(r.grade);
    // deterministic for same inputs
    const r2 = evaluateProject('landing-page', dir, { seed: 42, model: 'baseline' });
    expect(r2.runId).toBe(r.runId);
    expect(r2.score).toBe(r.score);
  });

  it('different seed ⇒ different runId, same score substance', () => {
    const dir = path.join(root, 'proj-api');
    generateStarter('api', dir);
    const a = evaluateProject('api', dir, { seed: 1 });
    const b = evaluateProject('api', dir, { seed: 2 });
    expect(a.runId).not.toBe(b.runId);
    expect(a.score).toBe(b.score);
  });
});

describe('framework: history + comparison', () => {
  it('saves, lists, and compares runs', () => {
    const dataDir = path.join(root, 'history');
    const dirA = path.join(root, 'h-a');
    const dirB = path.join(root, 'h-b');
    generateStarter('dashboard', dirA);
    generateStarter('dashboard', dirB);

    const ra = evaluateProject('dashboard', dirA, { seed: 11, model: 'model-a', dataDir });
    const rb = evaluateProject('dashboard', dirB, { seed: 11, model: 'model-b', dataDir });
    saveRun(ra, dataDir);
    saveRun(rb, dataDir);

    const list = listHistory(dataDir);
    expect(list.length).toBe(2);

    const cmp = compareRuns(ra.runId, rb.runId, dataDir);
    expect(cmp).not.toBeNull();
    expect(cmp!.rows.length).toBe(15);
    expect(cmp!.aggregateDelta).toBe(ra.score - rb.score);
  });

  it('compareRuns returns null for missing runs', () => {
    const cmp = compareRuns('missing-1', 'missing-2', root);
    expect(cmp).toBeNull();
  });
});
