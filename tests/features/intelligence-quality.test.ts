/**
 * Intelligence Quality Tests
 * ==========================
 *
 * Tests for deterministic hackathon intelligence:
 * - Judging intelligence analysis
 * - Sponsor intelligence analysis
 * - Opportunity analysis
 * - Challenge understanding
 * - Winning strategy report
 * - Robustness features
 */

import { describe, it, expect } from 'vitest';
import {
  analyzeJudgingIntelligence,
  analyzeSponsorIntelligence,
  analyzeOpportunity,
  analyzeChallengeUnderstanding,
  generateWinningStrategyReport,
} from '../../features/universal-parser/intelligence-analyzer.js';
import type { WinningStrategyReport } from '../../features/universal-parser/types.js';
import {
  detectLanguage,
  isNonEnglish,
  extractJsonLd,
  enrichFromJsonLd,
  extractFromNoscript,
  isAiGeneratedPage,
  isSponsorOnlyPage,
  assessExtractionQuality,
} from '../../features/universal-parser/section-extractor.js';
import type {
  HackathonSpec,
  UniversalExtractedSections,
  PlatformType,
} from '../../features/universal-parser/types.js';

// ─── Test Fixtures ──────────────────────────────────────────────────

function makeSpec(overrides: Partial<HackathonSpec> = {}): HackathonSpec {
  return {
    parseId: 'test-001',
    url: 'https://devpost.com/hackathon-test',
    platform: 'devpost',
    confidence: 0.85,
    rawHtmlLength: 10000,
    title: 'AI Innovation Hackathon 2024',
    tagline: 'Build the future of AI-powered solutions',
    description: 'A hackathon focused on building innovative AI solutions that solve real-world problems. Participants will use cutting-edge machine learning technologies to create production-ready applications with measurable social impact.',
    organizer: 'TechCorp',
    themes: ['AI/ML', 'Social Impact', 'Innovation'],
    tracks: ['Best AI App', 'Social Impact Award', 'Beginner Friendly'],
    judgingCriteria: [
      { name: 'Innovation', weight: 30, description: 'How novel and creative is the solution?', inferred: false, priority: 'critical' },
      { name: 'Technical Depth', weight: 25, description: 'How technically impressive is the implementation?', inferred: false, priority: 'high' },
      { name: 'Impact', weight: 25, description: 'How much real-world impact does the project have?', inferred: false, priority: 'high' },
      { name: 'Presentation', weight: 20, description: 'How well is the project presented?', inferred: false, priority: 'medium' },
    ],
    scoringMethodology: 'Scored on innovation, technical depth, impact, and presentation',
    judgingIntelligence: undefined as any,
    sponsorIntelligence: undefined as any,
    opportunityAnalysis: undefined as any,
    challengeUnderstanding: undefined as any,
    prizes: [
      { description: '$10,000 Grand Prize', cashValueUsd: 10000, tier: 'grand', rawText: '$10,000 Grand Prize' },
      { description: '$5,000 Best AI App', cashValueUsd: 5000, tier: 'track', sponsor: 'TechCorp', rawText: '$5,000 Best AI App' },
      { description: 'AWS Credits $2,000', cashValueUsd: 2000, tier: 'special', sponsor: 'AWS', rawText: 'AWS Credits $2,000' },
    ],
    sponsorAPIs: [
      { name: 'OpenAI', category: 'ai', mustUse: false, strategicValue: 5, description: 'GPT-4 API', confidence: 'confirmed' },
      { name: 'AWS', category: 'hosting', mustUse: false, strategicValue: 4, description: 'Cloud hosting', confidence: 'confirmed' },
      { name: 'Stripe', category: 'payments', mustUse: false, strategicValue: 3, description: 'Payment processing', confidence: 'inferred' },
    ],
    eligibility: [],
    restrictions: [],
    constraints: [],
    deliverables: [
      { description: 'GitHub repository', format: 'repo', required: true },
      { description: 'Live demo URL', format: 'url', required: true },
      { description: '3-minute video', format: 'video', required: true },
    ],
    timeline: [
      { label: 'Registration opens', date: '2024-01-01', type: 'registration' },
      { label: 'Submission deadline', date: '2024-01-15', type: 'submission' },
    ],
    importantLinks: [],
    fieldConfidence: {},
    meta: {
      extractedAt: new Date().toISOString(),
      parserVersion: '1.1.0',
      platformNotes: [],
      inferredFields: [],
      warnings: [],
      llmCalls: 0,
      aiNormalized: false,
    },
    qualityMetrics: {
      confidence: 0.85,
      parseTimeMs: 100,
      aiTimeMs: 0,
      aiRetryCount: 0,
      repairActionsCount: 0,
      inferredFieldsCount: 0,
      aiInterpretedFieldsCount: 0,
      lowConfidenceFieldsCount: 0,
      missingSectionsCount: 0,
      sponsorAPIsCount: 3,
      judgingCriteriaCount: 4,
      platform: 'devpost',
      platformConfidence: 0.85,
      warningCount: 0,
      success: true,
    },
    diagnostics: {
      extractedFields: [],
      inferredFields: [],
      aiGeneratedFields: [],
      missingFields: [],
      lowConfidenceFields: [],
      repairActions: [],
      fallbacksUsed: [],
      warnings: [],
      strategiesAttempted: ['dom_heading'],
      bestStrategy: 'dom_heading',
      performance: {
        htmlParseTimeMs: 50,
        sectionExtractionTimeMs: 30,
        aiNormalizationTimeMs: 0,
        validationTimeMs: 10,
        repairTimeMs: 0,
      },
    },
    ...overrides,
  } as HackathonSpec;
}

function makeSections(overrides: Partial<UniversalExtractedSections> = {}): UniversalExtractedSections {
  return {
    title: 'AI Innovation Hackathon 2024',
    tagline: 'Build the future of AI-powered solutions',
    description: 'A hackathon focused on building innovative AI solutions that solve real-world problems.',
    themes: 'AI/ML, Social Impact, Innovation',
    judgingCriteria: '## Judging Criteria\n- Innovation (30%)\n- Technical Depth (25%)\n- Impact (25%)\n- Presentation (20%)',
    prizes: '## Prizes\n- $10,000 Grand Prize\n- $5,000 Best AI App',
    sponsors: '## Sponsors\n- OpenAI\n- AWS\n- Stripe',
    rules: '## Rules\n- Open to all developers',
    deliverables: '## Deliverables\n- GitHub repo\n- Live demo\n- Video',
    timeline: '## Timeline\n- Registration: Jan 1\n- Submission: Jan 15',
    resources: '## Resources\n- API documentation',
    faq: '',
    team: '',
    workshops: '',
    metadata: '',
    rawSections: [],
    ...overrides,
  };
}

// ─── Judging Intelligence Tests ─────────────────────────────────────

describe('Intelligence: Judging Intelligence', () => {
  it('analyzes actual priorities from criteria weights', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeJudgingIntelligence(spec, sections);

    expect(result.actualPriorities.length).toBeGreaterThan(0);
    expect(result.actualPriorities.some(p => p.includes('Innovation'))).toBe(true);
  });

  it('generates winning strategies', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeJudgingIntelligence(spec, sections);

    expect(result.likelyWinningStrategies.length).toBeGreaterThan(0);
    expect(result.likelyWinningStrategies[0]!.name).toBeTruthy();
    expect(result.likelyWinningStrategies[0]!.rationale).toBeTruthy();
    expect(result.likelyWinningStrategies[0]!.difficulty).toBeGreaterThanOrEqual(1);
    expect(result.likelyWinningStrategies[0]!.difficulty).toBeLessThanOrEqual(10);
  });

  it('scores technical depth from content signals', () => {
    const spec = makeSpec({
      description: 'Build a scalable, distributed machine learning system with real-time inference and neural network architecture optimization.',
    });
    const sections = makeSections();
    const result = analyzeJudgingIntelligence(spec, sections);

    expect(result.expectedTechnicalDepth).toBeGreaterThanOrEqual(6);
  });

  it('scores innovation from content signals', () => {
    const spec = makeSpec({
      description: 'Create a novel, unique, and creative solution that reimagines how we approach this problem with an original approach.',
    });
    const sections = makeSections();
    const result = analyzeJudgingIntelligence(spec, sections);

    expect(result.expectedInnovation).toBeGreaterThanOrEqual(6);
  });

  it('detects platform-specific biases for Devpost', () => {
    const spec = makeSpec({ platform: 'devpost' });
    const sections = makeSections();
    const result = analyzeJudgingIntelligence(spec, sections);

    expect(result.knownBiases.some(b => b.includes('Devpost'))).toBe(true);
  });

  it('returns confidence based on available data', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeJudgingIntelligence(spec, sections);

    expect(result.confidence.confidence).toMatch(/^(high|medium|low)$/);
    expect(result.confidence.source).toMatch(/^(extracted|inferred)$/);
  });
});

// ─── Sponsor Intelligence Tests ─────────────────────────────────────

describe('Intelligence: Sponsor Intelligence', () => {
  it('ranks sponsors by strategic value', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeSponsorIntelligence(spec, sections);

    expect(result.sponsorsByValue.length).toBe(3);
    // OpenAI should be highest (AI category = 9)
    expect(result.sponsorsByValue[0]!.sponsorName).toBe('OpenAI');
    expect(result.sponsorsByValue[0]!.strategicValue).toBeGreaterThanOrEqual(result.sponsorsByValue[1]!.strategicValue);
  });

  it('identifies required sponsors', () => {
    const spec = makeSpec({
      sponsorAPIs: [
        { name: 'RequiredAPI', category: 'ai', mustUse: true, strategicValue: 5, description: 'Required', confidence: 'confirmed' },
        { name: 'OptionalAPI', category: 'hosting', mustUse: false, strategicValue: 3, description: 'Optional', confidence: 'confirmed' },
      ],
    });
    const sections = makeSections();
    const result = analyzeSponsorIntelligence(spec, sections);

    expect(result.requiredSponsors).toContain('RequiredAPI');
    expect(result.requiredSponsors).not.toContain('OptionalAPI');
  });

  it('detects synergy opportunities', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeSponsorIntelligence(spec, sections);

    // AI + Hosting synergy (OpenAI + AWS)
    expect(result.synergyOpportunities.length).toBeGreaterThan(0);
    expect(result.synergyOpportunities[0]!.sponsors.length).toBe(2);
    expect(result.synergyOpportunities[0]!.combinedValue).toBeGreaterThan(0);
  });

  it('generates overall sponsor strategy', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeSponsorIntelligence(spec, sections);

    expect(result.overallStrategy.length).toBeGreaterThan(10);
    expect(result.overallStrategy).toContain('OpenAI');
  });

  it('returns confidence based on sponsor data', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeSponsorIntelligence(spec, sections);

    expect(result.confidence.confidence).toMatch(/^(high|medium|low)$/);
  });
});

// ─── Opportunity Analysis Tests ─────────────────────────────────────

describe('Intelligence: Opportunity Analysis', () => {
  it('detects overused ideas', () => {
    const spec = makeSpec({
      description: 'Build a todo app and task manager for this hackathon.',
    });
    const sections = makeSections();
    const result = analyzeOpportunity(spec, sections);

    expect(result.overusedIdeas.length).toBeGreaterThan(0);
  });

  it('detects underserved opportunities', () => {
    const spec = makeSpec({
      description: 'Build an AI solution for this hackathon.',
    });
    const sections = makeSections();
    const result = analyzeOpportunity(spec, sections);

    // Accessibility should be underserved if not mentioned
    expect(result.underservedOpportunities.length).toBeGreaterThan(0);
  });

  it('identifies risky directions', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeOpportunity(spec, sections);

    expect(result.riskyDirections.length).toBeGreaterThan(0);
    expect(result.riskyDirections[0]!.riskLevel).toBeGreaterThanOrEqual(1);
    expect(result.riskyDirections[0]!.riskLevel).toBeLessThanOrEqual(10);
    expect(result.riskyDirections[0]!.failureModes.length).toBeGreaterThan(0);
  });

  it('finds strongest direction aligned with themes', () => {
    const spec = makeSpec({
      themes: ['AI/ML', 'Innovation'],
    });
    const sections = makeSections();
    const result = analyzeOpportunity(spec, sections);

    expect(result.strongestDirection.name).toBeTruthy();
    expect(result.strongestDirection.rationale).toBeTruthy();
    expect(result.strongestDirection.scorePotential).toBeGreaterThan(50);
  });

  it('determines easiest path to win', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeOpportunity(spec, sections);

    expect(result.easiestPathToWin.length).toBeGreaterThan(10);
  });

  it('determines highest ROI track', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeOpportunity(spec, sections);

    expect(result.highestRoiTrack).toBeTruthy();
  });
});

// ─── Challenge Understanding Tests ──────────────────────────────────

describe('Intelligence: Challenge Understanding', () => {
  it('infers core problem from description', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeChallengeUnderstanding(spec, sections);

    expect(result.coreProblem.length).toBeGreaterThan(10);
    expect(result.coreProblem).toContain('AI');
  });

  it('infers target users from content', () => {
    const spec = makeSpec({
      description: 'A hackathon for students and beginners to learn AI.',
    });
    const sections = makeSections();
    const result = analyzeChallengeUnderstanding(spec, sections);

    expect(result.targetUsers.length).toBeGreaterThan(0);
  });

  it('infers organizer motivation', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeChallengeUnderstanding(spec, sections);

    expect(result.organizerMotivation.length).toBeGreaterThan(10);
  });

  it('generates success criteria from judging criteria', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const result = analyzeChallengeUnderstanding(spec, sections);

    expect(result.successCriteria.length).toBeGreaterThan(0);
  });

  it('identifies domain knowledge requirements', () => {
    const spec = makeSpec({
      description: 'Build an AI solution using machine learning and deep learning.',
    });
    const sections = makeSections();
    const result = analyzeChallengeUnderstanding(spec, sections);

    expect(result.domainKnowledge.length).toBeGreaterThan(0);
    expect(result.domainKnowledge.some(d => d.includes('learning'))).toBe(true);
  });
});

// ─── Winning Strategy Report Tests ──────────────────────────────────

describe('Intelligence: Winning Strategy Report', () => {
  it('generates complete report from spec', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const report = generateWinningStrategyReport(spec, sections);

    expect(report.easiestPath.length).toBeGreaterThan(10);
    expect(report.highestRoiTrack).toBeTruthy();
    expect(report.recommendedTechStack.length).toBeGreaterThan(0);
    expect(report.recommendedMvpScope.length).toBeGreaterThan(10);
    expect(report.demoStrategy.length).toBeGreaterThan(10);
    expect(report.biggestRisks.length).toBeGreaterThan(0);
    expect(report.biggestOpportunities.length).toBeGreaterThan(0);
    expect(report.sponsorOpportunities.length).toBeGreaterThan(0);
    expect(report.judgingPrioritiesSummary.length).toBeGreaterThan(10);
  });

  it('includes sponsor technology in tech stack', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const report = generateWinningStrategyReport(spec, sections);

    expect(report.recommendedTechStack.some(t => t.includes('OpenAI'))).toBe(true);
  });

  it('includes risks from risky directions', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const report = generateWinningStrategyReport(spec, sections);

    expect(report.biggestRisks[0]).toContain('risk');
  });

  it('includes sponsor synergies in opportunities', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const report = generateWinningStrategyReport(spec, sections);

    expect(report.sponsorOpportunities.some(o => o.includes('OpenAI') || o.includes('Synergy'))).toBe(true);
  });

  it('has overall confidence', () => {
    const spec = makeSpec();
    const sections = makeSections();
    const report = generateWinningStrategyReport(spec, sections);

    expect(report.overallConfidence.confidence).toMatch(/^(high|medium|low)$/);
  });
});

// ─── Robustness Tests ───────────────────────────────────────────────

describe('Robustness: Language Detection', () => {
  it('detects English from lang attribute', () => {
    expect(detectLanguage('<html lang="en"><body></body></html>')).toBe('en');
  });

  it('detects Spanish from lang attribute', () => {
    expect(detectLanguage('<html lang="es"><body></body></html>')).toBe('es');
  });

  it('detects from meta content-language', () => {
    expect(detectLanguage('<html><head><meta http-equiv="content-language" content="fr"></head></html>')).toBe('fr');
  });

  it('defaults to English for uncertain content', () => {
    expect(detectLanguage('<html><body>Hello world</body></html>')).toBe('en');
  });

  it('isNonEnglish returns false for English', () => {
    expect(isNonEnglish('<html lang="en"><body></body></html>')).toBe(false);
  });

  it('isNonEnglish returns true for Spanish', () => {
    expect(isNonEnglish('<html lang="es"><body></body></html>')).toBe(true);
  });
});

describe('Robustness: JSON-LD Extraction', () => {
  it('extracts Event schema from JSON-LD', () => {
    const html = `
      <html>
      <head>
        <script type="application/ld+json">
        {"@type": "Event", "name": "Hackathon 2024", "description": "A test hackathon", "startDate": "2024-01-01"}
        </script>
      </head>
      <body></body>
      </html>
    `;
    const result = extractJsonLd(html);
    expect(result).not.toBeNull();
    expect(result!['@type']).toBe('Event');
    expect(result!.name).toBe('Hackathon 2024');
  });

  it('returns null for no JSON-LD', () => {
    expect(extractJsonLd('<html><body>No structured data</body></html>')).toBeNull();
  });

  it('enriches sections from JSON-LD', () => {
    const html = `
      <html>
      <head>
        <script type="application/ld+json">
        {"@type": "Event", "description": "A test hackathon", "startDate": "2024-01-01"}
        </script>
      </head>
      <body></body>
      </html>
    `;
    const sections = makeSections();
    enrichFromJsonLd(sections, html);

    expect(sections.description).toContain('JSON-LD');
    expect(sections.timeline).toContain('Start Date (JSON-LD)');
  });
});

describe('Robustness: Noscript Extraction', () => {
  it('extracts meaningful content from noscript tags', () => {
    const html = `
      <html>
      <body>
        <noscript>
          <h2>Judging Criteria</h2>
          <p>Innovation 30%, Technical Depth 25%, Impact 25%, Presentation 20%</p>
        </noscript>
      </body>
      </html>
    `;
    const result = extractFromNoscript(html);
    expect(result).toContain('Innovation');
  });

  it('ignores short noscript content', () => {
    const html = '<noscript>Enable JavaScript</noscript>';
    expect(extractFromNoscript(html)).toBe('');
  });
});

describe('Robustness: AI-Generated Detection', () => {
  it('detects AI-generated pages', () => {
    const html = '<html><body><div>Powered by ChatGPT and generated by AI</div></body></html>';
    expect(isAiGeneratedPage(html)).toBe(true);
  });

  it('does not flag normal pages', () => {
    const html = '<html><body><h1>Hackathon</h1><p>Normal content</p></body></html>';
    expect(isAiGeneratedPage(html)).toBe(false);
  });
});

describe('Robustness: Sponsor-Only Detection', () => {
  it('detects sponsor-only pages', () => {
    const sections = makeSections({
      description: '',
      judgingCriteria: '',
      prizes: '',
      sponsors: '## Sponsors\nBig Company A\nBig Company B\nBig Company C',
    });
    expect(isSponsorOnlyPage(sections)).toBe(true);
  });

  it('does not flag complete hackathon pages', () => {
    const sections = makeSections();
    expect(isSponsorOnlyPage(sections)).toBe(false);
  });
});

describe('Robustness: Extraction Quality', () => {
  it('scores complete extraction highly', () => {
    const sections = makeSections();
    const score = assessExtractionQuality(sections);
    expect(score).toBeGreaterThanOrEqual(0.7);
  });

  it('scores empty extraction lowly', () => {
    const sections = makeSections({
      title: '',
      description: '',
      judgingCriteria: '',
      prizes: '',
      sponsors: '',
      timeline: '',
    });
    const score = assessExtractionQuality(sections);
    expect(score).toBeLessThan(0.3);
  });
});
