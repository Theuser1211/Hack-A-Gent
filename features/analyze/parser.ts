/**
 * Devpost Intelligence — Parser
 * ==============================
 *
 * Securely fetches and extracts structured fields from a Devpost hackathon
 * page. Designed to work WITHOUT an LLM (deterministic, heuristic parse)
 * and to fall back to caller-supplied raw HTML for tests / offline use.
 *
 * Security: the fetcher enforces an SSRF guard — only devpost.com /
 * www.devpost.com are allowed, with a hard timeout. This mirrors the
 * guard used by the production `run` pipeline.
 */

import { getSeededRandom } from '../../benchmarks/determinism-kernel.js';
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

/** Fetch Devpost HTML with a hard timeout. Throws on network/SSRF failure. */
export async function fetchDevpostHtml(url: string, timeoutMs = 15000): Promise<string> {
  const parsed = assertSafeDevpostUrl(url);
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

function detectSponsors(text: string): SponsorAPI[] {
  const found: SponsorAPI[] = [];
  for (const s of KNOWN_SPONSORS) {
    if (s.patterns.test(text)) {
      found.push({
        name: s.name,
        category: s.category,
        mustUse: s.mustUse,
        strategicValue: s.strategicValue,
        notes: s.notes,
      });
    }
  }
  // Dedupe by name
  const seen = new Set<string>();
  return found.filter((s) => {
    if (seen.has(s.name)) return false;
    seen.add(s.name);
    return true;
  });
}

/** Parse a judging-criteria line like "Innovation — 40%" or "UI (25 pts)". */
function parseJudgingCriteria(text: string): ParsedDevpost['judgingCriteria'] {
  const criteria: ParsedDevpost['judgingCriteria'] = [];
  const lines = text.split(/\n|\.|(?:\r)/).map((l) => l.trim()).filter(Boolean);

  const pctRe = /([A-Za-z][\w &/+-]{2,40})?\s*[:\-—]?\s*(\d{1,3})\s*%?/;
  const ptsRe = /([A-Za-z][\w &/+-]{2,40})?\s*[:\-—]?\s*(\d{1,3})\s*pts?/i;

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (!/(judg|criteria|score|weight|points|%|pts)/i.test(line)) continue;
    const pct = line.match(pctRe);
    const pts = line.match(ptsRe);
    const m = pct ?? pts;
    if (!m) continue;
    const name = (m[1] ?? 'Criterion').replace(/[:\-—]\s*$/, '').trim() || 'Criterion';
    const num = parseInt(m[2]!, 10);
    if (Number.isNaN(num)) continue;
    criteria.push({ name: titleCase(name), weight: num, inferred: false });
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
  let scaled = criteria.map((c) => ({ ...c, weight: Math.max(0, Math.round((c.weight / sum) * 100)) }));
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
  const re = /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s*\d{4})/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) out.push(m[1]!);
  return [...new Set(out)].slice(0, 8);
}

function extractThemes(text: string): string[] {
  const themes = ['ai', 'ml', 'fintech', 'health', 'education', 'climate', 'climate', 'web3', 'blockchain', 'ar', 'vr', 'gaming', 'social', 'productivity', 'sustainability', 'accessibility', 'developer tools', 'security', 'privacy'];
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
  const rawText = stripHtml(html);
  const description = (tagline || rawText.slice(0, 600)).slice(0, 800);

  const sponsors = detectSponsors(rawText + ' ' + title);
  const judgingCriteria = parseJudgingCriteria(rawText);
  const deadlines = extractDeadlines(rawText);
  const themes = extractThemes(rawText + ' ' + title);

  const organizer = rawText.match(/(?:hosted by|organizer|presented by)\s*:?\s*([A-Z][\w &.]+)/i)?.[1]?.trim() ?? 'Unknown';

  const prizes = [...new Set(rawText.match(/\$[\d,]+(?:\+|\s*USD|\s*prize)?/gi) ?? [])].slice(0, 6);
  const rules = [...new Set(rawText.match(/\b(?:no\s+[a-z ]{2,30}|must\s+[a-z ]{2,30}|only\s+[a-z ]{2,30})\b/gi) ?? [])].slice(0, 6);

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
