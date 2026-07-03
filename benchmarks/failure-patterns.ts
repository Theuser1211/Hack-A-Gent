import type { BenchmarkRunResult } from './benchmark-types.js';

export interface FailurePattern {
  pattern: string;
  frequency: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
  affected_phases: string[];
  affected_categories: string[];
  typical_error: string;
  recommendation: string;
}

export function analyzeFailurePatterns(results: BenchmarkRunResult[]): FailurePattern[] {
  const patternCounts = new Map<
    string,
    { count: number; phases: Set<string>; categories: Set<string>; errors: string[] }
  >();

  for (const run of results) {
    for (const phase of run.phases) {
      if (phase.success || !phase.error) continue;

      const pattern = classifyError(phase.error, phase.phase);
      const entry = patternCounts.get(pattern.pattern) ?? {
        count: 0,
        phases: new Set(),
        categories: new Set(),
        errors: [],
      };
      entry.count++;
      entry.phases.add(phase.phase);
      entry.categories.add(run.category);
      entry.errors.push(phase.error);
      patternCounts.set(pattern.pattern, entry);
    }
  }

  const patterns: FailurePattern[] = [];
  for (const [patternKey, data] of patternCounts) {
    const sortedErrors = [...data.errors].sort((a, b) => a.localeCompare(b));
    const mostCommonError = sortedErrors[0] ?? 'Unknown error';
    patterns.push({
      pattern: patternKey,
      frequency: data.count,
      severity: data.count >= 3 ? 'critical' : data.count >= 2 ? 'high' : 'medium',
      affected_phases: [...data.phases].sort(),
      affected_categories: [...data.categories].sort(),
      typical_error: mostCommonError,
      recommendation: getRecommendation(patternKey),
    });
  }

  return patterns.sort((a, b) => b.frequency - a.frequency);
}

function classifyError(error: string, phase: string): { pattern: string } {
  const lower = error.toLowerCase();

  if (lower.includes('token') || lower.includes('rate limit') || lower.includes('quota')) {
    return { pattern: 'Rate limit or token quota exceeded' };
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return { pattern: 'Operation timed out' };
  }
  if (
    lower.includes('network') ||
    lower.includes('econnrefused') ||
    lower.includes('econnreset') ||
    lower.includes('enotfound')
  ) {
    return { pattern: 'Network connectivity failure' };
  }
  if (lower.includes('parse') || lower.includes('syntax') || lower.includes('invalid json')) {
    return { pattern: 'Response parsing or syntax error' };
  }
  if (lower.includes('validation') || lower.includes('schema') || lower.includes('zod')) {
    return { pattern: 'Schema validation failure' };
  }
  if (lower.includes('not found') || lower.includes('enoent') || lower.includes('missing')) {
    return { pattern: 'Missing file or resource' };
  }
  if (
    lower.includes('permission') ||
    lower.includes('forbidden') ||
    lower.includes('unauthorized') ||
    lower.includes('eaccess')
  ) {
    return { pattern: 'Permission or access denied' };
  }
  if (lower.includes('typeerror') || lower.includes('cannot read') || lower.includes('undefined')) {
    return { pattern: 'TypeError or undefined reference' };
  }
  if (
    lower.includes('build') ||
    lower.includes('compilation') ||
    lower.includes('tsc') ||
    lower.includes('typescript')
  ) {
    return { pattern: 'Build or compilation failure' };
  }
  if (lower.includes('dependenc') || lower.includes('module not found') || lower.includes('cannot find module')) {
    return { pattern: 'Missing dependency or module' };
  }
  if (lower.includes('test') && (lower.includes('fail') || lower.includes('assertion'))) {
    return { pattern: 'Test assertion failure' };
  }
  if (lower.includes('judge') || lower.includes('score') || lower.includes('rubric')) {
    return { pattern: 'Judge evaluation failure' };
  }
  if (lower.includes('memory') || lower.includes('oom') || lower.includes('heap')) {
    return { pattern: 'Out of memory error' };
  }
  if (lower.includes('disk') || lower.includes('storage') || lower.includes('no space')) {
    return { pattern: 'Disk space or storage error' };
  }

  return { pattern: `Unknown failure in ${phase}` };
}

function getRecommendation(pattern: string): string {
  const recs: Record<string, string> = {
    'Rate limit or token quota exceeded': 'Implement exponential backoff, reduce batch sizes, or upgrade API tier.',
    'Operation timed out':
      'Increase timeout limits, optimize slow operations, or split large tasks into smaller chunks.',
    'Network connectivity failure':
      'Add retry logic with backoff, check network configuration, and implement fallback providers.',
    'Response parsing or syntax error':
      'Add robust error handling around JSON parsing, validate responses before processing.',
    'Schema validation failure':
      'Add pre-validation of inputs, improve error messages to identify exact schema violations.',
    'Missing file or resource':
      'Check file paths before access, implement graceful fallbacks when resources are missing.',
    'Permission or access denied': 'Verify file/directory permissions, use least-privilege access patterns.',
    'TypeError or undefined reference': 'Add null checks, improve TypeScript strictness, validate runtime types.',
    'Build or compilation failure':
      'Run, type checking before build, fix TypeScript strict mode errors, verify module resolution.',
    'Missing dependency or module': 'Check package.json dependencies, run install before build, verify import paths.',
    'Test assertion failure': 'Improve test data quality, add more edge cases, verify test environment setup.',
    'Judge evaluation failure': 'Align generated code with rubric criteria, improve code quality and completeness.',
    'Out of memory error': 'Reduce batch processing size, optimize memory usage, increase available memory.',
    'Disk space or storage error': 'Implement cleanup routines, monitor disk usage, compress artifacts.',
  };
  return recs[pattern] ?? 'Investigate the specific error and add targeted error handling.';
}

export function generateFailurePatternsMarkdown(patterns: FailurePattern[]): string {
  if (patterns.length === 0) {
    return '# Failure Patterns\n\nNo failure patterns detected. All benchmarks passed successfully.\n';
  }

  const criticalCount = patterns.filter((p) => p.severity === 'critical').length;
  const highCount = patterns.filter((p) => p.severity === 'high').length;

  const lines: string[] = [
    '# Failure Patterns Analysis',
    '',
    `**Total patterns detected:** ${patterns.length}`,
    `**Critical patterns:** ${criticalCount}`,
    `**High severity patterns:** ${highCount}`,
    '',
    '## Top Failure Patterns',
    '',
    '| # | Pattern | Frequency | Severity | Affected Phases | Affected Categories |',
    '|---|---------|-----------|----------|-----------------|---------------------|',
    ...patterns.map(
      (p, i) =>
        `| ${i + 1} | ${p.pattern} | ${p.frequency} | ${p.severity} | ${p.affected_phases.join(', ')} | ${p.affected_categories.join(', ')} |`,
    ),
    '',
    '## Detailed Analysis',
    '',
    ...patterns
      .map((p, i) => [
        `### ${i + 1}. ${p.pattern}`,
        '',
        `- **Frequency:** ${p.frequency} occurrence${p.frequency !== 1 ? 's' : ''}`,
        `- **Severity:** ${p.severity}`,
        `- **Affected Phases:** ${p.affected_phases.join(', ')}`,
        `- **Affected Categories:** ${p.affected_categories.join(', ')}`,
        `- **Typical Error:** \`${p.typical_error}\``,
        '',
        '**Recommendation:**',
        '',
        p.recommendation,
        '',
      ])
      .flat(),
    '',
    '## Improvement Recommendations',
    '',
    '1. **Increase timeout thresholds** for LLM calls and build operations',
    '2. **Add retry logic** with exponential backoff for all external API calls',
    '3. **Improve error handling** at every phase boundary with detailed error messages',
    '4. **Add pre-flight validation** to catch schema issues before execution',
    '5. **Implement circuit breakers** for unreliable external services',
    '6. **Add performance monitoring** to detect slow operations early',
    '7. **Create fallback providers** for critical LLM-dependent phases',
    '',
  ];

  return lines.join('\n');
}

export function getTopFailurePatterns(patterns: FailurePattern[], topN: number = 20): FailurePattern[] {
  return patterns.slice(0, topN);
}
