import { describe, it, expect } from 'vitest';
import { validateInput } from '../../cli/validation/input-validator.js';
import { validateStageInput } from '../../cli/pipeline/stage-guards.js';
import { ImprovementInstrumentor, generateProjectName } from '../../cli/improvement/improvement-instrumentor.js';
import { PipelineTimer } from '../../cli/pipeline/timing.js';

describe('Release Regression Tests', () => {
  describe('Input Validation (Task 1)', () => {
    it('rejects empty input', () => {
      const result = validateInput('');
      expect(result.valid).toBe(false);
      expect(result.state).toBe('INVALID_INPUT');
    });

    it('rejects single-word gibberish', () => {
      const result = validateInput('hello');
      expect(result.valid).toBe(false);
    });

    it('rejects numeric input', () => {
      const result = validateInput('123');
      expect(result.valid).toBe(false);
    });

    it('rejects random text', () => {
      const result = validateInput('asdf');
      expect(result.valid).toBe(false);
    });

    it('rejects google.com', () => {
      const result = validateInput('https://google.com');
      expect(result.valid).toBe(false);
      expect(result.state).toBe('NOT_A_HACKATHON');
    });

    it('rejects github.com', () => {
      const result = validateInput('https://github.com');
      expect(result.valid).toBe(false);
      expect(result.state).toBe('NOT_A_HACKATHON');
    });

    it('rejects stackoverflow.com', () => {
      const result = validateInput('https://stackoverflow.com');
      expect(result.valid).toBe(false);
      expect(result.state).toBe('NOT_A_HACKATHON');
    });

    it('rejects reddit.com', () => {
      const result = validateInput('https://reddit.com');
      expect(result.valid).toBe(false);
      expect(result.state).toBe('NOT_A_HACKATHON');
    });

    it('rejects youtube.com', () => {
      const result = validateInput('https://youtube.com');
      expect(result.valid).toBe(false);
      expect(result.state).toBe('NOT_A_HACKATHON');
    });

    it('accepts devpost.com URLs', () => {
      const result = validateInput('https://example.devpost.com');
      expect(result.valid).toBe(true);
      expect(result.state).toBe('SUPPORTED');
    });

    it('accepts hackathon-related URLs', () => {
      const result = validateInput('https://example.com/hackathon-2026');
      expect(result.valid).toBe(true);
      expect(result.state).toBe('SUPPORTED');
    });

    it('accepts text specifications', () => {
      const result = validateInput('Build a chatbot for healthcare');
      expect(result.valid).toBe(true);
      expect(result.state).toBe('SUPPORTED');
    });
  });

  describe('Pipeline Guards (Task 2)', () => {
    it('rejects empty project name', () => {
      const result = validateStageInput('ProjectGeneration', { projectName: '' });
      expect(result.valid).toBe(false);
    });

    it('rejects empty title', () => {
      const result = validateStageInput('ChallengeAnalysis', { title: '' });
      expect(result.valid).toBe(false);
    });

    it('rejects UNKNOWN qualification', () => {
      const result = validateStageInput('ProjectGeneration', { qualification: 'UNKNOWN' });
      expect(result.valid).toBe(false);
    });

    it('accepts valid inputs', () => {
      const result = validateStageInput('ProjectGeneration', {
        projectName: 'visionforge',
        title: 'AI Hackathon 2026',
        qualification: 'SUPPORTED',
      });
      expect(result.valid).toBe(true);
    });
  });

  describe('Improvement Pass (Task 3)', () => {
    it('respects max iterations', () => {
      const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
      const decision = instrumentor.shouldStop(5, 2);
      expect(decision).toBe('max_iterations');
    });

    it('detects plateau', () => {
      const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
      const decision = instrumentor.shouldStop(0, 1);
      expect(decision).toBe('converged');
    });

    it('detects time budget exhaustion', () => {
      const instrumentor = new ImprovementInstrumentor(100, 50);
      instrumentor.t0 = Date.now() - 200;
      expect(instrumentor.ranOutOfTime).toBe(true);
    });

    it('builds summary correctly', () => {
      const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
      instrumentor.startIteration(1, 80);
      instrumentor.endIteration(85, 'continue', 'improving');
      const summary = instrumentor.buildSummary(80, 85, 'completed');
      expect(summary.iterations).toHaveLength(1);
      expect(summary.initialScore).toBe(80);
      expect(summary.finalScore).toBe(85);
    });
  });

  describe('Project Naming (Task 5)', () => {
    it('generates consistent names', () => {
      const result1 = generateProjectName('Test Hackathon', 'AI');
      const result2 = generateProjectName('Test Hackathon', 'AI');
      expect(result1.displayName).toBe(result2.displayName);
    });

    it('generates startup-style names', () => {
      const result = generateProjectName('Healthcare AI Challenge', 'Healthcare');
      expect(result.displayName.length).toBeGreaterThan(4);
      expect(result.displayName.length).toBeLessThan(15);
    });

    it('handles undefined inputs', () => {
      const result = generateProjectName(undefined as unknown as string, undefined);
      expect(result.displayName).toBeTruthy();
    });
  });

  describe('Pipeline Timer (Task 4)', () => {
    it('tracks stage timing', () => {
      const timer = new PipelineTimer();
      timer.start('Test Stage');
      timer.end('Test Stage', 'completed');
      expect(typeof timer.getDuration('Test Stage')).toBe('number');
      expect(timer.getStatus('Test Stage')).toBe('completed');
    });

    it('formats timing output', () => {
      const timer = new PipelineTimer();
      timer.start('Test Stage');
      timer.end('Test Stage', 'completed');
      const formatted = timer.format();
      expect(formatted).toContain('Test Stage');
      expect(formatted).toContain('\u2713');
    });
  });

  describe('Timeout Recovery', () => {
    it('instrumentor handles zero budget', () => {
      const instrumentor = new ImprovementInstrumentor(0, 0);
      expect(instrumentor.ranOutOfTime).toBe(true);
      expect(instrumentor.iterRanOutOfTime).toBe(true);
    });

    it('instrumentor handles negative budget', () => {
      const instrumentor = new ImprovementInstrumentor(-1000, -1000);
      expect(instrumentor.ranOutOfTime).toBe(true);
    });
  });
});
