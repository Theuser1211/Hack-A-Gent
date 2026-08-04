/**
 * Markdown → Sections + AI Input
 * ==============================
 *
 * Maps the clean Markdown rendering back onto `UniversalExtractedSections` so
 * the deterministic validation/repair leg and the intelligence analyzer keep
 * working unchanged, and builds the exact text blob passed to the AI leg.
 */

import type { PlatformType, UniversalExtractedSections, ExtractedSection } from '../universal-parser/types.js';
import type { StructuredMetadata } from './types.js';
import { formatStructuredMetadata } from './metadata.js';

interface SectionMapping {
  keys: string[];
  field: string;
}

const SECTION_MAPPINGS: SectionMapping[] = [
  { keys: ['title', 'event title', 'hackathon name', 'competition name', 'challenge name'], field: 'title' },
  { keys: ['tagline', 'subtitle', 'short description', 'one-liner', 'elevator pitch'], field: 'tagline' },
  {
    keys: ['about', 'overview', 'description', 'the challenge', 'problem statement', 'what is this', 'challenge description', 'about the hackathon', 'about this event'],
    field: 'description',
  },
  { keys: ['theme', 'themes', 'track', 'tracks', 'category', 'categories', 'challenge areas', 'focus areas', 'domains'], field: 'themes' },
  { keys: ['judging criteria', 'judging', 'evaluation criteria', 'scoring criteria', 'evaluation', 'scoring', 'how we judge', 'criteria'], field: 'judgingCriteria' },
  { keys: ['prize', 'prizes', 'awards', 'prize pool', 'what you can win', 'prizes & awards', 'sponsor prizes'], field: 'prizes' },
  { keys: ['sponsor', 'sponsors', 'partner', 'partners', 'supported by', 'powered by', 'our sponsors', 'prize sponsors'], field: 'sponsors' },
  { keys: ['rules', 'eligibility', 'who can participate', 'who can enter', 'requirements', 'restrictions', 'guidelines', 'code of conduct'], field: 'rules' },
  { keys: ['submission', 'deliverables', 'what to submit', 'what to build', 'submission requirements', 'how to submit'], field: 'deliverables' },
  { keys: ['timeline', 'schedule', 'deadline', 'deadlines', 'important dates', 'key dates', 'dates', 'calendar', 'milestones'], field: 'timeline' },
  { keys: ['resources', 'links', 'useful links', 'api documentation', 'documentation', 'docs', 'getting started', 'references'], field: 'resources' },
  { keys: ['faq', 'frequently asked', 'questions', 'help', 'support'], field: 'faq' },
  { keys: ['team', 'team formation', 'team size', 'finding teammates'], field: 'team' },
  { keys: ['workshop', 'workshops', 'event', 'events', 'agenda', 'sessions', 'mentors', 'office hours'], field: 'workshops' },
];

function createEmptySections(): UniversalExtractedSections {
  return {
    title: '',
    tagline: '',
    description: '',
    themes: '',
    judgingCriteria: '',
    prizes: '',
    sponsors: '',
    rules: '',
    deliverables: '',
    timeline: '',
    resources: '',
    faq: '',
    team: '',
    workshops: '',
    metadata: '',
    rawSections: [],
  };
}

function findBestField(headingText: string): string | null {
  const normalized = headingText.toLowerCase().replace(/[#*_`]/g, '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  for (const mapping of SECTION_MAPPINGS) {
    for (const key of mapping.keys) {
      if (normalized === key || normalized.startsWith(key + ' ') || normalized.includes(' ' + key + ' ')) {
        return mapping.field;
      }
    }
  }
  return null;
}

/** Strip Markdown syntax so deterministic regex extractors can parse the text. */
function normalizeSectionText(text: string, field: string): string {
  return text
    .split('\n')
    .map((line) => {
      let l = line.trim();
      l = l.replace(/^#{1,6}\s+/, '');
      l = l.replace(/^[-*+]\s+/, '');
      l = l.replace(/^\d+\.\s+/, '');
      l = l.replace(/\|/g, field === 'judgingCriteria' ? ' : ' : ' ');
      l = l.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
      l = l.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
      l = l.replace(/\*\*([^*]+)\*\*/g, '$1');
      l = l.replace(/\*([^*]+)\*/g, '$1');
      l = l.replace(/`([^`]+)`/g, '$1');
      l = l.replace(/[_~]{1,2}/g, '');
      l = l.replace(/\s+/g, ' ').trim();
      return l;
    })
    .filter(Boolean)
    .join('\n')
    .trim();
}

/** Build sections from clean Markdown + structured metadata. */
export function sectionsFromMarkdown(
  markdown: string,
  metadata: StructuredMetadata,
  platform: PlatformType
): UniversalExtractedSections {
  const result = createEmptySections();

  result.title = metadata.title || '';
  result.description = metadata.description || '';

  const blocks = new Map<string, string[]>();
  const headings = new Map<string, string>();
  const headingOrder: string[] = [];
  const composed = new Map<string, { heading: string; text: string; textRaw: string }>();

  for (const raw of markdown.split('\n')) {
    const heading = raw.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const headingText = (heading[2] ?? '').trim();
      const field = findBestField(headingText);
      const target = field ?? 'metadata';
      if (!blocks.has(target)) {
        blocks.set(target, []);
        headingOrder.push(target);
        headings.set(target, headingText);
      }
      blocks.get(target)!.push(`## ${headingText}`);
      continue;
    }
    const current = headingOrder[headingOrder.length - 1];
    if (current && raw.trim()) {
      blocks.get(current)!.push(raw);
    }
  }

  for (const field of headingOrder) {
    const content = blocks.get(field) ?? [];
    composed.set(field, {
      heading: headings.get(field) ?? field,
      text: normalizeSectionText(content.join('\n'), field),
      textRaw: content.join('\n'),
    });
    result.rawSections.push({
      heading: composed.get(field)!.heading,
      text: composed.get(field)!.text,
      textRaw: composed.get(field)!.textRaw,
      level: 2,
      field,
      matchedKey: field === 'metadata' ? '' : composed.get(field)!.heading.toLowerCase(),
    } satisfies ExtractedSection);
  }

  // Fields map directly to section strings; metadata is composed separately.
  for (const field of headingOrder) {
    if (field === 'metadata') continue;
    (result as Record<string, string>)[field] = composed.get(field)!.text;
  }

  // Title fallback: first h1 heading.
  if (!result.title) {
    const firstHeading = markdown.split('\n').find((l) => /^#\s/.test(l.trim()));
    if (firstHeading) result.title = firstHeading.trim().replace(/^#\s+/, '');
  }

  // Themes from metadata tags when no theme section was present.
  if (!result.themes && metadata.themeTags.length > 0) {
    result.themes = `## Themes (metadata)\n${metadata.themeTags.join(', ')}`;
  }

  // Metadata section: structured metadata + raw intro content (title heading,
  // tagline paragraph, "Hosted by …" sentence) + organizer/theme hints.
  const metaParts: string[] = [];
  const formatted = formatStructuredMetadata(metadata);
  if (formatted) metaParts.push(formatted);
  const rawMeta = composed.get('metadata');
  if (rawMeta?.textRaw.trim()) {
    metaParts.push(rawMeta.text);
  }
  if (metadata.organizer && !result.description.toLowerCase().includes(metadata.organizer.toLowerCase())) {
    metaParts.push(`Hosted by ${metadata.organizer}`);
  }
  if (metadata.themeTags.length > 0) {
    metaParts.push(`Theme Tags: ${metadata.themeTags.join(', ')}`);
  }
  if (metaParts.length > 0) {
    result.metadata = `## Metadata\n${metaParts.join('\n')}`;
  }

  // Platform-specific sidebar hints (kept textual, mirrors the DOM strategy).
  if (platform === 'devpost' && metadata.organizer) {
    if (!result.metadata.includes(metadata.organizer)) {
      result.metadata += `\n## Organizer (sidebar)\n${metadata.organizer}`;
    }
  }

  // Mirror the DOM strategy's JSON-LD enrichment for JS-heavy pages.
  const ld = metadata.jsonLd;
  if (ld) {
    if (!result.title && typeof ld.name === 'string' && ld.name.trim()) {
      result.title = ld.name.trim();
    }
    if (!result.description && typeof ld.description === 'string' && ld.description.trim()) {
      result.description = `## Description (JSON-LD)\n${ld.description.trim()}`;
    }
    if (typeof ld.startDate === 'string' && ld.startDate && !result.timeline.includes(ld.startDate)) {
      result.timeline += `\n\n## Start Date (JSON-LD)\n${ld.startDate}`;
    }
    if (typeof ld.endDate === 'string' && ld.endDate && !result.timeline.includes(ld.endDate)) {
      result.timeline += `\n\n## End Date (JSON-LD)\n${ld.endDate}`;
    }
    const loc = ld.location as Record<string, unknown> | undefined;
    if (loc?.name && !result.metadata.includes(String(loc.name))) {
      result.metadata += `\n\n## Location (JSON-LD)\n${String(loc.name)}`;
    }
  }

  return result;
}

/** Render sections in the flat `KEY: value` format the AI prompt already uses. */
export function buildSectionsText(sections: UniversalExtractedSections): string {
  const parts: string[] = [];

  if (sections.title) parts.push(`TITLE: ${sections.title}`);
  if (sections.tagline) parts.push(`TAGLINE: ${sections.tagline}`);
  if (sections.description) parts.push(`DESCRIPTION:\n${sections.description}`);
  if (sections.themes) parts.push(`THEMES SECTION:\n${sections.themes}`);
  if (sections.judgingCriteria) parts.push(`JUDGING CRITERIA SECTION:\n${sections.judgingCriteria}`);
  if (sections.prizes) parts.push(`PRIZES SECTION:\n${sections.prizes}`);
  if (sections.sponsors) parts.push(`SPONSORS SECTION:\n${sections.sponsors}`);
  if (sections.rules) parts.push(`RULES/ELIGIBILITY SECTION:\n${sections.rules}`);
  if (sections.deliverables) parts.push(`DELIVERABLES/SUBMISSION SECTION:\n${sections.deliverables}`);
  if (sections.timeline) parts.push(`TIMELINE/DEADLINES SECTION:\n${sections.timeline}`);
  if (sections.resources) parts.push(`RESOURCES/LINKS SECTION:\n${sections.resources}`);
  if (sections.faq) parts.push(`FAQ SECTION:\n${sections.faq}`);
  if (sections.team) parts.push(`TEAM SECTION:\n${sections.team}`);
  if (sections.workshops) parts.push(`WORKSHOPS/EVENTS SECTION:\n${sections.workshops}`);
  if (sections.metadata) parts.push(`OTHER SECTIONS:\n${sections.metadata}`);

  return parts.join('\n\n---\n\n');
}

/** Build the AI input for the Markdown strategy: clean markdown + metadata. */export function buildMarkdownAiInput(
  markdown: string,
  metadata: StructuredMetadata,
  url: string,
  platform: string
): string {
  return [
    `URL: ${url}`,
    `Platform Hint: ${platform}`,
    '',
    '=== CLEAN MARKDOWN (converted from HTML; scripts, styles, navigation, footer, ads, tracking, and repeated UI removed) ===',
    markdown,
    '',
    '=== STRUCTURED METADATA ===',
    formatStructuredMetadata(metadata),
  ].join('\n');
}

/** Build the AI input for the JSON-LD strategy: metadata first, DOM sections second. */
export function buildMetadataAiInput(
  metadata: StructuredMetadata,
  sectionsText: string,
  url: string,
  platform: string
): string {
  return [
    `URL: ${url}`,
    `Platform Hint: ${platform}`,
    '',
    '=== STRUCTURED METADATA ===',
    formatStructuredMetadata(metadata),
    '',
    '=== EXTRACTED PAGE SECTIONS ===',
    sectionsText,
  ].join('\n');
}
