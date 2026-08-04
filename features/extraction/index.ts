/**
 * Pluggable Extraction Strategies — Barrel
 * ==========================================
 *
 * Public surface of the extraction experiment. Import from
 * `features/extraction` for the strategy registry, or from individual modules
 * for the low-level HTML→Markdown pipeline.
 */

export type {
  ExtractorId,
  ExtractionContext,
  StructuredMetadata,
  ExtractionStats,
  ExtractionResult,
  Extractor,
  BenchmarkFixture,
  FixtureScore,
  BenchmarkMetric,
  BenchmarkVerdict,
  ExtractionBenchmarkResult,
} from './types.js';

export { extractStructuredMetadata, formatStructuredMetadata } from './metadata.js';
export { cleanHtml } from './html-cleaner.js';
export { htmlToMarkdown, countStructure } from './html-to-markdown.js';
export { sectionsFromMarkdown, buildMarkdownAiInput, buildMetadataAiInput, buildSectionsText } from './sections.js';

export { domExtractor } from './dom-extractor.js';
export { markdownExtractor } from './markdown-extractor.js';
export { jsonLdExtractor } from './jsonld-extractor.js';

export { getExtractor, runExtractor, listExtractors, EXTRACTOR_IDS } from './registry.js';
