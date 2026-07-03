import { describe, it, expect } from 'vitest';

import {
  HackathonInputSchema,
  UserPreferencesSchema,
  HackathonDataSchema,
  ProjectIdeaSchema,
  RiskSchema,
  UnknownSchema,
  RecommendedQuestionSchema,
  PlannerOutputSchema,
} from '../../kernel/planning/planner-types.js';

describe('Planner Types', () => {
  describe('UserPreferencesSchema', () => {
    it('accepts valid preferences', () => {
      const prefs = UserPreferencesSchema.parse({
        team_size: 'solo',
        platform: 'web',
        experience: 'intermediate',
        preferred_stack: ['typescript', 'react'],
        sponsor_apis_allowed: true,
      });
      expect(prefs.team_size).toBe('solo');
      expect(prefs.platform).toBe('web');
    });

    it('accepts partial preferences', () => {
      const prefs = UserPreferencesSchema.parse({
        experience: 'advanced',
      });
      expect(prefs.experience).toBe('advanced');
    });
  });

  describe('HackathonInputSchema', () => {
    it('accepts URL input', () => {
      const input = HackathonInputSchema.parse({
        hackathon_url: 'https://example-hackathon.devpost.com',
      });
      expect(input.hackathon_url).toBe('https://example-hackathon.devpost.com');
    });

    it('accepts description input', () => {
      const input = HackathonInputSchema.parse({
        hackathon_description: 'Build something amazing for social good',
      });
      expect(input.hackathon_description).toBe('Build something amazing for social good');
    });
  });

  describe('HackathonDataSchema', () => {
    it('accepts valid hackathon data', () => {
      const data = HackathonDataSchema.parse({
        hackathon_name: 'Test Hackathon',
        theme: 'AI',
        tracks: [{ name: 'General', description: 'Open track' }],
        judging_criteria: [{ name: 'Creativity', weight: 50 }],
        sponsor_technologies: [{ sponsor_name: 'Test', technology: 'API' }],
        submission_requirements: [{ category: 'Code', description: 'GitHub link', required: true }],
      });
      expect(data.hackathon_name).toBe('Test Hackathon');
      expect(data.tracks).toHaveLength(1);
    });
  });

  describe('ProjectIdeaSchema', () => {
    it('accepts valid project idea', () => {
      const idea = ProjectIdeaSchema.parse({
        id: 'idea-001',
        title: 'AI Assistant',
        description: 'An AI assistant',
        difficulty: 5,
        innovation: 7,
        estimated_build_time_hours: 24,
        risks: ['Complexity'],
        key_features: ['NLP'],
        required_skills: ['TypeScript'],
      });
      expect(idea.title).toBe('AI Assistant');
      expect(idea.difficulty).toBe(5);
    });

    it('rejects out-of-range difficulty', () => {
      expect(() =>
        ProjectIdeaSchema.parse({
          id: 'idea-002',
          title: 'Bad Idea',
          description: 'Too hard',
          difficulty: 15,
          innovation: 5,
          estimated_build_time_hours: 10,
          risks: [],
          key_features: [],
          required_skills: [],
        }),
      ).toThrow();
    });
  });

  describe('RiskSchema', () => {
    it('accepts valid risk', () => {
      const risk = RiskSchema.parse({
        category: 'technical',
        description: 'Complex API integration',
        severity: 'medium',
        mitigation: 'Start early',
      });
      expect(risk.category).toBe('technical');
    });
  });

  describe('UnknownSchema', () => {
    it('accepts valid unknown', () => {
      const unknown = UnknownSchema.parse({
        category: 'team',
        question: 'Solo or team?',
        impact: 'high',
      });
      expect(unknown.impact).toBe('high');
    });
  });

  describe('RecommendedQuestionSchema', () => {
    it('accepts valid question', () => {
      const q = RecommendedQuestionSchema.parse({
        id: 'q-001',
        question: 'What stack?',
        context: 'Helps narrow tech choices',
        priority: 'essential',
      });
      expect(q.priority).toBe('essential');
    });
  });

  describe('PlannerOutputSchema', () => {
    it('accepts complete planner output', () => {
      const output = PlannerOutputSchema.parse({
        summary: 'Planning complete',
        hackathon_data: {
          hackathon_name: 'Test Hackathon',
          tracks: [],
          judging_criteria: [],
          sponsor_technologies: [],
          submission_requirements: [],
        },
        project_ideas: [],
        risks: [],
        assumptions: ['Assumption 1'],
        unknowns: [],
        recommended_questions: [],
        generated_at: new Date().toISOString(),
        planner_version: '1.0.0',
      });
      expect(output.summary).toBe('Planning complete');
      expect(output.project_ideas).toEqual([]);
    });
  });
});
