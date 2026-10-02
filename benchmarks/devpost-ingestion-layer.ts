import { createDeterministicUuid } from './determinism-kernel.js';

export interface ParsedHackathonSpec {
  specId: string;
  title: string;
  problemStatement: string;
  judgingCriteria: string[];
  constraints: string[];
  techStackHints: string[];
  implicitGoals: string[];
  submissionRequirements: string[];
  rawText: string;
  source: 'devpost_url' | 'text' | 'file';
  parsedAt: string;
  devpostUrl?: string;
}

export class DevpostIngestionLayer {
  private readonly seed: number;

  constructor(seed = 42) {
    this.seed = seed;
  }

  async parse(input: string, source: 'devpost_url' | 'text' | 'file' = 'text'): Promise<ParsedHackathonSpec> {
    if (source === 'devpost_url' || input.startsWith('http')) {
      return this.parseDevpostUrl(input);
    }
    if (source === 'file') {
      return this.parseRawText(input);
    }
    return this.parseRawText(input);
  }

  private async parseDevpostUrl(url: string): Promise<ParsedHackathonSpec> {
    let html = '';
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Hack-A-Gent/1.0' },
        signal: AbortSignal.timeout(15000),
      });
      html = await response.text();
    } catch {
      return this.fallbackParse(url, 'devpost_url');
    }

    const title =
      this.extractMeta(html, 'og:title') ??
      this.extractTagContent(html, /<h1[^>]*id=["']title["'][^>]*>([\s\S]*?)<\/h1>/i) ??
      this.extractTagContent(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i) ??
      'Unknown Devpost Project';

    const description = this.extractMeta(html, 'og:description') ?? this.extractMeta(html, 'description') ?? '';

    const techStack = this.extractTechnologies(html);
    const judgingCriteria = this.extractSection(html, /judging/i, /<li[^>]*>([\s\S]*?)<\/li>/gi);
    const constraintsList = this.extractSection(
      html,
      /constraint|limit|must have|requirements/i,
      /<li[^>]*>([\s\S]*?)<\/li>/gi,
    );
    const submissionReqs = this.extractSection(html, /submission|deliverable/i, /<li[^>]*>([\s\S]*?)<\/li>/gi);

    const implicitGoals = this.inferGoals(description, judgingCriteria);

    return {
      specId: 'spec-' + createDeterministicUuid(this.seed, 0).slice(0, 8),
      title: this.cleanText(title).slice(0, 200),
      problemStatement: this.cleanText(description).slice(0, 5000),
      judgingCriteria:
        judgingCriteria.length > 0 ? judgingCriteria : ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
      constraints: constraintsList.map((c) => this.cleanText(c)).filter(Boolean),
      techStackHints: [...new Set(techStack.map((t) => this.cleanText(t)).filter(Boolean))],
      implicitGoals,
      submissionRequirements: submissionReqs.map((r) => this.cleanText(r)).filter(Boolean),
      rawText: html.slice(0, 10000),
      source: 'devpost_url',
      parsedAt: new Date().toISOString(),
      devpostUrl: url,
    };
  }

  private parseRawText(text: string): ParsedHackathonSpec {
    const lines = text.split('\n').filter((l) => l.trim());
    const title = lines[0]?.trim() ?? 'Untitled Project';

    const criteriaKeywords = [
      'innovation',
      'technical',
      'impact',
      'ux',
      'creativity',
      'feasibility',
      'design',
      'completion',
    ];
    const foundCriteria = criteriaKeywords.filter((k) => text.toLowerCase().includes(k));

    return {
      specId: 'spec-' + createDeterministicUuid(this.seed, 0).slice(0, 8),
      title: title.slice(0, 200),
      problemStatement: text.slice(0, 5000),
      judgingCriteria:
        foundCriteria.length > 0 ? foundCriteria : ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
      constraints: [],
      techStackHints: this.inferTechStack(text),
      implicitGoals: this.inferGoals(text, foundCriteria),
      submissionRequirements: [],
      rawText: text.slice(0, 10000),
      source: 'text',
      parsedAt: new Date().toISOString(),
    };
  }

  private fallbackParse(input: string, source: 'devpost_url' | 'text' | 'file'): ParsedHackathonSpec {
    return {
      specId: 'spec-' + createDeterministicUuid(this.seed, 0).slice(0, 8),
      title: `Project from ${source === 'devpost_url' ? 'Devpost' : 'input'}`,
      problemStatement: `Build a solution based on: ${input.slice(0, 2000)}`,
      judgingCriteria: ['Innovation', 'Technical Complexity', 'Impact', 'UX'],
      constraints: ['12 hour limit'],
      techStackHints: ['React', 'Node.js', 'Vercel'],
      implicitGoals: ['Deliver working demo', 'Clean UI', 'Deployed to production'],
      submissionRequirements: [],
      rawText: input.slice(0, 10000),
      source,
      parsedAt: new Date().toISOString(),
      devpostUrl: source === 'devpost_url' ? input : undefined,
    };
  }

  private extractMeta(html: string, property: string): string | null {
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

  private extractTagContent(html: string, pattern: RegExp): string | null {
    const m = html.match(pattern);
    return m?.[1] ?? null;
  }

  private extractTechnologies(html: string): string[] {
    const tags: string[] = [];
    const patterns = [
      /<span[^>]*class=["'][^"']*?(?:tech|tag|label|badge|language)[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi,
      /<a[^>]*href=["'][^"']*tech[^"']*["'][^>]*>([\s\S]*?)<\/a>/gi,
    ];
    for (const p of patterns) {
      const matches = html.matchAll(p);
      for (const m of matches) {
        if (m[1]) tags.push(m[1].replace(/<[^>]*>/g, '').trim());
      }
    }
    return tags;
  }

  private extractSection(html: string, sectionPattern: RegExp, itemPattern: RegExp): string[] {
    const matchIdx = html.search(sectionPattern);
    if (matchIdx < 0) return [];
    const section = html.slice(Math.max(0, matchIdx - 200), matchIdx + 1500);
    const items: string[] = [];
    const matches = section.matchAll(itemPattern);
    for (const m of matches) {
      if (m[1]) items.push(m[1]);
    }
    return items;
  }

  private inferGoals(description: string, criteria: string[]): string[] {
    const goals: string[] = [];
    if (/demo|working|functional|deploy/i.test(description)) goals.push('Deliver working demo');
    if (/ui|ux|design|user interface|user experience/i.test(description)) goals.push('Clean professional UI');
    if (/deploy|live|production|host/i.test(description)) goals.push('Deployed to production');
    if (/api|integrat|backend|server/i.test(description)) goals.push('Working API integration');
    if (/mobile|responsive|adaptive/i.test(description)) goals.push('Responsive design');
    if (criteria.length > 0) goals.push(`Address judging criteria: ${criteria.join(', ')}`);
    if (goals.length === 0) goals.push('Deliver complete hackathon project');
    return goals;
  }

  private inferTechStack(text: string): string[] {
    const known: Record<string, RegExp> = {
      React: /react/i,
      'Node.js': /node/i,
      Python: /python/i,
      TypeScript: /typescript/i,
      Next: /next\.?js/i,
      Vercel: /vercel/i,
      Docker: /docker/i,
      PostgreSQL: /postgres/i,
      MongoDB: /mongo/i,
      GraphQL: /graphql/i,
      Tailwind: /tailwind/i,
      Vue: /vue/i,
      Angular: /angular/i,
      Firebase: /firebase/i,
      AWS: /aws/i,
      GCP: /gcp|google cloud/i,
      TensorFlow: /tensorflow/i,
      PyTorch: /pytorch/i,
      Flutter: /flutter/i,
      Swift: /swift/i,
    };
    return Object.entries(known)
      .filter(([, p]) => p.test(text))
      .map(([name]) => name);
  }

  private cleanText(text: string): string {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
