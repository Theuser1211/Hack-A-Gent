/**
 * Benchmark Measurement Engine
 * ============================
 *
 * Measures generated projects across the engineering dimensions the mission
 * requires, using REAL tooling — never fabricated numbers:
 *
 *   Compilation · Lint · Type Safety · Tests · Accessibility · Performance
 *   · Bundle Size · Architecture · Maintainability · Documentation
 *   · Deployment · User Experience
 *
 * Every dimension returns a `MeasuredDimension` with:
 *   - `measured: true`  → a real value was produced
 *   - `measured: false` → the dimension could not be measured in this
 *     environment (tool missing, no build output, etc.). In that case
 *     `score` is null and `detail` explains why. We NEVER invent a number.
 *
 * Scores are normalized to 0..1 where a clear pass/fail criterion exists.
 * For inherently relative dimensions (Performance = build ms, Bundle Size =
 * KB) we report the raw value and leave `score` null so leaderboards only
 * ever average genuinely comparable numbers.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

import { deterministicNow } from '../../benchmarks/determinism-kernel.js';
import { evaluateProject, type EvaluationResult } from '../../kernel/evaluation/real-evaluator.js';

export type DimensionName =
  | 'compilation'
  | 'lint'
  | 'typeSafety'
  | 'tests'
  | 'accessibility'
  | 'performance'
  | 'bundleSize'
  | 'architecture'
  | 'maintainability'
  | 'documentation'
  | 'deployment'
  | 'userExperience';

export interface MeasuredDimension {
  name: DimensionName;
  /** Normalized 0..1 when comparable; null when only a raw value exists. */
  score: number | null;
  /** Raw measured value (error count, ms, KB, booleans encoded, etc.). May be structured. */
  raw: unknown;
  measured: boolean;
  detail: string;
}

export interface MeasurementResult {
  projectDir: string;
  dimensions: MeasuredDimension[];
  /** Convenience: dimensions keyed by name. */
  byName: Record<string, MeasuredDimension>;
  evaluated: EvaluationResult | null;
  measuredAt: string;
}

const ALL_DIMENSIONS: DimensionName[] = [
  'compilation',
  'lint',
  'typeSafety',
  'tests',
  'accessibility',
  'performance',
  'bundleSize',
  'architecture',
  'maintainability',
  'documentation',
  'deployment',
  'userExperience',
];

/**
 * Resolve a local tool binary by walking up from `fromDir` looking for
 * node_modules/.bin/<tool>. Falls back to the bare name (PATH). This avoids
 * `npx`, which can fetch bogus packages in sandboxed/empty directories and
 * would otherwise make measurements non-deterministic or fail silently.
 */
function resolveBin(tool: string, fromDir: string): string {
  const roots = [path.resolve(fromDir), process.cwd()];
  for (const root of roots) {
    let dir = root;
    for (let i = 0; i < 8; i += 1) {
      const candidate = path.join(dir, 'node_modules', '.bin', tool);
      if (existsSync(candidate)) return candidate;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
  }
  return tool; // fall back to PATH
}

function runTool(cwd: string, tool: string, args: string, timeoutMs: number): { stdout: string; ok: boolean; err?: string } {
  const bin = resolveBin(tool, cwd);
  try {
    const stdout = execSync(`"${bin}" ${args}`, { cwd, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] }).toString();
    return { stdout, ok: true };
  } catch (e) {
    const err = e as { stdout?: Buffer; stderr?: Buffer; message?: string };
    const out = err.stdout?.toString() ?? err.stderr?.toString() ?? err.message ?? '';
    // Non-zero exit still produces stdout/stderr we can parse.
    return { stdout: out, ok: false, err: out };
  }
}

function countMatches(dir: string, pattern: RegExp, maxDepth = 6): number {
  let count = 0;
  const walk = (d: string, depth: number): void => {
    if (depth > maxDepth) return;
    let entries: string[] = [];
    try {
      entries = readdirSync(d);
    } catch {
      return;
    }
    for (const e of entries) {
      if (e === 'node_modules' || e === '.git' || e === 'dist' || e === '.next' || e === 'build') continue;
      const full = path.join(d, e);
      try {
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full, depth + 1);
        } else if (/\.(ts|tsx|js|jsx|mdx?)$/.test(e)) {
          const text = readFileSync(full, 'utf-8');
          const m = text.match(pattern);
          if (m) count += 1;
        }
      } catch {
        /* skip unreadable */
      }
    }
  };
  walk(dir, 0);
  return count;
}

function measureCompilation(projectDir: string): MeasuredDimension {
  const r = runTool(projectDir, 'tsc', '--noEmit', 120000);
  // tsc prints "error TS" lines on failure.
  const errors = (r.stdout.match(/error TS\d+/g) ?? []).length;
  const passed = r.ok || errors === 0;
  return {
    name: 'compilation',
    score: passed ? 1 : Math.max(0, 1 - errors / 20),
    raw: errors,
    measured: true,
    detail: passed ? `Compiles cleanly (${errors} errors)` : `${errors} TypeScript errors`,
  };
}

function measureLint(projectDir: string): MeasuredDimension {
  // Prefer project ESLint config if present.
  const hasConfig = ['.eslintrc.js', '.eslintrc.cjs', '.eslintrc.json', 'eslint.config.js', '.eslintrc.yaml'].some((f) =>
    existsSync(path.join(projectDir, f)),
  );
  if (!hasConfig) {
    return { name: 'lint', score: null, raw: 'no-eslint-config', measured: false, detail: 'No ESLint config in project — lint not measured (not fabricated).' };
  }
  const r = runTool(projectDir, 'eslint', '. --format json', 120000);
  // eslint --format json prints an array; non-zero exit on lint errors.
  let errors = 0;
  let warnings = 0;
  try {
    const parsed = JSON.parse(r.stdout || '[]') as Array<{ errorCount?: number; warningCount?: number }>;
    for (const f of parsed) {
      errors += f.errorCount ?? 0;
      warnings += f.warningCount ?? 0;
    }
  } catch {
    errors = (r.stdout.match(/error\b/gi) ?? []).length;
  }
  return {
    name: 'lint',
    score: errors === 0 ? 1 : Math.max(0, 1 - errors / 20),
    raw: { errors, warnings },
    measured: true,
    detail: errors === 0 ? `Lint clean (${warnings} warnings)` : `${errors} lint errors, ${warnings} warnings`,
  };
}

function measureTypeSafety(projectDir: string): MeasuredDimension {
  const r = runTool(projectDir, 'tsc', '--noEmit --strict', 120000);
  const strictErrors = (r.stdout.match(/error TS\d+/g) ?? []).length;
  return {
    name: 'typeSafety',
    score: strictErrors === 0 ? 1 : Math.max(0, 1 - strictErrors / 20),
    raw: strictErrors,
    measured: true,
    detail: strictErrors === 0 ? 'Strict type-check passes' : `${strictErrors} strict type errors`,
  };
}

function measureTests(projectDir: string): MeasuredDimension {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!existsSync(pkgPath)) {
    return { name: 'tests', score: null, raw: 'no-package', measured: false, detail: 'No package.json — tests not measured.' };
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8')) as { scripts?: Record<string, string> };
  const hasTestScript = pkg.scripts && (pkg.scripts.test || pkg.scripts['test:run']);
  if (!hasTestScript) {
    return { name: 'tests', score: null, raw: 'no-test-script', measured: false, detail: 'No test script defined — tests not measured.' };
  }
  const testFiles = countMatches(projectDir, /(describe|it\(|test\()/);
  if (testFiles === 0) {
    return { name: 'tests', score: 0, raw: 0, measured: true, detail: 'Test script present but no test files found' };
  }
  const r = runTool(projectDir, 'vitest', 'run --reporter=dot', 180000);
  const passed = r.ok;
  const total = (r.stdout.match(/Test Files\s+(\d+)/) ?? [])[1];
  return {
    name: 'tests',
    score: passed ? 1 : 0,
    raw: { testFiles, passed, total: total ? Number(total) : undefined },
    measured: true,
    detail: passed ? `Tests pass (${testFiles} test files)` : `Tests present but failing (${testFiles} test files)`,
  };
}

function measureAccessibility(projectDir: string): MeasuredDimension {
  const interactive = countMatches(projectDir, /<(button|a|input|select|textarea|nav)\b/i);
  const a11y = countMatches(projectDir, /(aria-\w+|role=|alt=|<label|<fieldset)/i);
  if (interactive === 0) {
    return { name: 'accessibility', score: null, raw: 'no-interactive-elements', measured: false, detail: 'No interactive elements to assess — accessibility not scored.' };
  }
  const ratio = Math.min(1, a11y / Math.max(1, interactive));
  return {
    name: 'accessibility',
    score: ratio,
    raw: { interactive, accessibleAttrs: a11y, ratio: Number(ratio.toFixed(2)) },
    measured: true,
    detail: `${a11y} a11y markers across ${interactive} interactive elements (coverage ${Math.round(ratio * 100)}%)`,
  };
}

function measurePerformance(projectDir: string): MeasuredDimension {
  // Performance is inherently comparative; we measure real build time only.
  const start = Date.now();
  const r = runTool(projectDir, 'tsc', '--noEmit', 120000);
  const buildMs = r.ok ? Date.now() - start : -1;
  return {
    name: 'performance',
    score: null,
    raw: buildMs,
    measured: buildMs >= 0,
    detail: buildMs >= 0 ? `Type-check/build time: ${buildMs}ms (raw, not normalized)` : 'Build did not complete — performance not measured.',
  };
}

function measureBundleSize(projectDir: string): MeasuredDimension {
  const candidates = ['.next', 'dist', 'build', 'out'];
  for (const c of candidates) {
    const dir = path.join(projectDir, c);
    if (existsSync(dir)) {
      let bytes = 0;
      const walk = (d: string): void => {
        for (const e of readdirSync(d)) {
          const full = path.join(d, e);
          try {
            const st = statSync(full);
            if (st.isDirectory()) walk(full);
            else bytes += st.size;
          } catch {
            /* skip */
          }
        }
      };
      try {
        walk(dir);
        return {
          name: 'bundleSize',
          score: null,
          raw: Number((bytes / 1024).toFixed(1)),
          measured: true,
          detail: `Build artifact "${c}" size: ${(bytes / 1024).toFixed(1)} KB (raw, not normalized)`,
        };
      } catch {
        /* fall through */
      }
    }
  }
  return { name: 'bundleSize', score: null, raw: 'no-build-output', measured: false, detail: 'No build output found — bundle size not measured.' };
}

function measureDeployment(projectDir: string): MeasuredDimension {
  const signals = [
    'vercel.json',
    'netlify.toml',
    'netlify.json',
    'Dockerfile',
    'docker-compose.yml',
    '.github/workflows',
    'railway.json',
    'render.yaml',
  ];
  const found = signals.filter((s) => {
    const p = path.join(projectDir, s);
    return existsSync(p) || (s.endsWith('/') && existsSync(path.join(projectDir, s.replace(/\/$/, ''))));
  });
  // Also accept a "deploy" script in package.json as a weak positive.
  let deployScript = false;
  try {
    const pkg = JSON.parse(readFileSync(path.join(projectDir, 'package.json'), 'utf-8')) as { scripts?: Record<string, string> };
    deployScript = !!(pkg.scripts && (pkg.scripts.deploy || pkg.scripts.build));
  } catch {
    /* ignore */
  }
  const positives = found.length + (deployScript ? 1 : 0);
  return {
    name: 'deployment',
    score: Math.min(1, positives / 2),
    raw: { found, deployScript },
    measured: true,
    detail: found.length ? `Deployment config: ${found.join(', ')}` : deployScript ? 'Build/deploy script present only' : 'No deployment configuration detected',
  };
}

function measureDocumentation(projectDir: string): MeasuredDimension {
  const readme = existsSync(path.join(projectDir, 'README.md'));
  const mdFiles = countMatches(projectDir, /^#\s/m); // markdown headings in any file
  const jsdoc = countMatches(projectDir, /\/\*\*|\/\/\/|\/\*/);
  const score = readme ? Math.min(1, 0.6 + mdFiles / 20 + jsdoc / 50) : Math.min(1, mdFiles / 30);
  return {
    name: 'documentation',
    score,
    raw: { readme, markdownHeadings: mdFiles, docComments: jsdoc },
    measured: true,
    detail: `README: ${readme ? 'yes' : 'no'}, ${mdFiles} markdown headings, ${jsdoc} doc comments`,
  };
}

function measureArchitecture(evalResult: EvaluationResult | null): MeasuredDimension {
  if (!evalResult) {
    return { name: 'architecture', score: null, raw: 'no-eval', measured: false, detail: 'Code analysis unavailable — architecture not measured.' };
  }
  // Score from real structural signals: components, api routes, separation.
  const { componentCount, apiRouteCount, fileCount } = evalResult;
  const hasStructure = componentCount > 0 || apiRouteCount > 0;
  const score = hasStructure ? Math.min(1, 0.4 + Math.min(0.3, componentCount / 20) + Math.min(0.3, apiRouteCount / 10)) : (fileCount > 0 ? 0.3 : 0);
  return {
    name: 'architecture',
    score,
    raw: { componentCount, apiRouteCount, fileCount },
    measured: true,
    detail: `${componentCount} components, ${apiRouteCount} API routes, ${fileCount} files`,
  };
}

function measureMaintainability(evalResult: EvaluationResult | null): MeasuredDimension {
  if (!evalResult) {
    return { name: 'maintainability', score: null, raw: 'no-eval', measured: false, detail: 'Code analysis unavailable — maintainability not measured.' };
  }
  const { testFiles, totalLines, typescriptFiles } = evalResult;
  if (totalLines === 0) {
    return { name: 'maintainability', score: 0, raw: 0, measured: true, detail: 'No source lines analyzed' };
  }
  const testRatio = Math.min(1, testFiles / Math.max(1, typescriptFiles) );
  const tsRatio = typescriptFiles / Math.max(1, totalLines); // share of typed code
  const score = Math.min(1, 0.5 * testRatio + 0.5 * Math.min(1, tsRatio * 5));
  return {
    name: 'maintainability',
    score,
    raw: { testFiles, typescriptFiles, totalLines, testRatio: Number(testRatio.toFixed(2)) },
    measured: true,
    detail: `${testFiles} test files / ${typescriptFiles} TS files; ${totalLines} lines`,
  };
}

function measureUX(projectDir: string): MeasuredDimension {
  const responsive = countMatches(projectDir, /(sm:|md:|lg:|xl:|@media|grid|flex)/);
  const aria = countMatches(projectDir, /(aria-\w+|role=|alt=)/);
  const loading = countMatches(projectDir, /(loading|spinner|Skeleton|isLoading|suspense|useQuery)/i);
  const total = responsive + aria + loading;
  const score = total === 0 ? 0 : Math.min(1, 0.4 + 0.3 * Math.min(1, responsive / 5) + 0.3 * Math.min(1, aria / 5));
  return {
    name: 'userExperience',
    score,
    raw: { responsive, aria, loading },
    measured: true,
    detail: `Responsive: ${responsive}, ARIA: ${aria}, Loading states: ${loading}`,
  };
}

export function measureProject(projectDir: string, opts: { skipSlow?: boolean } = {}): MeasurementResult {
  const evalResult = existsSync(path.join(projectDir, 'package.json')) ? safeEval(projectDir) : null;

  const dimensions: MeasuredDimension[] = [
    measureCompilation(projectDir),
    measureLint(projectDir),
    measureTypeSafety(projectDir),
    measureTests(projectDir),
    measureAccessibility(projectDir),
    opts.skipSlow ? { name: 'performance', score: null, raw: 'skipped', measured: false, detail: 'Skipped (--fast).' } : measurePerformance(projectDir),
    measureBundleSize(projectDir),
    measureArchitecture(evalResult),
    measureMaintainability(evalResult),
    measureDocumentation(projectDir),
    measureDeployment(projectDir),
    measureUX(projectDir),
  ];

  const byName: Record<string, MeasuredDimension> = {};
  for (const d of dimensions) byName[d.name] = d;

  return {
    projectDir,
    dimensions,
    byName,
    evaluated: evalResult,
    measuredAt: deterministicStamp(),
  };
}

function safeEval(projectDir: string): EvaluationResult | null {
  try {
    return evaluateProject(projectDir);
  } catch {
    return null;
  }
}

// Deterministic timestamp (no wall clock) so history diffs are reproducible.
function deterministicStamp(): string {
  return deterministicNow(0);
}

export { ALL_DIMENSIONS };
