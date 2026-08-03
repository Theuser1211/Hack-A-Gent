import { describe, it, expect } from 'vitest';

import { brainstormIdeas } from '../../cli/ideation/idea-engine.js';
import type { CompetitionAnalysis } from '../../cli/pipeline/types.js';
import { analyzeFeasibility } from '../../cli/product-intelligence/feasibility.js';
import { simulateJudges } from '../../cli/product-intelligence/judge-sim.js';
import { extractJudgingPriorities } from '../../cli/product-intelligence/judging.js';
import { runProductIntelligence } from '../../cli/product-intelligence/orchestrator.js';
import { analyzeViability } from '../../cli/product-intelligence/viability.js';

function hackathon(over: Partial<CompetitionAnalysis>): CompetitionAnalysis {
  return {
    analysisId: 'ca-fit',
    challenge: {
      title: 'Hack',
      problemStatement: 'Problem',
      theme: 'technology',
      difficulty: 'intermediate',
      estimatedParticipants: 100,
      organizer: 'Org',
    },
    judgingCriteria: [
      { name: 'Innovation', weight: 40, weightRaw: '40%', description: '', priority: 'critical' },
      { name: 'Technical Depth', weight: 30, weightRaw: '30%', description: '', priority: 'high' },
      { name: 'Impact', weight: 30, weightRaw: '30%', description: '', priority: 'high' },
    ],
    sponsorAPIs: [],
    deliverables: [],
    restrictions: [],
    deadlines: [],
    ...over,
  };
}

const CLIMATE = hackathon({
  challenge: {
    title: 'Climate Data Sprint',
    problemStatement: 'Use open climate data and APIs to help cities cut carbon emissions',
    theme: 'climate',
    difficulty: 'advanced',
    estimatedParticipants: 150,
    organizer: 'GreenOrg',
  },
});

const AI_GOOD = hackathon({
  challenge: {
    title: 'AI for Good Hackathon',
    problemStatement: 'Build AI solutions for social impact and underserved communities',
    theme: 'AI for Good',
    difficulty: 'intermediate',
    estimatedParticipants: 200,
    organizer: 'GoodOrg',
  },
});

const GENERIC = hackathon({
  challenge: { title: 'Anything Goes', problemStatement: '', theme: 'technology', difficulty: 'beginner', estimatedParticipants: 50, organizer: 'AnyOrg' },
  judgingCriteria: [],
  sponsorAPIs: [],
});

// Word-boundary traps: "edu" lives inside "reduce" and "work" inside "networks".
// A substring matcher would call a food hackathon an education hackathon and a
// community hackathon a productivity hackathon.
const FOOD = hackathon({
  challenge: {
    title: 'Food Hack',
    problemStatement: 'Reduce food waste and improve access to food',
    theme: 'food',
    difficulty: 'intermediate',
    estimatedParticipants: 100,
    organizer: 'FoodOrg',
  },
});

const COMMUNITY = hackathon({
  challenge: {
    title: 'Community Connect',
    problemStatement: 'Strengthen local neighborhoods and volunteer networks',
    theme: 'community',
    difficulty: 'intermediate',
    estimatedParticipants: 100,
    organizer: 'LocalOrg',
  },
});

const FINANCE = hackathon({
  challenge: {
    title: 'Fintech Build',
    problemStatement: 'Build tools for financial literacy and better money habits',
    theme: 'finance',
    difficulty: 'intermediate',
    estimatedParticipants: 100,
    organizer: 'MoneyOrg',
  },
});

describe('theme-fit ranking', () => {
  it('picks an on-theme winner for a climate hackathon', () => {
    const result = brainstormIdeas(CLIMATE);
    expect(result.winner.themeFit).toBeGreaterThanOrEqual(7);
    // Drift/Harvest/Ember/Sway are the climate-domain angles.
    expect(['Drift', 'Harvest', 'Ember', 'Sway']).toContain(result.winner.title);
  });

  it('picks an on-theme winner for an AI hackathon', () => {
    const result = brainstormIdeas(AI_GOOD);
    expect(result.winner.themeFit).toBeGreaterThanOrEqual(7);
    expect(result.winner.domain).toBe('ai');
  });

  it('on-theme ideas score higher than off-theme ones', () => {
    const result = brainstormIdeas(CLIMATE);
    const climateIdea = result.generated.find((i) => i.domain === 'climate')!;
    const offTheme = result.generated.find((i) => i.domain === 'productivity')!;
    expect(climateIdea.themeFit).toBeGreaterThan(offTheme.themeFit);
  });

  it('pool is majority on-theme for a matched challenge', () => {
    const result = brainstormIdeas(CLIMATE);
    const onTheme = result.generated.filter((i) => i.domain === 'climate').length;
    expect(onTheme).toBeGreaterThanOrEqual(4);
  });

  it('generic challenges still produce 20 ideas with a winner', () => {
    const result = brainstormIdeas(GENERIC);
    expect(result.generated).toHaveLength(20);
    expect(result.winner.themeFit).toBeGreaterThanOrEqual(1);
    expect(result.winner.themeFit).toBeLessThanOrEqual(10);
  });

  it('generic challenges stay theme-neutral — no idea gets a flavor-only themeFit boost', () => {
    // When the challenge gives no thematic signal, an idea that merely speaks its
    // own domain's vocabulary (e.g. "carbon") must NOT be rewarded: themeFit
    // should be roughly flat across the pool so the other dimensions decide.
    const result = brainstormIdeas(GENERIC);
    const fits = result.generated.map((i) => i.themeFit);
    const spread = Math.max(...fits) - Math.min(...fits);
    expect(spread).toBeLessThanOrEqual(2);
  });

  it('product intelligence winner is on-theme too (judge sim reinforced)', () => {
    const pi = runProductIntelligence(CLIMATE, null);
    expect(pi.winner.themeFit).toBeGreaterThanOrEqual(7);
  });

  it('is deterministic with the theme-fit dimension', () => {
    expect(brainstormIdeas(CLIMATE)).toEqual(brainstormIdeas(CLIMATE));
  });

  it('word-boundary matching — "reduce" is NOT an education hackathon', () => {
    // "edu" is a substring of "reduce", but the food hackathon must still
    // produce a food winner, never an education one.
    const result = brainstormIdeas(FOOD);
    expect(['Pantry', 'Table', 'Ration', 'Swarm']).toContain(result.winner.title);
    expect(result.winner.domain).toBe('food');
  });

  it('word-boundary matching — "networks" is NOT a productivity hackathon', () => {
    // "work" is a substring of "networks", but this community hackathon must
    // still produce a community winner.
    const result = brainstormIdeas(COMMUNITY);
    expect(['Huddle', 'Handoff', 'Porch', 'Common']).toContain(result.winner.title);
  });

  it('theme field outweighs a keyword-heavy problem statement', () => {
    // The problem statement mentions "underserved communities" (community
    // domain), but the theme title "AI for Good" must win: an AI winner, not
    // a community one.
    const result = brainstormIdeas(AI_GOOD);
    expect(result.winner.domain).toBe('ai');
  });

  it('matched-domain pool favors the theme across varied hackathons', () => {
    const cases: Array<[CompetitionAnalysis, string]> = [
      [FINANCE, 'finance'],
      [FOOD, 'food'],
      [COMMUNITY, 'community'],
      [AI_GOOD, 'ai'],
    ];
    for (const [a, expected] of cases) {
      const result = brainstormIdeas(a);
      const onTheme = result.generated.filter((i) => i.domain === expected).length;
      expect(onTheme).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('judge realism — relevance to challenge', () => {
  it('judges reward an on-theme idea over an off-theme one', () => {
    const onTheme = brainstormIdeas(CLIMATE).generated.find((i) => i.domain === 'climate')!;
    const offTheme = brainstormIdeas(CLIMATE).generated.find((i) => i.domain === 'productivity')!;
    const priorities = extractJudgingPriorities(CLIMATE);
    const vOn = analyzeViability(onTheme, CLIMATE);
    const vOff = analyzeViability(offTheme, CLIMATE);
    const fOn = analyzeFeasibility(onTheme, CLIMATE, 'balanced');
    const fOff = analyzeFeasibility(offTheme, CLIMATE, 'balanced');

    const simOn = simulateJudges(onTheme, priorities, vOn, fOn);
    const simOff = simulateJudges(offTheme, priorities, vOff, fOff);

    // The panel must not prefer a clearly off-theme concept.
    expect(simOn.total).toBeGreaterThan(simOff.total);
  });
});
