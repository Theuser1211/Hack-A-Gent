import type { PipelineContext, FinalReport } from './pipeline/types.js';

export interface PipelineSummary {
  status: string;
  title: string;
  durationMs: number;
  stages: Array<{ name: string; status: string; durationMs: number | null; error: string | null }>;
  errors: string[];
  nextSteps: string[];
  outputDir: string | null;
  warnings: string[];
}

export interface BuildSummaryInput {
  ctx: PipelineContext;
  report: FinalReport | null;
  status: string;
  startedAtMs: number;
  outputDir?: string;
  nextSteps?: string[];
}

export function buildPipelineSummary(input: BuildSummaryInput): PipelineSummary {
  const { ctx, report, status, startedAtMs } = input;
  const durationMs = Date.now() - startedAtMs;
  const errors: string[] = [];
  const stages: PipelineSummary['stages'] = [];

  for (const [name, stage] of Object.entries(ctx.stages)) {
    stages.push({
      name,
      status: stage.status === 'completed' ? 'success' : stage.status === 'skipped' ? 'skipped' : stage.status === 'failed' ? 'failed' : stage.status === 'running' ? 'failed' : 'failed',
      durationMs: stage.durationMs,
      error: stage.error ?? null,
    });
    if (stage.error) errors.push(`${name}: ${stage.error}`);
  }

  if (report?.qualityChecks) {
    for (const check of report.qualityChecks) {
      if (!check.passed) errors.push(`Quality:${check.check}: ${check.message ?? ''}`);
    }
  }

  const nextSteps = (input.nextSteps ?? []).slice();
  if (status === 'succeeded' && nextSteps.length === 0) {
    nextSteps.push('Run `hag explain <project-id>` to inspect details.');
  }
  if (status === 'failed' && errors.length > 0) {
    nextSteps.push(`Re-run with --debug to investigate: first error was "${errors[0]}".`);
  }

  const warnings: string[] = [];
  if (ctx.executionResult && ctx.executionResult.errorCount > 0) {
    warnings.push(`${ctx.executionResult.errorCount} execution error(s) recorded.`);
  }
  if (report?.knownWeaknesses && report.knownWeaknesses.length > 0) {
    warnings.push(`${report.knownWeaknesses.length} weakness(es) noted by internal judge.`);
  }

  return {
    status,
    title: report?.challengeSummary ?? ctx.analysis?.challenge.title ?? 'Hackathon',
    durationMs,
    stages,
    errors,
    nextSteps,
    outputDir: input.outputDir ?? null,
    warnings,
  };
}

export function renderPipelineSummary(summary: PipelineSummary): string {
  const lines: string[] = [];
  lines.push(`Pipeline ${summary.status.toUpperCase()}: ${summary.title}`);
  lines.push(`Total duration: ${(summary.durationMs / 1000).toFixed(2)}s`);
  if (summary.outputDir) lines.push(`Output: ${summary.outputDir}`);
  if (summary.warnings.length > 0) lines.push(`Warnings: ${summary.warnings.join('; ')}`);
  lines.push('Stages:');
  for (const stage of summary.stages) {
    const duration = stage.durationMs !== null && stage.durationMs !== undefined ? `${stage.durationMs}ms` : 'n/a';
    lines.push(`  - [${stage.status}] ${stage.name} (${duration})`);
    if (stage.error) lines.push(`      error: ${stage.error}`);
  }
  if (summary.errors.length > 0) {
    lines.push('Errors:');
    for (const err of summary.errors) lines.push(`  - ${err}`);
  } else {
    lines.push('Errors: 0');
  }
  if (summary.nextSteps.length > 0) {
    lines.push('Next:');
    for (const step of summary.nextSteps) lines.push(`  - ${step}`);
  }
  return lines.join('\n');
}
