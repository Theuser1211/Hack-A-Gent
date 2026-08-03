/**
 * Ranking-quality regression suite for the Product Intelligence ideation engine.
 *
 * Locks in the ranking fixes:
 *   - every themed hackathon picks an on-theme winner (off-theme winners are a
 *     production bug — e.g. a health wearable winning a careers hackathon)
 *   - sponsor APIs measurably influence ranking (sponsorFit weight was 0)
 *   - judging criteria map to the right dimensions
 *   - generic/duplicated ideas lose
 *   - ranking is deterministic (same input → same winner, forever)
 */
import { describe, expect, it } from 'vitest';

import { brainstormIdeas } from '../../cli/ideation/idea-engine.js';
import { IDEA_DOMAINS, keywordMatchStrength, scoreDomains } from '../../cli/ideation/idea-library.js';
import type { CompetitionAnalysis } from '../../cli/pipeline/types.js';
import { criterionFocus } from '../../cli/product-intelligence/judging.js';
import { runProductIntelligence } from '../../cli/product-intelligence/orchestrator.js';

function h(over: Partial<CompetitionAnalysis>): CompetitionAnalysis {
  return {
    analysisId: 'regression',
    challenge: {
      title: 'Regression Hackathon',
      problemStatement: 'Build something judges remember.',
      theme: 'technology',
      difficulty: 'intermediate',
      estimatedParticipants: 200,
      organizer: 'RegressionOrg',
    },
    judgingCriteria: [
      { name: 'Innovation', weight: 40, weightRaw: '40%', description: 'Originality', priority: 'critical' },
      { name: 'Technical Depth', weight: 30, weightRaw: '30%', description: 'Sophistication', priority: 'high' },
      { name: 'Impact', weight: 30, weightRaw: '30%', description: 'Real-world value', priority: 'high' },
    ],
    sponsorAPIs: [],
    deliverables: [],
    restrictions: [],
    deadlines: [],
    ...over,
  };
}

function sponsor(name: string): CompetitionAnalysis['sponsorAPIs'] {
  return [{ name, provider: name, strategicValue: 'must_use', description: 'Sponsor API' }];
}

/** id → (theme, problem, expected top domain). */
const THEMED_SCENARIOS: Array<[string, string, string, string]> = [
  ['ai', 'AI for Good', 'Build AI solutions that create social impact for communities', 'ai'],
  ['health', 'Healthcare', 'Improve patient care and wellness for families', 'health'],
  ['climate', 'Climate Data', 'Use open data on carbon and energy to help cities cut emissions', 'climate'],
  ['fintech', 'Fintech', 'Build tools for banking, budgeting and payments', 'finance'],
  ['edu', 'Education', 'Help students learn and study better', 'education'],
  ['access', 'Accessibility', 'Break down barriers for people with disabilities', 'accessibility'],
  ['food', 'Food', 'Reduce food waste and improve access to food', 'food'],
  ['community', 'Community', 'Connect neighbors and strengthen local communities', 'community'],
  ['cyber', 'Cybersecurity', 'Protect people and businesses from hacking, phishing and data breaches', 'cybersecurity'],
  ['space', 'Space', 'Bring satellite data and space exploration to everyone', 'space'],
  ['robotics', 'Robotics', 'Make robots and autonomous hardware easier to build and operate', 'robotics'],
  ['gaming', 'Gaming', 'Build games and tools players and creators love', 'gaming'],
  ['careers', 'Career', 'Help people land jobs, prepare for interviews and grow their careers', 'careers'],
];

describe('rank-quality: on-theme winners across diverse hackathons', () => {
  for (const [id, theme, problem, expectedDomain] of THEMED_SCENARIOS) {
    it(`${id}: picks an on-theme winner (${expectedDomain})`, () => {
      const analysis = h({ challenge: { title: theme, problemStatement: problem, theme } });
      const pi = runProductIntelligence(analysis, null);
      // The top-matched domain must be the expected one — the theme weighting
      // must not be outvoted by secondary keywords in the problem statement.
      const matches = scoreDomains(theme, problem);
      expect(matches[0]?.domain.id).toBe(expectedDomain);
      // And the winner must actually come from that domain — never off-theme.
      expect(pi.winner.domain).toBe(expectedDomain);
      expect(pi.winner.themeFit).toBeGreaterThanOrEqual(8);
    });
  }
});

describe('rank-quality: careers must not lose to health', () => {
  it("the 'care' prefix in 'career' must not make health the top domain", () => {
    // Exact keyword hits beat accidental stem-prefix cross-matches.
    expect(keywordMatchStrength('career', 'career')).toBe(2);
    expect(keywordMatchStrength('career', 'care')).toBe(1); // prefix only
    expect(keywordMatchStrength('careers', 'career')).toBe(2); // plural folding
    // health 'care' must score strictly below careers 'career' on a careers theme.
    const matches = scoreDomains('Career', 'Help people land jobs and grow their careers');
    const careersScore = matches.find((m) => m.domain.id === 'careers')?.score ?? 0;
    const healthScore = matches.find((m) => m.domain.id === 'health')?.score ?? 0;
    expect(careersScore).toBeGreaterThan(healthScore);
  });

  it('a careers hackathon is won by a careers idea', () => {
    const analysis = h({
      challenge: { title: 'Career', problemStatement: 'Help people land jobs, prepare for interviews and grow their careers', theme: 'Career' },
    });
    const pi = runProductIntelligence(analysis, null);
    expect(pi.winner.domain).toBe('careers');
  });
});

describe('rank-quality: sponsor APIs influence ranking', () => {
  it('no sponsor → every idea is neutral (sponsorFit 5)', () => {
    const analysis = h({ challenge: { title: 'Healthcare', problemStatement: 'Improve patient care for families', theme: 'Healthcare' } });
    const brainstorm = brainstormIdeas(analysis, null);
    for (const idea of brainstorm.generated) {
      expect(idea.sponsorFit).toBe(5);
    }
  });

  it('a domain-matching sponsor lifts its domain (10) and sinks non-matching ideas (4)', () => {
    const analysis = h({
      challenge: { title: 'Healthcare', problemStatement: 'Improve patient care for families', theme: 'Healthcare' },
      sponsorAPIs: sponsor('Twilio'),
    });
    const brainstorm = brainstormIdeas(analysis, null);
    // Health is the matched domain — its ideas are all in the pool and get 10.
    expect(brainstorm.generated.some((i) => i.domain === 'health' && i.sponsorFit === 10)).toBe(true);
    // Non-health rest-pool ideas that ignore a specific sponsor pay an opportunity cost.
    expect(brainstorm.generated.some((i) => i.domain !== 'health' && i.sponsorFit === 4)).toBe(true);
  });

  it('an AI-flavored sponsor is broadly useful (8) to non-matching domains', () => {
    const analysis = h({
      challenge: { title: 'Healthcare', problemStatement: 'Improve patient care for families', theme: 'Healthcare' },
      sponsorAPIs: sponsor('OpenAI'),
    });
    const brainstorm = brainstormIdeas(analysis, null);
    expect(brainstorm.generated.some((i) => i.domain !== 'health' && i.sponsorFit === 8)).toBe(true);
  });

  it('the chosen sponsor can change the winning idea (Plaid → Ledgerly)', () => {
    const base = h({
      challenge: { title: 'Fintech', problemStatement: 'Build tools for banking, budgeting and payments', theme: 'Fintech' },
    });
    const withPlaid = h({
      challenge: { title: 'Fintech', problemStatement: 'Build tools for banking, budgeting and payments', theme: 'Fintech' },
      sponsorAPIs: sponsor('Plaid'),
    });
    const noSponsor = runProductIntelligence(base, null);
    const plaid = runProductIntelligence(withPlaid, null);
    expect(noSponsor.winner.domain).toBe('finance');
    expect(plaid.winner.domain).toBe('finance');
    expect(plaid.winner.title).not.toBe(noSponsor.winner.title);
  });
});

describe('rank-quality: judging criteria map to the right dimensions', () => {
  it('criterionFocus maps every criterion family correctly', () => {
    expect(criterionFocus('Innovation')).toBe('wow');
    expect(criterionFocus('Technical Depth')).toBe('technical');
    expect(criterionFocus('Social Impact')).toBe('impact');
    expect(criterionFocus('UI/UX')).toBe('design');
    expect(criterionFocus('Feasibility')).toBe('feasibility');
    expect(criterionFocus('Completeness')).toBe('completeness');
  });

  it('the winner rationale names the top judging criterion', () => {
    const analysis = h({
      challenge: { title: 'Climate Data', problemStatement: 'Help cities cut emissions with open data', theme: 'Climate Data' },
      judgingCriteria: [
        { name: 'Impact', weight: 50, weightRaw: '50%', description: 'Real-world value', priority: 'critical' },
        { name: 'Innovation', weight: 30, weightRaw: '30%', description: 'Originality', priority: 'high' },
        { name: 'Technical Depth', weight: 20, weightRaw: '20%', description: 'Sophistication', priority: 'high' },
      ],
    });
    const pi = runProductIntelligence(analysis, null);
    expect(pi.winner.whyItWins).toContain('Impact');
    expect(pi.winner.judgeSimulation.topCriterion).toBe('Impact');
  });
});

describe('rank-quality: generic and duplicated ideas lose', () => {
  it('every winner is a curated library angle with a specific user + mechanic', () => {
    const allTitles = new Set(IDEA_DOMAINS.flatMap((d) => d.angles.map((a) => a.title)));
    const genericFiller = /a platform for|an all-in-one|ai-powered app|generic|a tool for everything/i;
    for (const [, theme, problem] of THEMED_SCENARIOS) {
      const analysis = h({ challenge: { title: theme, problemStatement: problem, theme } });
      const winner = runProductIntelligence(analysis, null).winner;
      expect(allTitles.has(winner.title)).toBe(true);
      expect(genericFiller.test(winner.line)).toBe(false);
    }
  });

  it('a 20-idea brainstorm never contains duplicates', () => {
    const analysis = h({ challenge: { title: 'AI for Good', problemStatement: 'Build AI solutions for social impact', theme: 'AI for Good' } });
    const brainstorm = brainstormIdeas(analysis, null);
    const titles = brainstorm.generated.map((i) => i.title);
    expect(new Set(titles).size).toBe(titles.length);
    expect(brainstorm.generated).toHaveLength(20);
  });

  it('the library has no duplicate angle titles (domainForAngle correctness)', () => {
    const seen = new Map<string, string>();
    for (const domain of IDEA_DOMAINS) {
      for (const angle of domain.angles) {
        const prev = seen.get(angle.title);
        expect(prev, `title "${angle.title}" used by both ${prev} and ${domain.id}`).toBeUndefined();
        seen.set(angle.title, domain.id);
      }
    }
  });
});

describe('rank-quality: ranking is deterministic', () => {
  it('same input → identical winner, ranking, and scores', () => {
    const analysis = h({ challenge: { title: 'Healthcare', problemStatement: 'Improve patient care for families', theme: 'Healthcare' } });
    const r1 = runProductIntelligence(analysis, null);
    const r2 = runProductIntelligence(analysis, null);
    expect(r2.winner.title).toBe(r1.winner.title);
    expect(r2.brainstorm.rankedIds).toEqual(r1.brainstorm.rankedIds);
    expect(r2.brainstorm.generated.map((i) => i.totalScore)).toEqual(r1.brainstorm.generated.map((i) => i.totalScore));
  });

  it('different themes produce different winners (no theme-blind collapse)', () => {
    const climate = runProductIntelligence(
      h({ challenge: { title: 'Climate', problemStatement: 'Cut emissions with open data', theme: 'Climate' } }),
      null,
    );
    const gaming = runProductIntelligence(
      h({ challenge: { title: 'Gaming', problemStatement: 'Build games players love', theme: 'Gaming' } }),
      null,
    );
    expect(climate.winner.domain).toBe('climate');
    expect(gaming.winner.domain).toBe('gaming');
    expect(climate.winner.title).not.toBe(gaming.winner.title);
  });
});
