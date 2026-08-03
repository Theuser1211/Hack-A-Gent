/**
 * Universal Section Extractor
 * ===========================
 *
 * Platform-agnostic section extraction using semantic heading analysis.
 * Works with any hackathon platform by identifying common section patterns.
 */

import type { PlatformType, UniversalExtractedSections, ExtractedSection } from './types.js';
import { stripHtml, decodeHtmlEntities } from './html-utils.js';

// Universal section type mapping - works across platforms
const UNIVERSAL_SECTION_MAP: SectionMapping[] = [
  // Title/Identity
  { keys: ['title', 'event title', 'hackathon name', 'competition name', 'challenge name'], field: 'title', level: [1] },
  { keys: ['tagline', 'subtitle', 'short description', 'one-liner', 'elevator pitch'], field: 'tagline', level: [2, 3] },

  // Description/About
  { keys: ['about', 'overview', 'description', 'the challenge', 'problem statement', 'what is this', 'challenge description', 'about the hackathon', 'about this event'], field: 'description', level: [1, 2, 3, 4] },

  // Themes/Tracks
  { keys: ['theme', 'themes', 'track', 'tracks', 'category', 'categories', 'challenge areas', 'focus areas', 'domains'], field: 'themes', level: [2, 3, 4] },

  // Judging Criteria
  { keys: ['judging criteria', 'judging', 'evaluation criteria', 'scoring criteria', 'evaluation', 'scoring', 'how we judge', 'judging guidelines', 'criteria', 'score criteria'], field: 'judgingCriteria', level: [2, 3, 4] },

  // Prizes
  { keys: ['prize', 'prizes', 'awards', 'rewards', 'prize pool', 'winnings', 'what you can win', 'prizes & awards', 'sponsor prizes'], field: 'prizes', level: [2, 3, 4] },

  // Sponsors
  { keys: ['sponsor', 'sponsors', 'partner', 'partners', 'supported by', 'powered by', 'sponsorship', 'our sponsors', 'prize sponsors'], field: 'sponsors', level: [2, 3, 4] },

  // Rules/Eligibility
  { keys: ['rules', 'eligibility', 'who can participate', 'who can enter', 'requirements', 'restrictions', 'guidelines', 'terms', 'conditions', 'code of conduct', 'participation rules', 'entry requirements'], field: 'rules', level: [2, 3, 4, 5, 6] },

  // Deliverables/Submission
  { keys: ['submission', 'deliverables', 'what to submit', 'what to build', 'submission requirements', 'how to submit', 'project submission', 'submission guidelines', 'deliverable'], field: 'deliverables', level: [2, 3, 4] },

  // Timeline
  { keys: ['timeline', 'schedule', 'deadline', 'deadlines', 'important dates', 'key dates', 'dates', 'calendar', 'when', 'milestones'], field: 'timeline', level: [2, 3, 4] },

  // Resources/Links
  { keys: ['resources', 'links', 'useful links', 'helpful resources', 'api documentation', 'documentation', 'docs', 'getting started', 'quick start', 'api docs', 'references'], field: 'resources', level: [2, 3, 4] },

  // FAQ
  { keys: ['faq', 'frequently asked', 'questions', 'help', 'support'], field: 'faq', level: [2, 3, 4] },

  // Team
  { keys: ['team', 'team formation', 'team size', 'finding teammates', 'teammates'], field: 'team', level: [3, 4] },

  // Workshops/Events
  { keys: ['workshop', 'workshops', 'event', 'events', 'schedule', 'agenda', 'sessions', 'mentor', 'mentors', 'office hours'], field: 'workshops', level: [3, 4] },
];

interface SectionMapping {
  keys: string[];
  field: string;
  level: number[];
}

function metaContent(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m?.[1]) return decodeHtmlEntities(m[1]);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m2 = html.match(re2);
  return m2?.[1] ? decodeHtmlEntities(m2[1]) : '';
}

function removeBoilerplate(html: string): string {
  let cleaned = html;
  // Scripts, styles, SVGs, comments
  cleaned = cleaned.replace(/<script[\s\S]*?<\/script>/gi, '');
  cleaned = cleaned.replace(/<style[\s\S]*?<\/style>/gi, '');
  cleaned = cleaned.replace(/<svg[\s\S]*?<\/svg>/gi, '');
  cleaned = cleaned.replace(/<!--[\s\S]*?-->/g, '');
  // Navigation blocks
  cleaned = cleaned.replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '');
  cleaned = cleaned.replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '');
  // Footer blocks
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '');
  // Common sidebar/nav patterns
  cleaned = cleaned.replace(/<[^>]*(?:class|id)\s*=\s*["'][^"']*?(?:sidebar-nav|auth-buttons|user-nav|footer-nav|global-header|navigation|navbar|menu)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|nav|aside)>/gi, '');
  // Role=navigation
  cleaned = cleaned.replace(/<[a-z]+[^>]*?role\s*=\s*["']navigation["'][^>]*>[\s\S]*?<\/[a-z]+>/gi, '');
  return cleaned;
}

function findBestHeadingMatch(headingText: string): { field: string; matchedKey: string } | null {
  const normalized = headingText.toLowerCase().trim();
  if (!normalized) return null;

  for (const mapping of UNIVERSAL_SECTION_MAP) {
    for (const key of mapping.keys) {
      // Exact match or prefix match
      if (normalized === key.toLowerCase() || normalized.startsWith(key.toLowerCase() + ' ') || normalized.includes(' ' + key.toLowerCase())) {
        // Verify heading level is appropriate
        return { field: mapping.field, matchedKey: key };
      }
    }
  }
  return null;
}

export function extractUniversalSections(html: string, platform: PlatformType): UniversalExtractedSections {
  const bodyMatch = html.match(/<body[\s>][\s\S]*?<\/body>/i);
  let bodyContent = bodyMatch ? bodyMatch[0] : html;
  bodyContent = removeBoilerplate(bodyContent);

  const result: UniversalExtractedSections = {
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

  // Extract title from meta tags first
  result.title = metaContent(html, 'og:title')
    || metaContent(html, 'twitter:title')
    || metaContent(html, 'title')
    || stripHtml(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '')
    || '';

  // Find all h1-h6 sections
  const sectionRe = /<(h[1-6])([^>]*)>([\s\S]*?)<\/\1>/gi;
  let lastHeading: string | null = null;
  let lastHeadingText = '';
  let lastHeadingLevel = 0;
  let lastHeadingEnd = 0;
  const sectionContents: ExtractedSection[] = [];

  let m: RegExpExecArray | null;
  while ((m = sectionRe.exec(bodyContent)) !== null) {
    const level = parseInt(m[1]?.[1] ?? '1', 10);
    const headingHtml = m[3] ?? '';
    const headingText = stripHtml(headingHtml).trim();
    const pos = m.index;

    if (!headingText) continue;

    if (lastHeading) {
      const sectionHtml = bodyContent.slice(lastHeadingEnd, pos);
      const match = findBestHeadingMatch(lastHeadingText);
      sectionContents.push({
        heading: lastHeadingText,
        text: stripHtml(sectionHtml),
        textRaw: sectionHtml,
        level: lastHeadingLevel,
        field: match?.field ?? 'metadata',
        matchedKey: match?.matchedKey ?? '',
      });
    }

    lastHeading = m[0];
    lastHeadingText = headingText;
    lastHeadingLevel = level;
    lastHeadingEnd = pos + m[0].length;
  }

  // Last section
  if (lastHeading) {
    const sectionHtml = bodyContent.slice(lastHeadingEnd);
    const match = findBestHeadingMatch(lastHeadingText);
    sectionContents.push({
      heading: lastHeadingText,
      text: stripHtml(sectionHtml),
      textRaw: sectionHtml,
      level: lastHeadingLevel,
      field: match?.field ?? 'metadata',
      matchedKey: match?.matchedKey ?? '',
    });
  }

  // Classify sections
  for (const section of sectionContents) {
    const content = `## ${section.heading}\n${section.text}`;
    const existing = result[section.field as keyof UniversalExtractedSections];
    if (typeof existing === 'string') {
      (result as Record<string, string>)[section.field] = existing ? `${existing}\n\n${content}` : content;
    }
    result.rawSections.push(section);
  }

  // Platform-specific post-processing
  applyPlatformSpecificExtraction(result, html, platform);

  return result;
}

function applyPlatformSpecificExtraction(sections: UniversalExtractedSections, html: string, platform: PlatformType): void {
  switch (platform) {
    case 'devpost':
      extractDevpostSpecific(sections, html);
      break;
    case 'mlh':
      extractMlhSpecific(sections, html);
      break;
    case 'unstop':
      extractUnstopSpecific(sections, html);
      break;
    case 'luma':
      extractLumaSpecific(sections, html);
      break;
    case 'hack2skill':
      extractHack2SkillSpecific(sections, html);
      break;
    case 'hackerearth':
      extractHackerEarthSpecific(sections, html);
      break;
    case 'generic':
    default:
      extractGenericSpecific(sections, html);
      break;
  }
}

function extractDevpostSpecific(sections: UniversalExtractedSections, html: string): void {
  // Sidebar content (themes, organization)
  const sidebarMatch = html.match(/<div[^>]*id=["']content-sidebar["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/i);
  if (sidebarMatch?.[1]) {
    const sidebarHtml = sidebarMatch[1];
    const sidebarText = stripHtml(sidebarHtml);

    // Extract themes from sidebar links
    const themeRe = /hackathons\?themes?(?:%5B\d*%5D)?=([A-Za-z+%2F.-]+)/gi;
    const themes: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = themeRe.exec(sidebarHtml)) !== null) {
      const decoded = decodeURIComponent((m[1] ?? '').replace(/\+/g, ' '));
      if (!themes.includes(decoded)) themes.push(decoded);
    }
    if (themes.length > 0) {
      sections.themes = (sections.themes ? sections.themes + '\n\n' : '') + '## Themes (from sidebar)\n' + themes.join(', ');
    }

    // Extract organization
    const orgMatch = sidebarHtml.match(/hackathons\?organization=([A-Za-z0-9+]+(?:%20[A-Za-z0-9+]+)*)/);
    if (orgMatch?.[1]) {
      const org = decodeURIComponent(orgMatch[1].replace(/\+/g, ' '));
      if (!sections.description.includes(org)) {
        sections.metadata += `\n\n## Organizer (sidebar)\n${org}`;
      }
    }
  }

  // Judging criteria raw HTML for <li> parsing
  const judgingHtmlMatch = html.match(/<h[1-6][^>]*>[\s\S]*?judging\s*criteria[\s\S]*?<\/h[1-6]>\s*([\s\S]*?)(?=<h[1-6]\b|\s*$|<footer|<div[^>]*?(?:sidebar|footer))/i);
  if (judgingHtmlMatch?.[1] && !sections.judgingCriteria.includes('rawHtml:')) {
    sections.judgingCriteria += '\n\n<!-- rawHtml:' + judgingHtmlMatch[1].trim().slice(0, 5000) + ' -->';
  }
}

function extractMlhSpecific(sections: UniversalExtractedSections, html: string): void {
  // MLH often uses specific class names
  const mlhInfoMatch = html.match(/<div[^>]*class=["'][^"']*mlh-event-info[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (mlhInfoMatch?.[1]) {
    const text = stripHtml(mlhInfoMatch[1]);
    if (!sections.description.includes(text.slice(0, 200))) {
      sections.description += '\n\n## MLH Event Info\n' + text.slice(0, 2000);
    }
  }
}

function extractUnstopSpecific(sections: UniversalExtractedSections, html: string): void {
  // Unstop specific patterns
  const prizeMatch = html.match(/<div[^>]*class=["'][^"']*prize[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (prizeMatch?.[1]) {
    sections.prizes += '\n\n## Prize Section (Unstop)\n' + stripHtml(prizeMatch[1]);
  }
}

function extractLumaSpecific(sections: UniversalExtractedSections, html: string): void {
  // Luma uses JSON-LD structured data
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const script of jsonLdMatch) {
      try {
        const json = JSON.parse(stripHtml(script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')));
        if (json['@type'] === 'Event') {
          if (json.description && !sections.description.includes(json.description.slice(0, 100))) {
            sections.description += '\n\n## Event Description (JSON-LD)\n' + json.description;
          }
          if (json.startDate) {
            sections.timeline += '\n\n## Start Date\n' + json.startDate;
          }
          if (json.endDate) {
            sections.timeline += '\n\n## End Date\n' + json.endDate;
          }
          if (json.location) {
            sections.metadata += '\n\n## Location\n' + JSON.stringify(json.location);
          }
        }
      } catch {
        // Ignore JSON parse errors
      }
    }
  }
}

function extractHack2SkillSpecific(sections: UniversalExtractedSections, html: string): void {
  // Hack2Skill specific
  const challengeMatch = html.match(/<div[^>]*class=["'][^"']*challenge-detail[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (challengeMatch?.[1]) {
    sections.description += '\n\n## Challenge Detail\n' + stripHtml(challengeMatch[1]).slice(0, 3000);
  }
}

function extractHackerEarthSpecific(sections: UniversalExtractedSections, html: string): void {
  // HackerEarth specific
  const heMatch = html.match(/<div[^>]*class=["'][^"']*challenge-details[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  if (heMatch?.[1]) {
    sections.description += '\n\n## Challenge Details\n' + stripHtml(heMatch[1]).slice(0, 3000);
  }
}

function extractGenericSpecific(sections: UniversalExtractedSections, html: string): void {
  // For generic, try to extract from common patterns
  // Look for JSON-LD
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  if (jsonLdMatch) {
    for (const script of jsonLdMatch) {
      try {
        const json = JSON.parse(stripHtml(script.replace(/<script[^>]*>/, '').replace(/<\/script>/, '')));
        if (json['@type'] === 'Event' || json['@type'] === 'Hackathon') {
          if (json.description) {
            sections.description += '\n\n## Description (JSON-LD)\n' + json.description;
          }
          if (json.startDate) {
            sections.timeline += '\n\n## Start Date\n' + json.startDate;
          }
          if (json.endDate) {
            sections.timeline += '\n\n## End Date\n' + json.endDate;
          }
        }
      } catch {
        // Ignore
      }
    }
  }

  // Try meta tags for description
  const ogDesc = metaContent(html, 'og:description');
  const twitterDesc = metaContent(html, 'twitter:description');
  const metaDesc = metaContent(html, 'description');
  const desc = ogDesc || twitterDesc || metaDesc;
  if (desc && !sections.description.includes(desc.slice(0, 100))) {
    sections.description += '\n\n## Meta Description\n' + desc;
  }
}

export function getSectionText(sections: UniversalExtractedSections, field: keyof UniversalExtractedSections): string {
  const value = sections[field];
  return typeof value === 'string' ? value : '';
}

export function hasSection(sections: UniversalExtractedSections, field: keyof UniversalExtractedSections): boolean {
  const value = sections[field];
  return typeof value === 'string' && value.trim().length > 0;
}