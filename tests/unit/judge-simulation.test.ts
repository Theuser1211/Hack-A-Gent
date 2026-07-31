import { describe, it, expect } from 'vitest';

/**
 * Judge Simulation Scoring Tests
 * 
 * Each project is scored by three independent judges across 7 dimensions:
 * - Innovation: Novel approach, unique technical solution
 * - Technical Difficulty: Real API integration, complex state, data processing
 * - Execution: Fully working demo, no placeholder content
 * - Design: Polished UI, consistent typography, spacing, color
 * - Completeness: All features working, error handling, edge cases
 * - Presentation: README quality, demo narrative, talking points
 * - Overall: Weighted average of above
 */

interface JudgeScore {
  innovation: number;
  technicalDifficulty: number;
  execution: number;
  design: number;
  completeness: number;
  presentation: number;
  overall: number;
}

interface Judge {
  name: string;
  bias: 'technical' | 'design' | 'business';
}

const JUDGES: Judge[] = [
  { name: 'Judge A (Technical)', bias: 'technical' },
  { name: 'Judge B (Design)', bias: 'design' },
  { name: 'Judge C (Business)', bias: 'business' },
];

function scoreProject(
  project: {
    hasRealAPI: boolean;
    hasErrorHandling: boolean;
    hasLoadingStates: boolean;
    hasResponsiveDesign: boolean;
    hasWorkingDemo: boolean;
    hasREADME: boolean;
    hasJudgingAlignment: boolean;
    hasSponsorIntegration: boolean;
    hasUniqueApproach: boolean;
    hasPolishedUI: boolean;
  },
  judge: Judge,
): JudgeScore {
  const weights = {
    technical: { innovation: 0.2, technicalDifficulty: 0.3, execution: 0.2, design: 0.1, completeness: 0.1, presentation: 0.1 },
    design: { innovation: 0.15, technicalDifficulty: 0.1, execution: 0.15, design: 0.35, completeness: 0.1, presentation: 0.15 },
    business: { innovation: 0.25, technicalDifficulty: 0.1, execution: 0.2, design: 0.15, completeness: 0.15, presentation: 0.15 },
  };

  const w = weights[judge.bias];

  const innovation = (project.hasUniqueApproach ? 80 : 40) + (project.hasSponsorIntegration ? 15 : 0);
  const technicalDifficulty = (project.hasRealAPI ? 85 : 30) + (project.hasErrorHandling ? 15 : 0);
  const execution = (project.hasWorkingDemo ? 90 : 20) + (project.hasLoadingStates ? 10 : 0);
  const design = (project.hasPolishedUI ? 85 : 35) + (project.hasResponsiveDesign ? 15 : 0);
  const completeness = (project.hasErrorHandling ? 70 : 30) + (project.hasLoadingStates ? 15 : 0) + (project.hasWorkingDemo ? 15 : 0);
  const presentation = (project.hasREADME ? 70 : 20) + (project.hasJudgingAlignment ? 30 : 0);

  const overall = Math.round(
    innovation * w.innovation +
    technicalDifficulty * w.technicalDifficulty +
    execution * w.execution +
    design * w.design +
    completeness * w.completeness +
    presentation * w.presentation
  );

  return {
    innovation: Math.min(100, innovation),
    technicalDifficulty: Math.min(100, technicalDifficulty),
    execution: Math.min(100, execution),
    design: Math.min(100, design),
    completeness: Math.min(100, completeness),
    presentation: Math.min(100, presentation),
    overall: Math.min(100, overall),
  };
}

function averageScores(scores: JudgeScore[]): JudgeScore {
  return {
    innovation: Math.round(scores.reduce((sum, s) => sum + s.innovation, 0) / scores.length),
    technicalDifficulty: Math.round(scores.reduce((sum, s) => sum + s.technicalDifficulty, 0) / scores.length),
    execution: Math.round(scores.reduce((sum, s) => sum + s.execution, 0) / scores.length),
    design: Math.round(scores.reduce((sum, s) => sum + s.design, 0) / scores.length),
    completeness: Math.round(scores.reduce((sum, s) => sum + s.completeness, 0) / scores.length),
    presentation: Math.round(scores.reduce((sum, s) => sum + s.presentation, 0) / scores.length),
    overall: Math.round(scores.reduce((sum, s) => sum + s.overall, 0) / scores.length),
  };
}

describe('Judge Simulation', () => {
  describe('High-Quality Project', () => {
    it('scores above 8/10 average across all judges', () => {
      const project = {
        hasRealAPI: true,
        hasErrorHandling: true,
        hasLoadingStates: true,
        hasResponsiveDesign: true,
        hasWorkingDemo: true,
        hasREADME: true,
        hasJudgingAlignment: true,
        hasSponsorIntegration: true,
        hasUniqueApproach: true,
        hasPolishedUI: true,
      };

      const allScores = JUDGES.map(judge => scoreProject(project, judge));
      const average = averageScores(allScores);

      expect(average.overall).toBeGreaterThanOrEqual(80);
      expect(average.innovation).toBeGreaterThanOrEqual(75);
      expect(average.technicalDifficulty).toBeGreaterThanOrEqual(80);
      expect(average.execution).toBeGreaterThanOrEqual(85);
      expect(average.design).toBeGreaterThanOrEqual(80);
    });
  });

  describe('Medium-Quality Project', () => {
    it('scores between 5/10 and 8/10', () => {
      const project = {
        hasRealAPI: false,
        hasErrorHandling: true,
        hasLoadingStates: false,
        hasResponsiveDesign: true,
        hasWorkingDemo: true,
        hasREADME: true,
        hasJudgingAlignment: false,
        hasSponsorIntegration: false,
        hasUniqueApproach: true,
        hasPolishedUI: false,
      };

      const allScores = JUDGES.map(judge => scoreProject(project, judge));
      const average = averageScores(allScores);

      expect(average.overall).toBeGreaterThanOrEqual(50);
      expect(average.overall).toBeLessThan(80);
    });
  });

  describe('Low-Quality Project', () => {
    it('scores below 5/10 average', () => {
      const project = {
        hasRealAPI: false,
        hasErrorHandling: false,
        hasLoadingStates: false,
        hasResponsiveDesign: false,
        hasWorkingDemo: false,
        hasREADME: false,
        hasJudgingAlignment: false,
        hasSponsorIntegration: false,
        hasUniqueApproach: false,
        hasPolishedUI: false,
      };

      const allScores = JUDGES.map(judge => scoreProject(project, judge));
      const average = averageScores(allScores);

      expect(average.overall).toBeLessThan(50);
    });
  });

  describe('Judge Consistency', () => {
    it('all judges agree on high-quality projects', () => {
      const project = {
        hasRealAPI: true,
        hasErrorHandling: true,
        hasLoadingStates: true,
        hasResponsiveDesign: true,
        hasWorkingDemo: true,
        hasREADME: true,
        hasJudgingAlignment: true,
        hasSponsorIntegration: true,
        hasUniqueApproach: true,
        hasPolishedUI: true,
      };

      const allScores = JUDGES.map(judge => scoreProject(project, judge));
      const allAbove80 = allScores.every(s => s.overall >= 80);

      expect(allAbove80).toBe(true);
    });

    it('all judges agree on low-quality projects', () => {
      const project = {
        hasRealAPI: false,
        hasErrorHandling: false,
        hasLoadingStates: false,
        hasResponsiveDesign: false,
        hasWorkingDemo: false,
        hasREADME: false,
        hasJudgingAlignment: false,
        hasSponsorIntegration: false,
        hasUniqueApproach: false,
        hasPolishedUI: false,
      };

      const allScores = JUDGES.map(judge => scoreProject(project, judge));
      const allBelow50 = allScores.every(s => s.overall < 50);

      expect(allBelow50).toBe(true);
    });
  });

  describe('Feature Impact', () => {
    it('real API integration boosts technical difficulty significantly', () => {
      const withAPI = scoreProject(
        { hasRealAPI: true, hasErrorHandling: false, hasLoadingStates: false, hasResponsiveDesign: false, hasWorkingDemo: false, hasREADME: false, hasJudgingAlignment: false, hasSponsorIntegration: false, hasUniqueApproach: false, hasPolishedUI: false },
        JUDGES[0],
      );
      const withoutAPI = scoreProject(
        { hasRealAPI: false, hasErrorHandling: false, hasLoadingStates: false, hasResponsiveDesign: false, hasWorkingDemo: false, hasREADME: false, hasJudgingAlignment: false, hasSponsorIntegration: false, hasUniqueApproach: false, hasPolishedUI: false },
        JUDGES[0],
      );

      expect(withAPI.technicalDifficulty).toBeGreaterThan(withoutAPI.technicalDifficulty);
    });

    it('working demo boosts execution significantly', () => {
      const withDemo = scoreProject(
        { hasRealAPI: false, hasErrorHandling: false, hasLoadingStates: false, hasResponsiveDesign: false, hasWorkingDemo: true, hasREADME: false, hasJudgingAlignment: false, hasSponsorIntegration: false, hasUniqueApproach: false, hasPolishedUI: false },
        JUDGES[0],
      );
      const withoutDemo = scoreProject(
        { hasRealAPI: false, hasErrorHandling: false, hasLoadingStates: false, hasResponsiveDesign: false, hasWorkingDemo: false, hasREADME: false, hasJudgingAlignment: false, hasSponsorIntegration: false, hasUniqueApproach: false, hasPolishedUI: false },
        JUDGES[0],
      );

      expect(withDemo.execution).toBeGreaterThan(withoutDemo.execution);
    });

    it('polished UI boosts design significantly', () => {
      const withUI = scoreProject(
        { hasRealAPI: false, hasErrorHandling: false, hasLoadingStates: false, hasResponsiveDesign: false, hasWorkingDemo: false, hasREADME: false, hasJudgingAlignment: false, hasSponsorIntegration: false, hasUniqueApproach: false, hasPolishedUI: true },
        JUDGES[0],
      );
      const withoutUI = scoreProject(
        { hasRealAPI: false, hasErrorHandling: false, hasLoadingStates: false, hasResponsiveDesign: false, hasWorkingDemo: false, hasREADME: false, hasJudgingAlignment: false, hasSponsorIntegration: false, hasUniqueApproach: false, hasPolishedUI: false },
        JUDGES[0],
      );

      expect(withUI.design).toBeGreaterThan(withoutUI.design);
    });
  });
});
