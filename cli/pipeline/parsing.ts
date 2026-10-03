import { confirmed, unknownField } from '../confidence.js';
import { assertSafeHackathonUrl } from '../validation/ssrf-guard.js';

import type { DevpostParseResult } from './types.js';

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * Extract judging criteria from plain-text lines of a challenge description
 * or page content, without requiring a dedicated heading.
 *
 * It never fabricates criteria from arbitrary marketing text. It only accepts
 * lines whose wording signals a judging axis *and* that the item carries an
 * explicit weight or judging phrasing (e.g. "40% of the score", "25 pts",
 * "Judged on: creativity", "Evaluated on Innovation"). A bare axis word such
 * as "Impact", "Value", or "Quality" is a marketing adjective and is never
 * promoted to a judging criterion on its own.
 */
function parseCriteriaFromText(text: string, hint = ''): string[] {
  const criteria: string[] = [];
  const seen = new Set<string>();
  const add = (name: string) => {
    const cleaned = name.trim();
    if (!cleaned || cleaned.length < 3) return;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    criteria.push(cleaned);
  };

  // Jurisdiction marker: does the hint itself belong to a judging section?
  const hintIsJudging = /(judg|criteria|evaluation|scoring|score|judging axis)/i.test(hint);

  // 1. Bullet / numbered list items that look like criteria. A bare axis word
  // (e.g. "Impact", "Value", "Quality") is a marketing adjective, not a
  // judging axis, so we only accept the item when it carries an explicit
  // weight suffix or judging phrasing.
  const listRe = /-|\*|\d+\.\s*/;
  const bullets = text.split(/\n+/).filter((l) => l.match(listRe));
  for (const b of bullets) {
    const cleaned = b.replace(listRe, '').trim();
    if (!cleaned || cleaned.length < 3) continue;
    const lower = cleaned.toLowerCase();
    const hasAxis = /(innovat|technical|impact|design|usability|creativ|feasib|complet|present|original|execut|value|team|quality|scalab|security|accessib|performance|experience|function)/.exec(lower);
    // Accept only if the item has a weight/score marker or explicit judging phrasing.
    const hasWeight = /(\d+\s*(?:%|pts?|points?|of the score|of judging))|\d+\s*\/|judged on|evaluated on|scored on|scoring of|judging axis/i.test(cleaned);
    const hasJudgingPhrasing = /(criteria|judg|score|weight|evaluate|point|mark)/i.test(lower);
    if (hasAxis && (hasWeight || hasJudgingPhrasing || hintIsJudging)) {
      add(cleaned.split(/[,;]/)[0] ?? '');
    }
  }

  // 2. Free-standing lines that explicitly describe how the hackathon will be
  // judged (e.g. "Judged on innovation, technical complexity, and impact").
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    const hasAxis = /(innovat|technical|impact|design|usability|creativ|feasib|complet|present|original|execut|value|team|quality|scalab|security|accessib|performance|experience|function)/.exec(lower);
    const hasJudgingPhrasing = /(judg|judge|criteria|evaluation|scoring|score|weight|point|mark)/i.test(lower);
    const hasWeight = /(\d+\s*(?:%|pts?|points?|of the score|of judging))|\d+\s*\/|judged on|evaluated on|scored on/i.test(line);
    // Only treat a line as a criterion when it describes judgment: it names a
    // judging axis AND mentions judgment/weight explicitly.
    if (hasAxis && (hasWeight || hasJudgingPhrasing)) {
      const raw = line.split(/[,;]/)[0] ?? '';
      const cleaned = raw.replace(/^\s*[-*–—•\d.]+\s*/, '').trim();
      if (cleaned) add(cleaned);
    }
  }

  // 3. Fallback: scan the page text for "label: weight" rubric lines (e.g.
  // "Innovation: 40%"). These are the strongest signal that a page enumerates
  // its criteria even without section headings.
  const rubricRe = /([A-Za-z][\w &/+-]{2,40})\s*[:-–—]\s*(\d{1,3})\s*(?:%|pts?)/gi;
  let rubricMatch: RegExpExecArray | null;
  while ((rubricMatch = rubricRe.exec(text)) !== null) {
    const name = rubricMatch[1]!.replace(/[:-–—\s]+$/, '').trim();
    if (name && name.length >= 3) {
      const key = name.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        criteria.push(name);
      }
    }
  }

  return criteria;
}

/**
 * Parse a Devpost hackathon page and extract structured information.
 *
 * Every extracted field is tagged with a confidence level:
 * - confirmed: Actually found in the HTML
 * - inferred: Reasonable match from context (keyword proximity)
 * - unknown: Not found, empty fallback
 *
 * Never fabricates missing information.
 */
export async function parseDevpostUrl(url: string): Promise<DevpostParseResult> {
  const normalized = normalizeUrl(url);
  if (!normalized) {
    throw new Error('No URL provided. Expected a Devpost URL like:\n  https://example.devpost.com');
  }
  assertSafeHackathonUrl(normalized);
  const response = await fetch(normalized, {
    headers: { 'User-Agent': 'Hack-A-Gent/1.0 (devpost parser)' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Devpost URL: ${response.status} ${response.statusText}`);
  }

  const html = stripNoise(await response.text());

  // --- Extract title (confirmed if found in meta tags) ---
  const rawTitle =
    extractMeta(html, 'og:title') ??
    extractTitle(html, /<h1[^>]*id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i) ??
    extractTitle(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = rawTitle ? stripHtml(rawTitle).replace(/\s+/g, ' ').trim() : '';

  // --- Extract description ---
  const rawDesc =
    extractMeta(html, 'og:description') ??
    extractMeta(html, 'description') ??
    extractTextBetween(html, /<div[^>]*id=["']description["'][^>]*>([\s\S]*?)<\/div>/i) ??
    extractTextBetween(html, /<div[^>]*class=["'][^"']*?(?:description|summary|challenge)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i);
  const problemStatement = rawDesc ? stripHtml(rawDesc).replace(/\s+/g, ' ').trim() : '';
  const cleanDescription = stripHtml(rawDesc || '').replace(/\s+/g, ' ').trim();

  // --- Extract technologies/tags ---
  const techTags = extractTechnologies(html);
  const cleanTech = [...new Set(techTags.map((t) => stripHtml(t).trim()).filter(Boolean))];

  // --- Extract judging criteria ---
  // Look for a heading like 'Judging Criteria', 'Evaluation Criteria', 'How We Judge',
  // 'Judging Guidelines', 'Scoring', 'Evaluation', etc.,
  // and grab the list items that follow it until the next heading.
  const headingJudgingCriteria = extractListItems(html, /<h[1-6][^>]*>[\s\S]*?(?:judging|judging guidelines|how we judge|evaluation|evaluation criteria|scoring|scoring criteria|criteria|rubric)[\s\S]*?<\/h[1-6]>/i);
  let judgingCriteria = headingJudgingCriteria;
  let criteriaConfidence: 'confirmed' | 'inferred' = 'confirmed';
  if (judgingCriteria.length === 0) {
    // Heading was not found on this page (Devpost pages vary in section naming).
    // Fall back to heading-agnostic criteria extraction from the page text
    // so the strategy stage still knows what the judges reward.
    judgingCriteria = parseCriteriaFromText(stripHtml(html), problemStatement);
    criteriaConfidence = 'inferred';
  }

  // --- Extract constraints ---
  const constraints = extractListItems(html, /<h[1-6][^>]*>[\s\S]*?(?:constraint|limit|must have|restriction|eligibility|terms|conditions)[\s\S]*?<\/h[1-6]>/i);

  // --- Extract submission requirements ---
  const requirements = extractListItems(html, /<h[1-6][^>]*>[\s\S]*?(?:submission|deliverables|what to submit|how to submit|requirements|deliverable)[\s\S]*?<\/h[1-6]>/i);

  // --- Extract deadlines ---
  const deadlines = extractDeadlines(html);

  // --- Extract organizer ---
  const organizer = extractOrganizer(html, problemStatement);

  // --- Extract sponsor APIs ---
  const sponsors = extractSponsorMentions(html);

  return {
    title: title.slice(0, 200),
    problemStatement: cleanDescription.slice(0, 5000),
    judgingCriteria,
    constraints,
    recommendedStack: cleanTech,
    rawText: html.slice(0, 10000),
    submissionRequirements: requirements,
    confidence: {
      title: title ? confirmed(title, 'meta tag or h1') : unknownField(''),
      judgingCriteria: judgingCriteria.length > 0
        ? { value: judgingCriteria, confidence: criteriaConfidence, source: criteriaConfidence === 'confirmed' ? 'criteria found on the page (heading or text)' : 'criteria inferred from page text patterns' }
        : unknownField([]),
      deadlines: deadlines.length > 0
        ? confirmed(deadlines, 'date patterns in page text')
        : unknownField([]),
      sponsorAPIs: sponsors.length > 0
        ? confirmed(sponsors, 'sponsor mentions in HTML')
        : unknownField([]),
      organizer: organizer ? confirmed(organizer, 'organizer meta or text pattern') : unknownField(''),
      techStack: cleanTech.length > 0
        ? confirmed(cleanTech, 'technology tags')
        : unknownField([]),
      restrictions: constraints.length > 0
        ? confirmed(constraints, 'constraint list items')
        : unknownField([]),
    },
  };
}

function extractMeta(html: string, property: string): string | null {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m?.[1]) return m[1];
  }
  return null;
}

function extractTitle(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  return m?.[1] ?? null;
}

function extractTextBetween(html: string, pattern: RegExp): string | null {
  const m = html.match(pattern);
  return m?.[1] ?? null;
}

function extractTechnologies(html: string): string[] {
  const techTags = html.match(
    /<span[^>]*class=["'][^"']*?\b(?:tech|tag|label|badge)\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
  );
  if (!techTags) return [];
  return techTags.map((t) => t.replace(/<[^>]*>/g, '').trim());
}

/**
 * Extract list items (<li>) from a named HTML section, using a heading
 * match to define the section boundaries. Avoids grabbing unrelated list
 * items from navigation, footer, sidebar, or other parts of the page.
 */
function extractListItems(html: string, headingPattern: RegExp): string[] {
  const match = html.match(headingPattern);
  if (!match) return [];
  const start = match.index! + match[0].length;
  // Find the next heading or the end of the body section
  const after = html.slice(start);
  const nextHeading = after.search(/<h[1-6][^>]*>/i);
  const end = nextHeading >= 0 ? start + nextHeading : html.length;
  const section = html.slice(start, end);
  if (!section) return [];
  const items = section.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  if (!items) return [];
  return items.map((item) => stripHtml(item).trim()).filter(Boolean);
}

function extractDeadlines(html: string): Array<{ label: string; date: string; type: 'submission' | 'judging' | 'demo' }> {
  const result: Array<{ label: string; date: string; type: 'submission' | 'judging' | 'demo' }> = [];
  // Devpost typically has a sidebar with deadline info — look for date-like patterns
  const datePatterns = [
    // Month Day, Year
    /(?:submission|deadline|due)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi,
    // Also check for relative dates
    /(?:submission|deadline|due)[:\s]+([A-Za-z]+\s+\d+[a-z]{2}\s+\d{4})/gi,
  ];
  for (const pat of datePatterns) {
    const matches = html.matchAll(pat);
    for (const m of matches) {
      if (m[1]) {
        const date = m[1].trim();
        if (!result.some(d => d.date === date)) {
          result.push({ label: 'Submission', date, type: 'submission' });
        }
      }
    }
  }
  // Check for judging dates
  const judgingPatterns = [
    /(?:judging|evaluation)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi,
    /(?:demo\s+day|final|winners\s+announced)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi,
  ];
  for (const pat of judgingPatterns) {
    const matches = html.matchAll(pat);
    for (const m of matches) {
      if (m[1]) {
        const date = m[1].trim();
        const type = m[0].toLowerCase().includes('judging') || m[0].toLowerCase().includes('evaluation')
          ? 'judging' as const
          : 'demo' as const;
        if (!result.some(d => d.date === date)) {
          result.push({ label: type === 'judging' ? 'Judging' : 'Demo Day', date, type });
        }
      }
    }
  }
  return result;
}

function extractOrganizer(html: string, fallbackText: string): string | null {
  // Try meta tags first
  const metaOrg = extractMeta(html, 'application-name') || extractMeta(html, 'author');
  if (metaOrg && !metaOrg.includes('Devpost') && metaOrg.length > 2) return metaOrg;

  // Look for "hosted by" or "organized by" patterns in HTML
  const orgPatterns = [
    /(?:hosted by|organized by|presented by)[:\s]+<strong>([^<]+?)<\/strong>/i,
    /(?:hosted by|organized by|presented by)[:\s]+([A-Z][A-Za-z0-9\s]{2,50}?)(?:\.|!|\n|<|$)/i,
  ];
  for (const pat of orgPatterns) {
    const m = html.match(pat);
    if (m?.[1]) {
      const name = m[1].trim();
      if (name.length > 1 && !name.includes('Devpost')) return name;
    }
  }

  // Fall back to the text-based extraction (less reliable)
  // NOTE: intentionally does NOT match plain "by" — that produces false positives
  // on any sentence containing " by " (e.g. "submitted by", "powered by")
  if (fallbackText) {
    const m = fallbackText.match(/(?:hosted by|organized by|presented by)\s+([A-Z][A-Za-z0-9\s]{2,50}?)(?:\.|!|\n|$)/i);
    if (m?.[1]) {
      const name = m[1].trim();
      if (name.length > 1 && !name.includes('Devpost')) return name;
    }
  }

  return null;
}

export function extractSponsorMentions(html: string): string[] {
  // Look for the Devpost sidebar prize/sponsor section
  const sponsorPatterns = [
    /<div[^>]*class=["'][^"']*?(?:prize|sponsor|reward)[^"']*["'][^>]*>([\s\S]*?)<\/div>/gi,
  ];

  const mentions = new Set<string>();
  const knownSponsors = [
    'OpenAI', 'Twilio', 'Stripe', 'Firebase', 'AWS', 'Azure',
    'Supabase', 'Vercel', 'Hugging Face', 'Gemini', 'Google',
    'Microsoft', 'Meta', 'Netlify', 'Replit', 'Render', 'MongoDB',
    'DataStax', 'Confluent', 'Cloudflare', 'Algorand', 'Polygon',
    'Chainlink', 'WalletConnect', 'Push Protocol', 'The Graph',
  ];
  for (const pat of sponsorPatterns) {
    const sections = html.matchAll(pat);
    for (const section of sections) {
      const text = section[1]!;
      for (const sponsor of knownSponsors) {
        if (text.toLowerCase().includes(sponsor.toLowerCase())) {
          mentions.add(sponsor);
        }
      }
    }
  }

  // Also check if sponsors are mentioned in prize areas by looking for prize amounts
  // A number followed by "prize" is a strong signal of sponsor prizes
  if (mentions.size === 0) {
    // Check for common Devpost sidebar patterns
    const prizeSection = html.match(/<div[^>]*(?:sidebar|aside)[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>|<\/div>)/i);
    if (prizeSection) {
      const prizeText = prizeSection[1]!;
      for (const sponsor of knownSponsors) {
        if (prizeText.toLowerCase().includes(sponsor.toLowerCase())) {
          mentions.add(sponsor);
        }
      }
    }
  }

  return [...mentions];
}

/**
 * Strip HTML tags and decode common HTML entities.
 */
function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/"/g, '"')
    .replace(/'/g, "'")
    .replace(/'/g, "'")
    .replace(/&nbsp;/g, ' ');
}

/**
 * Strip website noise from HTML before challenge extraction.
 * Removes navigation, login forms, footer, cookie banners, accessibility
 * skip links, and generic site chrome that should never become challenge
 * goals, demo talking points, strategy, or project descriptions.
 */
function stripNoise(html: string): string {
  let clean = html;

  // 1. Remove structural noise elements (nav, footer, header site chrome)
  clean = clean.replace(/<nav\b[^>]*>[\s\S]*?<\/nav>/gi, '');
  clean = clean.replace(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi, '');
  clean = clean.replace(/<header\b[^>]*>[\s\S]*?<\/header>/gi, '');

  // 2. Remove cookie consent banners (common patterns)
  clean = clean.replace(/<div\b[^>]*class=["'][^"']*cookie[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  clean = clean.replace(/<div\b[^>]*id=["'][^"']*cookie[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  clean = clean.replace(/<div\b[^>]*class=["'][^"']*consent[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

  // 3. Remove login/sign-in/register elements
  clean = clean.replace(/<a\b[^>]*href=["'][^"']*sign[\s-]*in[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');
  clean = clean.replace(/<a\b[^>]*href=["'][^"']*login[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');
  clean = clean.replace(/<a\b[^>]*href=["'][^"']*register[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');
  clean = clean.replace(/<button\b[^>]*>[\s\S]*(?:sign[\s-]*in|log[\s-]*in|register)[\s\S]*?<\/button>/gi, '');

  // 4. Remove accessibility skip links
  clean = clean.replace(/<a\b[^>]*class=["'][^"']*skip[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');
  clean = clean.replace(/<a\b[^>]*href=["'][^"']*#main[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, '');

  // 5. Remove sidebar navigation / breadcrumbs
  clean = clean.replace(/<div\b[^>]*class=["'][^"']*sidebar[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  clean = clean.replace(/<ol\b[^>]*class=["'][^"']*breadcrumb[^"']*["'][^>]*>[\s\S]*?<\/ol>/gi, '');

  // 6. Remove Devpost-specific noise (hackathon listing navigation, filter bars)
  clean = clean.replace(/<div\b[^>]*class=["'][^"']*filter[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');
  clean = clean.replace(/<div\b[^>]*class=["'][^"']*toolbar[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '');

  return clean;
}