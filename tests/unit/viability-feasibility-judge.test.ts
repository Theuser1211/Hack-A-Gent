import { describe, it, expect } from 'vitest';

import { brainstormIdeas } from '../../cli/ideation/idea-engine.js';
import type { ScoredIdea } from '../../cli/ideation/types.js';
import type { CompetitionAnalysis } from '../../cli/pipeline/types.js';
import { analyzeFeasibility } from '../../cli/product-intelligence/feasibility.js';
import { simulateJudges } from '../../cli/product-intelligence/judge-sim.js';
import { extractJudgingPriorities } from '../../cli/product-intelligence/judging.js';
import { analyzeViability } from '../../cli/product-intelligence/viability.js';

function mockAnalysis(): CompetitionAnalysis {
  return {
    analysisId: 'ca-unit',
    challenge: {
      title: 'AI for Good Hackathon',
      problemStatement: 'Build AI solutions for social impact',
      theme: 'AI for Good',
      difficulty: 'intermediate',
      estimatedParticipants: 200,
      organizer: 'TestOrg',
    },
    judgingCriteria: [
      { name: 'Innovation', weight: 40, weightRaw: '40%', description: 'Originality', priority: 'critical' },
      { name: 'Technical Depth', weight: 30, weightRaw: '30%', description: 'Sophistication', priority: 'high' },
      { name: 'Social Impact', weight: 30, weightRaw: '30%', description: 'Impact', priority: 'high' },
    ],
    sponsorAPIs: [
      { name: 'OpenAI', provider: 'OpenAI', description: 'GPT models', strategicValue: 'must_use' },
    ],
    deliverables: [],
    restrictions: [],
    deadlines: [],
  };
}

function firstIdea(): ScoredIdea {
  return brainstormIdeas(mockAnalysis()).winner;
}

describe('analyzeViability', () => {
  it('returns 1-10 dimensions and a 0-100 total', () => {
    const v = analyzeViability(firstIdea(), mockAnalysis());
    for (const key of ['marketSize', 'urgency', 'monetization', 'moat', 'acquisition'] as const) {
      expect(v[key]).toBeGreaterThanOrEqual(1);
      expect(v[key]).toBeLessThanOrEqual(10);
    }
    expect(v.total).toBeGreaterThanOrEqual(0);
    expect(v.total).toBeLessThanOrEqual(100);
    expect(v.businessModel.length).toBeGreaterThan(0);
    expect(v.monetizationPath.length).toBeGreaterThan(0);
    expect(v.summary.length).toBeGreaterThan(20);
  });

  it('is deterministic', () => {
    const idea = firstIdea();
    expect(analyzeViability(idea, mockAnalysis())).toEqual(analyzeViability(idea, mockAnalysis()));
  });
});

describe('analyzeFeasibility', () => {
  it('returns buildable dimensions and an hour estimate', () => {
    const f = analyzeFeasibility(firstIdea(), mockAnalysis(), 'balanced');
    expect(f.buildability).toBeGreaterThanOrEqual(1);
    expect(f.dependencyRisk).toBeGreaterThanOrEqual(1);
    expect(f.scopeRisk).toBeGreaterThanOrEqual(1);
    expect(f.dataComplexity).toBeGreaterThanOrEqual(1);
    expect(f.estimateHours).toBeGreaterThanOrEqual(4);
    expect(f.total).toBeGreaterThan(0);
  });

  it('aggressive budget yields a larger estimate than minimal', () => {
    const idea = firstIdea();
    const analysis = mockAnalysis();
    const minimal = analyzeFeasibility(idea, analysis, 'minimal');
    const aggressive = analyzeFeasibility(idea, analysis, 'aggressive');
    expect(minimal.estimateHours).toBeLessThanOrEqual(aggressive.estimateHours);
  });

  it('is deterministic', () => {
    const idea = firstIdea();
    const analysis = mockAnalysis();
    expect(analyzeFeasibility(idea, analysis, 'balanced')).toEqual(analyzeFeasibility(idea, analysis, 'balanced'));
  });
});

describe('simulateJudges', () => {
  it('runs a three-judge panel scoring every criterion', () => {
    const analysis = mockAnalysis();
    const idea = firstIdea();
    const priorities = extractJudgingPriorities(analysis);
    const viability = analyzeViability(idea, analysis);
    const feasibility = analyzeFeasibility(idea, analysis, 'balanced');

    const sim = simulateJudges(idea, priorities, viability, feasibility);
    expect(sim.judges).toHaveLength(3);
    for (const judge of sim.judges) {
      expect(judge.scores).toHaveLength(priorities.length);
      expect(judge.overall).toBeGreaterThan(0);
      expect(judge.overall).toBeLessThanOrEqual(100);
      expect(judge.verdict).toContain(judge.name);
    }
    expect(sim.total).toBeGreaterThan(0);
    expect(sim.total).toBeLessThanOrEqual(100);
    expect(sim.summary).toContain('Panel verdict');
  });

  it('judges specialize — the engineer weights technical criteria higher', () => {
    const analysis = mockAnalysis();
    const idea = firstIdea();
    const priorities = extractJudgingPriorities(analysis);
    const viability = analyzeViability(idea, analysis);
    const feasibility = analyzeFeasibility(idea, analysis, 'balanced');
    const sim = simulateJudges(idea, priorities, viability, feasibility);

    const engineer = sim.judges.find((j) => j.name === 'The Engineer')!;
    const techCriterion = priorities.findIndex((p) => p.focus === 'technical');
    expect(techCriterion).toBeGreaterThanOrEqual(0);
    expect(engineer.scores[techCriterion]!.score).toBeGreaterThanOrEqual(1);
  });

  it('is deterministic', () => {
    const analysis = mockAnalysis();
    const idea = firstIdea();
    const priorities = extractJudgingPriorities(analysis);
    const viability = analyzeViability(idea, analysis);
    const feasibility = analyzeFeasibility(idea, analysis, 'balanced');
    const a = simulateJudges(idea, priorities, viability, feasibility);
    const b = simulateJudges(idea, priorities, viability, feasibility);
    expect(a).toEqual(b);
  });
});

describe('criterionFocus', () => {
  it('maps criterion names to reward dimensions', async () => {
    const { criterionFocus } = await import('../../cli/product-intelligence/judging.js');
    expect(criterionFocus('Innovation')).toBe('wow');
    expect(criterionFocus('Technical Complexity')).toBe('technical');
    expect(criterionFocus('Social Impact')).toBe('impact');
    expect(criterionFocus('UI/UX Design')).toBe('design');
  });
});

describe('edge cases — minimal challenge data', () => {
  function minimalAnalysis(): CompetitionAnalysis {
    return {
      analysisId: 'ca-min',
      challenge: {
        title: 'Minimal',
        problemStatement: '',
        theme: '',
        difficulty: 'beginner',
        estimatedParticipants: 0,
        organizer: '',
      },
      judgingCriteria: [],
      sponsorAPIs: [],
      deliverables: [],
      restrictions: [],
      deadlines: [],
    };
  }

  it('extractJudgingPriorities degrades to an empty list', () => {
    expect(extractJudgingPriorities(minimalAnalysis())).toEqual([]);
  });

  it('extractSponsorOpportunities degrades to an empty list', async () => {
    const { extractSponsorOpportunities } = await import('../../cli/product-intelligence/judging.js');
    expect(extractSponsorOpportunities(minimalAnalysis())).toEqual([]);
  });

  it('viability still scores with no problem statement and no sponsors', () => {
    const idea = brainstormIdeas(minimalAnalysis()).winner;
    const v = analyzeViability(idea, minimalAnalysis());
    expect(v.total).toBeGreaterThan(0);
    expect(v.total).toBeLessThanOrEqual(100);
    expect(v.monetizationPath.length).toBeGreaterThan(0);
  });

  it('judge panel falls back to default priorities when no criteria are listed', () => {
    const idea = brainstormIdeas(minimalAnalysis()).winner;
    const priorities = extractJudgingPriorities(minimalAnalysis());
    const viability = analyzeViability(idea, minimalAnalysis());
    const feasibility = analyzeFeasibility(idea, minimalAnalysis(), 'balanced');

    const sim = simulateJudges(idea, priorities, viability, feasibility);
    expect(sim.judges).toHaveLength(3);
    for (const judge of sim.judges) {
      // Falls back to the 3 default priorities (Innovation/Technical/Impact).
      expect(judge.scores.length).toBeGreaterThanOrEqual(3);
      expect(judge.overall).toBeGreaterThan(0);
    }
    expect(sim.total).toBeGreaterThan(0);
    expect(sim.total).toBeLessThanOrEqual(100);
  });
});
