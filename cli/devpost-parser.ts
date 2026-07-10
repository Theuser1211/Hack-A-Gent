import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid } from '../benchmarks/determinism-kernel.js';

export interface DevpostParseResult {
  title: string;
  problemStatement: string;
  judgingCriteria: string[];
  constraints: string[];
  recommendedStack: string[];
  rawText: string;
  submissionRequirements: string[];
}

// Phase 1: Competition Intelligence Types
export interface CompetitionAnalysis {
  analysisId: string;
  challenge: {
    title: string;
    problemStatement: string;
    theme: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedParticipants: number;
    organizer: string;
  };
  judgingCriteria: Array<{
    name: string;
    weight: number;
    weightRaw: string;
    description: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
  }>;
  sponsorAPIs: Array<{
    name: string;
    provider: string;
    description: string;
    strategicValue: 'must_use' | 'should_use' | 'nice_to_have';
  }>;
  deliverables: Array<{
    description: string;
    format: string;
    required: boolean;
  }>;
  restrictions: string[];
  deadlines: Array<{
    label: string;
    date: string;
    type: 'submission' | 'judging' | 'demo';
  }>;
}

// Phase 2: Winning Strategy Types
export interface WinningStrategy {
  projectName: string;
  oneLiner: string;
  whyScoreWell: string[];
  targetedCriteria: Array<{ name: string; weight: number; approach: string }>;
  prioritizedAPIs: string[];
  architecture: string;
  differentiators: string[];
  risks: Array<{ risk: string; mitigation: string }>;
  recommendedStack: string[];
  estimatedJudgeScore: number;
}

export interface FinalReport {
  challengeSummary: string;
  chosenStrategy: WinningStrategy;
  techStack: string[];
  generatedFeatures: string[];
  knownWeaknesses: string[];
  futureImprovements: string[];
  judgeScorePrediction: number;
  innovationScore: number;
  technicalDepthScore: number;
  feasibilityScore: number;
  presentationScore: number;
  completenessScore: number;
  maintainabilityScore: number;
  judgeAlignmentScore: number;
  qualityChecks: QualityCheck[];
}

export async function parseDevpostUrl(url: string): Promise<DevpostParseResult> {
  const parsed = new URL(url);
  const hostname = parsed.hostname;
  if (hostname !== 'devpost.com' && !hostname.endsWith('.devpost.com')) {
    throw new Error(`URL must be a Devpost URL (devpost.com). Got: ${hostname}`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error(`URL must use http or https protocol. Got: ${parsed.protocol}`);
  }

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

// ── Phase 1: Competition Intelligence Engine ──────────────────────────────────
// Extracts deep structured analysis from Devpost competition data

export class CompetitionIntelligence {
  private analyses: Array<CompetitionAnalysis> = [];

  analyze(input: DevpostParseResult): CompetitionAnalysis {
    const text = input.rawText || input.problemStatement;
    
    // Parse judging criteria with inferred weights
    const judgingCriteria = input.judgingCriteria.map(c => {
      const weightMatch = c.match(/(\d+)%/);
      const pointsMatch = c.match(/(\d+)\s*(?:pts|points)/i);
      const weightVal = weightMatch ? parseInt(weightMatch[1]!) : pointsMatch ? parseInt(pointsMatch[1]!) : 25;
      const cleanName = c.replace(/\(\d+%\)/, '').replace(/\d+%\s*/, '').replace(/[()]/g, '').trim();
      return {
        name: cleanName || c,
        weight: weightVal,
        weightRaw: weightMatch ? weightMatch[0] : pointsMatch ? pointsMatch[0] : 'equal',
        description: this.describeCriterion(cleanName || c),
        priority: (weightVal >= 30 ? 'critical' : weightVal >= 20 ? 'high' : weightVal >= 10 ? 'medium' : 'low') as 'critical' | 'high' | 'medium' | 'low',
      };
    });

    // Normalize weights to sum to 100
    const totalW = judgingCriteria.reduce((s, c) => s + c.weight, 0);
    if (totalW > 0 && Math.abs(totalW - 100) > 1) {
      for (const c of judgingCriteria) c.weight = Math.round((c.weight / totalW) * 100);
    }
    // Fix rounding
    const finalW = judgingCriteria.reduce((s, c) => s + c.weight, 0);
    if (judgingCriteria.length > 0 && finalW !== 100) {
      judgingCriteria[judgingCriteria.length - 1]!.weight += 100 - finalW;
    }

    // Extract sponsor APIs from text and stack
    const sponsorAPIs = this.findSponsorAPIs(text, input.recommendedStack);
    
    // Extract deliverables
    const deliverables = this.findDeliverables(text);
    
    // Extract restrictions
    const restrictions = this.findRestrictions(input.constraints, text);
    
    // Extract deadlines
    const deadlines = this.findDeadlines(text);
    
    // Theme inference
    const theme = this.inferTheme(text, input.title);

    const analysis: CompetitionAnalysis = {
      analysisId: 'ca-' + createDeterministicUuid(this.analyses.length, this.analyses.length).slice(0, 8),
      challenge: {
        title: input.title,
        problemStatement: input.problemStatement,
        theme,
        difficulty: this.inferDifficulty(input.constraints, input.recommendedStack),
        estimatedParticipants: this.estimateParticipants(text),
        organizer: this.extractOrganizer(text),
      },
      judgingCriteria,
      sponsorAPIs,
      deliverables,
      restrictions,
      deadlines,
    };

    this.analyses.push(analysis);
    return analysis;
  }

  getLatest(): CompetitionAnalysis | null {
    return this.analyses.length > 0 ? this.analyses[this.analyses.length - 1]! : null;
  }

  private describeCriterion(name: string): string {
    const l = name.toLowerCase();
    if (l.includes('innovation')) return 'Originality, creativity, and novel approach';
    if (l.includes('technical') || l.includes('complexity')) return 'Technical sophistication and implementation depth';
    if (l.includes('impact')) return 'Real-world applicability and potential';
    if (l.includes('ux') || l.includes('design') || l.includes('usability')) return 'User experience and interface polish';
    if (l.includes('functionality') || l.includes('complete')) return 'Feature completeness and working functionality';
    if (l.includes('presentation') || l.includes('pitch')) return 'Demo presentation quality'; 
    return 'Addresses: ' + name;
  }

  private findSponsorAPIs(text: string, stack: string[]): Array<CompetitionAnalysis['sponsorAPIs'][0]> {
    const knownSponsors: Record<string, { provider: string; desc: string }> = {
      'openai': { provider: 'OpenAI', desc: 'GPT models for AI features' },
      'twilio': { provider: 'Twilio', desc: 'SMS and communication APIs' },
      'stripe': { provider: 'Stripe', desc: 'Payment processing' },
      'firebase': { provider: 'Firebase', desc: 'Backend and hosting' },
      'aws': { provider: 'AWS', desc: 'Cloud infrastructure' },
      'azure': { provider: 'Azure', desc: 'Cloud services' },
      'supabase': { provider: 'Supabase', desc: 'Open-source backend' },
      'vercel': { provider: 'Vercel', desc: 'Frontend deployment' },
      'huggingface': { provider: 'Hugging Face', desc: 'AI models' },
    };
    const lt = text.toLowerCase();
    const ls = stack.map(s => s.toLowerCase());
    return Object.entries(knownSponsors)
      .filter(([kw]) => ls.some(s => s.includes(kw)) || lt.includes(kw))
      .map(([kw, info]) => ({
        name: info.provider,
        provider: info.provider,
        description: info.desc,
        strategicValue: (new RegExp('sponsor.*' + kw + '|' + kw + '.*prize', 'i').test(text) ? 'must_use' : 'should_use') as 'must_use' | 'should_use' | 'nice_to_have',
      }));
  }

  private findDeliverables(text: string): Array<CompetitionAnalysis['deliverables'][0]> {
    const out: Array<CompetitionAnalysis['deliverables'][0]> = [];
    const checks = [
      { p: /github|repository/i, d: 'Source code repository', f: 'GitHub URL' },
      { p: /demo|live|deploy|url|website/i, d: 'Live demo', f: 'URL' },
      { p: /video|screencast/i, d: 'Demo video', f: 'Video URL' },
      { p: /readme|documentation/i, d: 'Documentation', f: 'README' },
    ];
    for (const c of checks) {
      if (c.p.test(text)) out.push({ description: c.d, format: c.f, required: true });
    }
    return out;
  }

  private findRestrictions(constraints: string[], text: string): string[] {
    const r = new Set(constraints);
    const pats = [/(?:time|duration)\s*(?:limit|constraint)[:\s]+([^.\n]+)/i, /(?:must\s+not|cannot|prohibited|banned)[:\s]+([^.\n]+)/i];
    for (const p of pats) { const m = text.match(p); if (m?.[1]) r.add(m[1].trim()); }
    return [...r];
  }

  private findDeadlines(text: string): Array<CompetitionAnalysis['deadlines'][0]> {
    const d: Array<CompetitionAnalysis['deadlines'][0]> = [];
    const pats = [
      { p: /(?:submission|deadline|due)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Submission', type: 'submission' as const },
      { p: /(?:judging|evaluation)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Judging', type: 'judging' as const },
      { p: /(?:demo\s+day|final)[:\s]+([A-Za-z]+\s+\d+,?\s*\d{4})/gi, label: 'Demo Day', type: 'demo' as const },
    ];
    for (const pat of pats) {
      const ms = text.matchAll(pat.p);
      for (const m of ms) { if (m[1]) d.push({ label: pat.label, date: m[1].trim(), type: pat.type }); }
    }
    return d;
  }

  private inferTheme(text: string, fallbackTitle: string): string {
    const p = [/(?:theme|track)[:\s]+(.+?)(?:\.|!|\n|$)/i];
    for (const pat of p) {
      const m = text.match(pat);
      if (m?.[1]) return m[1].trim();
    }
    const terms = ['ai','ml','climate','health','education','fintech','sustainability','web3','blockchain','iot','gaming','social'];
    const found = terms.find(t => text.toLowerCase().includes(t));
    return found ? found.charAt(0).toUpperCase() + found.slice(1) : 'General';
  }

  private inferDifficulty(constraints: string[], stack: string[]): CompetitionAnalysis['challenge']['difficulty'] {
    const all = [...constraints, ...stack].join(' ').toLowerCase();
    const adv = ['blockchain','kubernetes','tensorflow','pytorch','web3','distributed','microservices'];
    const beg = ['html','css','python','beginner','starter'];
    if (adv.filter(k => all.includes(k)).length >= 2) return 'advanced';
    if (beg.filter(k => all.includes(k)).length >= 2) return 'beginner';
    if (constraints.some(c => /complex|advanced/i.test(c))) return 'advanced';
    if (constraints.some(c => /easy|simple|starter/i.test(c))) return 'beginner';
    return 'intermediate' as const;
  }

  private estimateParticipants(text: string): number {
    const m = text.match(/(\d[\d,]*)\s*(participants|teams|submissions|entries)/i);
    return m ? parseInt(m[1]!.replace(/,/g, ''), 10) : 500;
  }

  private extractOrganizer(text: string): string {
    const m = text.match(/(?:hosted by|organized by|presented by|by)\s+([A-Z][A-Za-z0-9\s]+?)(?:\.|!|\n|$)/i);
    return m ? m[1]!.trim() : 'Unknown';
  }

  /** Generate a competition brief */
  generateBrief(analysis: CompetitionAnalysis): string {
    return [
      '# ' + analysis.challenge.title,
      '',
      '**Theme:** ' + analysis.challenge.theme,
      '**Difficulty:** ' + analysis.challenge.difficulty,
      '',
      '## Judging Criteria',
      ...analysis.judgingCriteria.map(c => '- ' + c.name + ': ' + c.weight + '% [' + c.priority + ']'),
      '',
      analysis.sponsorAPIs.length ? '## Sponsor APIs' : '',
      ...analysis.sponsorAPIs.map(a => '- ' + a.name + ': ' + a.description + ' [' + a.strategicValue + ']'),
      '',
      analysis.restrictions.length ? '## Restrictions' : '',
      ...analysis.restrictions.map(r => '- ' + r),
      '',
      analysis.deadlines.length ? '## Deadlines' : '',
      ...analysis.deadlines.map(d => '- ' + d.label + ': ' + d.date),
    ].filter(Boolean).join('\n');
  }
}

// ── Phase 2: Winning Strategy Generator ────────────────────────────────────
// Generates judge-optimized winning strategies from competition analysis

export class WinningStrategyGenerator {
  generate(analysis: CompetitionAnalysis): WinningStrategy {
    const criteria = analysis.judgingCriteria;
    const topCriteria = [...criteria].sort((a, b) => b.weight - a.weight).slice(0, 3);
    const mustAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'must_use');
    const shouldAPIs = analysis.sponsorAPIs.filter(a => a.strategicValue === 'should_use');

    return {
      projectName: analysis.challenge.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase(),
      oneLiner: analysis.challenge.title + ' - A judge-optimized solution for ' + analysis.challenge.theme,
      whyScoreWell: [
        'Directly targets highest-weighted criteria: ' + topCriteria.map(c => c.name).join(', '),
        'Polished, deployed demo that judges can interact with immediately',
        'Uses recommended technologies for compatibility and sponsor alignment',
      ],
      targetedCriteria: topCriteria.map(c => ({
        name: c.name,
        weight: c.weight,
        approach: 'Build dedicated features and demo elements that showcase ' + c.name,
      })),
      prioritizedAPIs: [...mustAPIs.map(a => a.name), ...shouldAPIs.map(a => a.name)],
      architecture: 'Next.js full-stack with serverless API routes, PostgreSQL, Vercel deployment',
      differentiators: [
        'Fully deployed and accessible live demo',
        'Polished UX with responsive design and animations',
        'Directly addresses each judging criterion explicitly',
      ],
      risks: [
        { risk: 'Scope creep beyond MVP', mitigation: 'Strictly prioritize top-weighted criteria' },
        { risk: 'Deployment failure close to deadline', mitigation: 'Deploy early, iterate continuously' },
      ],
      recommendedStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'PostgreSQL', 'Vercel'],
      estimatedJudgeScore: Math.min(95, Math.round(criteria.reduce((s, c) => s + c.weight * 0.8, 0))),
    };
  }
}

// ── Phase 6: Self-Review Scorer ─────────────────────────────────────────────
// Scores generated projects on 7 dimensions and generates improvement feedback

export interface ReviewScore {
  innovation: number;
  technicalDepth: number;
  feasibility: number;
  presentation: number;
  completeness: number;
  maintainability: number;
  judgeAlignment: number;
  overall: number;
}

export interface ImprovementAction {
  category: string;
  action: string;
  expectedImpact: number;
  effortDays: number;
  priority: 'critical' | 'high' | 'medium' | 'low';
}

export interface ReviewFeedback {
  strengths: string[];
  weaknesses: string[];
  improvementActions: ImprovementAction[];
  score: ReviewScore;
  iteration: number;
  maxIterations: number;
}

export class SelfReviewScorer {
  /**
   * Score a project across 7 dimensions. Each dimension 0-100.
   * Uses deterministic logic (no Math.random) so scores are reproducible.
   */
  score(params: {
    hasUI: boolean;
    hasLiveDeploy: boolean;
    hasWowMoment: boolean;
    buildSuccess: boolean;
    deploySuccess: boolean;
    testPassRate: number;
    crashFree: boolean;
    taskCompleteness: number;
    mockAI?: boolean;
    criteriaCount?: number;
    featureCount?: number;
    errorCount?: number;
  }): ReviewScore {
    // Innovation: wow moment + AI features + novelty
    const innovation = this.dimensionScore([
      40, // base
      params.hasWowMoment ? 25 : 0,
      params.mockAI ? 15 : 0,
      params.hasUI ? 10 : 0,
    ]);

    // Technical Depth: build success + task completeness + complexity
    const technicalDepth = this.dimensionScore([
      30, // base
      params.buildSuccess ? 20 : 0,
      Math.round(params.taskCompleteness * 25),
      params.testPassRate >= 0.8 ? 15 : params.testPassRate >= 0.5 ? 8 : 0,
    ]);

    // Feasibility: deployability + real-world viability
    const feasibility = this.dimensionScore([
      30, // base
      params.buildSuccess ? 20 : 0,
      params.deploySuccess ? 20 : 0,
      params.crashFree ? 15 : 0,
      params.hasLiveDeploy ? 10 : 0,
    ]);

    // Presentation: UI quality + wow moment + deployability
    const presentation = this.dimensionScore([
      25, // base
      params.hasUI ? 25 : 0,
      params.hasWowMoment ? 20 : 0,
      params.hasLiveDeploy ? 15 : 0,
      params.buildSuccess ? 10 : 0,
    ]);

    // Completeness: task completion + feature count + error-free
    const completeness = this.dimensionScore([
      20, // base
      Math.round(params.taskCompleteness * 35),
      params.featureCount && params.featureCount > 5 ? 20 : params.featureCount && params.featureCount > 3 ? 10 : 0,
      params.errorCount === 0 ? 15 : params.errorCount && params.errorCount <= 3 ? 8 : 0,
      params.testPassRate >= 0.7 ? 10 : 0,
    ]);

    // Maintainability: test pass rate + build success + error-free
    const maintainability = this.dimensionScore([
      30, // base
      params.testPassRate >= 0.8 ? 25 : params.testPassRate >= 0.5 ? 15 : 0,
      params.buildSuccess ? 20 : 0,
      params.crashFree ? 15 : 0,
      params.errorCount === 0 ? 10 : 0,
    ]);

    // Judge Alignment: criteria coverage + wow moment + deployability
    const judgeAlignment = this.dimensionScore([
      25, // base
      params.criteriaCount && params.criteriaCount >= 4 ? 25 : params.criteriaCount && params.criteriaCount >= 2 ? 15 : 5,
      params.hasWowMoment ? 15 : 0,
      params.hasLiveDeploy ? 15 : 0,
      params.hasUI ? 10 : 0,
      params.buildSuccess ? 10 : 0,
    ]);

    const overall = Math.min(100, Math.round(
      (innovation + technicalDepth + feasibility + presentation + completeness + maintainability + judgeAlignment) / 7
    ));

    return { innovation, technicalDepth, feasibility, presentation, completeness, maintainability, judgeAlignment, overall };
  }

  /**
   * Generate improvement feedback with prioritized actions.
   * Acts as the improvement feedback loop - detects weaknesses
   * and produces concrete actions to raise each score.
   */
  generateFeedback(params: {
    score: ReviewScore;
    hasUI: boolean;
    hasLiveDeploy: boolean;
    hasWowMoment: boolean;
    buildSuccess: boolean;
    deploySuccess: boolean;
    testPassRate: number;
    crashFree: boolean;
    taskCompleteness: number;
    mockAI?: boolean;
    criteriaCount?: number;
    featureCount?: number;
    errorCount?: number;
  }, iteration = 0, maxIterations = 3): ReviewFeedback {
    const strengths: string[] = [];
    const weaknesses: string[] = [];
    const improvementActions: ImprovementAction[] = [];

    // Derive strengths from high scores
    if (params.score.innovation >= 75) strengths.push('Strong innovation - project feels novel and creative');
    if (params.score.technicalDepth >= 75) strengths.push('Solid technical implementation with good depth');
    if (params.score.presentation >= 75) strengths.push('Polished presentation - judges can understand the project quickly');
    if (params.score.feasibility >= 75) strengths.push('High feasibility - project is practical and deployable');
    if (params.score.completeness >= 75) strengths.push('High completeness - most features are implemented');
    if (params.score.judgeAlignment >= 75) strengths.push('Strong judge alignment - project addresses what judges care about');

    // Detect weaknesses and generate improvements
    if (params.score.innovation < 70) {
      weaknesses.push('Innovation score below 70 - project may not stand out');
      if (!params.hasWowMoment) {
        improvementActions.push({
          category: 'innovation',
          action: 'Add a wow moment: e.g., an interactive demo, AI-powered feature, or live API integration that creates a memorable judge impression',
          expectedImpact: 20,
          effortDays: 0.5,
          priority: 'high',
        });
      }
      if (params.mockAI === false || params.mockAI === undefined) {
        improvementActions.push({
          category: 'innovation',
          action: 'Incorporate an AI/ML element: even a simulated smart recommendation or auto-complete adds perceived intelligence',
          expectedImpact: 12,
          effortDays: 0.25,
          priority: 'medium',
        });
      }
    }

    if (params.score.technicalDepth < 70) {
      weaknesses.push('Technical depth score below 70 - implementation may feel shallow');
      if (!params.buildSuccess) {
        improvementActions.push({
          category: 'technicalDepth',
          action: 'Fix build failures: ensure the project compiles and runs without errors',
          expectedImpact: 25,
          effortDays: 0.5,
          priority: 'critical',
        });
      }
      improvementActions.push({
        category: 'technicalDepth',
        action: 'Add error handling and input validation across API endpoints for production-quality code',
        expectedImpact: 10,
        effortDays: 0.3,
        priority: 'high',
      });
    }

    if (params.score.feasibility < 70) {
      weaknesses.push('Feasibility score below 70 - project may not be practical in real world');
      if (!params.deploySuccess || !params.hasLiveDeploy) {
        improvementActions.push({
          category: 'feasibility',
          action: 'Deploy the project to a live URL: judges must be able to access and interact with the demo',
          expectedImpact: 25,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
      if (!params.crashFree) {
        improvementActions.push({
          category: 'feasibility',
          action: 'Fix runtime crashes: add error boundaries, null checks, and graceful failure handling',
          expectedImpact: 15,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
    }

    if (params.score.presentation < 70) {
      weaknesses.push('Presentation score below 70 - project may not impress at first glance');
      if (!params.hasUI) {
        improvementActions.push({
          category: 'presentation',
          action: 'Add a user interface: even a simple landing page with navigation makes the project feel complete',
          expectedImpact: 25,
          effortDays: 0.5,
          priority: 'high',
        });
      }
      if (!params.hasWowMoment) {
        improvementActions.push({
          category: 'presentation',
          action: 'Create a wow moment: a visually impressive interaction, animation, or data visualization',
          expectedImpact: 18,
          effortDays: 0.4,
          priority: 'high',
        });
      }
    }

    if (params.score.completeness < 70) {
      weaknesses.push('Completeness score below 70 - missing features may disappoint judges');
      improvementActions.push({
        category: 'completeness',
        action: 'Implement core user flows end-to-end: focus on the primary use case first',
        expectedImpact: 15,
        effortDays: 0.5,
        priority: 'high',
      });
      if (params.testPassRate < 0.7) {
        improvementActions.push({
          category: 'completeness',
          action: 'Add automated tests for core functionality to ensure features work reliably',
          expectedImpact: 10,
          effortDays: 0.3,
          priority: 'medium',
        });
      }
    }

    if (params.score.maintainability < 70) {
      weaknesses.push('Maintainability score below 70 - code quality concerns');
      if (params.testPassRate < 0.5) {
        improvementActions.push({
          category: 'maintainability',
          action: 'Add unit tests for critical functions and integration tests for API endpoints',
          expectedImpact: 15,
          effortDays: 0.4,
          priority: 'high',
        });
      }
      improvementActions.push({
        category: 'maintainability',
        action: 'Add inline documentation and README with setup, usage, and deployment instructions',
        expectedImpact: 8,
        effortDays: 0.2,
        priority: 'medium',
      });
    }

    if (params.score.judgeAlignment < 70) {
      weaknesses.push('Judge alignment score below 70 - project may miss what judges value');
      improvementActions.push({
        category: 'judgeAlignment',
        action: 'Review judging criteria and ensure the project explicitly addresses each one in the demo',
        expectedImpact: 20,
        effortDays: 0.3,
        priority: 'high',
      });
      if (!params.hasLiveDeploy) {
        improvementActions.push({
          category: 'judgeAlignment',
          action: 'Deploy to a live URL so judges can access the project without setup',
          expectedImpact: 15,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
    }

    // Sort by priority: critical first, then high, then medium, then low
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    improvementActions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    // If no weaknesses detected, add a generic strength
    if (weaknesses.length === 0) {
      strengths.push('Project scores well across all dimensions');
    }

    // If no improvement actions but weaknesses remain, add generic action
    if (improvementActions.length === 0 && weaknesses.length > 0) {
      improvementActions.push({
        category: 'general',
        action: 'Review project holistically and address the identified weaknesses above',
        expectedImpact: 10,
        effortDays: 0.5,
        priority: 'medium',
      });
    }

    return {
      strengths,
      weaknesses,
      improvementActions,
      score: params.score,
      iteration,
      maxIterations,
    };
  }

  /**
   * Check if the project has converged (all scores >= 70 or no critical improvements).
   */
  hasConverged(score: ReviewScore, feedback: ReviewFeedback): boolean {
    if (score.overall >= 75) return true;
    if (feedback.weaknesses.length === 0) return true;
    if (feedback.improvementActions.every(a => a.priority !== 'critical' && a.priority !== 'high')) return true;
    return false;
  }

  /**
   * Get the next priority improvement action for the feedback loop.
   */
  getNextAction(feedback: ReviewFeedback): ImprovementAction | null {
    return feedback.improvementActions.length > 0 ? feedback.improvementActions[0]! : null;
  }

  /**
   * Run the full improvement feedback loop end-to-end.
   * Scores the project, generates feedback, and iterates until convergence or max iterations.
   * Returns the final feedback with accumulated improvements across all iterations.
   */
  runImprovementLoop(params: {
    hasUI: boolean;
    hasLiveDeploy: boolean;
    hasWowMoment: boolean;
    buildSuccess: boolean;
    deploySuccess: boolean;
    testPassRate: number;
    crashFree: boolean;
    taskCompleteness: number;
    mockAI?: boolean;
    criteriaCount?: number;
    featureCount?: number;
    errorCount?: number;
  }, maxIterations = 3): { finalFeedback: ReviewFeedback; converged: boolean; iterations: number } {
    // Guard: if maxIterations is 0, score once and return immediately
    if (maxIterations <= 0) {
      const score = this.score(params);
      const feedback = this.generateFeedback({ ...params, score }, 0, 0);
      return { finalFeedback: feedback, converged: this.hasConverged(score, feedback), iterations: 0 };
    }

    let iteration = 0;
    let finalFeedback: ReviewFeedback | null = null;

    // Use a mutable copy so the function parameter is not reassigned
    const mutable = { ...params };

    for (; iteration < maxIterations; iteration++) {
      const score = this.score({
        ...mutable,
        // Simulate improvements each iteration based on previous feedback
        // In a real pipeline, the builder would apply the improvement actions here
        // For now, we model the expected improvement from applying the actions
        hasWowMoment: finalFeedback?.improvementActions.some(a => a.category === 'innovation') ? true : mutable.hasWowMoment,
      });

      const feedback = this.generateFeedback(
        { ...mutable, score },
        iteration,
        maxIterations,
      );

      finalFeedback = feedback;

      if (this.hasConverged(score, feedback)) {
        return { finalFeedback: feedback, converged: true, iterations: iteration + 1 };
      }

      // Simulate applying the top improvement action for next iteration
      const next = this.getNextAction(feedback);
      if (!next) {
        return { finalFeedback: feedback, converged: true, iterations: iteration + 1 };
      }

      // In a real pipeline, this is where the builder would apply the fix
      // For simulation, we model minimal improvement
      // Use spread to preserve other fields while updating simulated metrics
      Object.assign(mutable, {
        taskCompleteness: Math.min(1, mutable.taskCompleteness + 0.1),
        testPassRate: Math.min(1, mutable.testPassRate + 0.05),
      });
    }

    return {
      finalFeedback: finalFeedback!,
      converged: false,
      iterations: iteration,
    };
  }

  /**
   * Summarize review findings as markdown.
   */
  summarize(feedback: ReviewFeedback): string {
    const lines: string[] = [];
    lines.push('## Self-Review Results');
    lines.push('');
    lines.push('### Scores');
    lines.push('- Innovation: ' + feedback.score.innovation + '/100');
    lines.push('- Technical Depth: ' + feedback.score.technicalDepth + '/100');
    lines.push('- Feasibility: ' + feedback.score.feasibility + '/100');
    lines.push('- Presentation: ' + feedback.score.presentation + '/100');
    lines.push('- Completeness: ' + feedback.score.completeness + '/100');
    lines.push('- Maintainability: ' + feedback.score.maintainability + '/100');
    lines.push('- Judge Alignment: ' + feedback.score.judgeAlignment + '/100');
    lines.push('- **Overall: ' + feedback.score.overall + '/100**');
    lines.push('');
    if (feedback.strengths.length > 0) {
      lines.push('### Strengths');
      for (const s of feedback.strengths) lines.push('- ' + s);
      lines.push('');
    }
    if (feedback.weaknesses.length > 0) {
      lines.push('### Weaknesses');
      for (const w of feedback.weaknesses) lines.push('- ' + w);
      lines.push('');
    }
    if (feedback.improvementActions.length > 0) {
      lines.push('### Improvement Actions');
      for (const a of feedback.improvementActions) {
        const priorityTag = a.priority === 'critical' ? ' [CRITICAL]' : a.priority === 'high' ? ' [HIGH]' : '';
        lines.push('- [' + a.category + ']' + priorityTag + ' ' + a.action);
        lines.push('  - Expected impact: +' + a.expectedImpact + ' pts, Effort: ' + a.effortDays + ' day(s)');
      }
      lines.push('');
    }
    lines.push('Iteration ' + (feedback.iteration + 1) + '/' + feedback.maxIterations);
    return lines.join('\n');
  }

  /**
   * Compute a dimension score by summing weighted components and clamping to 0-100.
   */
  private dimensionScore(components: number[]): number {
    const total = components.reduce((s, c) => s + c, 0);
    return Math.min(100, Math.max(0, total));
  }
}

// ── Phase 9: Pipeline Report Generator ─────────────────────────────────────

export class PipelineReportGenerator {
  private scorer: SelfReviewScorer;

  constructor(scorer?: SelfReviewScorer) {
    this.scorer = scorer ?? new SelfReviewScorer();
  }

  generate(params: {
    analysis: CompetitionAnalysis | null;
    strategy: WinningStrategy | null;
    features: string[];
    errors: string[];
    deployUrl: string | null;
    durationMs: number;
    reviewFeedback?: ReviewFeedback | null;
    qualityChecks?: QualityCheck[] | null;
  }): FinalReport {
    const features = params.features.length > 0 ? params.features : ['Project scaffold', 'Core features', 'Deployment'];
    const knownWeaknesses = params.errors.length > 0
      ? params.errors.slice(0, 5)
      : ['No known weaknesses - project completed successfully'];

    // Use the reviewer feedback if provided, otherwise compute a default
    const review = params.reviewFeedback?.score ?? this.scorer.score({
      hasUI: true,
      hasLiveDeploy: !!params.deployUrl,
      hasWowMoment: true,
      buildSuccess: params.errors.length === 0,
      deploySuccess: !!params.deployUrl,
      testPassRate: params.errors.length === 0 ? 0.8 : 0.4,
      crashFree: params.errors.length === 0,
      taskCompleteness: features.length > 5 ? 0.9 : 0.6,
      featureCount: features.length,
      errorCount: params.errors.length,
    });

    return {
      challengeSummary: params.analysis
        ? params.analysis.challenge.title + ' - ' + params.analysis.challenge.theme
        : 'Hackathon project',
      chosenStrategy: params.strategy ?? {
        projectName: 'project',
        oneLiner: 'Hackathon project',
        whyScoreWell: ['Completed project'],
        targetedCriteria: [],
        prioritizedAPIs: [],
        architecture: 'Standard web stack',
        differentiators: ['Working product'],
        risks: [],
        recommendedStack: ['React', 'Node.js'],
        estimatedJudgeScore: 0, // Not computed — requires real evaluation
      },
      techStack: params.strategy?.recommendedStack ?? ['React', 'Node.js', 'PostgreSQL'],
      generatedFeatures: features,
      knownWeaknesses,
      futureImprovements: params.reviewFeedback?.improvementActions.map(a => a.action) ?? [
        'Add automated browser testing for reliability',
        'Improve error handling and edge cases',
        'Add CI/CD pipeline for faster iteration',
        'Enhance documentation with API reference',
      ],
      judgeScorePrediction: params.strategy?.estimatedJudgeScore ?? 0, // 0 = not computed
      innovationScore: review.innovation,
      technicalDepthScore: review.technicalDepth,
      feasibilityScore: review.feasibility,
      presentationScore: review.presentation,
      completenessScore: review.completeness,
      maintainabilityScore: review.maintainability,
      judgeAlignmentScore: review.judgeAlignment,
      qualityChecks: params.qualityChecks ?? [],
    };
  }

  formatReport(report: FinalReport): string {
    return [
      '# Pipeline Report',
      '',
      '## Challenge',
      report.challengeSummary,
      '',
      '## Strategy',
      'Project: ' + report.chosenStrategy.oneLiner,
      'Architecture: ' + report.chosenStrategy.architecture,
      '',
      '### Why It Scores Well',
      ...report.chosenStrategy.whyScoreWell.map(s => '- ' + s),
      '',
      '## Tech Stack',
      report.techStack.join(', '),
      '',
      '## Features',
      ...report.generatedFeatures.map(f => '- ' + f),
      '',
      '## Weaknesses',
      ...report.knownWeaknesses.map(w => '- ' + w),
      '',
      '## Improvements',
      ...report.futureImprovements.map(i => '- ' + i),
      '',
      '## Scores',
      '- Predicted Judge Score: ' + report.judgeScorePrediction + '/100',
      '- Innovation: ' + report.innovationScore + '/100',
      '- Technical Depth: ' + report.technicalDepthScore + '/100',
      '- Feasibility: ' + report.feasibilityScore + '/100',
      '- Presentation: ' + report.presentationScore + '/100',
      '- Completeness: ' + report.completenessScore + '/100',
      '- Maintainability: ' + report.maintainabilityScore + '/100',
      '- Judge Alignment: ' + report.judgeAlignmentScore + '/100',
      '',
      '## Quality Checklist',
      ...report.qualityChecks.map(c =>
        `- ${c.passed ? '✅' : '❌'} ${c.check} (${c.severity}): ${c.message}`
      ),
    ].join('\n');
  }
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

// ── Phase 3: Hackathon Pipeline Orchestrator ────────────────────────────────
// Chains CompetitionIntelligence → WinningStrategyGenerator → InternetHackathonOrchestrator
// → SelfReviewScorer → PipelineReportGenerator with filtered info flow

export interface PipelineStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
  error: string | null;
  result: unknown | null;
}

export interface PipelineContext {
  analysis: CompetitionAnalysis | null;
  strategy: WinningStrategy | null;
  executionResult: {
    features: string[];
    errors: string[];
    deployUrl: string | null;
    taskCount: number;
    buildSuccess: boolean;
    testPassRate: number;
    criteriaCount: number;
    featureCount: number;
    errorCount: number;
    durationMs: number;
  } | null;
  reviewFeedback: ReviewFeedback | null;
  feedbackConverged: boolean;
  feedbackIterations: number;
  qualityChecks: QualityCheck[] | null;
  report: FinalReport | null;
  stages: Record<string, PipelineStage>;
  seed: number;
  startedAt: number;
}

export class HackathonPipelineOrchestrator {
  private intelligence: CompetitionIntelligence;
  private strategyGen: WinningStrategyGenerator;
  private scorer: SelfReviewScorer;
  private reporter: PipelineReportGenerator;
  private context: PipelineContext;

  constructor(seed = 42) {
    this.intelligence = new CompetitionIntelligence();
    this.strategyGen = new WinningStrategyGenerator();
    this.scorer = new SelfReviewScorer();
    this.reporter = new PipelineReportGenerator(this.scorer);
    this.context = this.createContext(seed);
  }

  private createContext(seed: number): PipelineContext {
    return {
      analysis: null,
      strategy: null,
      executionResult: null,
      reviewFeedback: null,
      feedbackConverged: false,
      feedbackIterations: 0,
      qualityChecks: null,
      report: null,
      stages: {},
      seed,
      startedAt: Date.now(),
    };
  }

  getContext(): PipelineContext {
    return this.context;
  }

  private recordStage(name: string, status: PipelineStage['status'], error: string | null = null, result: unknown = null): void {
    const existing = this.context.stages[name];
    this.context.stages[name] = {
      name,
      status,
      startedAt: existing?.startedAt ?? Date.now(),
      completedAt: status === 'completed' || status === 'failed' ? Date.now() : null,
      durationMs: status === 'completed' || status === 'failed' ? Date.now() - (existing?.startedAt ?? Date.now()) : null,
      error,
      result,
    };
  }

  /**
   * Initialize the orchestrator with pre-computed analysis and strategy.
   * This avoids duplicating work that was already done externally.
   */
  init(analysis: CompetitionAnalysis, strategy: WinningStrategy): void {
    this.recordStage('competition-intelligence', 'completed', null, {
      challenge: analysis.challenge.title,
      criteriaCount: analysis.judgingCriteria.length,
      sponsorCount: analysis.sponsorAPIs.length,
    });
    this.recordStage('winning-strategy', 'completed', null, {
      projectName: strategy.projectName,
      estimatedScore: strategy.estimatedJudgeScore,
      apiCount: strategy.prioritizedAPIs.length,
      differentiators: strategy.differentiators.length,
    });
    this.context.analysis = analysis;
    this.context.strategy = strategy;
  }

  /**
   * Stage 1 & 2: Compute analysis and strategy from raw input.
   */
  runIntelligencePhase(devpostResult: Parameters<CompetitionIntelligence['analyze']>[0]): { analysis: CompetitionAnalysis; strategy: WinningStrategy } {
    const analysis = this.intelligence.analyze(devpostResult);
    this.context.analysis = analysis;
    this.recordStage('competition-intelligence', 'completed', null, {
      challenge: analysis.challenge.title,
      criteriaCount: analysis.judgingCriteria.length,
      sponsorCount: analysis.sponsorAPIs.length,
    });

    const strategy = this.strategyGen.generate(analysis);
    this.context.strategy = strategy;
    this.recordStage('winning-strategy', 'completed', null, {
      projectName: strategy.projectName,
      estimatedScore: strategy.estimatedJudgeScore,
      apiCount: strategy.prioritizedAPIs.length,
      differentiators: strategy.differentiators.length,
    });

    return { analysis, strategy };
  }

  /**
   * Stage 3: Record Execution Results — ingest execution output for self-review
   */
  recordExecution(params: {
    features: string[];
    errors: string[];
    deployUrl: string | null;
    taskCount: number;
    buildSuccess: boolean;
    testPassRate: number;
    durationMs: number;
  }): void {
    this.recordStage('execution', 'completed', null, {
      featureCount: params.features.length,
      errorCount: params.errors.length,
      hasDeploy: !!params.deployUrl,
    });
    this.context.executionResult = {
      ...params,
      criteriaCount: this.context.analysis?.judgingCriteria.length ?? 4,
      featureCount: params.features.length,
      errorCount: params.errors.length,
    };
  }

  /**
   * Stage 4: Self-Review — score + improvement feedback loop
   */
  review(): ReviewFeedback {
    this.recordStage('self-review', 'running');
    try {
      const exec = this.context.executionResult;
      if (!exec) {
        throw new Error('Cannot review: no execution results recorded');
      }

      const { finalFeedback, converged, iterations } = this.scorer.runImprovementLoop({
        hasUI: exec.features.some(f => /ui|page|component|app|frontend/i.test(f)),
        hasLiveDeploy: !!exec.deployUrl,
        hasWowMoment: exec.features.some(f => /wow|ai|smart|interactive|realtime|animation/i.test(f)),
        buildSuccess: exec.buildSuccess,
        deploySuccess: !!exec.deployUrl,
        testPassRate: exec.testPassRate,
        crashFree: exec.errorCount === 0,
        taskCompleteness: exec.taskCount > 0 ? Math.min(1, exec.featureCount / exec.taskCount) : 0.5,
        featureCount: exec.featureCount,
        errorCount: exec.errorCount,
        criteriaCount: exec.criteriaCount,
      }, 3);

      this.context.reviewFeedback = finalFeedback;
      this.context.feedbackConverged = converged;
      this.context.feedbackIterations = iterations;
      this.recordStage('self-review', 'completed', null, {
        overallScore: finalFeedback.score.overall,
        weaknesses: finalFeedback.weaknesses.length,
        improvements: finalFeedback.improvementActions.length,
        converged,
        iterations,
});
      return finalFeedback;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('self-review', 'failed', msg);
      throw new Error(`Self-review failed: ${msg}`);
    }
  }

  /**
   * Stage 5: Optimization — run optimizer pass on the review feedback
   */
  optimize(): ImprovementAction[] {
      this.recordStage('optimization', 'running');
      try {
        if (!this.context.reviewFeedback) {
          this.review();
        }
        const optimizer = new HackathonOptimizer();
        const optimizations = optimizer.optimize(
          this.context.reviewFeedback!,
          this.context.analysis ?? undefined,
        );
        this.recordStage('optimization', 'completed', null, {
          optimizations: optimizations.length,
          criticalCount: optimizations.filter(a => a.priority === 'critical').length,
        });
        return optimizations;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordStage('optimization', 'failed', msg);
        throw err;
      }
    }

    /**
     * Stage 6: Project Quality — scaffolder checks and enhancements
     */
    scaffoldQuality(): QualityCheck[] {
      this.recordStage('project-quality', 'running');
      try {
        const scaffolder = new ProjectScaffolder();
        const checks = scaffolder.check({
          analysis: this.context.analysis ?? undefined,
          strategy: this.context.strategy ?? undefined,
          features: this.context.executionResult?.features ?? ['Project scaffold'],
          errors: this.context.executionResult?.errors ?? [],
        });
        this.context.qualityChecks = checks;
        this.recordStage('project-quality', 'completed', null, {
          checks: checks.length,
          passed: checks.filter(c => c.passed).length,
          failed: checks.filter(c => !c.passed).length,
        });
        return checks;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.recordStage('project-quality', 'failed', msg);
        throw err;
      }
    }

  /**
   * Stage 7: Generate missing scaffolding files into the project directory.
   * Generates README.md, LICENSE, .gitignore, .env.example, Dockerfile, CI/CD
   * for any items that failed the quality check and don't exist on disk.
   */
  generateScaffolding(projectDir: string): GeneratedFile[] {
    this.recordStage('scaffold-generation', 'running');
    try {
      if (!this.context.qualityChecks) {
        this.scaffoldQuality();
      }
      const scaffolder = new ProjectScaffolder();
      const exec = this.context.executionResult ?? {
        features: ['Project scaffold', 'Core features', 'Deployment'],
        errors: [], deployUrl: null, taskCount: 0, buildSuccess: true, testPassRate: 0.8, criteriaCount: 4, featureCount: 3, errorCount: 0, durationMs: 0,
      };
      const generated = scaffolder.generate({
        projectDir,
        checks: this.context.qualityChecks ?? [],
        features: exec.features,
        techStack: this.context.strategy?.recommendedStack ?? ['React', 'Node.js'],
        projectName: this.context.strategy?.projectName ?? 'project',
        description: this.context.analysis?.challenge.title ?? undefined,
        deployUrl: exec.deployUrl,
        sponsorAPIs: this.context.analysis?.sponsorAPIs.map(a => a.name),
      });
      this.recordStage('scaffold-generation', 'completed', null, {
        generatedCount: generated.length,
        files: generated.map(g => g.file),
      });
      if (generated.length > 0) {
        this.scaffoldQuality();
      }
      return generated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('scaffold-generation', 'failed', msg);
      return [];
    }
  }

  /**
   * Stage 8: Run pipeline benchmarks — compare current run metrics
   * against the previous run's baseline to track improvement over time.
   */
  benchmark(dataDir: string): BenchmarkComparison[] {
    this.recordStage('benchmark', 'running');
    try {
      const exec = this.context.executionResult ?? {
        features: ['Project scaffold', 'Core features', 'Deployment'],
        errors: [], deployUrl: null, taskCount: 0, buildSuccess: true, testPassRate: 0.8, criteriaCount: 4, featureCount: 3, errorCount: 0, durationMs: 0,
      };
      const report = this.context.report;
      const analysis = this.context.analysis;

      const newMetrics: Record<string, unknown> = {
        promptSizeChars: exec.features.reduce((s, f) => s + f.length, 0) * 5,
        generationTimeMs: exec.durationMs,
        errorCount: exec.errorCount,
        judgeScore: report?.judgeScorePrediction ?? 0,
        criteriaAnalyzed: analysis?.judgingCriteria.length ?? exec.criteriaCount,
        improvementActions: report?.futureImprovements.length ?? 0,
      };

      const benchmarksDir = path.join(dataDir, 'benchmarks');
      if (!existsSync(benchmarksDir)) mkdirSync(benchmarksDir, { recursive: true });
      const benchFile = path.join(benchmarksDir, 'pipeline.json');

      let oldMetrics: Record<string, unknown> | null = null;
      if (existsSync(benchFile)) {
        oldMetrics = JSON.parse(readFileSync(benchFile, 'utf-8'));
      }

      const benchmarker = new PipelineBenchmarker();
      const comparisons = oldMetrics
        ? benchmarker.compare(oldMetrics, newMetrics)
        : [];

      writeFileSync(benchFile, JSON.stringify(newMetrics, null, 2), 'utf-8');

      this.recordStage('benchmark', 'completed', null, {
        isBaseline: !oldMetrics,
        comparisonsCount: comparisons.length,
      });
      return comparisons;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('benchmark', 'failed', msg);
      return [];
    }
  }

  /**
   * Stage 9: Generate Final Report
   */
  report(): FinalReport {
    this.recordStage('report', 'running');
    try {
      const exec = this.context.executionResult ?? {
        features: ['Project scaffold', 'Core features', 'Deployment'],
        errors: [],
        deployUrl: null,
        taskCount: 0,
        buildSuccess: true,
        testPassRate: 0.8,
        criteriaCount: 4,
        featureCount: 3,
        errorCount: 0,
        durationMs: 0,
      };

      const report = this.reporter.generate({
        analysis: this.context.analysis,
        strategy: this.context.strategy,
        features: exec.features,
        errors: exec.errors,
        deployUrl: exec.deployUrl,
        durationMs: exec.durationMs,
        reviewFeedback: this.context.reviewFeedback,
        qualityChecks: this.context.qualityChecks,
      });
      this.context.report = report;
      this.recordStage('report', 'completed', null, {
        challengeSummary: report.challengeSummary,
        judgeScore: report.judgeScorePrediction,
        featuresCount: report.generatedFeatures.length,
        weaknessesCount: report.knownWeaknesses.length,
      });
      return report;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.recordStage('report', 'failed', msg);
      throw err;
    }
  }

  /**
   * Run the full pipeline end-to-end.
   */
  runFullPipeline(input: Parameters<CompetitionIntelligence['analyze']>[0]): PipelineContext {
    this.context = this.createContext(this.context.seed);
    this.runIntelligencePhase(input);
    return this.context;
  }

  /**
   * Complete the pipeline after execution results are available.
   */
  completePipeline(params: Parameters<HackathonPipelineOrchestrator['recordExecution']>[0]): FinalReport {
    this.recordExecution(params);
    this.review();
    this.optimize();
    this.scaffoldQuality();
    return this.report();
  }

  /**
   * Generate a markdown summary of the pipeline run.
   */
  summarizePipeline(): string {
    const ctx = this.context;
    const lines: string[] = [];
    lines.push('# Hackathon Pipeline Report');
    lines.push('');
    lines.push('## Pipeline Stages');
    lines.push('');
    lines.push('| Stage | Status | Duration | Details |');
    lines.push('|-------|--------|----------|---------|');
    for (const [name, stage] of Object.entries(ctx.stages)) {
      const icon = stage.status === 'completed' ? '✅' : stage.status === 'failed' ? '❌' : stage.status === 'running' ? '⏳' : '⏸️';
      const dur = stage.durationMs !== null ? `${(stage.durationMs / 1000).toFixed(1)}s` : '-';
      const details = stage.result ? JSON.stringify(stage.result).slice(0, 80) : stage.error ?? '-';
      lines.push(`| ${icon} ${name} | ${stage.status} | ${dur} | ${details} |`);
    }
    lines.push('');
    if (ctx.reviewFeedback) {
      lines.push('## Review Scores');
      lines.push('');
      lines.push('| Dimension | Score |');
      lines.push('|-----------|-------|');
      lines.push(`| Innovation | ${ctx.reviewFeedback.score.innovation}/100 |`);
      lines.push(`| Technical Depth | ${ctx.reviewFeedback.score.technicalDepth}/100 |`);
      lines.push(`| Feasibility | ${ctx.reviewFeedback.score.feasibility}/100 |`);
      lines.push(`| Presentation | ${ctx.reviewFeedback.score.presentation}/100 |`);
      lines.push(`| Completeness | ${ctx.reviewFeedback.score.completeness}/100 |`);
      lines.push(`| Maintainability | ${ctx.reviewFeedback.score.maintainability}/100 |`);
      lines.push(`| Judge Alignment | ${ctx.reviewFeedback.score.judgeAlignment}/100 |`);
      lines.push(`| **Overall** | **${ctx.reviewFeedback.score.overall}/100** |`);
      lines.push('');
      lines.push(`Converged: ${ctx.feedbackConverged ? 'Yes' : 'No'} | Iterations: ${ctx.feedbackIterations}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}

// ── Phase 5: Project Quality Scaffolder ─────────────────────────────────────
// Checks generated projects for quality scaffolding elements

export interface QualityCheck {
  check: string;
  passed: boolean;
  message: string;
  severity: 'required' | 'recommended' | 'optional';
}

export interface GeneratedFile {
  file: string;
  path: string;
}

export class ProjectScaffolder {
  /**
   * Check a generated project for quality scaffolding.
   * Identifies missing elements that should be present.
   */
  check(params: {
    analysis?: CompetitionAnalysis;
    strategy?: WinningStrategy;
    features: string[];
    errors: string[];
  }): QualityCheck[] {
    const checks: QualityCheck[] = [];
    const features = params.features.map(f => f.toLowerCase());
    const allText = [...features, ...params.errors.map(e => e.toLowerCase())].join(' ');

    // README check
    checks.push({
      check: 'README.md',
      passed: features.some(f => f.includes('readme') || f.includes('documentation')),
      message: features.some(f => f.includes('readme'))
        ? 'README present'
        : 'README missing — judges expect documentation',
      severity: 'required',
    });

    // License check
    checks.push({
      check: 'LICENSE',
      passed: features.some(f => f.includes('license')),
      message: features.some(f => f.includes('license'))
        ? 'License present'
        : 'LICENSE missing — required for open source',
      severity: 'recommended',
    });

    // .gitignore check
    checks.push({
      check: '.gitignore',
      passed: features.some(f => f.includes('gitignore') || f.includes('.gitignore')),
      message: features.some(f => f.includes('gitignore'))
        ? '.gitignore present'
        : '.gitignore missing — repository hygiene',
      severity: 'required',
    });

    // .env.example check
    checks.push({
      check: '.env.example',
      passed: features.some(f => f.includes('.env')),
      message: features.some(f => f.includes('.env'))
        ? 'Environment config present'
        : '.env.example missing — deployment setup',
      severity: 'recommended',
    });

    // Docker support
    checks.push({
      check: 'Dockerfile',
      passed: features.some(f => f.includes('docker') || f.includes('container')),
      message: features.some(f => f.includes('docker'))
        ? 'Docker support present'
        : 'Dockerfile missing — portable deployment',
      severity: 'optional',
    });

    // CI/CD workflow
    checks.push({
      check: 'CI/CD',
      passed: features.some(f => f.includes('ci') || f.includes('workflow') || f.includes('github actions')),
      message: features.some(f => f.includes('ci'))
        ? 'CI/CD workflow present'
        : 'CI/CD workflow missing — automated testing',
      severity: 'optional',
    });

    // Tests
    checks.push({
      check: 'Tests',
      passed: features.some(f => f.includes('test') || f.includes('spec') || f.includes('vitest') || f.includes('jest')),
      message: features.some(f => f.includes('test'))
        ? 'Tests present'
        : 'Tests missing — build confidence',
      severity: 'recommended',
    });

    // Deployment configuration
    checks.push({
      check: 'Deployment Config',
      passed: features.some(f => f.includes('deploy') || f.includes('vercel') || f.includes('netlify')),
      message: features.some(f => f.includes('deploy'))
        ? 'Deployment configured'
        : 'Deployment not configured',
      severity: 'recommended',
    });

    // Responsive UI
    checks.push({
      check: 'Responsive UI',
      passed: features.some(f => f.includes('responsive') || f.includes('mobile') || f.includes('tailwind')),
      message: features.some(f => f.includes('responsive'))
        ? 'Responsive design detected'
        : 'Responsive design not confirmed',
      severity: 'recommended',
    });

    return checks;
  }

  /**
   * Generate missing scaffolding files for a project.
   * Only generates files that don't already exist.
   */
  generate(params: {
    projectDir: string;
    checks: QualityCheck[];
    features: string[];
    techStack: string[];
    projectName: string;
    description?: string;
    deployUrl?: string | null;
    sponsorAPIs?: string[];
  }): GeneratedFile[] {
    const generated: GeneratedFile[] = [];
    const dir = params.projectDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const failedChecks = params.checks.filter(c => !c.passed);
    const checkNames = failedChecks.map(c => c.check);

    const stackLower = params.techStack.map(s => s.toLowerCase());

    // README.md
    if (checkNames.includes('README.md') && !existsSync(path.join(dir, 'README.md'))) {
      const readmeLines: string[] = [];
      readmeLines.push(`# ${params.projectName}`);
      readmeLines.push('');
      readmeLines.push(params.description ?? 'A hackathon project.');
      readmeLines.push('');
      readmeLines.push('## Tech Stack');
      readmeLines.push('');
      for (const t of params.techStack) readmeLines.push(`- ${t}`);
      readmeLines.push('');
      readmeLines.push('## Features');
      readmeLines.push('');
      for (const f of params.features) readmeLines.push(`- ${f}`);
      readmeLines.push('');
      if (params.sponsorAPIs && params.sponsorAPIs.length > 0) {
        readmeLines.push('## Sponsor APIs Used');
        readmeLines.push('');
        for (const api of params.sponsorAPIs) readmeLines.push(`- ${api}`);
        readmeLines.push('');
      }
      readmeLines.push('## Getting Started');
      readmeLines.push('');
      readmeLines.push('```bash');
      readmeLines.push('npm install');
      readmeLines.push('npm run dev');
      readmeLines.push('```');
      readmeLines.push('');
      if (params.deployUrl) {
        readmeLines.push(`## Live Demo`);
        readmeLines.push('');
        readmeLines.push(`[${params.deployUrl}](${params.deployUrl})`);
        readmeLines.push('');
      }
      writeFileSync(path.join(dir, 'README.md'), readmeLines.join('\n'), 'utf-8');
      generated.push({ file: 'README.md', path: path.join(dir, 'README.md') });
    }

    // LICENSE (MIT)
    if (checkNames.includes('LICENSE') && !existsSync(path.join(dir, 'LICENSE'))) {
      const year = new Date().getFullYear();
      const license = `MIT License

Copyright (c) ${year} ${params.projectName}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
      writeFileSync(path.join(dir, 'LICENSE'), license, 'utf-8');
      generated.push({ file: 'LICENSE', path: path.join(dir, 'LICENSE') });
    }

    // .gitignore
    if (checkNames.includes('.gitignore') && !existsSync(path.join(dir, '.gitignore'))) {
      const isNode = stackLower.some(s => s.includes('node') || s.includes('javascript') || s.includes('typescript'));
      const gitignoreLines: string[] = [];
      gitignoreLines.push('# Dependencies');
      gitignoreLines.push(isNode ? 'node_modules/' : '');
      gitignoreLines.push('# Build output');
      gitignoreLines.push('dist/');
      gitignoreLines.push('build/');
      gitignoreLines.push('.next/');
      gitignoreLines.push('out/');
      gitignoreLines.push('');
      gitignoreLines.push('# Environment');
      gitignoreLines.push('.env');
      gitignoreLines.push('.env.local');
      gitignoreLines.push('.env.*.local');
      gitignoreLines.push('');
      gitignoreLines.push('# IDE');
      gitignoreLines.push('.vscode/');
      gitignoreLines.push('.idea/');
      gitignoreLines.push('*.swp');
      gitignoreLines.push('*.swo');
      gitignoreLines.push('');
      gitignoreLines.push('# OS');
      gitignoreLines.push('.DS_Store');
      gitignoreLines.push('Thumbs.db');
      gitignoreLines.push('');
      gitignoreLines.push('# Logs');
      gitignoreLines.push('*.log');
      gitignoreLines.push('npm-debug.log*');
      const content = gitignoreLines.filter(l => l !== '' || l === '').join('\n');
      writeFileSync(path.join(dir, '.gitignore'), content, 'utf-8');
      generated.push({ file: '.gitignore', path: path.join(dir, '.gitignore') });
    }

    // .env.example
    if (checkNames.includes('.env.example') && !existsSync(path.join(dir, '.env.example'))) {
      const envLines: string[] = [];
      envLines.push('# Environment Configuration');
      envLines.push('# Copy this file to .env and fill in your values');
      envLines.push('');
      if (stackLower.some(s => s.includes('node') || s.includes('express'))) {
        envLines.push('PORT=3000');
        envLines.push('NODE_ENV=development');
      }
      if (stackLower.some(s => s.includes('postgres') || s.includes('prisma') || s.includes('database'))) {
        envLines.push('DATABASE_URL=postgresql://localhost:5432/mydb');
      }
      if (stackLower.some(s => s.includes('redis'))) {
        envLines.push('REDIS_URL=redis://localhost:6379');
      }
      if (stackLower.some(s => s.includes('openai') || s.includes('ai'))) {
        envLines.push('OPENAI_API_KEY=sk-your-key-here');
      }
      envLines.push('');
      envLines.push('# Add other environment variables here');
      writeFileSync(path.join(dir, '.env.example'), envLines.join('\n'), 'utf-8');
      generated.push({ file: '.env.example', path: path.join(dir, '.env.example') });
    }

    // Dockerfile
    if (checkNames.includes('Dockerfile') && !existsSync(path.join(dir, 'Dockerfile'))) {
      const dockerLines: string[] = [];
      dockerLines.push('FROM node:20-alpine AS builder');
      dockerLines.push('WORKDIR /app');
      dockerLines.push('COPY package*.json ./');
      dockerLines.push('RUN npm ci');
      dockerLines.push('COPY . .');
      dockerLines.push('RUN npm run build');
      dockerLines.push('');
      dockerLines.push('FROM node:20-alpine AS runner');
      dockerLines.push('WORKDIR /app');
      dockerLines.push('COPY --from=builder /app/dist ./dist');
      dockerLines.push('COPY --from=builder /app/node_modules ./node_modules');
      dockerLines.push('COPY --from=builder /app/package.json ./');
      dockerLines.push('');
      dockerLines.push('EXPOSE 3000');
      dockerLines.push('CMD ["node", "dist/index.js"]');
      writeFileSync(path.join(dir, 'Dockerfile'), dockerLines.join('\n'), 'utf-8');
      generated.push({ file: 'Dockerfile', path: path.join(dir, 'Dockerfile') });
    }

    // CI/CD — GitHub Actions workflow
    if (checkNames.includes('CI/CD') && !existsSync(path.join(dir, '.github/workflows/ci.yml'))) {
      const workflowsDir = path.join(dir, '.github', 'workflows');
      if (!existsSync(workflowsDir)) mkdirSync(workflowsDir, { recursive: true });
      const ciLines: string[] = [];
      ciLines.push('name: CI');
      ciLines.push('on:');
      ciLines.push('  push:');
      ciLines.push('    branches: [main]');
      ciLines.push('  pull_request:');
      ciLines.push('    branches: [main]');
      ciLines.push('jobs:');
      ciLines.push('  build:');
      ciLines.push('    runs-on: ubuntu-latest');
      ciLines.push('    steps:');
      ciLines.push('      - uses: actions/checkout@v4');
      ciLines.push('      - uses: actions/setup-node@v4');
      ciLines.push('        with:');
      ciLines.push('          node-version: 20');
      ciLines.push('          cache: npm');
      ciLines.push('      - run: npm ci');
      ciLines.push('      - run: npm run build --if-present');
      ciLines.push('      - run: npm run lint --if-present');
      ciLines.push('      - run: npm test --if-present');
      writeFileSync(path.join(workflowsDir, 'ci.yml'), ciLines.join('\n'), 'utf-8');
      generated.push({ file: '.github/workflows/ci.yml', path: path.join(workflowsDir, 'ci.yml') });
    }

    return generated;
  }

  /**
   * Generate markdown report of quality checks.
   */
  formatChecks(checks: QualityCheck[]): string {
    const lines: string[] = [];
    lines.push('## Project Quality Checklist');
    lines.push('');
    lines.push('| Check | Status | Severity | Note |');
    lines.push('|-------|--------|----------|------|');
    const severityOrder = { required: 0, recommended: 1, optional: 2 };
    const sorted = [...checks].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    for (const c of sorted) {
      const icon = c.passed ? '✅' : '❌';
      const sev = c.severity === 'required' ? '🔴' : c.severity === 'recommended' ? '🟡' : '🟢';
      lines.push(`| ${icon} ${c.check} | ${c.passed ? 'Pass' : 'Fail'} | ${sev} ${c.severity} | ${c.message} |`);
    }
    lines.push('');
    const required = checks.filter(c => c.severity === 'required');
    const failedRequired = required.filter(c => !c.passed);
    if (failedRequired.length > 0) {
      lines.push(`⚠️ ${failedRequired.length} required check(s) failing`);
    }
    lines.push('');
    return lines.join('\n');
  }
}

// ── Phase 7: Hackathon Optimizer ────────────────────────────────────────────
// Dedicated optimization stage that asks "If I were judging, how could it score higher?"

export class HackathonOptimizer {
  /**
   * Analyze review feedback and competition context to produce targeted
   * optimizations aimed at maximizing judge scores.
   */
  optimize(feedback: ReviewFeedback, analysis?: CompetitionAnalysis): ImprovementAction[] {
    const optimizations: ImprovementAction[] = [];

    // Strategy: optimize for judge presentation
    optimizations.push({
      category: 'judgeAlignment',
      action: 'Create a 2-minute demo script that walks through each judging criterion explicitly, showing how the project addresses it',
      expectedImpact: 20,
      effortDays: 0.25,
      priority: 'high',
    });

    // Strategy: wow moment amplification
    if (feedback.score.innovation < 80) {
      optimizations.push({
        category: 'innovation',
        action: 'Add a self-contained interactive demo that works without setup — use a hosted playground, embedded video, or live preview link',
        expectedImpact: 18,
        effortDays: 0.5,
        priority: 'high',
      });
    }

    // Strategy: sponsor API showcase
    if (analysis?.sponsorAPIs && analysis.sponsorAPIs.length > 0) {
      const mustUse = analysis.sponsorAPIs.filter(a => a.strategicValue === 'must_use');
      if (mustUse.length > 0) {
        optimizations.push({
          category: 'sponsorAlignment',
          action: `Highlight sponsor API usage: add visible indicators in the UI showing ${mustUse.map(a => a.name).join(', ')} integration — judges look for sponsor usage`,
          expectedImpact: 15,
          effortDays: 0.3,
          priority: 'critical',
        });
      }
    }

    // Strategy: deployment polish
    if (feedback.score.feasibility < 75) {
      optimizations.push({
        category: 'feasibility',
        action: 'Ensure zero-config deployment: add a Deploy to Vercel/Netlify button that works on first click — judges will try to access the demo immediately',
        expectedImpact: 25,
        effortDays: 0.3,
        priority: 'critical',
      });
    }

    // Strategy: UX polish
    if (feedback.score.presentation < 75) {
      optimizations.push({
        category: 'presentation',
        action: 'Add onboarding experience: a hero section explaining what the project does in under 5 seconds, with clear call-to-action',
        expectedImpact: 15,
        effortDays: 0.25,
        priority: 'high',
      });
    }

    // Strategy: criteria targeting
    if (analysis?.judgingCriteria && analysis.judgingCriteria.length > 0) {
      const topCrit = [...analysis.judgingCriteria].sort((a, b) => b.weight - a.weight)[0]!;
      optimizations.push({
        category: 'judgeAlignment',
        action: `Directly target the highest-weighted criterion (${topCrit.name}: ${topCrit.weight}%) — ensure the demo leads with this strength`,
        expectedImpact: 20,
        effortDays: 0.25,
        priority: 'high',
      });
    }

    // Strategy: completeness drive
    const missingFeatures = feedback.weaknesses.filter(w => w.toLowerCase().includes('complete') || w.toLowerCase().includes('missing'));
    if (missingFeatures.length > 0) {
      optimizations.push({
        category: 'completeness',
        action: 'Prioritize must-have features over nice-to-haves: complete the core user flow end-to-end before adding extras',
        expectedImpact: 18,
        effortDays: 0.5,
        priority: 'high',
      });
    }

    // Strategy: presentation-ready README
    optimizations.push({
      category: 'presentation',
      action: 'Generate a judges-ready README with project description, demo link, tech stack, sponsor API usage, and judging criteria alignment table',
      expectedImpact: 12,
      effortDays: 0.2,
      priority: 'medium',
    });

    // Sort by priority
    const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
    optimizations.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

    return optimizations;
  }

  /**
   * Format optimizations as markdown.
   */
  formatOptimizations(optimizations: ImprovementAction[]): string {
    const lines: string[] = [];
    lines.push('## Hackathon Optimizations');
    lines.push('');
    lines.push('Actions to maximize judge score:');
    lines.push('');
    for (const opt of optimizations) {
      const priorityTag = opt.priority === 'critical' ? '🔴 [CRITICAL]' : opt.priority === 'high' ? '🟡 [HIGH]' : '🟢 [MEDIUM]';
      lines.push(`- **${priorityTag}** ${opt.action}`);
      lines.push(`  - Impact: +${opt.expectedImpact} pts, Effort: ${opt.effortDays} day(s)`);
    }
    lines.push('');
    return lines.join('\n');
  }
}

// ── Phase 8: Pipeline Benchmarks ────────────────────────────────────────────
// Compares old pipeline vs improved pipeline performance

export interface BenchmarkComparison {
  metric: string;
  oldValue: number | string;
  newValue: number | string;
  improvement: string;
  unit: string;
}

export interface PipelineBenchmarkResult {
  benchmarkName: string;
  category: string;
  oldPipeline: {
    promptSizeChars: number;
    generationTimeMs: number;
    errorCount: number;
    judgeScore: number | null;
    criteriaAnalyzed: number;
    improvementActions: number;
  };
  newPipeline: {
    promptSizeChars: number;
    generationTimeMs: number;
    errorCount: number;
    judgeScore: number | null;
    criteriaAnalyzed: number;
    improvementActions: number;
  };
  comparisons: BenchmarkComparison[];
}

export class PipelineBenchmarker {
  /**
   * Run a benchmark comparing an old-pipeline run to the new improved pipeline.
   * Measures prompt size, generation time, completeness, error rate, and estimated score.
   */
  compare(oldPipeline: Record<string, unknown>, newPipeline: Record<string, unknown>): BenchmarkComparison[] {
    const comparisons: BenchmarkComparison[] = [];

    // Prompt size comparison
    const oldPromptSize = (oldPipeline.promptSizeChars as number) ?? 0;
    const newPromptSize = (newPipeline.promptSizeChars as number) ?? 0;
    comparisons.push({
      metric: 'Prompt Size',
      oldValue: oldPromptSize,
      newValue: newPromptSize,
      improvement: oldPromptSize > 0 ? `${Math.round(((oldPromptSize - newPromptSize) / oldPromptSize) * 100)}%` : 'N/A',
      unit: 'chars',
    });

    // Generation time
    const oldTime = (oldPipeline.generationTimeMs as number) ?? 0;
    const newTime = (newPipeline.generationTimeMs as number) ?? 0;
    comparisons.push({
      metric: 'Generation Time',
      oldValue: oldTime,
      newValue: newTime,
      improvement: oldTime > 0 ? `${Math.round(((oldTime - newTime) / oldTime) * 100)}%` : 'N/A',
      unit: 'ms',
    });

    // Error count
    const oldErrors = (oldPipeline.errorCount as number) ?? 0;
    const newErrors = (newPipeline.errorCount as number) ?? 0;
    comparisons.push({
      metric: 'Error Count',
      oldValue: oldErrors,
      newValue: newErrors,
      improvement: oldErrors > 0 ? `${Math.round(((oldErrors - newErrors) / oldErrors) * 100)}%` : 'N/A',
      unit: 'errors',
    });

    // Judge score
    const oldScore = (oldPipeline.judgeScore as number) ?? 0;
    const newScore = (newPipeline.judgeScore as number) ?? 0;
    comparisons.push({
      metric: 'Estimated Judge Score',
      oldValue: oldScore,
      newValue: newScore,
      improvement: oldScore > 0 ? `+${Math.round(newScore - oldScore)} pts` : 'N/A',
      unit: '/100',
    });

    // Criteria analyzed
    const oldCriteria = (oldPipeline.criteriaAnalyzed as number) ?? 0;
    const newCriteria = (newPipeline.criteriaAnalyzed as number) ?? 0;
    comparisons.push({
      metric: 'Criteria Analyzed',
      oldValue: oldCriteria,
      newValue: newCriteria,
      improvement: `+${newCriteria - oldCriteria} criteria`,
      unit: 'criteria',
    });

    // Improvement actions
    const oldActions = (oldPipeline.improvementActions as number) ?? 0;
    const newActions = (newPipeline.improvementActions as number) ?? 0;
    comparisons.push({
      metric: 'Improvement Actions Suggested',
      oldValue: oldActions,
      newValue: newActions,
      improvement: `+${newActions - oldActions} actions`,
      unit: 'actions',
    });

    return comparisons;
  }

  /**
   * Generate a standardized benchmark suite prompt for each pipeline variant.
   */
  generateBenchmarkPrompts(): Array<{ name: string; prompt: string; expectedDeliverables: string[] }> {
    return [
      {
        name: 'Web App (CRUD)',
        prompt: 'Build a task management web app with create, read, update, delete functionality, user authentication, and a dashboard.',
        expectedDeliverables: ['Source code', 'Tests', 'README', 'Deployment'],
      },
      {
        name: 'AI Integration',
        prompt: 'Build a web app that uses an AI API to analyze sentiment of user-submitted text and display results with charts.',
        expectedDeliverables: ['Source code', 'AI integration', 'Charts UI', 'README'],
      },
      {
        name: 'Full Stack with Auth',
        prompt: 'Build a full-stack application with user registration, login, profile management, and a protected dashboard showing user data.',
        expectedDeliverables: ['Auth system', 'Backend API', 'Frontend UI', 'Database schema', 'Tests'],
      },
    ];
  }

  /**
   * Format benchmark comparisons as markdown.
   */
  formatComparison(comparisons: BenchmarkComparison[]): string {
    const lines: string[] = [];
    lines.push('## Pipeline Benchmark Comparison');
    lines.push('');
    lines.push('| Metric | Old Pipeline | Improved Pipeline | Improvement |');
    lines.push('|--------|-------------|-------------------|-------------|');
    for (const c of comparisons) {
      lines.push(`| ${c.metric} | ${c.oldValue} ${c.unit} | ${c.newValue} ${c.unit} | ${c.improvement} |`);
    }
    lines.push('');
    return lines.join('\n');
  }
}
