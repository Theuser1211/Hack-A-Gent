/**
 * Structured Metadata Extraction
 * ===============================
 *
 * Harvests metadata from HTML `<head>` (meta/og/twitter tags, canonical link)
 * and JSON-LD structured data. This metadata is passed to the AI leg alongside
 * the clean Markdown so the model gets high-signal, hallucination-resistant
 * signals (title, description, organizer, theme tags, canonical URL).
 */

import type { StructuredMetadata } from './types.js';
import { decodeHtmlEntities } from '../universal-parser/html-utils.js';
import { extractJsonLd } from '../universal-parser/section-extractor.js';

/** Read a `meta` tag value by name or property, regardless of attribute order. */
function metaContent(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m?.[1]) return decodeHtmlEntities(m[1]);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m2 = html.match(re2);
  return m2?.[1] ? decodeHtmlEntities(m2[1]) : '';
}

function titleTag(html: string): string {
  const m = html.match(/<title>([^<]*)<\/title>/i);
  return m?.[1] ? decodeHtmlEntities(m[1]).trim() : '';
}

function canonicalUrl(html: string, url: string): string {
  const rel = html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)
    || html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["']canonical["']/i);
  if (rel?.[1]) return rel[1];
  const ogUrl = metaContent(html, 'og:url');
  if (ogUrl) return ogUrl;
  return url;
}

function splitList(value: string): string[] {
  return value
    .split(/[,;]/)
    .map(s => s.trim())
    .filter(Boolean);
}

/** Theme tags parsed from platform tag links (e.g. Devpost `hackathons?themes[]=`). */
function extractThemeTags(html: string): string[] {
  const themes: string[] = [];
  const themeRe = /hackathons\?themes?(?:%5B\d*%5D)?=([A-Za-z+%2F.-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = themeRe.exec(html)) !== null) {
    const decoded = decodeURIComponent((m[1] ?? '').replace(/\+/g, ' '));
    if (decoded && !themes.includes(decoded)) themes.push(decoded);
  }
  return themes;
}

/** Organizer from sidebar links, JSON-LD, or "Hosted by"/"Organized by" text. */
function extractOrganizer(html: string, jsonLd: Record<string, unknown> | null): string {
  const orgLink = html.match(/hackathons\?organization=([A-Za-z0-9+]+(?:%20[A-Za-z0-9+]+)*)/);
  if (orgLink?.[1]) return decodeURIComponent(orgLink[1].replace(/\+/g, ' '));

  const organizerLd = jsonLd?.organizer as Record<string, unknown> | undefined;
  if (organizerLd?.name) return String(organizerLd.name);

  const orgRe = /(?:hosted by|organized by|organised by|presented by|powered by)\s+([A-Z][A-Za-z0-9&.'\s-]{1,60})/i;
  const m = html.match(orgRe);
  if (m?.[1]) return m[1].trim();

  const host = jsonLd?.hostOrganization as Record<string, unknown> | undefined;
  if (host?.name) return String(host.name);

  return '';
}

/** Extract all structured metadata from a raw HTML document. */
export function extractStructuredMetadata(html: string, url: string): StructuredMetadata {
  const ogTitle = metaContent(html, 'og:title');
  const twitterTitle = metaContent(html, 'twitter:title');
  const ogDescription = metaContent(html, 'og:description');
  const twitterDescription = metaContent(html, 'twitter:description');
  const description = metaContent(html, 'description');
  const jsonLd = extractJsonLd(html);

  return {
    title: ogTitle || twitterTitle || titleTag(html) || '',
    ogTitle,
    twitterTitle,
    description: ogDescription || twitterDescription || description || '',
    ogDescription,
    twitterDescription,
    siteName: metaContent(html, 'og:site_name'),
    canonicalUrl: canonicalUrl(html, url),
    keywords: splitList(metaContent(html, 'keywords')),
    author: metaContent(html, 'author'),
    organizer: extractOrganizer(html, jsonLd),
    themeTags: extractThemeTags(html),
    jsonLd,
    hasJsonLd: jsonLd !== null,
  };
}

/** Compact, deterministic human-readable rendering of the metadata block. */
export function formatStructuredMetadata(metadata: StructuredMetadata): string {
  const lines: string[] = [];

  if (metadata.title) lines.push(`Title: ${metadata.title}`);
  if (metadata.siteName) lines.push(`Site Name: ${metadata.siteName}`);
  if (metadata.organizer) lines.push(`Organizer: ${metadata.organizer}`);
  if (metadata.description) lines.push(`Description: ${metadata.description}`);
  if (metadata.themeTags.length > 0) lines.push(`Theme Tags: ${metadata.themeTags.join(', ')}`);
  if (metadata.keywords.length > 0) lines.push(`Keywords: ${metadata.keywords.join(', ')}`);
  if (metadata.author) lines.push(`Author: ${metadata.author}`);
  if (metadata.canonicalUrl) lines.push(`Canonical URL: ${metadata.canonicalUrl}`);

  const ld = metadata.jsonLd;
  if (ld) {
    const ldLines: string[] = [];
    if (ld['@type']) ldLines.push(`@type: ${String(ld['@type'])}`);
    if (ld.name) ldLines.push(`name: ${String(ld.name)}`);
    if (ld.description) ldLines.push(`description: ${String(ld.description)}`);
    if (ld.startDate) ldLines.push(`startDate: ${String(ld.startDate)}`);
    if (ld.endDate) ldLines.push(`endDate: ${String(ld.endDate)}`);
    const loc = ld.location as Record<string, unknown> | undefined;
    if (loc?.name) ldLines.push(`location: ${String(loc.name)}`);
    const organizer = ld.organizer as Record<string, unknown> | undefined;
    if (organizer?.name) ldLines.push(`organizer: ${String(organizer.name)}`);
    const offers = ld.offers as Record<string, unknown> | undefined;
    if (offers?.price !== undefined) ldLines.push(`registrationPrice: ${String(offers.price)}`);
    if (ldLines.length > 0) {
      lines.push('JSON-LD:');
      for (const l of ldLines) lines.push(`  ${l}`);
    }
  }

  return lines.join('\n');
}
