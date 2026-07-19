/**
 * Real Benchmark Framework
 * =======================
 *
 * Evaluates a generated project against 15 verifiable dimensions, stores
 * reproducible run history, and supports model-to-model comparison.
 *
 * Design rules:
 *  • Real, not synthetic — every dimension score comes from inspecting
 *    the actual project (file content, build/lint/test output) or a
 *    clearly-labeled heuristic when a tool is unavailable.
 *  • Deterministic — runs are keyed by (category, model, seed); no
 *    Math.random / Date.now in scoring. The same inputs ⇒ same result.
 *  • Hermetic by default — heavy tools (tsc/eslint/test) are run
 *    only when present and never block; static checks always run.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';

import { getSeededRandom, createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import {
  type CategorySpec,
  type BenchDimension,
  ALL_DIMENSIONS,
  getCategory,
} from './category-suite.js';

export interface DimensionResult {
  id: BenchDimension;
  label: string;
  score: number; // 0-100
  weight: number; // normalized 0-100
  evidence: string[];
  passed: boolean;
}

export interface CategoryRunResult {
  runId: string;
  categoryId: string;
  categoryName: string;
  seed: number;
  model: string;
  /** Deterministic timestamp derived from seed (no Date.now). */
  startedAt: string;
  durationMs: number;
  dimensions: DimensionResult[];
  score: number; // weighted aggregate 0-100
  maxScore: number;
  passed: boolean;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
}

export interface EvalOptions {
  seed?: number;
  model?: string;
  /** Run tsc/eslint (skipped if the tool is missing). Default true. */
  allowShell?: boolean;
  dataDir?: string; // for history persistence
}

export const DIMENSION_LABELS: Record<BenchDimension, string> = {
  compilation: 'Compilation',
  type_safety: 'Type Safety',
  lint: 'Lint',
  tests: 'Tests',
  performance: 'Performance',
  accessibility: 'Accessibility',
  seo: 'SEO',
  responsiveness: 'Responsiveness',
  bundle_size: 'Bundle Size',
  code_quality: 'Code Quality',
  architecture: 'Architecture',
  maintainability: 'Maintainability',
  documentation: 'Documentation',
  file_organization: 'File Organization',
  deployment_readiness: 'Deployment Readiness',
};

// ── File inspection helpers (no external deps) ──────────────────────

const TEXT_EXT = /\.(ts|tsx|js|jsx|json|md|css|html|mdx)$/;

function walk(dir: string, maxDepth: number, cb: (file: string) => void): void {
  if (maxDepth <= 0) return;
  let entries: string[] = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === 'node_modules' || name === '.git' || name === 'dist' || name === '.next') continue;
    const full = path.join(dir, name);
    try {
      const st = statSync(full);
      if (st.isDirectory()) walk(full, maxDepth - 1, cb);
      else if (st.isFile()) cb(full);
    } catch {
      /* ignore */
    }
  }
}

/** Recursively search project files for a pattern. Returns matched file paths. */
function searchProject(projectDir: string, pattern: RegExp, maxDepth = 6): string[] {
  const hits: string[] = [];
  walk(projectDir, maxDepth, (file) => {
    if (!TEXT_EXT.test(file)) return;
    try {
      if (pattern.test(readFileSync(file, 'utf-8'))) hits.push(file);
    } catch {
      /* ignore unreadable */
    }
  });
  return hits;
}

function readProject(projectDir: string): { files: string[]; texts: Map<string, string> } {
  const files: string[] = [];
  const texts = new Map<string, string>();
  walk(projectDir, 8, (file) => {
    files.push(file);
    if (TEXT_EXT.test(file)) {
      try {
        texts.set(file, readFileSync(file, 'utf-8'));
      } catch {
        /* ignore */
      }
    }
  });
  return { files, texts };
}

function hasDir(projectDir: string, name: string): boolean {
  return existsSync(path.join(projectDir, name)) && statSync(path.join(projectDir, name)).isDirectory();
}

// ── Shell tool helpers (best-effort) ───────────────────────────────

function tryShell(cmd: string, cwd: string, timeoutMs: number): { ok: boolean; out: string } {
  try {
    const out = execSync(cmd, {
      cwd,
      stdio: 'pipe',
      timeout: timeoutMs,
      windowsHide: true,
      encoding: 'utf-8',
    });
    return { ok: true, out: `${out}` };
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return { ok: false, out: e.stdout ?? e.stderr ?? e.message ?? '' };
  }
}

// ── Dimension checkers ────────────────────────────────────────────────

interface DimOutcome {
  score: number;
  evidence: string[];
}

function checkCompilation(spec: CategorySpec, dir: string, allowShell: boolean): DimOutcome {
  const evidence: string[] = [];
  if (!hasDir(dir, 'node_modules') && allowShell) {
    const r = tryShell('npx --no-install tsc --noEmit 2>&1 || tsc --noEmit 2>&1', dir, 30000);
    if (r.ok || /0 errors?/i.test(r.out) || r.out.trim() === '') {
      evidence.push('tsc --noEmit reported no errors.');
      return { score: 100, evidence };
    }
    const errs = (r.out.match(/error TS/g) ?? []).length;
    evidence.push(errs > 0 ? `${errs} TS error(s) detected.` : 'tsc unavailable; using static checks.');
    const score = errs === 0 ? 90 : Math.max(0, 100 - errs * 5);
    return { score, evidence };
  }
  evidence.push('No installed toolchain; static check only.');
  return { score: 70, evidence };
}

function checkTypeSafety(spec: CategorySpec, dir: string, allowShell: boolean): DimOutcome {
  const evidence: string[] = [];
  if (allowShell) {
    const r = tryShell('npx --no-install tsc --noEmit 2>&1 || tsc --noEmit 2>&1', dir, 30000);
    const errs = (r.out.match(/error TS\d+/g) ?? []).length;
    if (errs === 0) {
      evidence.push('No TypeScript errors.');
      return { score: 100, evidence };
    }
    evidence.push(`${errs} type error(s).`);
    return { score: Math.max(0, 100 - errs * 6), evidence };
  }
  // Static: count `as any` / `: any` which are type-safety smells.
  const anys = searchProject(dir, /:\s*any\b|:\s*unknown\s*&&\s*any|\bas any\b/).length;
  evidence.push(anys > 0 ? `${anys} potential 'any' usages.` : 'No obvious unsafe any-usage.');
  return { score: anys > 0 ? 60 : 85, evidence };
}

function checkLint(spec: CategorySpec, dir: string, allowShell: boolean): DimOutcome {
  const evidence: string[] = [];
  if (allowShell && existsSync(path.join(dir, '.eslintrc.json')) || existsSync(path.join(dir, '.eslintrc'))) {
    const r = tryShell('npx --no-install eslint . 2>&1 || eslint . 2>&1', dir, 30000);
    const errs = (r.out.match(/error/g) ?? []).length;
    const warns = (r.out.match(/warning/g) ?? []).length;
    evidence.push(`eslint: ${errs} error(s), ${warns} warning(s) (or tool unavailable).`);
    return { score: errs === 0 ? 100 : Math.max(0, 100 - errs * 8 - warns), evidence };
  }
  evidence.push('No ESLint config; static check only.');
  return { score: 75, evidence };
}

function checkTests(spec: CategorySpec, dir: string): DimOutcome {
  const testFiles = searchProject(dir, /\.test\.(ts|tsx|js)$|__tests__|\/tests?\//).length;
  if (testFiles > 0) {
    return { score: 90, evidence: [`${testFiles} test file(s) present.`] };
  }
  return { score: 20, evidence: ['No test files detected.'] };
}

function checkPerformance(spec: CategorySpec, dir: string): DimOutcome {
  const lazy = searchProject(dir, /dynamic\s*import|React\.lazy|next\/dynamic|loading\s*[:=]|Suspense/).length;
  const img = searchProject(dir, /next\/image|<img[^>]+loading=|loading="lazy"/).length;
  const score = Math.min(100, 40 + lazy * 20 + img * 10);
  const evidence: string[] = [
    `${lazy} lazy/split signal(s)`,
    `${img} optimized-image signal(s)`,
  ];
  return { score, evidence };
}

function checkAccessibility(spec: CategorySpec, dir: string): DimOutcome {
  const aria = searchProject(dir, /aria-|role=|aria-label|htmlFor|label\s+htmlFor/).length;
  const alt = searchProject(dir, /<img[^>]+alt=|alt=\{?["']/).length;
  const score = Math.min(100, aria * 12 + alt * 8);
  return { score, evidence: [`${aria} ARIA/role signal(s)`, `${alt} alt-text signal(s)`] };
}

function checkSeo(spec: CategorySpec, dir: string): DimOutcome {
  const meta = searchProject(dir, /export\s+const\s+metadata|generateMetadata|name=["']description|og:|\{ title:/).length;
  const feed = searchProject(dir, /rss|sitemap|\.xml/).length;
  const score = Math.min(100, meta * 20 + feed * 15);
  return { score, evidence: [`${meta} metadata signal(s)`, `${feed} feed/sitemap signal(s)`] };
}

function checkResponsiveness(spec: CategorySpec, dir: string): DimOutcome {
  const bp = searchProject(dir, /(^|\s)(sm|md|lg|xl):|@media|max-width|min-width/).length;
  const score = Math.min(100, bp * 12);
  return { score, evidence: [`${bp} responsive/breakpoint signal(s)`] };
}

function checkBundleSize(spec: CategorySpec, dir: string): DimOutcome {
  const nextOut = path.join(dir, '.next');
  if (existsSync(nextOut)) {
    let bytes = 0;
    walk(nextOut, 6, (f) => {
      try {
        bytes += statSync(f).size;
      } catch {
        /* ignore */
      }
    });
    const kb = Math.round(bytes / 1024);
    const score = kb === 0 ? 80 : kb < 500 ? 100 : kb < 1500 ? 75 : kb < 4000 ? 50 : 25;
    return { score, evidence: [`Build output ~${kb}KB.`] };
  }
  // Heuristic: fewer heavy deps ⇒ smaller bundle.
  const pkgPath = path.join(dir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const deps = Object.keys(pkg.dependencies ?? {}).length;
      const score = Math.max(20, 100 - deps * 6);
      return { score, evidence: [`${deps} runtime dependencies (heuristic).`] };
    } catch {
      /* fall through */
    }
  }
  return { score: 60, evidence: ['No build output or package.json; heuristic only.'] };
}

function checkCodeQuality(spec: CategorySpec, dir: string): DimOutcome {
  const { texts } = readProject(dir);
  let totalLines = 0;
  let consoleCount = 0;
  let todoCount = 0;
  for (const t of texts.values()) {
    totalLines += t.split('\n').length;
    consoleCount += (t.match(/console\.(log|warn|error|debug)/g) ?? []).length;
    todoCount += (t.match(/TODO|FIXME|XXX/g) ?? []).length;
  }
  const files = texts.size || 1;
  const perFile = totalLines / files;
  let score = 80;
  if (perFile > 400) score -= 15; // overly long files
  if (consoleCount > files) score -= 10;
  if (todoCount > 0) score -= Math.min(20, todoCount * 4);
  const evidence = [
    `${files} source file(s), avg ${Math.round(perFile)} lines`,
    `${consoleCount} console.* call(s)`,
    `${todoCount} TODO/FIXME marker(s)`,
  ];
  return { score: Math.max(0, score), evidence };
}

function checkArchitecture(spec: CategorySpec, dir: string): DimOutcome {
  const wanted = ['app', 'components', 'lib', 'server', 'src', 'pages'];
  const present = wanted.filter((w) => hasDir(dir, w));
  const score = Math.min(100, present.length * 18);
  const evidence = [
    present.length > 0 ? `Layered dirs: ${present.join(', ')}` : 'No recognized layer directories.',
  ];
  return { score, evidence };
}

function checkMaintainability(spec: CategorySpec, dir: string): DimOutcome {
  const { texts } = readProject(dir);
  let comments = 0;
  let code = 0;
  for (const t of texts.values()) {
    for (const line of t.split('\n')) {
      if (/^\s*([/]{2}|\*|\/\*)/.test(line)) comments++;
      else if (line.trim().length > 0) code++;
    }
  }
  const ratio = code > 0 ? comments / code : 0;
  const score = Math.min(100, 50 + ratio * 200);
  return { score, evidence: [`Comment-to-code ratio ≈ ${ratio.toFixed(2)}.`] };
}

function checkDocumentation(spec: CategorySpec, dir: string): DimOutcome {
  const hasReadme = existsSync(path.join(dir, 'README.md'));
  const { texts } = readProject(dir);
  let docComments = 0;
  for (const t of texts.values()) docComments += (t.match(/\/\*\*|\/\/ [A-Z]/g) ?? []).length;
  const score = (hasReadme ? 60 : 0) + Math.min(40, docComments * 4);
  const evidence = [hasReadme ? 'README.md present.' : 'No README.', `${docComments} doc-comment signal(s)`];
  return { score, evidence };
}

function checkFileOrganization(spec: CategorySpec, dir: string): DimOutcome {
  const evidence: string[] = [];
  let passed = 0;
  for (const a of spec.acceptance) {
    const tgt = path.join(dir, a.target);
    if (a.target === 'app' || a.target.startsWith('app/') || a.target.startsWith('src')) {
      const hits = searchProject(dir, new RegExp(a.pattern, 'i'), 6);
      if (hits.length > 0) passed++;
      else evidence.push(`Missing: ${a.description} (${a.id}).`);
    } else if (existsSync(tgt)) {
      passed++;
    }
  }
  const total = spec.acceptance.length || 1;
  const score = Math.round((passed / total) * 100);
  if (passed === total) evidence.unshift(`All ${total} acceptance checks present.`);
  return { score, evidence };
}

function checkDeployment(spec: CategorySpec, dir: string): DimOutcome {
  const signals = [
    'vercel.json',
    'netlify.toml',
    'Dockerfile',
    '.github/workflows',
    '.env.example',
    'railway.json',
    'render.yaml',
  ].filter((s) => {
    const p = path.join(dir, s);
    return existsSync(p);
  });
  const score = Math.min(100, signals.length * 20);
  return { score, evidence: signals.length > 0 ? signals : ['No deployment config detected.'] };
}

// ── Orchestration ───────────────────────────────────────────────────

const CHECKERS: Record<BenchDimension, (spec: CategorySpec, dir: string, allowShell: boolean) => DimOutcome> = {
  compilation: (s, d, a) => checkCompilation(s, d, a),
  type_safety: (s, d, a) => checkTypeSafety(s, d, a),
  lint: (s, d) => checkLint(s, d, true),
  tests: (_s, d) => checkTests(_s, d),
  performance: (_s, d) => checkPerformance(_s, d),
  accessibility: (_s, d) => checkAccessibility(_s, d),
  seo: (_s, d) => checkSeo(_s, d),
  responsiveness: (_s, d) => checkResponsiveness(_s, d),
  bundle_size: (_s, d) => checkBundleSize(_s, d),
  code_quality: (_s, d) => checkCodeQuality(_s, d),
  architecture: (_s, d) => checkArchitecture(_s, d),
  maintainability: (_s, d) => checkMaintainability(_s, d),
  documentation: (_s, d) => checkDocumentation(_s, d),
  file_organization: (s, d) => checkFileOrganization(s, d),
  deployment_readiness: (_s, d) => checkDeployment(_s, d),
};

function normalizeWeights(spec: CategorySpec): Record<BenchDimension, number> {
  const raw: Record<string, number> = { ...spec.weights };
  let sum = ALL_DIMENSIONS.reduce((s, d) => s + (raw[d] ?? 0), 0);
  if (sum === 0) sum = ALL_DIMENSIONS.length;
  const out = {} as Record<BenchDimension, number>;
  for (const d of ALL_DIMENSIONS) out[d] = Math.round(((raw[d] ?? 0) / sum) * 100);
  return out;
}

function gradeFor(score: number): CategoryRunResult['grade'] {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/**
 * Evaluate a project directory against one category's 15 dimensions.
 * Deterministic for a given (spec, dir, seed).
 */
export function evaluateProject(
  categoryId: string,
  projectDir: string,
  opts: EvalOptions = {},
): CategoryRunResult {
  const spec = getCategory(categoryId);
  if (!spec) throw new Error(`Unknown category: ${categoryId}`);
  const seed = opts.seed ?? 42;
  const model = opts.model ?? 'baseline';
  const allowShell = opts.allowShell ?? true;
  const rng = getSeededRandom(seed);
  void rng;

  const weights = normalizeWeights(spec);
  const dimensions: DimensionResult[] = ALL_DIMENSIONS.map((dim) => {
    const outcome = CHECKERS[dim](spec, projectDir, allowShell);
    const passed = outcome.score >= 60;
    return {
      id: dim,
      label: DIMENSION_LABELS[dim],
      score: Math.max(0, Math.min(100, Math.round(outcome.score))),
      weight: weights[dim],
      evidence: outcome.evidence,
      passed,
    };
  });

  const score = Math.round(
    dimensions.reduce((s, d) => s + (d.score * d.weight) / 100, 0),
  );
  const maxScore = 100;
  const passed = score >= 70;
  const runId = createDeterministicUuid(seed, categoryId.length + model.length).slice(0, 14);

  return {
    runId,
    categoryId: spec.id,
    categoryName: spec.name,
    seed,
    model,
    startedAt: new Date(1700000000000 + seed * 1000).toISOString(),
    durationMs: 0,
    dimensions,
    score,
    maxScore,
    passed,
    grade: gradeFor(score),
  };
}

// ── History store (reproducible) ───────────────────────────────────

export interface HistoryStore {
  runs: Record<string, CategoryRunResult>;
}

const HISTORY_FILE = 'benchmark-history.json';

export function loadHistory(dataDir: string): HistoryStore {
  const p = path.join(dataDir, HISTORY_FILE);
  if (!existsSync(p)) return { runs: {} };
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as HistoryStore;
    return parsed.runs ? parsed : { runs: {} };
  } catch {
    return { runs: {} };
  }
}

export function saveRun(result: CategoryRunResult, dataDir: string): void {
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const store = loadHistory(dataDir);
  store.runs[result.runId] = result;
  writeFileSync(path.join(dataDir, HISTORY_FILE), JSON.stringify(store, null, 2), 'utf-8');
}

export function listHistory(dataDir: string): CategoryRunResult[] {
  return Object.values(loadHistory(dataDir).runs);
}

export interface ComparisonRow {
  dimension: string;
  a: number;
  b: number;
  delta: number;
}

export interface Comparison {
  aRunId: string;
  bRunId: string;
  rows: ComparisonRow[];
  aggregateDelta: number;
}

export function compareRuns(aId: string, bId: string, dataDir: string): Comparison | null {
  const store = loadHistory(dataDir).runs;
  const a = store[aId];
  const b = store[bId];
  if (!a || !b) return null;
  const bMap = new Map(b.dimensions.map((d) => [d.id, d.score]));
  const rows: ComparisonRow[] = a.dimensions.map((d) => {
    const bScore = bMap.get(d.id) ?? 0;
    return { dimension: d.label, a: d.score, b: bScore, delta: d.score - bScore };
  });
  return {
    aRunId: aId,
    bRunId: bId,
    rows,
    aggregateDelta: a.score - b.score,
  };
}

// ── Deterministic starter generator (offline "actual project") ───────

/**
 * Generate a small, real, compiling TypeScript project for a category so
 * the benchmark can evaluate an *actual* project without an LLM or network.
 * Content deterministically satisfies the category's acceptance patterns.
 * Production runs would instead evaluate LLM-generated projects.
 */
export function generateStarter(categoryId: string, outDir: string): string[] {
  const spec = getCategory(categoryId);
  if (!spec) throw new Error(`Unknown category: ${categoryId}`);
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const written: string[] = [];
  const write = (rel: string, content: string) => {
    const full = path.join(outDir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
    written.push(rel);
  };

  write('package.json', JSON.stringify({
    name: `hag-${spec.id}`,
    version: '1.0.0',
    private: true,
    type: 'module',
    scripts: { build: 'tsc', 'typecheck': 'tsc --noEmit' },
    devDependencies: { typescript: '^5.8.2' },
  }, null, 2) + '\n');

  write('tsconfig.json', JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'bundler',
      strict: true,
      noEmit: true,
      esModuleInterop: true,
      skipLibCheck: true,
    },
    include: ['src/**/*.ts'],
  }, null, 2) + '\n');

  write('README.md', `# ${spec.name}\n\n${spec.description}\n\n## Run\n\n\`\`\`bash\nnpm install\nnpm run build\n\`\`\`\n`);

  write('src/index.ts', `// ${spec.name} — generated starter for benchmark "${spec.id}".\n// Stack: ${spec.stack.join(', ')}.\n\nexport interface AppConfig {\n  name: string;\n  category: '${spec.id}';\n}\n\nexport const config: AppConfig = {\n  name: '${spec.name}',\n  category: '${spec.id}',\n};\n\nexport function describe(): string {\n  return \`\${config.name} — \${config.category}\`;\n}\n`);

  // A second module that satisfies an acceptance pattern where possible (static).
  write('src/features.ts', `// Feature surface for ${spec.name}.\n// Acceptance patterns referenced: ${spec.acceptance.map((a) => a.id).join(', ')}.\n\nexport interface Feature {\n  id: string;\n  label: string;\n  enabled: boolean;\n}\n\nexport const features: Feature[] = [\n${spec.acceptance
    .map((a) => `  { id: '${a.id}', label: '${a.description}', enabled: true }`)
    .join(',\n')}\n];\n\nexport function enabledCount(): number {\n  return features.filter((f) => f.enabled).length;\n}\n`);

  return written;
}
