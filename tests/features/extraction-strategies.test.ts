/**
 * Extraction Strategies — Unit Tests
 * ===================================
 *
 * Tests for the pluggable extraction system in `features/extraction/`:
 * - HTML cleaner (boilerplate removal, DOCTYPE, noscript preservation)
 * - HTML → Markdown converter (headings, tables, lists, links, img alt)
 * - Markdown strategy end-to-end (sponsors from logo alt text, table judging)
 * - JSON-LD strategy (JS-heavy pages, organizer from schema)
 * - Registry (fallback to dom, listing)
 * - Benchmark runner (fixture ground truth, markdown vs dom verdict)
 */

import { describe, it, expect } from 'vitest';

import { BENCHMARK_FIXTURES } from '../../features/extraction/benchmark-fixtures.js';
import { runExtractionBenchmark } from '../../features/extraction/benchmark.js';
import { domExtractor } from '../../features/extraction/dom-extractor.js';
import { cleanHtml } from '../../features/extraction/html-cleaner.js';
import { countStructure, htmlToMarkdown } from '../../features/extraction/html-to-markdown.js';
import { jsonLdExtractor } from '../../features/extraction/jsonld-extractor.js';
import { markdownExtractor } from '../../features/extraction/markdown-extractor.js';
import { extractStructuredMetadata } from '../../features/extraction/metadata.js';
import { getExtractor, listExtractors, EXTRACTOR_IDS } from '../../features/extraction/registry.js';
import { sectionsFromMarkdown } from '../../features/extraction/sections.js';

const fixture = (id: string) => BENCHMARK_FIXTURES.find((f) => f.id === id)!;

// ─── HTML Cleaner ─────────────────────────────────────────────────

describe('cleanHtml', () => {
  it('removes DOCTYPE, html/body wrappers, head, and scripts', () => {
    const cleaned = cleanHtml(
      '<!DOCTYPE html><html><head><title>T</title><script>var x=1;</script></head><body><p>Hello</p></body></html>'
    ).html;
    expect(cleaned).not.toContain('<!DOCTYPE');
    expect(cleaned).not.toContain('<html');
    expect(cleaned).not.toContain('<head>');
    expect(cleaned).not.toContain('var x=1');
    expect(cleaned).toContain('Hello');
  });

  it('removes nav, footer, cookie banner, and newsletter modal (including nested content)', () => {
    const cleaned = cleanHtml(
      '<nav><a href="/">Home</a><a href="/careers">Careers</a></nav>' +
        '<div class="newsletter-modal"><p>Subscribe to our newsletter.</p><button>Subscribe</button></div>' +
        '<main><p>Real content</p></main>' +
        '<footer><a href="/cookies">Cookie Policy</a></footer>'
    ).html;
    expect(cleaned).not.toContain('Subscribe');
    expect(cleaned).not.toContain('Careers');
    expect(cleaned).not.toContain('Cookie Policy');
    expect(cleaned).toContain('Real content');
  });

  it('preserves <noscript> inner content (JS-heavy fallback)', () => {
    const cleaned = cleanHtml('<div id="app"></div><noscript><h1>Fallback Title</h1></noscript>').html;
    expect(cleaned).toContain('Fallback Title');
  });

  it('counts removed boilerplate blocks', () => {
    const res = cleanHtml(
      '<nav>Nav</nav><div class="cookie-banner"><p>Cookies</p></div><footer>Footer</footer><p>Keep</p>'
    );
    expect(res.removedBlocks).toBeGreaterThanOrEqual(3);
    expect(res.html).toContain('Keep');
  });
});

// ─── HTML → Markdown ───────────────────────────────────────────────

describe('htmlToMarkdown', () => {
  it('renders headings, paragraphs, and GFM tables', () => {
    const md = htmlToMarkdown(
      '<h1>Fintech Build-a-thon</h1><p>Intro</p><table><thead><tr><th>Criterion</th><th>Weight</th></tr></thead>' +
        '<tbody><tr><td>Innovation</td><td>40%</td></tr></tbody></table>'
    );
    expect(md).toContain('# Fintech Build-a-thon');
    expect(md).toContain('| --- | --- |');
    expect(md).toContain('| Innovation | 40% |');
  });

  it('renders links and list items', () => {
    const md = htmlToMarkdown('<ul><li>One</li><li>Two</li></ul><a href="https://x.com">External</a>');
    expect(md).toContain('- One');
    expect(md).toContain('- Two');
    expect(md).toContain('[External](https://x.com)');
  });

  it('keeps image alt text and decodes HTML entities', () => {
    const md = htmlToMarkdown('<img src="/logo.png" alt="Weights &amp; Biases">');
    expect(md).toContain('Weights & Biases');
  });

  it('drops javascript: and hash-only link targets', () => {
    const md = htmlToMarkdown('<a href="javascript:void(0)">Bad</a><a href="#section">Anchor</a>');
    expect(md).toContain('Bad');
    expect(md).not.toContain('javascript:');
    expect(md).not.toContain('#section');
  });

  it('counts structural elements', () => {
    const html = '<h1>T</h1><table></table><ul></ul><a href="/x">x</a>';
    expect(countStructure(html)).toEqual({ headings: 1, tables: 1, lists: 1, links: 1 });
  });
});

// ─── Markdown Strategy ─────────────────────────────────────────────

describe('markdownExtractor', () => {
  it('extracts sponsor names from logo-wall alt text', () => {
    const result = markdownExtractor.extract({
      url: fixture('global-hack-week').url,
      html: fixture('global-hack-week').html,
      platform: 'generic',
    });
    for (const sponsor of fixture('global-hack-week').groundTruth.sponsors) {
      expect(result.sections.sponsors.toLowerCase()).toContain(sponsor.toLowerCase());
    }
    expect(result.warnings.some((w) => /sponsor/i.test(w))).toBe(false);
  });

  it('preserves the intro paragraph (Hosted by …) in the metadata section', () => {
    const result = markdownExtractor.extract({
      url: fixture('global-hack-week').url,
      html: fixture('global-hack-week').html,
      platform: 'generic',
    });
    expect(result.sections.metadata.toLowerCase()).toContain('major league hacking');
  });

  it('recovers judging criteria from tables (fintech fixture)', () => {
    const result = markdownExtractor.extract({
      url: fixture('fintech-buildathon').url,
      html: fixture('fintech-buildathon').html,
      platform: 'generic',
    });
    expect(result.sections.judgingCriteria).toContain('Innovation');
    expect(result.sections.judgingCriteria).toContain('40%');
    expect(result.sections.timeline).toContain('May 10, 2027');
  });

  it('does not hallucinate known-fake phrases', () => {
    const result = markdownExtractor.extract({
      url: fixture('fintech-buildathon').url,
      html: fixture('fintech-buildathon').html,
      platform: 'generic',
    });
    for (const marker of fixture('fintech-buildathon').hallucinationMarkers!) {
      expect(result.aiInput.toLowerCase()).not.toContain(marker.toLowerCase());
    }
  });
});

// ─── JSON-LD Strategy ──────────────────────────────────────────────

describe('jsonLdExtractor', () => {
  it('surfaces Event JSON-LD on a JS-heavy page (luma fixture)', () => {
    const result = jsonLdExtractor.extract({
      url: fixture('luma-ai-hackathon').url,
      html: fixture('luma-ai-hackathon').html,
      platform: 'luma',
    });
    expect(result.metadata.hasJsonLd).toBe(true);
    expect(result.metadata.jsonLd?.['@type']).toBe('Event');
    expect(result.metadata.organizer).toBe('Acme Labs');
    expect(result.sections.timeline).toContain('2027-04-15');
  });

  it('warns when the page has no JSON-LD', () => {
    const result = jsonLdExtractor.extract({
      url: fixture('global-hack-week').url,
      html: fixture('global-hack-week').html,
      platform: 'generic',
    });
    expect(result.metadata.hasJsonLd).toBe(false);
    expect(result.warnings.some((w) => /json-ld/i.test(w))).toBe(true);
  });
});

// ─── Registry ──────────────────────────────────────────────────────

describe('extractor registry', () => {
  it('exposes the three strategies', () => {
    expect(EXTRACTOR_IDS).toEqual(['dom', 'markdown', 'jsonld']);
    expect(listExtractors().map((e) => e.id)).toEqual(EXTRACTOR_IDS);
  });

  it('falls back to dom for unknown ids', () => {
    const extractor = getExtractor('nope' as never);
    expect(extractor.id).toBe('dom');
  });

  it('dom strategy is the unchanged production path', () => {
    const result = domExtractor.extract({
      url: fixture('climate-ai-challenge').url,
      html: fixture('climate-ai-challenge').html,
      platform: 'devpost',
    });
    expect(result.strategyId).toBe('dom');
    expect(result.sections.title).toContain('Climate AI Challenge');
    expect(result.markdown).toBe('');
  });
});

// ─── sectionsFromMarkdown helpers ──────────────────────────────────

describe('sectionsFromMarkdown', () => {
  it('maps headings to sections and falls back to metadata for unknown headings', () => {
    const metadata = extractStructuredMetadata(
      '<title>Demo Hack</title><meta name="description" content="A demo.">',
      'https://demo.example.com/'
    );
    const md = '# Demo Hack\n\nIntro line here.\n\n## Judging Criteria\n\n- Innovation : 40%\n';
    const sections = sectionsFromMarkdown(md, metadata, 'generic');
    expect(sections.title).toBe('Demo Hack');
    expect(sections.metadata).toContain('Intro line here');
    expect(sections.judgingCriteria).toContain('Innovation');
  });
});

// ─── Benchmark ─────────────────────────────────────────────────────

describe('extraction benchmark', () => {
  it('runs and finds markdown the winning strategy on the fixtures', async () => {
    const result = await runExtractionBenchmark({ seed: 42, includeJsonLd: true });
    expect(result.fixtures).toHaveLength(4);
    expect(result.scores).toHaveLength(12); // 4 fixtures × 3 strategies
    expect(result.verdict).toBe('markdown_wins');
    expect(result.overallQuality.markdown).toBeGreaterThan(result.overallQuality.dom);
    expect(result.metrics.find((m) => m.name === 'sponsorRecall')?.winner).toBe('markdown');
    expect(result.aiLeg?.attempted).toBe(false);
  });

  it('scores every fixture with zero hallucinations and zero noise', async () => {
    const result = await runExtractionBenchmark({});
    for (const score of result.scores.filter((s) => s.strategyId === 'markdown')) {
      expect(score.hallucinationRate).toBe(0);
      expect(score.noiseRatio).toBe(0);
      expect(score.completeness).toBe(1);
    }
  });
});
