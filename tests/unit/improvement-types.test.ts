import { describe, it, expect } from 'vitest';

describe('ImprovementAction type', () => {
  it('creates a valid add_feature action', () => {
    const action = {
      id: 'act-001',
      type: 'add_feature' as const,
      target: 'src/components/Demo.tsx',
      description: 'Add a wow-moment animation to the demo component',
      priority: 'high' as const,
      expectedScoreIncrease: 8,
      implementation: 'Add a fade-in animation using CSS keyframes on the result container',
    };
    expect(action.id).toBe('act-001');
    expect(action.type).toBe('add_feature');
    expect(action.target).toContain('Demo.tsx');
    expect(action.priority).toBe('high');
    expect(action.expectedScoreIncrease).toBeGreaterThan(0);
    expect(action.implementation.length).toBeGreaterThan(0);
  });

  it('creates a valid fix_issue action', () => {
    const action = {
      id: 'act-002',
      type: 'fix_issue' as const,
      target: 'src/app/page.tsx',
      description: 'Fix missing loading state',
      priority: 'critical' as const,
      expectedScoreIncrease: 12,
      implementation: 'Wrap the async data fetch with Suspense boundary and add a fallback loading skeleton',
    };
    expect(action.type).toBe('fix_issue');
    expect(action.priority).toBe('critical');
  });

  it('supports all action types', () => {
    const types = [
      'add_feature',
      'enhance_ui',
      'fix_issue',
      'add_docs',
      'improve_performance',
      'add_tests',
      'add_deployment',
    ] as const;
    for (const t of types) {
      const action = {
        id: `act-${t}`,
        type: t,
        target: 'some/file.tsx',
        description: `Action of type ${t}`,
        priority: 'medium' as const,
        expectedScoreIncrease: 5,
        implementation: 'do something',
      };
      expect(action.type).toBe(t);
    }
  });

  it('serializes to JSON without data loss', () => {
    const action = {
      id: 'act-003',
      type: 'add_tests' as const,
      target: 'tests/unit/Demo.test.tsx',
      description: 'Add unit tests for the Demo component',
      priority: 'low' as const,
      expectedScoreIncrease: 3,
      implementation: 'Write tests covering render, interaction, and edge cases',
    };
    const json = JSON.stringify(action);
    const parsed = JSON.parse(json);
    expect(parsed.id).toBe('act-003');
    expect(parsed.type).toBe('add_tests');
    expect(parsed.target).toBe('tests/unit/Demo.test.tsx');
    expect(parsed.description).toBe('Add unit tests for the Demo component');
    expect(parsed.priority).toBe('low');
    expect(parsed.expectedScoreIncrease).toBe(3);
    expect(parsed.implementation).toBe('Write tests covering render, interaction, and edge cases');
  });

  it('supports all priority levels', () => {
    const priorities = ['critical', 'high', 'medium', 'low'] as const;
    for (const p of priorities) {
      const action = {
        id: `act-${p}`,
        type: 'enhance_ui' as const,
        target: 'src/app/page.tsx',
        description: `Priority ${p} action`,
        priority: p,
        expectedScoreIncrease: 5,
        implementation: 'update styles',
      };
      expect(action.priority).toBe(p);
    }
  });

  it('creates a valid JudgeResult', () => {
    const judgeResult = {
      scores: {
        innovation: 75,
        technicalDepth: 60,
        feasibility: 80,
        presentation: 55,
        completeness: 70,
        maintainability: 65,
        judgeAlignment: 85,
        overall: 70,
      },
      strengths: ['Good innovation', 'Strong alignment'],
      weaknesses: ['Weak presentation', 'Missing tests'],
    };
    expect(judgeResult.scores.innovation).toBe(75);
    expect(judgeResult.scores.overall).toBe(70);
    expect(judgeResult.strengths).toHaveLength(2);
    expect(judgeResult.weaknesses).toContain('Weak presentation');
  });
});
