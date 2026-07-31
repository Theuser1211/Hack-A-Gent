import { describe, it, expect } from 'vitest';
import { validateStageInput } from '../../cli/pipeline/stage-guards.js';

describe('validateStageInput', () => {
  it('rejects empty project name', () => {
    const result = validateStageInput('ProjectGeneration', { projectName: '' });
    expect(result.valid).toBe(false);
    expect(result.stage).toBe('ProjectGeneration');
    expect(result.error).toContain('Project name');
  });

  it('rejects empty hackathon title', () => {
    const result = validateStageInput('ChallengeAnalysis', { title: '' });
    expect(result.valid).toBe(false);
    expect(result.stage).toBe('ChallengeAnalysis');
    expect(result.error).toContain('title');
  });

  it('rejects UNKNOWN qualification', () => {
    const result = validateStageInput('ProjectGeneration', {
      projectName: 'test',
      title: 'Test',
      qualification: 'UNKNOWN',
    });
    expect(result.valid).toBe(false);
    expect(result.stage).toBe('ProjectGeneration');
    expect(result.error).toContain('qualification');
  });

  it('accepts valid project generation input', () => {
    const result = validateStageInput('ProjectGeneration', {
      projectName: 'visionforge',
      title: 'AI Hackathon 2026',
      qualification: 'SUPPORTED',
    });
    expect(result.valid).toBe(true);
  });

  it('rejects empty title for strategy', () => {
    const result = validateStageInput('WinningStrategy', {
      title: '',
      judgingCriteria: ['Innovation'],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('title');
  });

  it('rejects missing judging criteria', () => {
    const result = validateStageInput('WinningStrategy', {
      title: 'AI Hackathon 2026',
      judgingCriteria: [],
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Judging criteria');
  });

  it('accepts valid winning strategy input', () => {
    const result = validateStageInput('WinningStrategy', {
      title: 'AI Hackathon 2026',
      judgingCriteria: ['Innovation', 'Technical Complexity'],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects empty improvement target', () => {
    const result = validateStageInput('ImprovementPass', {
      projectName: '',
      currentScore: 80,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Project name');
  });

  it('rejects out-of-range score', () => {
    const result = validateStageInput('ImprovementPass', {
      projectName: 'test',
      currentScore: 150,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid current score');
  });

  it('accepts valid improvement pass input', () => {
    const result = validateStageInput('ImprovementPass', {
      projectName: 'visionforge',
      currentScore: 75,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects low judge score for submission', () => {
    const result = validateStageInput('SubmissionPackage', {
      projectName: 'test',
      judgeScore: 30,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('below minimum threshold');
  });

  it('accepts valid submission input', () => {
    const result = validateStageInput('SubmissionPackage', {
      projectName: 'test',
      judgeScore: 80,
    });
    expect(result.valid).toBe(true);
  });

  it('rejects empty project name for internal judge', () => {
    const result = validateStageInput('InternalJudge', { projectName: '' });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Project name');
  });

  it('accepts valid internal judge input', () => {
    const result = validateStageInput('InternalJudge', { projectName: 'test' });
    expect(result.valid).toBe(true);
  });

  it('passes unknown stages through', () => {
    const result = validateStageInput('UnknownStage', {});
    expect(result.valid).toBe(true);
  });
});
