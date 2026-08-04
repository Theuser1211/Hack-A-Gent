/**
 * JSON-LD + Metadata Extractor
 * =============================
 *
 * Lightweight strategy: rely on structured metadata (meta/og/twitter tags and
 * JSON-LD) for the AI leg, while keeping the DOM section extractor as the
 * deterministic fallback. Produces the smallest, highest-signal AI input of
 * the three strategies.
 */

import { extractUniversalSections } from '../universal-parser/section-extractor.js';
import { countStructure } from './html-to-markdown.js';
import { extractStructuredMetadata } from './metadata.js';
import { buildMetadataAiInput, buildSectionsText } from './sections.js';
import type { ExtractionContext, ExtractionResult, Extractor } from './types.js';

export const jsonLdExtractor: Extractor = {
  id: 'jsonld',
  name: 'JSON-LD + Metadata Extractor',
  description: 'Metadata-first strategy: structured metadata + JSON-LD over a DOM fallback.',
  extract(ctx: ExtractionContext): ExtractionResult {
    const start = Date.now();

    const sections = extractUniversalSections(ctx.html, ctx.platform);
    const metadata = extractStructuredMetadata(ctx.html, ctx.url);
    const structure = countStructure(ctx.html);

    const warnings: string[] = [];
    if (!metadata.hasJsonLd) {
      warnings.push('No Event/Hackathon JSON-LD block found on this page.');
    }

    return {
      strategyId: 'jsonld',
      sections,
      metadata,
      markdown: '',
      aiInput: buildMetadataAiInput(metadata, buildSectionsText(sections), ctx.url, ctx.platform),
      stats: {
        htmlBytes: Buffer.byteLength(ctx.html),
        cleanedHtmlBytes: Buffer.byteLength(ctx.html),
        markdownBytes: 0,
        headings: structure.headings,
        tables: structure.tables,
        lists: structure.lists,
        links: structure.links,
        removedBlocks: 0,
      },
      timingMs: Date.now() - start,
      warnings,
    };
  },
};
