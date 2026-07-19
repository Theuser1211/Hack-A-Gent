import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { createContext } from '../../cli/context.js';
import type { CLIContext, CLIArgs } from '../../cli/types.js';
import { extractDevpostData, normalizeWeights } from '../../features/analyze/parser.js';
import { analyzeDevpost } from '../../features/analyze/analyzer.js';
import { formatAnalysisHuman, formatAnalysisJson } from '../../features/analyze/formatter.js';
import {
  analyzeCommand,
  sponsorsCommand,
  timelineCommand,
  strategyCommand,
  compareCommand,
} from '../../features/intelligence/command.js';
import { runIntelligence, compareIntelligence } from '../../features/intelligence/engine.js';

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
  tmp = mkdtempSync(path.join(tmpdir(), 'hag-intel-'));
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

  it('normalizeWeights forces a 100 total', () => {
    const out = normalizeWeights([
      { name: 'A', weight: 40, inferred: false },
      { name: 'B', weight: 20, inferred: false },
    ]);
    expect(out.reduce((s, c) => s + c.weight, 0)).toBe(100);
  });
});

describe('intelligence engine', () => {
  const data = extractDevpostData(SAMPLE_HTML, 'https://devpost.com/software/x', 42);

  it('produces the 20 structural dimensions plus the new ones', () => {
    const a = analyzeDevpost(data, { seed: 42 });
    const b = analyzeDevpost(data, { seed: 42 });
    expect(a).toEqual(b);
    expect(a.difficultyScore).toBeGreaterThanOrEqual(1);
    const human = formatAnalysisHuman(a);
    for (let i = 1; i <= 20; i++) expect(human).toContain(`## ${i}.`);
  });

  it('runIntelligence adds competition, probability, judges, requirements, winners', async () => {
    const out = await runIntelligence({ source: SAMPLE_HTML, seed: 42, htmlOverride: SAMPLE_HTML });
    expect(out.competition.level).toBeDefined();
    expect(out.competition.why.length).toBeGreaterThan(20);
    expect(out.probability.completion).toBeGreaterThan(0);
    expect(out.probability.competitiveness).toBeGreaterThan(0);
    expect(out.probability.why.length).toBeGreaterThan(20);
    expect(out.judges.primaryFocus.why.length).toBeGreaterThan(20);
    expect(out.requirements.hard.length + out.requirements.soft.length).toBeGreaterThan(0);
    expect(out.winners.playbook.length).toBeGreaterThan(0);
    expect(out.recommendMvp.every((r) => r.why.length > 0)).toBe(true);
    expect(out.recommendTechnology.every((r) => r.why.length > 0)).toBe(true);
  });

  it('is deterministic for the same input + seed', async () => {
    const a = await runIntelligence({ source: SAMPLE_HTML, seed: 42, htmlOverride: SAMPLE_HTML });
    const b = await runIntelligence({ source: SAMPLE_HTML, seed: 42, htmlOverride: SAMPLE_HTML });
    expect(a.analysisId).toBe(b.analysisId);
    expect(a.competition.score).toBe(b.competition.score);
    expect(a.probability.competitiveness).toBe(b.probability.competitiveness);
  });
});

describe('intelligence commands', () => {
  it('analyze from local HTML (offline) returns full data', async () => {
    const args: CLIArgs = {
      command: 'analyze' as CLIArgs['command'],
      subcommand: undefined,
      positional: [htmlPath],
      flags: {},
    };
    const result = await analyzeCommand(ctx, args);
    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(data!.competition).toBeDefined();
    expect(data!.probability).toBeDefined();
    expect(result.metrics!.competitiveness).toBeGreaterThanOrEqual(0);
  });

  it('sponsors / timeline / strategy views all succeed', async () => {
    const base = { command: 'sponsors' as CLIArgs['command'], subcommand: undefined, positional: [htmlPath], flags: {} };
    expect((await sponsorsCommand(ctx, { ...base, command: 'sponsors' as CLIArgs['command'] })).success).toBe(true);
    expect((await timelineCommand(ctx, { ...base, command: 'timeline' as CLIArgs['command'] })).success).toBe(true);
    expect((await strategyCommand(ctx, { ...base, command: 'strategy' as CLIArgs['command'] })).success).toBe(true);
  });

  it('compare produces a structured diff', async () => {
    const a = await runIntelligence({ source: 'AI app with OpenAI', seed: 42 });
    const b = await runIntelligence({ source: 'Fintech app with Stripe', seed: 42 });
    const diff = compareIntelligence(a, b);
    expect(diff.notes.length).toBeGreaterThan(0);
    expect(typeof diff.probability.delta).toBe('number');
  });

  it('reports usage error without source', async () => {
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
