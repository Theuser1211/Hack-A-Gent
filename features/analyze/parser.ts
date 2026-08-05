/**
 * Hackathon Intelligence — Parser
 * ===============================
 *
 * Securely fetches and extracts structured fields from a hackathon page.
 * Designed to work WITHOUT an LLM (deterministic, heuristic parse)
 * and to fall back to caller-supplied raw HTML for tests / offline use.
 *
 * Security: the fetcher enforces an SSRF guard — denylist of internal and
 * known non-hackathon hosts. Only safe hosts are allowed, with a hard
 * timeout. This mirrors the guard used by the production `run` pipeline.
 */

import { getSeededRandom } from '../../benchmarks/determinism-kernel.js';
import { assertSafeHackathonUrl } from '../../cli/validation/ssrf-guard.js';

import type { ParsedDevpost, SponsorAPI } from './types.js';

const ALLOWED_HOSTS = ['devpost.com', 'www.devpost.com'];

/** Known sponsor technologies and how they typically map to integrations. */
export const KNOWN_SPONSORS: Array<{
  patterns: RegExp;
  name: string;
  category: SponsorAPI['category'];
  mustUse: boolean;
  strategicValue: SponsorAPI['strategicValue'];
  notes: string;
}> = [
  { patterns: /open\s*ai|gpt|whisper|dall-?e|chatgpt/i, name: 'OpenAI', category: 'ai', mustUse: false, strategicValue: 5, notes: 'LLMs, embeddings, vision, speech — strong differentiator for AI demos.' },
  { patterns: /anthropic|claude/i, name: 'Anthropic', category: 'ai', mustUse: false, strategicValue: 5, notes: 'Claude for reasoning, long-context, and agentic flows.' },
  { patterns: /gemini|google ai|palm/i, name: 'Google Gemini', category: 'ai', mustUse: false, strategicValue: 4, notes: 'Multimodal LLM + Vertex ecosystem.' },
  { patterns: /hugging ?face|transformers/i, name: 'Hugging Face', category: 'ml', mustUse: false, strategicValue: 4, notes: 'Model hub, inference endpoints, datasets.' },
  { patterns: /twilio/i, name: 'Twilio', category: 'comms', mustUse: false, strategicValue: 4, notes: 'SMS, voice, WhatsApp, email — great for notifications/demos.' },
  { patterns: /stripe/i, name: 'Stripe', category: 'payments', mustUse: false, strategicValue: 4, notes: 'Payments, billing, checkout — needed for any commerce angle.' },
  { patterns: /firebase/i, name: 'Firebase', category: 'data', mustUse: false, strategicValue: 3, notes: 'Auth, Firestore, hosting, functions — fast full-stack scaffold.' },
  { patterns: /supabase/i, name: 'Supabase', category: 'data', mustUse: false, strategicValue: 4, notes: 'Postgres, auth, storage, realtime — open-source BaaS.' },
  { patterns: /aws|amazon web services/i, name: 'AWS', category: 'hosting', mustUse: false, strategicValue: 3, notes: 'Bedrock, Lambda, S3 — broad cloud surface.' },
  { patterns: /azure|microsoft/i, name: 'Azure', category: 'hosting', mustUse: false, strategicValue: 3, notes: 'OpenAI on Azure, cognitive services, static web apps.' },
  { patterns: /vercel/i, name: 'Vercel', category: 'hosting', mustUse: false, strategicValue: 4, notes: 'Zero-config Next.js deploy — the default Hack-A-Gent target.' },
  { patterns: /netlify/i, name: 'Netlify', category: 'hosting', mustUse: false, strategicValue: 3, notes: 'Edge functions + forms.' },
  { patterns: /auth0|okta|clerk/i, name: 'Auth0 / Clerk', category: 'auth', mustUse: false, strategicValue: 3, notes: 'Drop-in authentication.' },
  { patterns: /nvidia/i, name: 'NVIDIA', category: 'ai', mustUse: false, strategicValue: 4, notes: 'NIMs inference endpoints, CUDA, RAG.' },
  { patterns: /cohere|mistral|groq|together/i, name: 'Cohere / Mistral / Groq', category: 'ai', mustUse: false, strategicValue: 3, notes: 'Fast/cheap inference alternatives.' },
  { patterns: /pinecone|weaviate|qdrant|chromadb/i, name: 'Vector DB', category: 'data', mustUse: false, strategicValue: 3, notes: 'RAG memory for LLM apps.' },
  { patterns: /langchain|llamaindex/i, name: 'LangChain / LlamaIndex', category: 'ai', mustUse: false, strategicValue: 2, notes: 'Orchestration frameworks.' },
  { patterns: /sendgrid|resend|postmark/i, name: 'Email API', category: 'comms', mustUse: false, strategicValue: 2, notes: 'Transactional email.' },
];

export function isAllowedDevpostHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/\.$/, '');
  return ALLOWED_HOSTS.includes(h) || h.endsWith('.devpost.com');
}

/** Throws on non-Devpost hosts (SSRF guard). */
export function assertSafeDevpostUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: ${url}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`Only http(s) Devpost URLs are allowed: ${url}`);
  }
  if (!isAllowedDevpostHost(parsed.hostname)) {
    throw new Error(
      `Refusing to fetch non-Devpost host (SSRF guard): ${parsed.hostname}. Only devpost.com is allowed.`,
    );
  }
  return parsed;
}

/** Fetch a hackathon page HTML with a hard timeout. Throws on network/SSRF failure. */
export async function fetchDevpostHtml(url: string, timeoutMs = 15000): Promise<string> {
  const parsed = assertSafeHackathonUrl(url);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(parsed.toString(), {
      headers: { 'user-agent': 'Hack-A-Gent/1.0 (+https://github.com/Theuser1211/Hack-A-Gent)' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Devpost returned HTTP ${res.status} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ── HTML extraction helpers (no external deps) ──────────────────────────

function metaContent(html: string, prop: string): string {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i');
  const m = html.match(re);
  if (m) return decodeHtmlEntities(m[1]!);
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, 'i');
  const m2 = html.match(re2);
  return m2 ? decodeHtmlEntities(m2[1]!) : '';
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x27;/gi, "'");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

/**
 * Extract text from a named section in HTML, identified by a heading.
 * Returns the text content between the heading and the next heading of the
 * same level (h2/h3/h4), or empty string if no such section heading exists.
 * Only searches within <body> to avoid false positives from <head> content.
 */
function extractSectionText(html: string, sectionNames: string[]): string {
  const bodyMatch = html.match(/<body[\s>][\s\S]*?<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[0] : html;
  const pattern = sectionNames.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const headingRe = new RegExp(`<h[234][^>]*>\\s*.*?(?:${pattern})[^<]*<\\/h[234]>`, 'i');
  const sectionMatch = bodyContent.match(headingRe);
  if (!sectionMatch) return '';
  const afterHeading = bodyContent.slice(sectionMatch.index! + sectionMatch[0].length);
  const nextHeading = afterHeading.search(/<\/?h[1-6]/i);
  return nextHeading > 0 ? afterHeading.slice(0, nextHeading) : afterHeading;
}

/**
 * Extract the sponsors section from raw HTML.
 * Returns the text content of the sponsors/partners section, or empty string
 * if no explicit sponsor section is found. This prevents false positives from
 * navigation, footer badges, OG meta tags, analytics scripts, etc.
 */
function extractSponsorSectionText(html: string): string {
  return extractSectionText(html, ['sponsor', 'partner', 'supported by']);
}

function detectSponsors(html: string): SponsorAPI[] {
  const sectionText = extractSponsorSectionText(html);
  if (!sectionText) return [];

  const plainText = stripHtml(sectionText);

  const found: SponsorAPI[] = [];
  for (const s of KNOWN_SPONSORS) {
    if (s.patterns.test(plainText)) {
      found.push({
        name: s.name,
        category: s.category,
        mustUse: s.mustUse,
        strategicValue: s.strategicValue,
        notes: s.notes,
      });
    }
  }

  // Fallback: extract sponsor names from image alt text in the sponsor section
  const altRe = /<img[^>]+alt="([^"]+)"[^>]*>/gi;
  let altM: RegExpExecArray | null;
  const seen = new Set<string>(found.map(s => s.name.toLowerCase()));
  while ((altM = altRe.exec(sectionText)) !== null) {
    const name = altM[1]!.trim();
    if (name && !seen.has(name.toLowerCase()) && !/sponsor|logo/i.test(name)) {
      seen.add(name.toLowerCase());
      found.push({
        name,
        category: 'other',
        mustUse: false,
        strategicValue: 1,
        notes: '',
      });
    }
  }

  // Filter by seen set
  const seen2 = new Set<string>();
  return found.filter((s) => {
    if (seen2.has(s.name)) return false;
    seen2.add(s.name);
    return true;
  });
}

/** Extract text content from <li> items in HTML, preferring <strong> for names. */
function extractCriteriaFromLis(html: string): ParsedDevpost['judgingCriteria'] {
  const criteria: ParsedDevpost['judgingCriteria'] = [];
  const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  const pctRe = /([A-Za-z][\w &/+-]{2,40})\s*[:\-—]?\s*(\d{1,3})\s*%/g;
  const ptsRe = /([A-Za-z][\w &/+-]{2,40})\s*[:\-—]?\s*(\d{1,3})\s*pts?/gi;

  let m: RegExpExecArray | null;
  while ((m = liRe.exec(html)) !== null) {
    const liContent = m[1]!;

    // Try to extract <strong> text as the criterion name
    const strongMatch = liContent.match(/<strong[^>]*>([\s\S]*?)<\/strong>/i);
    const nameRaw = strongMatch ? strongMatch[1]! : liContent;
    const nameClean = stripHtml(nameRaw).trim();
    if (!nameClean || nameClean.length < 3) continue;

    // Check for percentage/points in the full <li> content
    const fullText = stripHtml(liContent);
    const pctMatches = [...fullText.matchAll(pctRe)];
    const ptsMatches = [...fullText.matchAll(ptsRe)];

    if (pctMatches.length > 0 || ptsMatches.length > 0) {
      let added = false;
      for (const match of pctMatches) {
        const pctName = match[1]!.replace(/[:\-—]\s*$/, '').trim() || 'Criterion';
        const num = parseInt(match[2]!, 10);
        if (Number.isNaN(num)) continue;
        criteria.push({ name: titleCase(pctName), weight: num, inferred: false });
        added = true;
      }
      for (const match of ptsMatches) {
        const ptsName = match[1]!.replace(/[:\-—]\s*$/, '').trim() || 'Criterion';
        const num = parseInt(match[2]!, 10);
        if (Number.isNaN(num)) continue;
        criteria.push({ name: titleCase(ptsName), weight: num, inferred: false });
        added = true;
      }
      if (!added) criteria.push({ name: titleCase(nameClean), weight: 10, inferred: false });
    } else {
      criteria.push({ name: titleCase(nameClean), weight: 10, inferred: false });
    }
  }
  return criteria;
}

/** Parse a judging-criteria line like "Innovation — 40%" or "UI (25 pts)". */
function parseJudgingCriteria(text: string): ParsedDevpost['judgingCriteria'] {
  const criteria: ParsedDevpost['judgingCriteria'] = [];
  const pctRe = /([A-Za-z][\w &/+-]{2,40})\s*[:\-—]?\s*(\d{1,3})\s*%/g;
  const ptsRe = /([A-Za-z][\w &/+-]{2,40})\s*[:\-—]?\s*(\d{1,3})\s*pts?/gi;

  // First pass: extract from <li> items if text contains HTML
  const liCriteria = extractCriteriaFromLis(text);
  if (liCriteria.length > 0) return normalizeWeights(liCriteria);

  // Fallback: split by newlines (plain-text input)
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!/(judg|criteria|score|weight|points|%|pts)/i.test(line)) continue;
    const pctMatches = [...line.matchAll(pctRe)];
    const ptsMatches = [...line.matchAll(ptsRe)];
    for (const m of pctMatches) {
      const name = m[1]!.replace(/[:\-—]\s*$/, '').trim() || 'Criterion';
      const num = parseInt(m[2]!, 10);
      if (Number.isNaN(num)) continue;
      criteria.push({ name: titleCase(name), weight: num, inferred: false });
    }
    for (const m of ptsMatches) {
      const name = m[1]!.replace(/[:\-—]\s*$/, '').trim() || 'Criterion';
      const num = parseInt(m[2]!, 10);
      if (Number.isNaN(num)) continue;
      criteria.push({ name: titleCase(name), weight: num, inferred: false });
    }
  }

  if (criteria.length === 0) {
    // Fallback: infer equal weights for generic categories seen in text.
    const generic = ['innovation', 'technical', 'design', 'impact', 'usability', 'feasibility'];
    for (const g of generic) {
      if (new RegExp(g, 'i').test(text)) {
        criteria.push({ name: titleCase(g), weight: 10, inferred: true });
      }
    }
  }
  return normalizeWeights(criteria);
}

/** Normalize weights so they sum to 100 (deterministic). */
export function normalizeWeights(
  criteria: ParsedDevpost['judgingCriteria'],
): ParsedDevpost['judgingCriteria'] {
  if (criteria.length === 0) return criteria;
  const sum = criteria.reduce((s, c) => s + c.weight, 0);
  if (sum === 0) {
    const w = Math.round(100 / criteria.length);
    return criteria.map((c) => ({ ...c, weight: w }));
  }
  // Scale to 100 and fix rounding on the largest.
  const scaled = criteria.map((c) => ({ ...c, weight: Math.max(0, Math.round((c.weight / sum) * 100)) }));
  const newSum = scaled.reduce((s, c) => s + c.weight, 0);
  const diff = 100 - newSum;
  if (diff !== 0 && scaled.length > 0) {
    const idx = scaled.reduce((best, c, i) => (c.weight > scaled[best]!.weight ? i : best), 0);
    scaled[idx] = { ...scaled[idx]!, weight: scaled[idx]!.weight + diff };
  }
  return scaled;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w.length > 2 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function extractDeadlines(text: string): string[] {
  const out: string[] = [];
  // Match date with optional time and timezone
  const re = /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4}(?:\s*@?\s*\d{1,2}:\d{2}\s*(?:am|pm)?\s*(?:[a-z]{2,5}(?:\/[a-z]{2,5})?(?:[+-]\d{1,2}(?::\d{2})?)?)?)?)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]!.trim());
  return [...new Set(out)].slice(0, 8);
}

/** Extract themes from Devpost theme tag links in HTML. */
function extractThemesFromTags(html: string): string[] {
  const themes: string[] = [];
  const themeRe = /hackathons\?themes?(?:%5B\d*%5D)?=([A-Za-z+%2F.-]+)/gi;
  const seen = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = themeRe.exec(html)) !== null) {
    const decoded = decodeURIComponent(m[1]!.replace(/\+/g, ' '));
    if (!seen.has(decoded)) {
      seen.add(decoded);
      themes.push(titleCase(decoded));
    }
  }
  return themes.filter(t => t.length > 1 && !['General', 'Public'].includes(t));
}

function extractThemes(html: string): string[] {
  // First: extract from Devpost theme tags
  const fromTags = extractThemesFromTags(html);
  if (fromTags.length > 0) return fromTags;

  // Fallback: keyword matching on page text
  const text = stripHtml(html);
  const themes = ['ai', 'ml', 'fintech', 'health', 'education', 'climate', 'web3', 'blockchain', 'ar', 'vr', 'gaming', 'social', 'productivity', 'sustainability', 'accessibility', 'developer tools', 'security', 'privacy', 'beginner friendly', 'machine learning/ai'];
  const found = themes.filter((t) => new RegExp(`\\b${t}\\b`, 'i').test(text));
  return found.length > 0 ? found.map(titleCase) : ['General'];
}

/**
 * Extract structured fields from raw Devpost HTML. Deterministic given the
 * same HTML + seed. Works fully offline (no LLM, no network).
 */
export function extractDevpostData(html: string, url: string, seed = 42): ParsedDevpost {
  const rng = getSeededRandom(seed);
  void rng; // reserved for stable tie-breaking if needed

  const title = metaContent(html, 'og:title') || metaContent(html, 'title') || stripHtml(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').slice(0, 120);
  const tagline = metaContent(html, 'og:description') || '';
  // Normalize Devpost currency spans before stripping HTML:
  // Devpost uses $<span data-currency-value="">32,585</span> which stripHtml
  // turns into "$ 32,585" with a space, breaking the prize regex.
  // We rewrite it to $32,585 before stripping.
  const htmlForPrizes = html.replace(/\$<span[^>]*data-currency[^>]*>([^<]*)<\/span>/gi, '$$$1');
  const rawText = stripHtml(htmlForPrizes);
  const description = (tagline || rawText.slice(0, 600)).slice(0, 800);

  const sponsors = detectSponsors(html);
  const judgingSectionHtml = extractSectionText(html, ['judging', 'criteria', 'evaluation', 'scoring']);
  const judgingCriteria = judgingSectionHtml
    ? parseJudgingCriteria(judgingSectionHtml)
    : []; // No Judging section heading — no inferred criteria
  const deadlines = extractDeadlines(rawText);
  const themes = extractThemes(html);

  const organizerMatch = rawText.match(/(?:[Hh]osted by|[Oo]rganized by|[Pp]resented by)\s*:?\s*([A-Z][A-Za-z0-9&.']+(?:\s+[A-Z][A-Za-z0-9&.']+){0,3})/);
  let rawOrganizer = organizerMatch?.[1]?.trim() ?? '';
  // Fallback: extract from Devpost sidebar organization link
  if (!rawOrganizer || rawOrganizer.includes('Devpost')) {
    const orgLinkMatch = html.match(/hackathons\?organization=([A-Za-z0-9+]+(?:%20[A-Za-z0-9+]+)*)/);
    if (orgLinkMatch) {
      rawOrganizer = decodeURIComponent(orgLinkMatch[1]!.replace(/\+/g, ' '));
    }
  }
  const organizer = rawOrganizer && !rawOrganizer.includes('Devpost') ? rawOrganizer.replace(/\.+$/, '').trim() : 'Unknown';

  // Cash prizes (dollar amounts) — text already has normalized currency spans
  const prizeMatches = rawText.match(/\$[\d,]+(?:\s+(?:USD|prize|award|pool|fund|grant))?/gi) ?? [];
  let prizes = [...new Set(prizeMatches.filter(m => {
    const num = parseInt(m.replace(/[^0-9]/g, ''), 10);
    return num >= 100 || /prize|award|pool|fund|grant/i.test(m);
  }))];
  // Fallback: non-cash prizes from section text
  if (prizes.length === 0) {
    const prizeSectionHtml = extractSectionText(html, ['prize', 'award']);
    if (prizeSectionHtml) {
      const prizeText = stripHtml(prizeSectionHtml);
      const nonCash = prizeText.match(/(?:certificates?|troph(?:y|ies)|swag|non-cash|goodies?|credits?|grants?)[^.]*(?:\.|$)/gi);
      if (nonCash) prizes = [...new Set(nonCash.map(p => p.replace(/\s+/g, ' ').trim()))];
    }
  }
  prizes = prizes.slice(0, 6);
  const rulesSection = extractSectionText(html, ['rule', 'restriction', 'eligibility', 'requirement']);
  let rules: string[] = [];
  if (rulesSection) {
    const rulesText = stripHtml(rulesSection);
    rules = [...new Set(rulesText.match(/\b(?:no\s+[a-z ]{2,30}|must\s+[a-z ]{2,30}|only\s+[a-z ]{2,30})\b/gi) ?? [])];
  }
  // Fallback: extract from <h5>/<h6> "who can participate" or "eligibility" sidebar
  if (rules.length === 0) {
    const eligMatch = html.match(/<h[56][^>]*>(?:Who can participate|Eligibility)[\s\S]*?<\/h[56]>\s*<ul[^>]*>([\s\S]*?)<\/ul>/i);
    if (eligMatch) {
      const liRe = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let liM: RegExpExecArray | null;
      while ((liM = liRe.exec(eligMatch[1]!)) !== null) {
        const text = stripHtml(liM[1]!).trim();
        if (text) rules.push(text);
      }
    }
  }
  rules = rules.slice(0, 6);

  return {
    url,
    title: title || 'Untitled Hackathon',
    tagline,
    description,
    themes,
    organizer,
    sponsorAPIs: sponsors,
    judgingCriteria,
    prizes,
    deadlines,
    rules,
    rawHtmlLength: html.length,
  };
}
