/**
 * Parser Production Tests — Quality Metrics, Diagnostics, Learning, Multi-Strategy
 * ===============================================================================
 *
 * Tests for production-grade parser features:
 * - ParserQualityMetrics
 * - ParserDiagnostics
 * - Multi-strategy parsing
 * - Parser learning/failure tracking
 * - Field provenance
 * - Robustness (malformed HTML, missing sections, edge cases)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { parseHackathon } from '../../features/universal-parser/index.js';
import { validateAndRepairSpec, createDefaultSpec } from '../../features/universal-parser/validator.js';
import {
  analyzeAndRecord,
  recordFailure,
  getLearningSummary,
  getRecentRecords,
  exportLearningData,
  importLearningData,
  resetLearningData,
} from '../../features/universal-parser/parser-learning.js';
import type { HackathonSpec, FieldConfidence } from '../../features/universal-parser/types.js';
import { extractUniversalSections } from '../../features/universal-parser/section-extractor.js';

// ─── Test HTML Fixtures ────────────────────────────────────────────

const VALID_HACKATHON_HTML = `<!doctype html>
<html><head>
<meta property="og:site_name" content="Devpost">
<meta property="og:title" content="AI for Good Hack 2027">
<meta property="og:description" content="Build AI that helps people.">
</head><body>
<h1>AI for Good Hack 2027</h1>
<p>Hosted by Acme Foundation. Build AI that helps people. Register for the hackathon now.</p>
<p>The prize pool is $20,000. Demo day is Jan 20. Team size: 2-4 people.</p>
<h2>Judging Criteria</h2>
<ul>
<li>Innovation — 40%</li>
<li>Technical — 35%</li>
<li>Design — 25%</li>
</ul>
<h2>Prizes</h2>
<ul>
<li>Grand Prize: $10,000</li>
<li>Second Place: $5,000</li>
<li>Third Place: $2,500</li>
</ul>
<h2>Sponsors</h2>
<p>Sponsored by OpenAI and Vercel.</p>
<h2>Rules</h2>
<p>Must use OpenAI API. Open to all participants. Eligibility: 18+.</p>
<h2>Timeline</h2>
<p>Registration deadline: Jan 10, 2027</p>
<p>Submission deadline: Jan 15, 2027</p>
</body></html>`;

const MALFORMED_HTML = `<!doctype html>
<html><head><meta property="og:site_name" content="Devpost"><title>Hackathon</title></head>
<body>
<div class="hackathon">
<p>This is a hackathon but the HTML is broken
<p>No closing tags, no proper structure
<p>Register for the hackathon. Prize pool $5,000. Demo day coming.
<p>Eligibility: open to all. Team size: 1-3.
<h1>Broken Hackathon Page</h1>
<h2>Judging Criteria</h2>
<ul><li>Innovation 50%</li><li>Design 50%</li></ul>
</body>`;

const NO_SECTIONS_HTML = `<!doctype html>
<html><head><title>Event</title></head>
<body>
<p>Some random page about technology.</p>
<p>Not a hackathon at all.</p>
</body></html>`;

const DUPLICATE_HEADINGS_HTML = `<!doctype html>
<html><head>
<meta property="og:site_name" content="Devpost">
<meta property="og:title" content="Multi-Track Hackathon">
</head><body>
<h1>Multi-Track Hackathon</h1>
<p>Hosted by TechCorp. Multiple tracks available. Register for the hackathon. Prize pool $15,000. Demo day Jan 25. Team size: 2-4.</p>
<h2>Rules</h2>
<p>Open to all. Eligibility: students and professionals.</p>
<h2>Rules</h2>
<p>Duplicate section heading above.</p>
<h2>Judging Criteria</h2>
<ul>
<li>Innovation — 50%</li>
<li>Implementation — 50%</li>
</ul>
</body></html>`;

const SPONSOR_HEAVY_HTML = `<!doctype html>
<html><head>
<meta property="og:site_name" content="Devpost">
<meta property="og:title" content="SponsorFest Hack 2027">
<meta property="og:description" content="Sponsored by OpenAI, Vercel, Stripe, Twilio, Supabase.">
</head><body>
<h1>SponsorFest Hack 2027</h1>
<p>Hosted by SponsorFest Inc. Register for the hackathon. Prize pool $40,000. Demo day Feb 1. Team size: 2-5. Eligibility: open to all.</p>
<h2>Judging Criteria</h2>
<ul>
<li>Sponsor Integration — 40%</li>
<li>Innovation — 30%</li>
<li>Presentation — 30%</li>
</ul>
<h2>Prizes</h2>
<ul>
<li>Grand Prize: $20,000</li>
<li>OpenAI Track: $5,000</li>
<li>Vercel Track: $5,000</li>
<li>Stripe Track: $5,000</li>
</ul>
<h2>Sponsors</h2>
<p>Sponsored by OpenAI API, Vercel Deployment, Stripe Payments, Twilio Communications, Supabase Database</p>
</body></html>`;

// ─── Helper ────────────────────────────────────────────────────────

async function parseWithDefaults(html: string, url = 'https://devpost.com/software/test'): Promise<HackathonSpec> {
  const result = await parseHackathon(url, html, { router: undefined });
  expect(result.success).toBe(true);
  return result.spec;
}

// ─── Tests ─────────────────────────────────────────────────────────

describe('Parser Quality Metrics', () => {
  it('populates qualityMetrics on successful parse', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    expect(spec.qualityMetrics).toBeDefined();
    expect(spec.qualityMetrics.confidence).toBeGreaterThan(0);
    expect(spec.qualityMetrics.confidence).toBeLessThanOrEqual(1);
    expect(spec.qualityMetrics.parseTimeMs).toBeGreaterThanOrEqual(0);
    expect(spec.qualityMetrics.aiTimeMs).toBe(0); // No router provided
    expect(spec.qualityMetrics.success).toBe(true);
    expect(spec.qualityMetrics.platform).toBeDefined();
    expect(spec.qualityMetrics.warningCount).toBeGreaterThanOrEqual(0);
  });

  it('tracks field counts correctly', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    expect(spec.qualityMetrics.judgingCriteriaCount).toBeGreaterThan(0);
    expect(spec.qualityMetrics.sponsorAPIsCount).toBeGreaterThanOrEqual(0);
    expect(spec.qualityMetrics.inferredFieldsCount).toBeGreaterThanOrEqual(0);
  });

  it('reports failure metrics on non-hackathon', async () => {
    const result = await parseHackathon('https://google.com', NO_SECTIONS_HTML);
    expect(result.success).toBe(false);
    expect(result.spec.qualityMetrics.success).toBe(false);
  });
});

describe('Parser Diagnostics', () => {
  it('populates diagnostics on successful parse', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    expect(spec.diagnostics).toBeDefined();
    expect(Array.isArray(spec.diagnostics.extractedFields)).toBe(true);
    expect(Array.isArray(spec.diagnostics.inferredFields)).toBe(true);
    expect(Array.isArray(spec.diagnostics.missingFields)).toBe(true);
    expect(Array.isArray(spec.diagnostics.warnings)).toBe(true);
    expect(Array.isArray(spec.diagnostics.repairActions)).toBe(true);
    expect(Array.isArray(spec.diagnostics.strategiesAttempted)).toBe(true);
    expect(spec.diagnostics.bestStrategy).toBeDefined();
  });

  it('populates performance metrics', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    expect(spec.diagnostics.performance).toBeDefined();
    expect(spec.diagnostics.performance.htmlParseTimeMs).toBeGreaterThanOrEqual(0);
    expect(spec.diagnostics.performance.sectionExtractionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('tracks extracted vs inferred fields', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    // At minimum, title should be extracted
    expect(spec.diagnostics.extractedFields.length).toBeGreaterThan(0);
  });
});

describe('Multi-Strategy Parsing', () => {
  it('records strategy results', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    // Strategy results are tracked internally, but bestStrategy should be set
    expect(spec.diagnostics.bestStrategy).toBeDefined();
    expect(spec.diagnostics.strategiesAttempted.length).toBeGreaterThan(0);
  });
});

describe('Parser Learning', () => {
  beforeEach(() => {
    resetLearningData();
  });

  it('records parse learning data', async () => {
    await parseWithDefaults(VALID_HACKATHON_HTML);

    const records = getRecentRecords(1);
    expect(records.length).toBe(1);
    expect(records[0].url).toContain('devpost.com');
    expect(records[0].confidence).toBeGreaterThan(0);
    expect(Array.isArray(records[0].extractedFields)).toBe(true);
  });

  it('records failures', () => {
    const failure = recordFailure(
      'unknown_heading',
      'Test failure',
      'generic',
      'Custom Section'
    );
    expect(failure.id).toBeDefined();
    expect(failure.occurrenceCount).toBe(1);
    expect(failure.category).toBe('unknown_heading');
  });

  it('increments occurrence count for duplicate failures', () => {
    const f1 = recordFailure('unknown_heading', 'Test', 'generic', 'X');
    const f2 = recordFailure('unknown_heading', 'Test', 'generic', 'X');
    expect(f1.id).toBe(f2.id);
    expect(f2.occurrenceCount).toBe(2);
  });

  it('generates learning summary', async () => {
    await parseWithDefaults(VALID_HACKATHON_HTML);
    await parseWithDefaults(SPONSOR_HEAVY_HTML);

    const summary = getLearningSummary();
    expect(summary.totalParses).toBe(2);
    expect(summary.totalFailures).toBeGreaterThanOrEqual(0);
  });

  it('exports and imports learning data', async () => {
    await parseWithDefaults(VALID_HACKATHON_HTML);
    const exported = exportLearningData();
    expect(exported.length).toBeGreaterThan(0);

    resetLearningData();
    const imported = importLearningData(exported);
    expect(imported).toBe(true);

    const records = getRecentRecords(1);
    expect(records.length).toBe(1);
  });
});

describe('Field Confidence / Provenance', () => {
  it('populates fieldConfidence on spec', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    expect(spec.fieldConfidence).toBeDefined();
    expect(typeof spec.fieldConfidence).toBe('object');
    expect(Object.keys(spec.fieldConfidence).length).toBeGreaterThan(0);
  });

  it('each field confidence has required fields', async () => {
    const spec = await parseWithDefaults(VALID_HACKATHON_HTML);

    for (const [field, conf] of Object.entries(spec.fieldConfidence)) {
      expect(conf.confidence).toMatch(/^(high|medium|low)$/);
      expect(conf.source).toMatch(/^(extracted|inferred|ai_interpreted)$/);
    }
  });
});

describe('Robustness — Malformed HTML', () => {
  it('handles malformed HTML gracefully', async () => {
    const spec = await parseWithDefaults(MALFORMED_HTML);
    expect(spec).toBeDefined();
    expect(spec.qualityMetrics).toBeDefined();
    expect(spec.diagnostics).toBeDefined();
  });

  it('handles duplicate headings', async () => {
    const spec = await parseWithDefaults(DUPLICATE_HEADINGS_HTML);
    expect(spec).toBeDefined();
    expect(spec.judgingCriteria.length).toBeGreaterThan(0);
  });

  it('handles empty HTML', async () => {
    const result = await parseHackathon('https://example.com', '');
    expect(result.success).toBe(false);
    expect(result.spec.qualityMetrics).toBeDefined();
  });

  it('handles very large HTML', async () => {
    const largeContent = 'x'.repeat(100000);
    const html = `<!doctype html><html><body><h1>Hackathon</h1><p>${largeContent}</p></body></html>`;
    const result = await parseHackathon('https://devpost.com/test', html, { maxHtmlLength: 50000 });
    expect(result).toBeDefined();
  });
});

describe('Non-hackathon Detection', () => {
  it('rejects google.com', async () => {
    const result = await parseHackathon('https://google.com/search', '<html><body>search</body></html>');
    expect(result.success).toBe(false);
  });

  it('rejects youtube.com', async () => {
    const result = await parseHackathon('https://youtube.com/watch?v=123', '<html><body>video</body></html>');
    expect(result.success).toBe(false);
  });

  it('rejects wikipedia.org', async () => {
    const result = await parseHackathon('https://en.wikipedia.org/wiki/Test', '<html><body>article</body></html>');
    expect(result.success).toBe(false);
  });
});

describe('Sponsor-Heavy Parse', () => {
  it('extracts multiple sponsors correctly', async () => {
    const spec = await parseWithDefaults(SPONSOR_HEAVY_HTML);

    expect(spec.sponsorAPIs.length).toBeGreaterThanOrEqual(3);
    const names = spec.sponsorAPIs.map(s => s.name.toLowerCase());
    expect(names).toContain('openai');
    expect(names).toContain('vercel');
  });

  it('tracks sponsor intelligence', async () => {
    const spec = await parseWithDefaults(SPONSOR_HEAVY_HTML);

    expect(spec.sponsorIntelligence).toBeDefined();
    expect(spec.sponsorIntelligence.sponsorsByValue.length).toBeGreaterThan(0);
  });

  it('populates quality metrics for sponsor-heavy page', async () => {
    const spec = await parseWithDefaults(SPONSOR_HEAVY_HTML);

    expect(spec.qualityMetrics.sponsorAPIsCount).toBeGreaterThanOrEqual(3);
  });
});

describe('createDefaultSpec', () => {
  it('includes qualityMetrics', () => {
    const spec = createDefaultSpec('https://test.com', 1000);
    expect(spec.qualityMetrics).toBeDefined();
    expect(spec.qualityMetrics.success).toBe(false);
  });

  it('includes diagnostics', () => {
    const spec = createDefaultSpec('https://test.com', 1000);
    expect(spec.diagnostics).toBeDefined();
    expect(Array.isArray(spec.diagnostics.extractedFields)).toBe(true);
  });

  it('includes intelligence defaults', () => {
    const spec = createDefaultSpec('https://test.com', 1000);
    expect(spec.judgingIntelligence).toBeDefined();
    expect(spec.sponsorIntelligence).toBeDefined();
    expect(spec.opportunityAnalysis).toBeDefined();
    expect(spec.challengeUnderstanding).toBeDefined();
  });

  it('includes fieldConfidence', () => {
    const spec = createDefaultSpec('https://test.com', 1000);
    expect(spec.fieldConfidence).toBeDefined();
    expect(typeof spec.fieldConfidence).toBe('object');
  });
});
