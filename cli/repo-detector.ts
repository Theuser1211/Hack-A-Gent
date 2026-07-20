import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { confirmed, inferred, unknownField, type ExtractedField } from './confidence.js';

export interface RepoAnalysis {
  hasRepo: boolean;
  framework: ExtractedField<string>;
  packageManager: ExtractedField<string>;
  language: ExtractedField<string>;
  deploymentTarget: ExtractedField<string>;
  hasTypeScript: boolean;
  hasTests: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  projectHealth: ExtractedField<string>;
}

/**
 * Analyze a directory to detect if it's an existing project and extract details.
 * Never asks the user questions that can be answered automatically.
 */
export function detectRepo(projectDir: string): RepoAnalysis {
  if (!existsSync(projectDir)) {
    return {
      hasRepo: false,
      framework: unknownField(''),
      packageManager: unknownField(''),
      language: unknownField(''),
      deploymentTarget: unknownField(''),
      hasTypeScript: false,
      hasTests: false,
      hasDocker: false,
      hasCI: false,
      projectHealth: unknownField(''),
    };
  }

  const files = listFiles(projectDir);

  // Detect framework
  const framework = detectFramework(projectDir, files);

  // Detect package manager
  const packageManager = detectPackageManager(projectDir, files);

  // Detect language
  const language = detectLanguage(projectDir, files);

  // Detect deployment target
  const deploymentTarget = detectDeploymentTarget(projectDir, files);

  // Check for TypeScript
  const hasTypeScript = files.some(f =>
    f.endsWith('.ts') || f.endsWith('.tsx') ||
    f === 'tsconfig.json' || f === 'tsconfig.ts'
  );

  // Check for tests
  const hasTests = files.some(f =>
    f.includes('test.') || f.includes('spec.') ||
    f.includes('__test__') || f === 'vitest.config.ts' ||
    f === 'jest.config.ts' || f === 'jest.config.js'
  );

  // Check for Docker
  const hasDocker = files.some(f =>
    f === 'Dockerfile' || f.startsWith('docker-compose') || f === '.dockerignore'
  );

  // Check for CI
  const hasCI = files.some(f =>
    f.startsWith('.github/workflows') || f.startsWith('.gitlab-ci') ||
    f === 'Jenkinsfile' || f.startsWith('.circleci')
  );

  // Assess project health
  const health = assessHealth(projectDir, files);

  return {
    hasRepo: true,
    framework,
    packageManager,
    language,
    deploymentTarget,
    hasTypeScript,
    hasTests,
    hasDocker,
    hasCI,
    projectHealth: health,
  };
}

function listFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    walkDir(dir, dir, results);
  } catch {
    // If we can't read the directory, return empty
  }
  return results;
}

function walkDir(root: string, current: string, results: string[]): void {
  let entries;
  try {
    entries = readdirSync(current, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const relativePath = path.relative(root, path.join(current, entry.name));
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.next' || entry.name === 'dist' || entry.name === '.cache') continue;
      walkDir(root, path.join(current, entry.name), results);
    } else {
      results.push(relativePath);
    }
  }
}

function detectFramework(projectDir: string, files: string[]): ExtractedField<string> {
  // Check for package.json
  const pkgPath = path.join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };

      if (allDeps['next']) return confirmed('Next.js', 'package.json dependency');
      if (allDeps['react']) return confirmed('React', 'package.json dependency');
      if (allDeps['vue'] || allDeps['nuxt']) return confirmed('Vue', 'package.json dependency');
      if (allDeps['svelte'] || allDeps['sveltekit']) return confirmed('Svelte', 'package.json dependency');
      if (allDeps['angular'] || allDeps['@angular/core']) return confirmed('Angular', 'package.json dependency');
      if (allDeps['express']) return confirmed('Express', 'package.json dependency');
      if (allDeps['fastify']) return confirmed('Fastify', 'package.json dependency');
      if (allDeps['flask'] || allDeps['django']) return confirmed('Python web framework', 'package.json-like dependency');

      if (files.some(f => f.startsWith('src/app') || f.startsWith('app/'))) return inferred('Next.js App Router', 'app directory structure');
      if (existsSync(path.join(projectDir, 'pages'))) return inferred('Next.js Pages Router', 'pages directory');
    } catch { /* package.json is malformed */ }
  }

  // Check for Python frameworks
  const reqPath = path.join(projectDir, 'requirements.txt');
  if (existsSync(reqPath)) {
    try {
      const req = readFileSync(reqPath, 'utf-8');
      if (req.includes('flask')) return inferred('Flask', 'requirements.txt');
      if (req.includes('django')) return inferred('Django', 'requirements.txt');
      if (req.includes('fastapi')) return inferred('FastAPI', 'requirements.txt');
    } catch { /* unreadable */ }
  }

  // Check for Cargo.toml
  if (existsSync(path.join(projectDir, 'Cargo.toml'))) return confirmed('Rust', 'Cargo.toml');

  // Check for go.mod
  if (existsSync(path.join(projectDir, 'go.mod'))) return confirmed('Go', 'go.mod');

  // Check for index.html (vanilla JS)
  if (files.some(f => f === 'index.html')) return inferred('Vanilla JS', 'index.html found');

  return unknownField('');
}

function detectPackageManager(projectDir: string, _files: string[]): ExtractedField<string> {
  if (existsSync(path.join(projectDir, 'pnpm-lock.yaml'))) return confirmed('pnpm', 'lockfile');
  if (existsSync(path.join(projectDir, 'yarn.lock'))) return confirmed('yarn', 'lockfile');
  if (existsSync(path.join(projectDir, 'package-lock.json'))) return confirmed('npm', 'lockfile');
  if (existsSync(path.join(projectDir, 'bun.lock'))) return confirmed('bun', 'lockfile');

  // Check for package.json scripts
  const pkgPath = path.join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.scripts) return inferred('npm', 'package.json with scripts');
    } catch { /* ignore */ }
  }

  return unknownField('');
}

function detectLanguage(projectDir: string, files: string[]): ExtractedField<string> {
  // Count file extensions
  const counts: Record<string, number> = {};
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    if (ext) counts[ext] = (counts[ext] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  if (sorted.length === 0) return unknownField('');

  const [topExt] = sorted[0]!;
  switch (topExt) {
    case '.ts': case '.tsx': return confirmed('TypeScript', `most common extension: ${topExt}`);
    case '.js': case '.jsx': return confirmed('JavaScript', `most common extension: ${topExt}`);
    case '.py': return confirmed('Python', `most common extension: ${topExt}`);
    case '.rs': return confirmed('Rust', `most common extension: ${topExt}`);
    case '.go': return confirmed('Go', `most common extension: ${topExt}`);
    case '.java': return confirmed('Java', `most common extension: ${topExt}`);
    case '.rb': return confirmed('Ruby', `most common extension: ${topExt}`);
    case '.php': return confirmed('PHP', `most common extension: ${topExt}`);
    default: return inferred(topExt, `most common extension`);
  }
}

function detectDeploymentTarget(projectDir: string, files: string[]): ExtractedField<string> {
  if (files.some(f => f === 'vercel.json' || f.startsWith('.vercel'))) return confirmed('Vercel', 'vercel config');
  if (files.some(f => f === 'netlify.toml' || f.startsWith('.netlify'))) return confirmed('Netlify', 'netlify config');
  if (files.some(f => f.startsWith('.github/workflows'))) return inferred('GitHub Actions', 'CI workflow');
  if (files.some(f => f === 'Dockerfile')) return inferred('Docker', 'Dockerfile present');
  if (files.some(f => f.startsWith('.aws') || f === 'serverless.yml')) return inferred('AWS', 'AWS config present');

  // Check package.json for deploy scripts
  const pkgPath = path.join(projectDir, 'package.json');
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      const scripts = Object.values((pkg.scripts || {}) as Record<string, string>).join(' ');
      if (scripts.includes('vercel')) return inferred('Vercel', 'deploy script mentions vercel');
      if (scripts.includes('netlify')) return inferred('Netlify', 'deploy script mentions netlify');
      if (scripts.includes('aws') || scripts.includes('s3')) return inferred('AWS S3', 'deploy script mentions AWS');
    } catch { /* ignore */ }
  }

  return unknownField('');
}

function assessHealth(projectDir: string, files: string[]): ExtractedField<string> {
  const issues: string[] = [];

  // Check for essential files
  if (!files.some(f => f === 'README.md')) issues.push('missing README');
  if (!files.some(f => f === '.gitignore')) issues.push('missing .gitignore');
  if (!existsSync(path.join(projectDir, 'package.json')) &&
      !existsSync(path.join(projectDir, 'Cargo.toml')) &&
      !existsSync(path.join(projectDir, 'go.mod')) &&
      !existsSync(path.join(projectDir, 'requirements.txt'))) {
    issues.push('no package manifest');
  }

  if (issues.length === 0) return confirmed('Good', 'all essential files present');
  if (issues.length <= 2) return inferred('Fair', `issues: ${issues.join(', ')}`);
  return inferred('Needs setup', `issues: ${issues.join(', ')}`);
}
