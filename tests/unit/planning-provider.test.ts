import { describe, it, expect } from 'vitest';

import { MockPlanningProvider } from '../../kernel/planning/planning-provider.js';

describe('MockPlanningProvider', () => {
  const provider = new MockPlanningProvider();

  describe('ingestHackathon', () => {
    it('extracts name from Devpost URL', async () => {
      const data = await provider.ingestHackathon({
        hackathon_url: 'https://example-hackathon.devpost.com',
      });
      expect(data.hackathon_name).toBe('Example Hackathon');
    });

    it('uses first line of description as fallback name', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Summer Hackathon 2026\nBuild something cool',
      });
      expect(data.hackathon_name).toBe('Summer Hackathon 2026');
    });

    it('returns default name for empty input', async () => {
      const data = await provider.ingestHackathon({});
      expect(data.hackathon_name).toBe('Untitled Hackathon');
    });

    it('extracts theme from description', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Theme: Artificial Intelligence\nBuild AI solutions',
      });
      expect(data.theme).toBe('Artificial Intelligence');
    });

    it('extracts deadline from description', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Deadline: June 30, 2026',
      });
      expect(data.timeline?.submission_deadline).toBe('June 30, 2026');
    });

    it('returns default tracks and judging criteria', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Test hackathon',
      });
      expect(data.tracks.length).toBeGreaterThanOrEqual(3);
      expect(data.judging_criteria.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('generateProjectIdeas', () => {
    it('returns 5 project ideas', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Theme: Climate\nDeadline: July 1',
      });
      const ideas = await provider.generateProjectIdeas(data);
      expect(ideas).toHaveLength(5);
    });

    it('each idea has required fields', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Theme: Health',
      });
      const ideas = await provider.generateProjectIdeas(data);

      for (const idea of ideas) {
        expect(idea.id).toBeDefined();
        expect(idea.title).toBeDefined();
        expect(idea.description).toBeDefined();
        expect(idea.difficulty).toBeGreaterThanOrEqual(1);
        expect(idea.difficulty).toBeLessThanOrEqual(10);
        expect(idea.innovation).toBeGreaterThanOrEqual(1);
        expect(idea.innovation).toBeLessThanOrEqual(10);
        expect(idea.estimated_build_time_hours).toBeGreaterThan(0);
        expect(idea.key_features.length).toBeGreaterThan(0);
        expect(idea.required_skills.length).toBeGreaterThan(0);
      }
    });

    it('incorporates theme into idea titles', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Theme: Robotics',
      });
      const ideas = await provider.generateProjectIdeas(data);
      for (const idea of ideas) {
        expect(idea.title.toLowerCase()).toContain('robotics');
      }
    });

    it('ranges difficulty from 5 to 9', async () => {
      const data = await provider.ingestHackathon({
        hackathon_description: 'Test hackathon',
      });
      const ideas = await provider.generateProjectIdeas(data);
      const difficulties = ideas.map((i) => i.difficulty);
      expect(Math.min(...difficulties)).toBeGreaterThanOrEqual(5);
      expect(Math.max(...difficulties)).toBeLessThanOrEqual(9);
    });
  });

  describe('assessRisks', () => {
    it('returns 4 risks', async () => {
      const data = await provider.ingestHackathon({ hackathon_description: 'Test' });
      const ideas = await provider.generateProjectIdeas(data);
      const risks = await provider.assessRisks(data, ideas);
      expect(risks).toHaveLength(4);
    });

    it('each risk has valid category and severity', async () => {
      const data = await provider.ingestHackathon({ hackathon_description: 'Test' });
      const ideas = await provider.generateProjectIdeas(data);
      const risks = await provider.assessRisks(data, ideas);

      for (const risk of risks) {
        expect(['technical', 'time', 'scope', 'team', 'sponsor', 'external']).toContain(risk.category);
        expect(['low', 'medium', 'high']).toContain(risk.severity);
      }
    });
  });

  describe('identifyUnknowns', () => {
    it('returns 6 unknowns', async () => {
      const data = await provider.ingestHackathon({ hackathon_description: 'Test' });
      const ideas = await provider.generateProjectIdeas(data);
      const unknowns = await provider.identifyUnknowns(data, ideas);
      expect(unknowns).toHaveLength(6);
    });

    it('each unknown has impact level', async () => {
      const data = await provider.ingestHackathon({ hackathon_description: 'Test' });
      const ideas = await provider.generateProjectIdeas(data);
      const unknowns = await provider.identifyUnknowns(data, ideas);

      for (const u of unknowns) {
        expect(['low', 'medium', 'high']).toContain(u.impact);
        expect(u.category).toBeDefined();
        expect(u.question).toBeDefined();
      }
    });
  });

  describe('generateQuestions', () => {
    it('returns 5 questions', async () => {
      const data = await provider.ingestHackathon({ hackathon_description: 'Test' });
      const ideas = await provider.generateProjectIdeas(data);
      const unknowns = await provider.identifyUnknowns(data, ideas);
      const questions = await provider.generateQuestions(unknowns);

      expect(questions).toHaveLength(5);
    });

    it('each question has valid priority', async () => {
      const data = await provider.ingestHackathon({ hackathon_description: 'Test' });
      const ideas = await provider.generateProjectIdeas(data);
      const unknowns = await provider.identifyUnknowns(data, ideas);
      const questions = await provider.generateQuestions(unknowns);

      for (const q of questions) {
        expect(['essential', 'recommended', 'nice_to_have']).toContain(q.priority);
        expect(q.id).toBeDefined();
        expect(q.question).toBeDefined();
      }
    });
  });
});
