/**
 * Failure Tracker
 *
 * Tracks what went wrong in past runs and uses that knowledge
 * to prevent the same failures in future runs.
 *
 * Unlike the existing memory system (which just stores project metadata),
 * this tracks specific failure patterns, their causes, and fixes.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface FailureRecord {
  id: string;
  timestamp: number;
  projectName: string;
  phase: string;
  errorType: 'typescript' | 'build' | 'runtime' | 'import' | 'type' | 'network' | 'unknown';
  errorMessage: string;
  file?: string;
  line?: number;
  fix?: string;
  resolved: boolean;
  occurrences: number;
}

export interface FailurePattern {
  pattern: RegExp;
  category: FailureRecord['errorType'];
  description: string;
  commonFix: string;
  preventionStrategy: string;
}

export interface LearningData {
  failures: FailureRecord[];
  patterns: FailurePattern[];
  totalRuns: number;
  successRate: number;
  averageScore: number;
  lastUpdated: number;
}

/**
 * Known failure patterns and their fixes.
 */
const KNOWN_PATTERNS: FailurePattern[] = [
  {
    pattern: /Cannot find module ['"]@\/types\/.*?['"]/,
    category: 'import',
    description: 'Importing from @/types/ file that does not exist',
    commonFix: 'Define types inline in the same file instead of importing from a types file',
    preventionStrategy: 'Prompt rule: Never create separate type files — define types locally',
  },
  {
    pattern: /Property 'children' is missing/i,
    category: 'type',
    description: 'React component missing children prop type',
    commonFix: 'Add children: React.ReactNode to component props',
    preventionStrategy: 'Prompt rule: Every component with children must accept { children: React.ReactNode }',
  },
  {
    pattern: /Type 'X' is not assignable to type 'Y'/i,
    category: 'type',
    description: 'Type mismatch error',
    commonFix: 'Add proper type annotations or type assertions',
    preventionStrategy: 'Use strict TypeScript types in generated code',
  },
  {
    pattern: /named export.*page|export const Page/i,
    category: 'typescript',
    description: 'Named export instead of default export for page component',
    commonFix: 'Change to "export default function Page"',
    preventionStrategy: 'Prompt rule: Use export default for all React components and page files',
  },
  {
    pattern: /Module not found.*Can't resolve/i,
    category: 'import',
    description: 'Missing file or package',
    commonFix: 'Generate the missing file or add the package to dependencies',
    preventionStrategy: 'Verify all imports resolve before returning files',
  },
  {
    pattern: /Server responded with \d{3}/,
    category: 'network',
    description: 'API endpoint returned error status',
    commonFix: 'Check API route implementation and error handling',
    preventionStrategy: 'Add proper error handling to all API routes',
  },
  {
    pattern: /ECONNREFUSED|ETIMEDOUT/i,
    category: 'network',
    description: 'Connection refused or timed out',
    commonFix: 'Check if the service is running and accessible',
    preventionStrategy: 'Add retry logic and graceful degradation',
  },
  {
    pattern: /Unexpected token.*JSON/i,
    category: 'runtime',
    description: 'JSON parse error in response',
    commonFix: 'Validate response content type before parsing',
    preventionStrategy: 'Add try-catch around all JSON.parse calls',
  },
];

/**
 * Memory file path.
 */
function getMemoryPath(dataDir: string): string {
  return path.join(dataDir, 'failure-learning.json');
}

/**
 * Load learning data from disk.
 */
export function loadLearningData(dataDir: string): LearningData {
  const memPath = getMemoryPath(dataDir);
  if (fs.existsSync(memPath)) {
    try {
      return JSON.parse(fs.readFileSync(memPath, 'utf-8'));
    } catch { /* ignore corrupted file */ }
  }
  return {
    failures: [],
    patterns: KNOWN_PATTERNS,
    totalRuns: 0,
    successRate: 0,
    averageScore: 0,
    lastUpdated: Date.now(),
  };
}

/**
 * Save learning data to disk.
 */
export function saveLearningData(dataDir: string, data: LearningData): void {
  const memPath = getMemoryPath(dataDir);
  const dir = path.dirname(memPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(memPath, JSON.stringify(data, null, 2));
}

/**
 * Record a failure from a pipeline run.
 */
export function recordFailure(
  dataDir: string,
  record: Omit<FailureRecord, 'id' | 'timestamp' | 'occurrences' | 'resolved'>,
): void {
  const data = loadLearningData(dataDir);

  // Check if this exact failure has been seen before
  const existing = data.failures.find(
    f =>
      f.errorType === record.errorType &&
      f.errorMessage === record.errorMessage &&
      f.file === record.file,
  );

  if (existing) {
    existing.occurrences++;
    existing.resolved = false;
  } else {
    data.failures.push({
      ...record,
      id: `fail-${Date.now()}-${record.errorMessage.slice(0, 8).replace(/[^a-z0-9]/gi, '')}`,
      timestamp: Date.now(),
      occurrences: 1,
      resolved: false,
    });
  }

  // Keep only last 100 failures
  if (data.failures.length > 100) {
    data.failures = data.failures.slice(-100);
  }

  data.lastUpdated = Date.now();
  saveLearningData(dataDir, data);
}

/**
 * Record a successful fix for a failure.
 */
export function recordFix(dataDir: string, failureId: string, fix: string): void {
  const data = loadLearningData(dataDir);
  const failure = data.failures.find(f => f.id === failureId);
  if (failure) {
    failure.fix = fix;
    failure.resolved = true;
  }
  saveLearningData(dataDir, data);
}

/**
 * Get prevention strategies for upcoming runs based on past failures.
 */
export function getPreventionStrategies(dataDir: string): string[] {
  const data = loadLearningData(dataDir);
  const strategies: string[] = [];

  // Get strategies from known patterns that have occurred
  for (const pattern of data.patterns) {
    const matchingFailures = data.failures.filter(
      f => f.errorType === pattern.category && pattern.pattern.test(f.errorMessage),
    );
    if (matchingFailures.length > 0) {
      strategies.push(`${pattern.preventionStrategy} (occurred ${matchingFailures.length}x)`);
    }
  }

  // Get strategies from unresolved failures
  const unresolved = data.failures.filter(f => !f.resolved);
  for (const failure of unresolved.slice(0, 5)) {
    if (failure.fix) {
      strategies.push(`Fix for "${failure.errorMessage.slice(0, 50)}": ${failure.fix}`);
    }
  }

  return strategies;
}

/**
 * Get the most common failure types.
 */
export function getCommonFailures(dataDir: string, limit: number = 10): Array<{ type: string; count: number; lastSeen: number }> {
  const data = loadLearningData(dataDir);
  const counts = new Map<string, { count: number; lastSeen: number }>();

  for (const failure of data.failures) {
    const key = failure.errorType;
    const existing = counts.get(key) ?? { count: 0, lastSeen: 0 };
    existing.count += failure.occurrences;
    existing.lastSeen = Math.max(existing.lastSeen, failure.timestamp);
    counts.set(key, existing);
  }

  return Array.from(counts.entries())
    .map(([type, { count, lastSeen }]) => ({ type, count, lastSeen }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Update run statistics.
 */
export function updateRunStats(dataDir: string, success: boolean, score: number): void {
  const data = loadLearningData(dataDir);
  data.totalRuns++;
  data.successRate = ((data.successRate * (data.totalRuns - 1)) + (success ? 1 : 0)) / data.totalRuns;
  data.averageScore = ((data.averageScore * (data.totalRuns - 1)) + score) / data.totalRuns;
  data.lastUpdated = Date.now();
  saveLearningData(dataDir, data);
}

/**
 * Get a summary of learning data for CLI display.
 */
export function formatLearningSummary(dataDir: string): string {
  const data = loadLearningData(dataDir);
  const lines: string[] = [];

  lines.push('📊 Learning Summary');
  lines.push(`   Total runs: ${data.totalRuns}`);
  lines.push(`   Success rate: ${Math.round(data.successRate * 100)}%`);
  lines.push(`   Average score: ${Math.round(data.averageScore * 100)}%`);
  lines.push(`   Tracked failures: ${data.failures.length}`);

  const unresolved = data.failures.filter(f => !f.resolved);
  lines.push(`   Unresolved: ${unresolved.length}`);

  const common = getCommonFailures(dataDir, 5);
  if (common.length > 0) {
    lines.push('   Common failure types:');
    for (const c of common) {
      lines.push(`     • ${c.type}: ${c.count} occurrences`);
    }
  }

  return lines.join('\n');
}
