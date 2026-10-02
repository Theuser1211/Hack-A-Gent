/**
 * DOM Section Extractor
 * =====================
 *
 * Baseline strategy: the current production section extractor
 * (`extractUniversalSections`) with zero behavioral changes. Used as the
 * control arm in the extraction benchmark.
 */

import { extractUniversalSections } from '../universal-parser/section-extractor.js';
import { countStructure } from './html-to-markdown.js';
import { extractStructuredMetadata } from './metadata.js';
import { buildSectionsText } from './sections.js';
import type { ExtractionContext, ExtractionResult, Extractor } from './types.js';

function buildResult(ctx: ExtractionContext, markdown = ''): ExtractionResult {
  const start = Date.now();
  const htmlBytes = Buffer.byteLength(ctx.html);
  const cleanedHtmlBytes = Buffer.byteLength(ctx.html);
  const markdownBytes = Buffer.byteLength(markdown);
  const warnings: string[] = [];

  if (markdown) {
    warnings.push('DOM strategy keeps raw HTML; clean Markdown is not produced.');
  }

  const sections = extractUniversalSections(ctx.html, ctx.platform);
  const metadata = extractStructuredMetadata(ctx.html, ctx.url);
  const structure = countStructure(ctx.html);

  return {
    strategyId: 'dom',
    sections,
    metadata,
    markdown,
    aiInput: buildSectionsText(sections),
    stats: {
      htmlBytes,
      cleanedHtmlBytes,
      markdownBytes,
      headings: structure.headings,
      tables: structure.tables,
      lists: structure.lists,
      links: structure.links,
      removedBlocks: 0,
    },
    timingMs: Date.now() - start,
    warnings,
  };
}

export const domExtractor: Extractor = {
  id: 'dom',
  name: 'DOM Section Extractor',
  description: 'Baseline: semantic heading analysis over raw HTML (current production extractor).',
  extract(ctx: ExtractionContext): ExtractionResult {
    return buildResult(ctx);
  },
};
