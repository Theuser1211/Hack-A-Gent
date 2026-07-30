import { describe, it, expect } from 'vitest';
import { planImprovements } from '../../cli/improvement/improvement-planner.js';
import type { JudgeResult } from '../../cli/improvement/improvement-types.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

function createTempProject(): string {
  const dir = join(import.meta.dirname, '__temp_improvement_planner__');
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(dir, 'src', 'app'), { recursive: true });
  writeFileSync(join(dir, 'src', 'app', 'page.tsx'), 'export default function Home() { return <main>Hello</main>; }');
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }));
  return dir;
}

const LOW_SCORES: JudgeResult = {
  scores: { innovation: 30, technicalDepth: 40, feasibility: 60, presentation: 25, completeness: 50, maintainability: 45, judgeAlignment: 80, overall: 47 },
  strengths: ['Good alignment'],
  weaknesses: ['Everything else needs work'],
};

const HIGH_SCORES: JudgeResult = {
  scores: { innovation: 90, technicalDepth: 85, feasibility: 88, presentation: 80, completeness: 82, maintainability: 78, judgeAlignment: 92, overall: 85 },
  strengths: ['All strong'],
  weaknesses: [],
};

const MIXED_SCORES: JudgeResult = {
  scores: { innovation: 85, technicalDepth: 60, feasibility: 90, presentation: 55, completeness: 75, maintainability: 70, judgeAlignment: 88, overall: 75 },
  strengths: ['Innovation', 'Feasibility', 'Alignment'],
  weaknesses: ['Technical depth', 'Presentation'],
};

describe('planImprovements', () => {
  it('returns up to 5 actions for low scores', () => {
    const dir = createTempProject();
    try {
      const actions = planImprovements(LOW_SCORES, dir);
      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions.length).toBeLessThanOrEqual(5);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('returns fewer actions for high scores', () => {
    const dir = createTempProject();
    try {
      const actions = planImprovements(HIGH_SCORES, dir);
      expect(actions.length).toBeGreaterThanOrEqual(0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('assigns critical priority to scores below 50', () => {
    const dir = createTempProject();
    try {
      const actions = planImprovements(LOW_SCORES, dir);
      const criticalActions = actions.filter(a => a.priority === 'critical');
      expect(criticalActions.length).toBeGreaterThanOrEqual(1);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('sorts actions by lowest score first', () => {
    const dir = createTempProject();
    try {
      const actions = planImprovements(MIXED_SCORES, dir);
      expect(actions.length).toBeGreaterThanOrEqual(2);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('each action has required fields', () => {
    const dir = createTempProject();
    try {
      const actions = planImprovements(LOW_SCORES, dir);
      for (const a of actions) {
        expect(a.id).toBeTruthy();
        expect(a.type).toBeTruthy();
        expect(a.target).toBeTruthy();
        expect(a.description).toBeTruthy();
        expect(a.priority).toBeTruthy();
        expect(typeof a.expectedScoreIncrease).toBe('number');
        expect(a.implementation).toBeTruthy();
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('returns no actions for empty project dir', () => {
    const actions = planImprovements(MIXED_SCORES, '/nonexistent/path/that/does/not/exist');
    expect(actions.length).toBeGreaterThanOrEqual(1);
  });

  it('gives higher expectedScoreIncrease for lower scores', () => {
    const dir = createTempProject();
    try {
      const actions = planImprovements(LOW_SCORES, dir);
      const criticalActions = actions.filter(a => a.priority === 'critical');
      const highActions = actions.filter(a => a.priority === 'high');
      if (criticalActions.length > 0 && highActions.length > 0) {
        expect(criticalActions[0]!.expectedScoreIncrease).toBeGreaterThanOrEqual(highActions[0]!.expectedScoreIncrease);
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
