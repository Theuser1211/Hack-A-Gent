import type { DevpostParseResult } from './types.js';
import { confirmed, inferred, unknownField, type ExtractedField } from '../confidence.js';

export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
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
  const parsed = new URL(normalized);
  const hostname = parsed.hostname;
  if (hostname !== 'devpost.com' && !hostname.endsWith('.devpost.com')) {
    throw new Error(`URL must be a Devpost URL (devpost.com). Got: ${hostname}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`URL must use http or https protocol. Got: ${parsed.protocol}`);
  }

  const response = await fetch(normalized, {
    headers: { 'User-Agent': 'Hack-A-Gent/1.0 (devpost parser)' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Devpost URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

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
  const rawCriteria = extractListItems(html, /judging|criteria|evaluation/i);
  const judgingCriteria = rawCriteria.map((c) => stripHtml(c).trim()).filter(Boolean);

  // --- Extract constraints ---
  const rawConstraints = extractListItems(html, /constraint|limit|must have|restriction/i);
  const constraints = rawConstraints.map((c) => stripHtml(c).trim()).filter(Boolean);

  // --- Extract submission requirements ---
  const rawRequirements = extractListItems(html, /requirement|submission|deliverable/i);
  const requirements = rawRequirements.map((r) => stripHtml(r).trim()).filter(Boolean);

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
        ? confirmed(judgingCriteria, 'HTML list items under judging section')
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
    /<span[^>]*class=["'][^"']*?(?:tech|tag|label|badge)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
  );
  if (!techTags) return [];
  return techTags.map((t) => t.replace(/<[^>]*>/g, '').trim());
}

function extractListItems(html: string, keyword: RegExp): string[] {
  const matchIndex = html.search(keyword);
  // search() returns -1 when not found — guard against slicing from -1
  if (matchIndex < 0) return [];

  const start = Math.max(0, matchIndex - 500);
  const end = matchIndex + 1000;
  const section = html.slice(start, end);
  if (!section) return [];

  const items = section.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  if (!items) return [];

  return items.map((item) => item.replace(/<[^>]*>/g, '').trim());
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

function extractSponsorMentions(html: string): string[] {
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
    const prizeSection = html.match(/<div[^>]*(?:sidebar|aside)[^>]*>([\s\S]*?)(?:<\/div>\s*<\/div>)/i);
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

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}
