import { describe, it, expect } from 'vitest';
import { buildPipelineSummary, renderPipelineSummary } from '../../cli/pipeline-summary.js';
import type { PipelineContext, FinalReport } from '../../cli/pipeline/types.js';

describe('buildPipelineSummary', () => {
  it('builds summary with stages', () => {
    const ctx = {
      seed: 42,
      startedAt: Date.now() - 1000,
      stages: {
        'Challenge Analysis': { name: 'Challenge Analysis', status: 'completed', startedAt: Date.now() - 1000, completedAt: Date.now(), durationMs: 500, error: null, result: null },
        'Project Generation': { name: 'Project Generation', status: 'completed', startedAt: Date.now() - 500, completedAt: Date.now(), durationMs: 300, error: null, result: null },
      },
      analysis: null,
      strategy: null,
      executionResult: { features: [], errors: [], deployUrl: null, taskCount: 10, buildSuccess: true, testPassRate: 0.9, criteriaCount: 5, featureCount: 3, errorCount: 0, durationMs: 800 },
      reviewFeedback: null,
      feedbackConverged: true,
      feedbackIterations: 1,
      qualityChecks: [],
      report: null,
    } as unknown as PipelineContext;

    const report = {
      judgeScorePrediction: 85,
      challengeSummary: 'AI Hackathon 2026',
      knownWeaknesses: ['Could improve UI'],
      qualityChecks: [
        { check: 'Build', passed: true, severity: 'required', message: '' },
        { check: 'Tests', passed: false, severity: 'recommended', message: 'No tests found' },
      ],
    } as unknown as FinalReport;

    const summary = buildPipelineSummary({
      ctx,
      report,
      status: 'succeeded',
      startedAtMs: Date.now() - 1000,
      outputDir: '/tmp/project',
      nextSteps: ['Deploy to Vercel'],
    });

    expect(summary.status).toBe('succeeded');
    expect(summary.title).toBe('AI Hackathon 2026');
    expect(summary.stages).toHaveLength(2);
    expect(summary.outputDir).toBe('/tmp/project');
    expect(summary.nextSteps).toContain('Deploy to Vercel');
  });

  it('renders summary as string', () => {
    const summary = {
      status: 'succeeded',
      title: 'Test Project',
      durationMs: 5000,
      stages: [
        { name: 'Challenge Analysis', status: 'success', durationMs: 1000, error: null },
        { name: 'Project Generation', status: 'success', durationMs: 3000, error: null },
      ],
      errors: [],
      nextSteps: ['Run `hag explain <project-id>`'],
      outputDir: '/tmp/project',
      warnings: [],
    };

    const rendered = renderPipelineSummary(summary);
    expect(rendered).toContain('Pipeline SUCCEEDED: Test Project');
    expect(rendered).toContain('Total duration: 5.00s');
    expect(rendered).toContain('Challenge Analysis');
    expect(rendered).toContain('Project Generation');
  });
});
