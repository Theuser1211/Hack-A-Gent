import { describe, it, expect } from 'vitest';

import { generateQuestions } from '../../cli/interview/question-generator.js';
import type { CompetitionAnalysis } from '../../cli/pipeline/types.js';

function mockAnalysis(overrides?: Partial<CompetitionAnalysis>): CompetitionAnalysis {
  return {
    analysisId: 'ca-test',
    challenge: {
      title: 'Test Hackathon',
      problemStatement: 'Build something awesome',
      theme: 'AI',
      difficulty: 'intermediate',
      estimatedParticipants: 100,
      organizer: 'TestOrg',
    },
    judgingCriteria: [
      { name: 'Innovation', weight: 40, weightRaw: '40%', description: 'Originality', priority: 'critical' },
      { name: 'Technical', weight: 30, weightRaw: '30%', description: 'Depth', priority: 'high' },
      { name: 'Impact', weight: 30, weightRaw: '30%', description: 'Reach', priority: 'high' },
    ],
    sponsorAPIs: [],
    deliverables: [],
    restrictions: [],
    deadlines: [],
    extractionConfidence: {
      title: { value: 'Test Hackathon', confidence: 'confirmed' },
      judgingCriteria: { value: [], confidence: 'confirmed' },
      sponsorAPIs: { value: [], confidence: 'unknown' },
      organizer: { value: 'TestOrg', confidence: 'confirmed' },
      techStack: { value: [], confidence: 'unknown' },
      restrictions: { value: [], confidence: 'unknown' },
      deadlines: { value: [], confidence: 'unknown' },
    },
    ...overrides,
  };
}

function mockAnalysisWithConfirmedSponsors(overrides?: Partial<CompetitionAnalysis>): CompetitionAnalysis {
  return {
    ...mockAnalysis(overrides),
    extractionConfidence: {
      ...mockAnalysis(overrides).extractionConfidence,
      sponsorAPIs: { value: ['OpenAI', 'Twilio'], confidence: 'confirmed' },
    },
    sponsorAPIs: [
      { name: 'OpenAI', provider: 'OpenAI', description: 'GPT models', strategicValue: 'must_use' },
      { name: 'Twilio', provider: 'Twilio', description: 'SMS APIs', strategicValue: 'should_use' },
    ],
    ...overrides,
  };
}

describe('generateQuestions', () => {
  it('generates team size, hours, budget and idea questions when no sponsors', () => {
    const analysis = mockAnalysis();
    const questions = generateQuestions(analysis);

    expect(questions).toHaveLength(4);

    // Check question order
    expect(questions[0]!.category).toBe('team_size');
    expect(questions[1]!.category).toBe('hours_remaining');
    expect(questions[2]!.category).toBe('optimization');
    expect(questions[3]!.category).toBe('project_idea');

    // Check team size question
    const teamSizeQ = questions.find((q) => q.category === 'team_size');
    expect(teamSizeQ).toBeDefined();
    expect(teamSizeQ!.minValue).toBe(1);
    expect(teamSizeQ!.maxValue).toBe(10);
    expect(teamSizeQ!.defaultAnswer).toBe('1');

    // Check hours remaining question
    const hoursQ = questions.find((q) => q.category === 'hours_remaining');
    expect(hoursQ).toBeDefined();
    expect(hoursQ!.minValue).toBe(1);
    expect(hoursQ!.maxValue).toBe(168);
    expect(hoursQ!.defaultAnswer).toBe('5');

    // Check budget question
    const budgetQ = questions.find((q) => q.category === 'optimization');
    expect(budgetQ).toBeDefined();
    expect(budgetQ!.options).toHaveLength(3);
    expect(budgetQ!.options[0]!.value).toBe('minimal');
    expect(budgetQ!.options[2]!.value).toBe('aggressive');

    // Check project idea question
    const ideaQ = questions.find((q) => q.category === 'project_idea');
    expect(ideaQ).toBeDefined();
    expect(ideaQ!.skipLabel).toContain('Auto-generate');
  });

  it('generates sponsor question when sponsors detected with confirmed confidence', () => {
    const analysis = mockAnalysisWithConfirmedSponsors();
    const questions = generateQuestions(analysis);

    // Should have 5 questions: team_size, hours_remaining, sponsor, budget, project_idea
    expect(questions).toHaveLength(5);

    const sponsorQ = questions.find((q) => q.category === 'sponsor_selection');
    expect(sponsorQ).toBeDefined();
    expect(sponsorQ!.options).toHaveLength(2);
    expect(sponsorQ!.options[0]!.value).toBe('OpenAI');
    expect(sponsorQ!.options[1]!.value).toBe('Twilio');
    expect(sponsorQ!.options[0]!.influences.sponsorApis).toEqual(['OpenAI']);
  });

  it('does not generate sponsor question when sponsors detected but confidence is not confirmed', () => {
    const analysis = mockAnalysis({
      sponsorAPIs: [
        { name: 'OpenAI', provider: 'OpenAI', description: 'GPT models', strategicValue: 'must_use' },
        { name: 'Twilio', provider: 'Twilio', description: 'SMS APIs', strategicValue: 'should_use' },
      ],
      extractionConfidence: {
        sponsorAPIs: { value: ['OpenAI', 'Twilio'], confidence: 'inferred' }, // Not confirmed
      },
    });
    const questions = generateQuestions(analysis);

    // Should have 4 questions: team_size, hours_remaining, budget, project_idea (no sponsor question)
    expect(questions).toHaveLength(4);

    const sponsorQ = questions.find((q) => q.category === 'sponsor_selection');
    expect(sponsorQ).toBeUndefined();
  });

  it('generates tech preference from sponsor names', () => {
    const analysis = mockAnalysisWithConfirmedSponsors({
      sponsorAPIs: [
        { name: 'OpenAI', provider: 'OpenAI', description: 'GPT models', strategicValue: 'must_use' },
        { name: 'Stripe', provider: 'Stripe', description: 'Payments', strategicValue: 'nice_to_have' },
      ],
    });
    const questions = generateQuestions(analysis);

    const sponsorQ = questions.find((q) => q.category === 'sponsor_selection')!;
    expect(sponsorQ.options[0]!.influences.technologyPreference).toContain('python');
    expect(sponsorQ.options[1]!.influences.technologyPreference).toContain('nextjs');
  });

  it('puts team size, hours, budget and idea questions in correct order', () => {
    const analysis = mockAnalysis();
    const questions = generateQuestions(analysis);

    expect(questions[0]!.category).toBe('team_size');
    expect(questions[1]!.category).toBe('hours_remaining');
    expect(questions[2]!.category).toBe('optimization');
    expect(questions[3]!.category).toBe('project_idea');
  });

  it('handles empty sponsor list', () => {
    const analysis = mockAnalysis({ sponsorAPIs: [] });
    const questions = generateQuestions(analysis);

    const sponsorQ = questions.find((q) => q.category === 'sponsor_selection');
    expect(sponsorQ).toBeUndefined();
  });

  it('budget options have correct influences', () => {
    const analysis = mockAnalysis();
    const questions = generateQuestions(analysis);

    const budgetQ = questions.find((q) => q.category === 'optimization')!;
    expect(budgetQ.options[0]!.influences.optimizationBudget).toBe('minimal');
    expect(budgetQ.options[1]!.influences.optimizationBudget).toBe('balanced');
    expect(budgetQ.options[2]!.influences.optimizationBudget).toBe('aggressive');
  });

  it('project idea question has no options and supports skip', () => {
    const analysis = mockAnalysis();
    const questions = generateQuestions(analysis);

    const ideaQ = questions.find((q) => q.category === 'project_idea')!;
    expect(ideaQ.options).toHaveLength(0);
    expect(ideaQ.required).toBe(false);
    expect(ideaQ.skipLabel).toBeDefined();
    expect(ideaQ.dependsOn).toEqual([]);
  });
});
