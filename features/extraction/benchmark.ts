/**
 * Extraction Strategy Benchmark
 * ==============================
 *
 * Runs every registered extractor against the synthetic fixtures and scores
 * each on:
 *
 *  - recall of ground-truth fields (title, organizer, sponsors, judging,
 *    timeline, prizes, themes)
 *  - hallucination rate (presence of known-fake phrases)
 *  - noise ratio (presence of boilerplate that should have been cleaned)
 *  - AI input size and runtime
 *
 * The headline verdict compares the `dom` (production) strategy against the
 * experimental `markdown` strategy. The `jsonld` strategy is scored for
 * reference only.
 */

import { normalizeWithAIRetry } from '../universal-parser/ai-normalizer.js';
import type { RouterEngine } from '../../kernel/llm/router-engine.js';
import { getExtractor, EXTRACTOR_IDS } from './registry.js';
import { BENCHMARK_FIXTURES } from './benchmark-fixtures.js';
import type {
  BenchmarkFixture,
  BenchmarkMetric,
  BenchmarkVerdict,
  ExtractionBenchmarkResult,
  ExtractionResult,
  ExtractorId,
  FixtureScore,
} from './types.js';

export interface BenchmarkOptions {
  fixtures?: BenchmarkFixture[];
  seed?: number;
  /** Also score the jsonld strategy (not part of the verdict). */
  includeJsonLd?: boolean;
  /** Run the AI normalization leg on each strategy's input (requires a router). */
  runAiLeg?: boolean;
  router?: RouterEngine;
}

const HEADLINE_STRATEGIES: ExtractorId[] = ['dom', 'markdown'];

function contains(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function recall(names: string[], haystack: string): number {
  if (names.length === 0) return 1;
  const hits = names.filter((n) => contains(haystack, n)).length;
  return hits / names.length;
}

/** A criterion counts only when its name appears next to an explicit weight. */
function judgingRecall(criteria: string[], sectionsText: string): number {
  if (criteria.length === 0) return 1;
  const lines = sectionsText.split('\n');
  const weighted = /[\:\-—–]\s*\d{1,3}\s*(?:%|pts?|points?)/i;
  const hits = criteria.filter((c) =>
    lines.some((l) => contains(l, c) && weighted.test(l))
  ).length;
  return hits / criteria.length;
}

function scoreFixture(fixture: BenchmarkFixture, result: ExtractionResult): FixtureScore {
  const s = result.sections;
  const gt = fixture.groundTruth;

  const titleHit = contains(`${s.title} ${result.metadata.title}`, gt.title);
  const organizerHit = contains(`${s.metadata} ${s.description}`, gt.organizer);
  const sponsorRecall = recall(gt.sponsors, `${s.sponsors} ${s.metadata} ${s.description} ${result.markdown}`);
  const timelineRecall = recall(gt.timeline, `${s.timeline} ${s.metadata}`);
  const prizeRecall = recall(gt.prizes, `${s.prizes} ${s.metadata} ${s.description}`);
  const themesRecall = recall(gt.themes, `${s.themes} ${s.metadata}`);

  const markers = fixture.hallucinationMarkers ?? [];
  const hallucinationRate = markers.length === 0 ? 0 : markers.filter((m) => contains(result.aiInput, m)).length / markers.length;
  const noiseRatio = fixture.noiseTerms.length === 0 ? 0 : fixture.noiseTerms.filter((n) => contains(result.aiInput, n)).length / fixture.noiseTerms.length;

  const components = [
    titleHit ? 1 : 0,
    organizerHit ? 1 : 0,
    sponsorRecall,
    judgingRecall(gt.judgingCriteria, s.judgingCriteria),
    timelineRecall,
    prizeRecall,
    themesRecall,
  ];
  const completeness = components.reduce((a, b) => a + b, 0) / components.length;

  return {
    fixtureId: fixture.id,
    strategyId: result.strategyId,
    success: true,
    completeness,
    hallucinationRate,
    sponsorRecall,
    judgingRecall: judgingRecall(gt.judgingCriteria, s.judgingCriteria),
    timelineRecall,
    prizeRecall,
    themesRecall,
    titleHit,
    organizerHit,
    missingFields: components.filter((c) => c === 0).length,
    confidence: completeness,
    aiInputBytes: Buffer.byteLength(result.aiInput),
    noiseRatio,
    runtimeMs: result.timingMs,
  };
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function metric(name: string, dom: number, markdown: number, unit: string, better: 'higher' | 'lower'): BenchmarkMetric {
  const winner: BenchmarkMetric['winner'] =
    Math.abs(dom - markdown) < 0.005 ? 'tie' : better === 'higher' ? (dom > markdown ? 'dom' : 'markdown') : (dom < markdown ? 'dom' : 'markdown');
  return { name, dom, markdown, delta: markdown - dom, unit, better, winner };
}

function round(value: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

async function runAiLeg(
  options: BenchmarkOptions,
  fixtures: BenchmarkFixture[],
  runs: Map<string, ExtractionResult>
): Promise<ExtractionBenchmarkResult['aiLeg']> {
  if (!options.runAiLeg || !options.router) {
    return {
      attempted: false,
      ran: false,
      note: 'AI leg disabled. Pass runAiLeg + router to enable; will use the configured LLM.',
    };
  }

  const results: string[] = [];
  let ran = false;
  try {
    for (const fixture of fixtures) {
      for (const strategyId of HEADLINE_STRATEGIES) {
        const result = runs.get(`${fixture.id}:${strategyId}`);
        if (!result) continue;
        const ai = await normalizeWithAIRetry(
          result.sections,
          fixture.url,
          fixture.platform ?? 'generic',
          options.router,
          {},
          0,
          result.aiInput
        );
        ran = true;
        const titleOk = ai?.spec?.title ? contains(fixture.groundTruth.title, ai.spec.title) || contains(ai.spec.title, fixture.groundTruth.title) : false;
        results.push(`${fixture.id}/${strategyId}: isHackathon=${ai?.isHackathon ?? 'error'} title=${ai?.spec?.title ?? 'none'} titleHit=${titleOk}`);
      }
    }
  } catch (error) {
    return { attempted: true, ran, note: `AI leg errored: ${error instanceof Error ? error.message : String(error)}` };
  }

  return { attempted: true, ran, note: results.join('\n') };
}

/** Run the full extraction benchmark. */
export async function runExtractionBenchmark(options: BenchmarkOptions = {}): Promise<ExtractionBenchmarkResult> {
  const fixtures = options.fixtures ?? BENCHMARK_FIXTURES;
  const strategies: ExtractorId[] = options.includeJsonLd ? EXTRACTOR_IDS : HEADLINE_STRATEGIES;
  const scores: FixtureScore[] = [];
  const runs = new Map<string, ExtractionResult>();

  for (const fixture of fixtures) {
    for (const strategyId of strategies) {
      const extractor = getExtractor(strategyId);
      let result: ExtractionResult;
      try {
        result = extractor.extract({
          url: fixture.url,
          html: fixture.html,
          platform: fixture.platform ?? 'generic',
          options: { seed: options.seed },
        });
      } catch (error) {
        scores.push({
          fixtureId: fixture.id,
          strategyId,
          success: false,
          completeness: 0,
          hallucinationRate: 1,
          sponsorRecall: 0,
          judgingRecall: 0,
          timelineRecall: 0,
          prizeRecall: 0,
          themesRecall: 0,
          titleHit: false,
          organizerHit: false,
          missingFields: 7,
          confidence: 0,
          aiInputBytes: 0,
          noiseRatio: 1,
          runtimeMs: 0,
        });
        continue;
      }
      runs.set(`${fixture.id}:${strategyId}`, result);
      scores.push(scoreFixture(fixture, result));
    }
  }

  const domScores = scores.filter((sc) => sc.strategyId === 'dom');
  const markdownScores = scores.filter((sc) => sc.strategyId === 'markdown');

  const avg = (fn: (sc: FixtureScore) => number, arr: FixtureScore[]): number => round(mean(arr.map(fn)));
  const overallQuality = {
    dom: avg((sc) => sc.completeness, domScores),
    markdown: avg((sc) => sc.completeness, markdownScores),
  };

  const metrics: BenchmarkMetric[] = [
    metric('completeness', overallQuality.dom, overallQuality.markdown, '0-1', 'higher'),
    metric('sponsorRecall', avg((sc) => sc.sponsorRecall, domScores), avg((sc) => sc.sponsorRecall, markdownScores), '0-1', 'higher'),
    metric('judgingRecall', avg((sc) => sc.judgingRecall, domScores), avg((sc) => sc.judgingRecall, markdownScores), '0-1', 'higher'),
    metric('timelineRecall', avg((sc) => sc.timelineRecall, domScores), avg((sc) => sc.timelineRecall, markdownScores), '0-1', 'higher'),
    metric('prizeRecall', avg((sc) => sc.prizeRecall, domScores), avg((sc) => sc.prizeRecall, markdownScores), '0-1', 'higher'),
    metric('themesRecall', avg((sc) => sc.themesRecall, domScores), avg((sc) => sc.themesRecall, markdownScores), '0-1', 'higher'),
    metric('titleHit', avg((sc) => (sc.titleHit ? 1 : 0), domScores), avg((sc) => (sc.titleHit ? 1 : 0), markdownScores), '0-1', 'higher'),
    metric('organizerHit', avg((sc) => (sc.organizerHit ? 1 : 0), domScores), avg((sc) => (sc.organizerHit ? 1 : 0), markdownScores), '0-1', 'higher'),
    metric('hallucinationRate', avg((sc) => sc.hallucinationRate, domScores), avg((sc) => sc.hallucinationRate, markdownScores), '0-1', 'lower'),
    metric('noiseRatio', avg((sc) => sc.noiseRatio, domScores), avg((sc) => sc.noiseRatio, markdownScores), '0-1', 'lower'),
    metric('aiInputBytes', round(mean(domScores.map((sc) => sc.aiInputBytes))), round(mean(markdownScores.map((sc) => sc.aiInputBytes))), 'bytes', 'lower'),
    metric('runtimeMs', round(mean(domScores.map((sc) => sc.runtimeMs)), 1), round(mean(markdownScores.map((sc) => sc.runtimeMs)), 1), 'ms', 'lower'),
  ];

  const delta = overallQuality.markdown - overallQuality.dom;
  const verdict: BenchmarkVerdict = delta > 0.02 ? 'markdown_wins' : delta < -0.02 ? 'dom_wins' : 'tie';

  const aiLeg = await runAiLeg(options, fixtures, runs);

  return {
    timestamp: new Date().toISOString(),
    seed: options.seed ?? 42,
    fixtures: fixtures.map((f) => f.id),
    scores,
    metrics,
    overallQuality,
    verdict,
    aiLeg,
  };
}

/** Human-readable summary of a benchmark run. */
export function formatBenchmarkResult(result: ExtractionBenchmarkResult): string {
  const lines: string[] = [];
  lines.push('Extraction Strategy Benchmark');
  lines.push('==============================');
  lines.push(`Seed: ${result.seed} | Fixtures: ${result.fixtures.length} (${result.fixtures.join(', ')})`);
  lines.push('');

  const pad = (s: string, n: number): string => s.padEnd(n);
  const header = `${pad('metric', 20)} ${pad('dom', 10)} ${pad('markdown', 10)} ${pad('delta', 10)} winner`;
  lines.push(header);
  lines.push('-'.repeat(header.length));
  for (const m of result.metrics) {
    lines.push(`${pad(m.name, 20)} ${pad(String(m.dom), 10)} ${pad(String(m.markdown), 10)} ${pad(String(round(m.delta)), 10)} ${m.winner}`);
  }
  lines.push('');
  lines.push(`Overall quality: dom=${result.overallQuality.dom} markdown=${result.overallQuality.markdown}`);
  lines.push(`VERDICT: ${result.verdict}`);
  lines.push('');

  if (result.aiLeg) {
    lines.push('AI leg:');
    lines.push(`  attempted: ${result.aiLeg.attempted} | ran: ${result.aiLeg.ran}`);
    lines.push(result.aiLeg.note);
    lines.push('');
  }

  const byFixture = new Map<string, FixtureScore[]>();
  for (const sc of result.scores) {
    if (!byFixture.has(sc.fixtureId)) byFixture.set(sc.fixtureId, []);
    byFixture.get(sc.fixtureId)!.push(sc);
  }
  for (const [id, list] of byFixture) {
    lines.push(`Fixture ${id}:`);
    for (const sc of list) {
      lines.push(
        `  ${pad(sc.strategyId, 10)} completeness=${sc.completeness} sponsor=${sc.sponsorRecall} judging=${sc.judgingRecall} timeline=${sc.timelineRecall} prize=${sc.prizeRecall} themes=${sc.themesRecall} halluc=${sc.hallucinationRate} noise=${sc.noiseRatio}`
      );
    }
  }

  return lines.join('\n');
}
