import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { createContext } from '../../cli/context.js';
import type { CLIContext, CLIArgs } from '../../cli/types.js';
import { extractDevpostData, normalizeWeights } from '../../features/analyze/parser.js';
import { analyzeDevpost } from '../../features/analyze/analyzer.js';
import { formatAnalysisHuman, formatAnalysisJson } from '../../features/analyze/formatter.js';
import { analyzeCommand } from '../../features/analyze/command.js';

const SAMPLE_HTML = `<!doctype html>
<html><head>
<meta property="og:title" content="AI for Good Hack 2027">
<meta property="og:description" content="Build AI that helps people. Sponsored by OpenAI and Vercel.">
</head><body>
<h1>AI for Good Hack 2027</h1>
<p>Hosted by Acme Foundation. Build AI that helps people. Judging criteria:</p>
<ul>
<li>Innovation — 40%</li>
<li>Technical — 35%</li>
<li>Design — 25%</li>
</ul>
<p>Must integrate OpenAI and deploy on Vercel. Submission deadline Jan 15, 2027.</p>
</body></html>`;

let tmp: string;
let htmlPath: string;
let ctx: CLIContext;

beforeAll(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'hag-analyze-'));
  htmlPath = path.join(tmp, 'sample.html');
  writeFileSync(htmlPath, SAMPLE_HTML, 'utf-8');
  ctx = createContext(42);
});

afterAll(() => {
  if (existsSync(tmp)) rmSync(tmp, { recursive: true });
});

describe('devpost parser', () => {
  it('extracts sponsors from known keywords', () => {
    const d = extractDevpostData(SAMPLE_HTML, 'https://devpost.com/software/x');
    const names = d.sponsorAPIs.map((s) => s.name);
    expect(names).toContain('OpenAI');
    expect(names).toContain('Vercel');
  });

  it('normalizes judging criteria to sum 100', () => {
    const d = extractDevpostData(SAMPLE_HTML, 'https://devpost.com/software/x');
    const sum = d.judgingCriteria.reduce((s, c) => s + c.weight, 0);
    expect(sum).toBe(100);
    expect(d.judgingCriteria[0]!.name).toContain('Innovation');
  });

  it('extracts deadline', () => {
    const d = extractDevpostData(SAMPLE_HTML, 'https://devpost.com/software/x');
    expect(d.deadlines).toContain('Jan 15, 2027');
  });

  it('normalizeWeights forces a 100 total', () => {
    const out = normalizeWeights([
      { name: 'A', weight: 40, inferred: false },
      { name: 'B', weight: 20, inferred: false },
    ]);
    expect(out.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
});

describe('devpost analyzer', () => {
  const data = extractDevpostData(SAMPLE_HTML, 'https://devpost.com/software/x', 42);

  it('produces all 20 dimensions deterministically', () => {
    const a = analyzeDevpost(data, { seed: 42 });
    const b = analyzeDevpost(data, { seed: 42 });
    expect(a).toEqual(b);
    expect(a.difficultyScore).toBeGreaterThanOrEqual(1);
    expect(a.difficultyScore).toBeLessThanOrEqual(10);
    expect(a.recommendedTeamSize).toBeGreaterThanOrEqual(2);
    expect(a.meta.confidence).toBe('high');
    // 20 numbered sections are present in the human report
    const human = formatAnalysisHuman(a);
    for (let i = 1; i <= 20; i++) expect(human).toContain(`## ${i}.`);
  });

  it('different seed yields same substance, different analysisId', () => {
    const a = analyzeDevpost(data, { seed: 1 });
    const b = analyzeDevpost(data, { seed: 2 });
    expect(a.meta.analysisId).not.toBe(b.meta.analysisId);
    expect(a.technologyStack).toEqual(b.technologyStack);
  });

  it('flags must-use sponsors as scoring opportunities', () => {
    const a = analyzeDevpost(data, { seed: 42 });
    expect(a.scoringOpportunities.length).toBeGreaterThan(0);
    expect(a.potentialDifferentiators.length).toBeGreaterThan(0);
  });

  it('JSON formatter round-trips', () => {
    const a = analyzeDevpost(data, { seed: 42 });
    const json = formatAnalysisJson(a);
    const back = JSON.parse(json) as typeof a;
    expect(back.projectOverview).toBe(a.projectOverview);
    expect(back.meta.analysisId).toBe(a.meta.analysisId);
  });
});

describe('analyze command', () => {
  it('analyzes from a local HTML file (offline)', async () => {
    const args: CLIArgs = {
      command: 'analyze' as CLIArgs['command'],
      subcommand: undefined,
      positional: [],
      flags: { html: htmlPath },
    };
    const result = await analyzeCommand(ctx, args);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    const data = result.data as Record<string, unknown>;
    expect(data!.difficultyScore).toBeDefined();
    expect(result.metrics!.sponsorCount).toBeGreaterThanOrEqual(2);
  });

  it('reports usage error without url or html', async () => {
    const args: CLIArgs = {
      command: 'analyze' as CLIArgs['command'],
      subcommand: undefined,
      positional: [],
      flags: {},
    };
    const result = await analyzeCommand(ctx, args);
    expect(result.success).toBe(false);
  });
});
