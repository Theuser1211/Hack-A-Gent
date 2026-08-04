/**
 * Markdown Extractor (EXPERIMENTAL)
 * ==================================
 *
 * Implements the "HTML → Clean Markdown → AI" hypothesis:
 *
 *  1. `cleanHtml`  — strip scripts, styles, navigation, footer, ads, tracking,
 *                    hidden and repeated UI from the raw page.
 *  2. `htmlToMarkdown` — render the clean HTML as readable Markdown, preserving
 *                    headings, tables, lists, links, and image alt text.
 *  3. `sectionsFromMarkdown` — map headings back onto
 *                    `UniversalExtractedSections` so the deterministic
 *                    validation/repair leg and intelligence analyzer work
 *                    unchanged.
 *  4. `buildMarkdownAiInput` — pass clean Markdown + structured metadata to the
 *                    AI leg instead of raw section dumps.
 */

import { cleanHtml } from './html-cleaner.js';
import { htmlToMarkdown, countStructure } from './html-to-markdown.js';
import { extractStructuredMetadata } from './metadata.js';
import { sectionsFromMarkdown, buildMarkdownAiInput } from './sections.js';
import type { ExtractionContext, ExtractionResult, Extractor } from './types.js';

export const markdownExtractor: Extractor = {
  id: 'markdown',
  name: 'Clean Markdown Extractor',
  description: 'Experimental: boilerplate removal + HTML→Markdown conversion + metadata for the AI leg.',
  extract(ctx: ExtractionContext): ExtractionResult {
    const start = Date.now();

    const cleaned = cleanHtml(ctx.html);
    const markdown = htmlToMarkdown(cleaned.html);
    const metadata = extractStructuredMetadata(ctx.html, ctx.url);
    const sections = sectionsFromMarkdown(markdown, metadata, ctx.platform);
    const structure = countStructure(cleaned.html);

    const htmlBytes = Buffer.byteLength(ctx.html);
    const cleanedHtmlBytes = Buffer.byteLength(cleaned.html);

    const warnings: string[] = [];
    if (markdown.length === 0) {
      warnings.push('Clean Markdown is empty after conversion; page may be JS-only.');
    }
    if (metadata.themeTags.length === 0 && !/themes/i.test(markdown)) {
      warnings.push('No theme tags found in metadata or markdown.');
    }

    return {
      strategyId: 'markdown',
      sections,
      metadata,
      markdown,
      aiInput: buildMarkdownAiInput(markdown, metadata, ctx.url, ctx.platform),
      stats: {
        htmlBytes,
        cleanedHtmlBytes,
        markdownBytes: Buffer.byteLength(markdown),
        headings: structure.headings,
        tables: structure.tables,
        lists: structure.lists,
        links: structure.links,
        removedBlocks: cleaned.removedBlocks,
      },
      timingMs: Date.now() - start,
      warnings,
    };
  },
};
