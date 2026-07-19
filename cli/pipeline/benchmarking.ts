import type { BenchmarkComparison, PipelineBenchmarkResult } from './types.js';

export class PipelineBenchmarker {
  /**
   * Run a benchmark comparing an old-pipeline run to the new improved pipeline.
   * Measures prompt size, generation time, completeness, error rate, and estimated score.
   */
  compare(oldPipeline: Record<string, unknown>, newPipeline: Record<string, unknown>): BenchmarkComparison[] {
    const comparisons: BenchmarkComparison[] = [];

    // Prompt size comparison
    const oldPromptSize = (oldPipeline.promptSizeChars as number) ?? 0;
    const newPromptSize = (newPipeline.promptSizeChars as number) ?? 0;
    comparisons.push({
      metric: 'Prompt Size',
      oldValue: oldPromptSize,
      newValue: newPromptSize,
      improvement: oldPromptSize > 0 ? `${Math.round(((oldPromptSize - newPromptSize) / oldPromptSize) * 100)}%` : 'N/A',
      unit: 'chars',
    });

    // Generation time
    const oldTime = (oldPipeline.generationTimeMs as number) ?? 0;
    const newTime = (newPipeline.generationTimeMs as number) ?? 0;
    comparisons.push({
      metric: 'Generation Time',
      oldValue: oldTime,
      newValue: newTime,
      improvement: oldTime > 0 ? `${Math.round(((oldTime - newTime) / oldTime) * 100)}%` : 'N/A',
      unit: 'ms',
    });

    // Error count
    const oldErrors = (oldPipeline.errorCount as number) ?? 0;
    const newErrors = (newPipeline.errorCount as number) ?? 0;
    comparisons.push({
      metric: 'Error Count',
      oldValue: oldErrors,
      newValue: newErrors,
      improvement: oldErrors > 0 ? `${Math.round(((oldErrors - newErrors) / oldErrors) * 100)}%` : 'N/A',
      unit: 'errors',
    });

    // Judge score
    const oldScore = (oldPipeline.judgeScore as number) ?? 0;
    const newScore = (newPipeline.judgeScore as number) ?? 0;
    comparisons.push({
      metric: 'Estimated Judge Score',
      oldValue: oldScore,
      newValue: newScore,
      improvement: oldScore > 0 ? `+${Math.round(newScore - oldScore)} pts` : 'N/A',
      unit: '/100',
    });

    // Criteria analyzed
    const oldCriteria = (oldPipeline.criteriaAnalyzed as number) ?? 0;
    const newCriteria = (newPipeline.criteriaAnalyzed as number) ?? 0;
    comparisons.push({
      metric: 'Criteria Analyzed',
      oldValue: oldCriteria,
      newValue: newCriteria,
      improvement: `+${newCriteria - oldCriteria} criteria`,
      unit: 'criteria',
    });

    // Improvement actions
    const oldActions = (oldPipeline.improvementActions as number) ?? 0;
    const newActions = (newPipeline.improvementActions as number) ?? 0;
    comparisons.push({
      metric: 'Improvement Actions Suggested',
      oldValue: oldActions,
      newValue: newActions,
      improvement: `+${newActions - oldActions} actions`,
      unit: 'actions',
    });

    return comparisons;
  }

  /**
   * Generate a standardized benchmark suite prompt for each pipeline variant.
   */
  generateBenchmarkPrompts(): Array<{ name: string; prompt: string; expectedDeliverables: string[] }> {
    return [
      {
        name: 'Web App (CRUD)',
        prompt: 'Build a task management web app with create, read, update, delete functionality, user authentication, and a dashboard.',
        expectedDeliverables: ['Source code', 'Tests', 'README', 'Deployment'],
      },
      {
        name: 'AI Integration',
        prompt: 'Build a web app that uses an AI API to analyze sentiment of user-submitted text and display results with charts.',
        expectedDeliverables: ['Source code', 'AI integration', 'Charts UI', 'README'],
      },
      {
        name: 'Full Stack with Auth',
        prompt: 'Build a full-stack application with user registration, login, profile management, and a protected dashboard showing user data.',
        expectedDeliverables: ['Auth system', 'Backend API', 'Frontend UI', 'Database schema', 'Tests'],
      },
    ];
  }

  /**
   * Format benchmark comparisons as markdown.
   */
  formatComparison(comparisons: BenchmarkComparison[]): string {
    const lines: string[] = [];
    lines.push('## Pipeline Benchmark Comparison');
    lines.push('');
    lines.push('| Metric | Old Pipeline | Improved Pipeline | Improvement |');
    lines.push('|--------|-------------|-------------------|-------------|');
    for (const c of comparisons) {
      lines.push(`| ${c.metric} | ${c.oldValue} ${c.unit} | ${c.newValue} ${c.unit} | ${c.improvement} |`);
    }
    lines.push('');
    return lines.join('\n');
  }
}
