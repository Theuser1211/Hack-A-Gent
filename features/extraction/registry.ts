/**
 * Extraction Strategy Registry
 * =============================
 *
 * Central lookup for the pluggable extractors. Unknown ids fall back to the
 * production-safe DOM extractor so callers never break.
 */

import { domExtractor } from './dom-extractor.js';
import { markdownExtractor } from './markdown-extractor.js';
import { jsonLdExtractor } from './jsonld-extractor.js';
import type { ExtractionContext, ExtractionResult, Extractor, ExtractorId } from './types.js';

const REGISTRY: Record<ExtractorId, Extractor> = {
  dom: domExtractor,
  markdown: markdownExtractor,
  jsonld: jsonLdExtractor,
};

export const EXTRACTOR_IDS: ExtractorId[] = Object.keys(REGISTRY) as ExtractorId[];

export function getExtractor(id: ExtractorId): Extractor {
  return REGISTRY[id] ?? domExtractor;
}

export function listExtractors(): Array<Pick<Extractor, 'id' | 'name' | 'description'>> {
  return EXTRACTOR_IDS.map((id) => {
    const { name, description } = REGISTRY[id];
    return { id, name, description };
  });
}

/** Convenience wrapper: resolve by id and run against a context. */
export function runExtractor(id: ExtractorId | undefined, ctx: ExtractionContext): ExtractionResult {
  return getExtractor(id ?? 'dom').extract(ctx);
}
