import type { LeaderboardEntry } from './agent-types.js';
import type { AnalysisReport } from './analysis-engine.js';
import type { BenchmarkRunResult } from './benchmark-types.js';
import type { CrossModelReport } from './cross-model-adapter.js';
import { deterministicNow } from './determinism-kernel.js';
import type { MutationEvolutionReport } from './mutation-evolution-controller.js';
import type { MutationGene } from './mutation-genome.js';

export interface ExperimentTable {
  name: string;
  caption: string;
  headers: string[];
  rows: string[][];
  footnotes: string[];
}

export interface LeaderboardSnapshot {
  timestamp: string;
  entries: LeaderboardEntry[];
}

export interface MutationChartData {
  chartType: 'line' | 'bar' | 'scatter' | 'heatmap';
  title: string;
  xAxis: string;
  yAxis: string;
  series: { name: string; data: number[] }[];
  labels: string[];
}

export interface RobustnessComparison {
  metricName: string;
  values: { agentId: string; score: number; stdDev: number }[];
}

export interface FailureTaxonomyBreakdown {
  category: string;
  frequency: number;
  count: number;
  percentage: number;
}

export interface PaperExporterConfig {
  title: string;
  authors: string[];
  abstract: string;
  benchmarkSuiteName: string;
  experimentDate: string;
  includeRawData: boolean;
  includeCharts: boolean;
  includeFullTaxonomy: boolean;
}

export interface PaperDataPackage {
  config: PaperExporterConfig;
  experimentTables: ExperimentTable[];
  leaderboardSnapshots: LeaderboardSnapshot[];
  mutationChartData: MutationChartData[];
  robustnessComparisons: RobustnessComparison[];
  failureTaxonomy: FailureTaxonomyBreakdown[];
  crossModelComparisons: CrossModelReport | null;
  mutationEvolutionReport: MutationEvolutionReport | null;
  analysisReport: AnalysisReport | null;
  rawResults: BenchmarkRunResult[];
  generatedAt: string;
}

export function createExperimentTable(
  name: string,
  caption: string,
  headers: string[],
  rows: string[][],
  footnotes?: string[],
): ExperimentTable {
  return { name, caption, headers, rows, footnotes: footnotes ?? [] };
}

export function buildLeaderboardTable(
  entries: LeaderboardEntry[],
  title: string = 'Agent Leaderboard',
): ExperimentTable {
  const headers = ['Rank', 'Agent', 'Robustness', 'Survival Rate', 'Repair Eff.', 'Specialization', 'Benchmarks'];
  const rows = entries.map((e) => [
    String(e.rank),
    e.name,
    e.averageRobustnessScore.toFixed(1),
    `${(e.mutationSurvivalRate * 100).toFixed(0)}%`,
    e.repairEfficiency.toFixed(2),
    e.specializationScore.toFixed(2),
    String(e.totalBenchmarksRun),
  ]);

  return createExperimentTable('leaderboard', title, headers, rows, [
    'Robustness scores range 0-100. Higher is better.',
  ]);
}

export function buildRobustnessComparisonTable(results: BenchmarkRunResult[]): ExperimentTable {
  const agentIds = [...new Set(results.map((r) => r.agent_id))];
  const benchmarks = [...new Set(results.map((r) => r.benchmark_id))];

  const headers = ['Benchmark', ...agentIds];
  const rows = benchmarks.map((benchmarkId) => {
    const benchResults = results.filter((r) => r.benchmark_id === benchmarkId);
    return [
      benchmarkId,
      ...agentIds.map((agentId) => {
        const agentResult = benchResults.find((r) => r.agent_id === agentId);
        return agentResult ? agentResult.robustness_score.toFixed(1) : 'N/A';
      }),
    ];
  });

  return createExperimentTable(
    'robustness_comparison',
    'Per-Benchmark Robustness Scores Across Agents',
    headers,
    rows,
    ['N/A indicates the agent did not run this benchmark.'],
  );
}

export function buildMutationEvolutionTable(report: MutationEvolutionReport): ExperimentTable {
  const headers = ['Family', 'Gene Count', 'Avg Utility', 'Top Variant'];
  const rows = report.topEvolvingFamilies.map((f) => [
    f.familyName,
    String(f.geneCount),
    `${(f.avgUtility * 100).toFixed(1)}%`,
    f.topType,
  ]);

  return createExperimentTable('mutation_evolution', 'Top Evolving Mutation Families', headers, rows, [
    'Utility scores are computed from agent differentiation, repair difficulty, and detection variance.',
  ]);
}

export function buildFailureCategoryTable(taxonomy: FailureTaxonomyBreakdown[]): ExperimentTable {
  const headers = ['Failure Category', 'Count', 'Percentage'];
  const rows = taxonomy.map((t) => [t.category, String(t.count ?? t.frequency), `${t.percentage.toFixed(1)}%`]);

  return createExperimentTable('failure_taxonomy', 'Failure Mode Taxonomy', headers, rows, [
    'Categories are derived from error messages during verification, testing, and judging phases.',
  ]);
}

export function buildCrossModelComparisonTable(report: CrossModelReport): ExperimentTable[] {
  const tables: ExperimentTable[] = [];

  for (const comp of report.comparisons) {
    const headers = ['Rank', 'Adapter', 'Value'];
    const rows = comp.rankings.map((r) => [String(r.rank), r.adapterId, r.value.toFixed(3)]);

    tables.push(
      createExperimentTable(`cross_model_${comp.metricId}`, `Cross-Model Comparison: ${comp.metricId}`, headers, rows, [
        `Best: ${comp.bestAdapter}, Worst: ${comp.worstAdapter}, Spread: ${comp.spread.toFixed(3)}`,
      ]),
    );
  }

  return tables;
}

export function packagePaperData(
  config: PaperExporterConfig,
  results: BenchmarkRunResult[],
  leaderboardEntries: LeaderboardEntry[],
  analysisReport: AnalysisReport | null,
  mutationEvolutionReport: MutationEvolutionReport | null,
  crossModelReport: CrossModelReport | null,
): PaperDataPackage {
  const tables: ExperimentTable[] = [];

  tables.push(buildLeaderboardTable(leaderboardEntries));
  tables.push(buildRobustnessComparisonTable(results));
  const failureCategories: FailureTaxonomyBreakdown[] = (analysisReport?.failureTaxonomy.failureCategories ?? []).map(
    (fc) => ({ category: fc.category, frequency: fc.frequency, count: fc.frequency, percentage: fc.percentage }),
  );
  tables.push(buildFailureCategoryTable(failureCategories));

  if (mutationEvolutionReport) {
    tables.push(buildMutationEvolutionTable(mutationEvolutionReport));
  }

  if (crossModelReport) {
    tables.push(...buildCrossModelComparisonTable(crossModelReport));
  }

  const chartData: MutationChartData[] = [];

  if (analysisReport) {
    const utilityDrift = analysisReport.evolutionaryDrift.find((d) => d.metricName === 'utility_score');
    if (utilityDrift) {
      chartData.push({
        chartType: 'line',
        title: 'Mutation Utility Score Evolution',
        xAxis: 'Generation',
        yAxis: 'Utility Score',
        series: [{ name: 'Utility Score', data: [utilityDrift.driftMagnitude] }],
        labels: ['0'],
      });
    }
  }

  return {
    config,
    experimentTables: tables,
    leaderboardSnapshots: [{ timestamp: deterministicNow(0), entries: leaderboardEntries }],
    mutationChartData: chartData,
    robustnessComparisons: agentIdsFromResults(results).map((agentId) => ({
      metricName: 'robustness_score',
      values: [
        {
          agentId,
          score: averageOf(results.filter((r) => r.agent_id === agentId).map((r) => r.robustness_score)),
          stdDev: 0,
        },
      ],
    })),
    failureTaxonomy: failureCategories,
    crossModelComparisons: crossModelReport,
    mutationEvolutionReport,
    analysisReport,
    rawResults: results,
    generatedAt: deterministicNow(0),
  };
}

export function exportPaperDataJson(data: PaperDataPackage): string {
  return JSON.stringify(data, null, 2);
}

export function exportPaperDataLatexTables(data: PaperDataPackage): string {
  const lines: string[] = [
    '% Auto-generated LaTeX tables for Hack-A-Gent Benchmark Suite',
    `% Generated at: ${data.generatedAt}`,
    `% Title: ${data.config.title}`,
    '',
  ];

  for (const table of data.experimentTables) {
    lines.push(`% Table: ${table.name}`);
    lines.push(`\\begin{ table }[ht]`);
    lines.push(`\\centering`);
    lines.push(`\\caption{ ${table.caption}}`);
    lines.push(`\\begin{ tabular }{ ${'l'.repeat(table.headers.length)}}`);
    lines.push(`\\hline`);
    lines.push(`${table.headers.join(' & ')} \\\\`);
    lines.push(`\\hline`);

    for (const row of table.rows) {
      lines.push(`${row.map((cell) => cell.replace(/%/g, '\\%')).join(' & ')} \\\\`);
    }

    lines.push(`\\hline`);
    lines.push(`\\end{ tabular }`);
    if (table.footnotes.length > 0) {
      lines.push(`\\caption*{ \\small ${table.footnotes.join(' ')}}`);
    }
    lines.push(`\\end{ table }`);
    lines.push('');
  }

  return lines.join('\n');
}

export function exportPaperDataMarkdownTables(data: PaperDataPackage): string {
  const lines: string[] = [
    `# ${data.config.title}`,
    '',
    `**Authors:** ${data.config.authors.join(', ')}`,
    '',
    data.config.abstract,
    '',
    `**Generated:** ${data.generatedAt}`,
    '',
    '---',
    '',
  ];

  for (const table of data.experimentTables) {
    lines.push(`## ${table.caption}`, '');
    lines.push(`| ${table.headers.join(' | ')} |`);
    lines.push(`| ${table.headers.map(() => '---').join(' | ')} |`);

    for (const row of table.rows) {
      lines.push(`| ${row.join(' | ')} |`);
    }

    if (table.footnotes.length > 0) {
      lines.push('');
      lines.push(`_${table.footnotes.join(' ')}_`);
    }

    lines.push('');
    lines.push('---', '');
  }

  return lines.join('\n');
}

function agentIdsFromResults(results: BenchmarkRunResult[]): string[] {
  return [...new Set(results.map((r) => r.agent_id))];
}

function averageOf(values: number[]): number {
  return values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : 0;
}
