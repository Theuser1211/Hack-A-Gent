import type { BenchmarkRunResult, BenchmarkSuiteResult } from './benchmark-types.js';
import { BenchmarkSuiteResultSchema } from './benchmark-types.js';
import { deterministicNow } from './determinism-kernel.js';
import type { MutationEvolutionReport } from './mutation-evolution-controller.js';

export function generateBenchmarkReport(results: BenchmarkRunResult[]): BenchmarkSuiteResult {
  const total = results.length;
  const passed = results.filter((r) => r.overall_success).length;
  const failed = results.filter((r) => !r.overall_success).length;

  const judgeScores = results.map((r) => r.judge_score).filter((s): s is number => s !== null);
  const avgJudgeScore =
    judgeScores.length > 0 ? Math.round(judgeScores.reduce((s, v) => s + v, 0) / judgeScores.length) : 0;

  const buildPassRate = total > 0 ? Math.round((results.filter((r) => r.build_success).length / total) * 100) : 0;

  const testResults = results.filter((r) => r.test_success !== null);
  const testPassRate =
    testResults.length > 0
      ? Math.round((testResults.filter((r) => r.test_success).length / testResults.length) * 100)
      : null;

  const avgTokens = total > 0 ? Math.round(results.reduce((s, r) => s + r.total_tokens, 0) / total) : 0;

  const avgCost = total > 0 ? parseFloat((results.reduce((s, r) => s + r.total_cost, 0) / total).toFixed(4)) : 0;

  const avgDuration = total > 0 ? Math.round(results.reduce((s, r) => s + r.total_duration_ms, 0) / total) : 0;

  const totalRepairs = results.reduce((s, r) => s + r.repair_iterations, 0);

  const report: BenchmarkSuiteResult = {
    suite_name: 'Hack-A-Gent Benchmark Suite',
    run_at: deterministicNow(0),
    benchmark_results: results,
    summary: {
      total_benchmarks: total,
      passed,
      failed,
      average_judge_score: avgJudgeScore,
      average_build_pass_rate: buildPassRate,
      average_test_pass_rate: testPassRate,
      average_token_consumption: avgTokens,
      average_cost: avgCost,
      average_duration_ms: avgDuration,
      total_repair_iterations: totalRepairs,
    },
  };

  return BenchmarkSuiteResultSchema.parse(report);
}

export function generateCategoryBreakdown(
  results: BenchmarkRunResult[],
): Record<string, { count: number; passRate: number; avgScore: number }> {
  const categories: Record<string, BenchmarkRunResult[]> = {};
  for (const r of results) {
    const cat = r.category;
    if (!categories[cat]) categories[cat] = [];
    categories[cat]!.push(r);
  }

  const breakdown: Record<string, { count: number; passRate: number; avgScore: number }> = {};
  for (const [cat, items] of Object.entries(categories)) {
    const scores = items.map((i) => i.judge_score).filter((s): s is number => s !== null);
    breakdown[cat] = {
      count: items.length,
      passRate: Math.round((items.filter((i) => i.overall_success).length / items.length) * 100),
      avgScore: scores.length > 0 ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length) : 0,
    };
  }
  return breakdown;
}

export function generateBenchmarkSummaryMarkdown(results: BenchmarkRunResult[]): string {
  const report = generateBenchmarkReport(results);
  const breakdown = generateCategoryBreakdown(results);
  const lines: string[] = [
    '# Hack-A-Gent Benchmark Suite Report',
    '',
    `**Run at:** ${report.run_at}`,
    `**Total Benchmarks:** ${report.summary.total_benchmarks}`,
    `**Passed:** ${report.summary.passed} / **Failed:** ${report.summary.failed}`,
    '',
    '## Summary',
    '',
    '| Metric | Value |',
    '|--------|-------|',
    `| **Build Pass Rate** | ${report.summary.average_build_pass_rate}% |`,
    `| **Test Pass Rate** | ${report.summary.average_test_pass_rate !== null ? `${report.summary.average_test_pass_rate}%` : 'N/A'} |`,
    `| **Average Judge Score** | ${report.summary.average_judge_score}/100 |`,
    `| **Average Token Consumption** | ${report.summary.average_token_consumption.toLocaleString()} |`,
    `| **Average Cost** | $${report.summary.average_cost.toFixed(4)} |`,
    `| **Average Duration** | ${(report.summary.average_duration_ms / 1000).toFixed(1)}s |`,
    `| **Total Repair Iterations** | ${report.summary.total_repair_iterations} |`,
    '',
    '## Category Breakdown',
    '',
    '| Category | Count | Pass Rate | Avg Score |',
    '|----------|-------|-----------|-----------|',
    ...Object.entries(breakdown).map(
      ([cat, stats]) => `| ${cat} | ${stats.count} | ${stats.passRate}% | ${stats.avgScore}/100 |`,
    ),
    '',
    '## Individual Results',
    '',
    '| Benchmark | Category | Success | Build | Judge Score | Duration | Tokens |',
    '|-----------|----------|---------|-------|-------------|----------|--------|',
    ...results.map(
      (r) =>
        `| ${r.benchmark_name} | ${r.category} | ${r.overall_success ? 'Ã¢Å“â€¦' : 'Ã¢ÂÅ’'} | ${r.build_success ? 'Ã¢Å“â€¦' : 'Ã¢ÂÅ’'} | ${r.judge_score !== null ? `${r.judge_score}/100` : 'N/A'} | ${(r.total_duration_ms / 1000).toFixed(1)}s | ${r.total_tokens.toLocaleString()} |`,
    ),
    '',
    '## Phase Success Rates',
    '',
    '| Phase | Success Rate |',
    '|-------|-------------|',
  ];

  const phases = [
    'planning',
    'architecture',
    'building',
    'materialization',
    'build_verification',
    'testing',
    'judging',
    'repair',
  ] as const;
  for (const phase of phases) {
    const phaseResults = results.flatMap((r) => r.phases.filter((p) => p.phase === phase));
    const successCount = phaseResults.filter((p) => p.success).length;
    const totalCount = phaseResults.length;
    const rate = totalCount > 0 ? Math.round((successCount / totalCount) * 100) : 0;
    lines.push(`| **${phase}** | ${rate}% (${successCount}/${totalCount}) |`);
  }

  return lines.join('\n');
}

export function generateMutationEvolutionReportMarkdown(report: MutationEvolutionReport): string {
  const lines: string[] = [
    '## Mutation Evolution Report',
    '',
    `**Total Population:** ${report.totalPopulation}`,
    `**Mutation Diversity Index:** ${(report.mutationDiversityIndex * 100).toFixed(1)}%`,
    `**Average Utility Score:** ${(report.averageUtilityScore * 100).toFixed(1)}%`,
    '',
  ];

  if (report.topEvolvingFamilies.length > 0) {
    lines.push('### Top Evolving Mutation Families', '');
    lines.push('| Family | Genes | Avg Utility | Top Variant |');
    lines.push('|--------|-------|-------------|-------------|');
    for (const family of report.topEvolvingFamilies) {
      lines.push(
        `| ${family.familyName} | ${family.geneCount} | ${(family.avgUtility * 100).toFixed(1)}% | ${family.topType} |`,
      );
    }
    lines.push('');
  }

  if (report.newlyDiscoveredClasses.length > 0) {
    lines.push('### Newly Discovered Mutation Classes', '');
    lines.push('| Mutation ID | Type | Generation | Parents | Utility |');
    lines.push('|-------------|------|-----------|---------|---------|');
    for (const mutation of report.newlyDiscoveredClasses) {
      const parentStr = mutation.parentIds.length > 0 ? mutation.parentIds.join(', ') : 'seed';
      lines.push(
        `| ${mutation.id} | ${mutation.type} | ${mutation.generation} | ${parentStr} | ${(mutation.fitness.utility_score * 100).toFixed(1)}% |`,
      );
    }
    lines.push('');
  }

  if (report.extinctionEvents.length > 0) {
    lines.push('### Mutation Extinction Events', '');
    for (const extinctId of report.extinctionEvents) {
      lines.push(`- ${extinctId} Ã¢â‚¬â€ removed from population`);
    }
    lines.push('');
  }

  if (report.survivalCurves.length > 0) {
    lines.push('### Mutation Survival Curves', '');
    lines.push('| Generation | Survival Rate |');
    lines.push('|------------|---------------|');
    for (const point of report.survivalCurves) {
      lines.push(`| ${point.generation} | ${(point.survivalRate * 100).toFixed(1)}% |`);
    }
    lines.push('');
  }

  if (report.agentSpecificVulnerabilities.size > 0) {
    lines.push('### Agent-Specific Mutation Vulnerabilities', '');
    lines.push('| Agent | Vulnerable To |');
    lines.push('|-------|--------------|');
    for (const [agentId, weaknesses] of report.agentSpecificVulnerabilities) {
      lines.push(`| ${agentId} | ${weaknesses.join(', ')} |`);
    }
    lines.push('');
  }

  lines.push('### Mutation Diversity Index', '');
  lines.push(`Current mutation diversity index: ${(report.mutationDiversityIndex * 100).toFixed(1)}%`);
  lines.push('- 0% = all mutations are the same type');
  lines.push('- 100% = every mutation is a unique type');
  lines.push('');

  return lines.join('\n');
}
