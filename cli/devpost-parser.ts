import { createDeterministicUuid, deterministicNow } from '../benchmarks/determinism-kernel.js';

export interface DevpostParseResult {
  title: string;
  problemStatement: string;
  judgingCriteria: string[];
  constraints: string[];
  recommendedStack: string[];
  rawText: string;
  submissionRequirements: string[];
}

export async function parseDevpostUrl(url: string): Promise<DevpostParseResult> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Hack-A-Gent/1.0 (devpost parser)' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch Devpost URL: ${response.status} ${response.statusText}`);
  }

  const html = await response.text();

  const title =
    extractMeta(html, 'og:title') ??
    extractTitle(html, /<h1[^>]*id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i) ??
    extractTitle(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
    'Unknown Devpost Project';

  const description =
    extractMeta(html, 'og:description') ??
    extractMeta(html, 'description') ??
    extractTextBetween(html, /<div[^>]*id=["']description["'][^>]*>([\s\S]*?)<\/div>/i) ??
    '';

  const technologies = extractTechnologies(html);

  const judgingCriteria = extractListItems(html, /judging/i);
  const constraints = extractListItems(html, /constraint|limit|must have/i);
  const requirements = extractListItems(html, /requirement|submission/i);

  const cleanDescription = stripHtml(description).replace(/\s+/g, ' ').trim();
  const cleanTitle = stripHtml(title).replace(/\s+/g, ' ').trim();
  const cleanTech = [...new Set(technologies.map((t) => stripHtml(t).trim()).filter(Boolean))];

  return {
    title: cleanTitle.slice(0, 200),
    problemStatement: cleanDescription.slice(0, 5000),
    judgingCriteria:
      judgingCriteria.length > 0 ? judgingCriteria : ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
    constraints: constraints.map((c) => stripHtml(c).trim()).filter(Boolean),
    recommendedStack: cleanTech.length > 0 ? cleanTech : ['React', 'Node.js', 'Vercel'],
    rawText: html.slice(0, 10000),
    submissionRequirements: requirements.map((r) => stripHtml(r).trim()).filter(Boolean),
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
  const section = html.slice(Math.max(0, html.search(keyword) - 500), html.search(keyword) + 1000);
  if (!section) return [];
  const items = section.match(/<li[^>]*>([\s\S]*?)<\/li>/gi);
  if (!items) return [];
  return items.map((item) => item.replace(/<[^>]*>/g, '').trim());
}

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'");
}
