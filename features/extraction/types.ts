/**
 * Pluggable Extraction Strategies — Types
 * ========================================
 *
 * An `Extractor` converts raw HTML into the inputs consumed by the rest of the
 * parsing pipeline:
 *
 *  1. `UniversalExtractedSections` — deterministic field population used by
 *     validation/repair and the intelligence analyzer.
 *  2. `StructuredMetadata` — meta tags + JSON-LD surfaced to the AI leg.
 *  3. `aiInput` — the exact text blob that will be sent to the LLM. This is the
 *     primary knob the extractor strategy controls ("HTML → Clean Markdown → AI"
 *     vs. raw sections).
 *  4. `ExtractionStats` — measurable properties for benchmarking.
 *
 * The current strategies:
 *  - `dom`      — the existing section extractor (unchanged behavior).
 *  - `markdown` — EXPERIMENTAL: HTML cleanup → Markdown conversion → metadata.
 *  - `jsonld`   — lightweight metadata/JSON-LD strategy with DOM fallback.
 */

import type { PlatformType, UniversalExtractedSections } from '../universal-parser/types.js';

/** Identifier for a registered extraction strategy. */
export type ExtractorId = 'dom' | 'markdown' | 'jsonld';

/** Inputs shared by every extractor. */
export interface ExtractionContext {
  url: string;
  html: string;
  platform: PlatformType;
  options?: {
    seed?: number;
    maxHtmlLength?: number;
  };
}

/** Structured metadata harvested from meta tags, canonical links, and JSON-LD. */
export interface StructuredMetadata {
  /** Prefer og:title, then twitter:title, then <title>. */
  title: string;
  ogTitle: string;
  twitterTitle: string;
  /** Prefer og:description, then twitter:description, then meta description. */
  description: string;
  ogDescription: string;
  twitterDescription: string;
  /** og:site_name. */
  siteName: string;
  /** Canonical URL (rel=canonical > og:url > provided URL). */
  canonicalUrl: string;
  /** meta keywords split into a list. */
  keywords: string[];
  /** meta author. */
  author: string;
  /** Organizer resolved from sidebar links, JSON-LD, or "Hosted by" text. */
  organizer: string;
  /** Theme tags parsed from platform tag links (e.g. hackathons?themes[]=). */
  themeTags: string[];
  /** First Event/Hackathon JSON-LD block, if any. */
  jsonLd: Record<string, unknown> | null;
  hasJsonLd: boolean;
}

/** Measurable properties of an extraction run. */
export interface ExtractionStats {
  htmlBytes: number;
  cleanedHtmlBytes: number;
  markdownBytes: number;
  headings: number;
  tables: number;
  lists: number;
  links: number;
  removedBlocks: number;
}

/** The full output of an extractor. */
export interface ExtractionResult {
  strategyId: ExtractorId;
  sections: UniversalExtractedSections;
  metadata: StructuredMetadata;
  /** Clean Markdown rendering (empty for non-markdown strategies). */
  markdown: string;
  /** The exact text that should be passed to the AI normalization leg. */
  aiInput: string;
  stats: ExtractionStats;
  timingMs: number;
  warnings: string[];
}

/** Pluggable strategy contract. */
export interface Extractor {
  id: ExtractorId;
  name: string;
  description: string;
  extract(ctx: ExtractionContext): ExtractionResult;
}

// ─── Benchmark Types ────────────────────────────────────────────────

/** Ground truth for a benchmark fixture. */
export interface BenchmarkFixture {
  id: string;
  name: string;
  url: string;
  html: string;
  platform?: PlatformType;
  groundTruth: {
    title: string;
    organizer: string;
    sponsors: string[];
    judgingCriteria: string[];
    prizes: string[];
    timeline: string[];
    themes: string[];
  };
  /** Boilerplate terms expected in the raw page that should be cleaned away. */
  noiseTerms: string[];
  /** Phrases that are known NOT to appear in this page; their presence in output indicates hallucination. */
  hallucinationMarkers?: string[];
}

/** Per-fixture, per-strategy score. */
export interface FixtureScore {
  fixtureId: string;
  strategyId: ExtractorId;
  success: boolean;
  completeness: number;
  hallucinationRate: number;
  sponsorRecall: number;
  judgingRecall: number;
  timelineRecall: number;
  prizeRecall: number;
  themesRecall: number;
  titleHit: boolean;
  organizerHit: boolean;
  missingFields: number;
  confidence: number;
  aiInputBytes: number;
  noiseRatio: number;
  runtimeMs: number;
}

/** Aggregated metric comparing the DOM strategy against the Markdown strategy. */
export interface BenchmarkMetric {
  name: string;
  dom: number;
  markdown: number;
  delta: number;
  unit: string;
  /** Whether a higher or lower value is better. */
  better: 'higher' | 'lower';
  winner: 'dom' | 'markdown' | 'tie';
}

export type BenchmarkVerdict = 'markdown_wins' | 'dom_wins' | 'tie';

/** Result of the extraction benchmark run. */
export interface ExtractionBenchmarkResult {
  timestamp: string;
  seed: number;
  fixtures: string[];
  scores: FixtureScore[];
  metrics: BenchmarkMetric[];
  overallQuality: { dom: number; markdown: number };
  verdict: BenchmarkVerdict;
  aiLeg: { attempted: boolean; ran: boolean; note: string } | null;
}
