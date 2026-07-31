import { describe, it, expect } from 'vitest';
import { ImprovementInstrumentor } from '../../cli/improvement/improvement-instrumentor.js';

describe('ImprovementInstrumentor hardening', () => {
  it('respects total time budget', () => {
    const instrumentor = new ImprovementInstrumentor(100, 50);
    instrumentor.startIteration(1, 80);
    instrumentor.t0 = Date.now() - 200;
    expect(instrumentor.ranOutOfTime).toBe(true);
  });

  it('respects iteration time budget', () => {
    const instrumentor = new ImprovementInstrumentor(600_000, 100);
    instrumentor.startIteration(1, 80);
    instrumentor.currentStageStart = Date.now() - 200;
    expect(instrumentor.iterRanOutOfTime).toBe(true);
  });

  it('stops after max iterations', () => {
    const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
    const decision = instrumentor.shouldStop(5, 2);
    expect(decision).toBe('max_iterations');
  });

  it('detects plateau (no score improvement)', () => {
    const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
    const decision = instrumentor.shouldStop(0, 1);
    expect(decision).toBe('converged');
  });

  it('detects negative score change', () => {
    const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
    const decision = instrumentor.shouldStop(-2, 1);
    expect(decision).toBe('converged');
  });

  it('continues on first iteration with positive score', () => {
    const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
    const decision = instrumentor.shouldStop(5, 0);
    expect(decision).toBe('continue');
  });

  it('builds summary correctly', () => {
    const instrumentor = new ImprovementInstrumentor(600_000, 180_000);
    instrumentor.startIteration(1, 80);
    instrumentor.endIteration(85, 'continue', 'improving');
    const summary = instrumentor.buildSummary(80, 85, 'completed');
    expect(summary.initialScore).toBe(80);
    expect(summary.finalScore).toBe(85);
    expect(summary.iterations).toHaveLength(1);
  });
});
