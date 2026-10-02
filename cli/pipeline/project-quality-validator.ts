/**
 * Project Quality Validator
 *
 * Deterministic post-generation audit. Inspects the generated project on
 * disk and produces a structured quality scorecard. No LLM calls.
 *
 * Runs after the Consistency Scanner and before runtime/build validation.
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface QualityCategory {
  name: string;
  score: number;
  max: number;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
}

export interface QualityReport {
  categories: QualityCategory[];
  overall: number;
  max: number;
  passed: boolean;
  warnings: string[];
}

const WARN = (msg: string) => globalWarnings.push(msg);
let globalWarnings: string[] = [];

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function fileExists(projectDir: string, rel: string): boolean {
  return existsSync(path.join(projectDir, rel));
}

function read(projectDir: string, rel: string): string | null {
  try {
    return readFileSync(path.join(projectDir, rel), 'utf-8');
  } catch {
    return null;
  }
}

function dirExists(projectDir: string, rel: string): boolean {
  try {
    return statSync(path.join(projectDir, rel)).isDirectory();
  } catch {
    return false;
  }
}

function hasPattern(content: string | null, pattern: RegExp): boolean {
  if (!content) return false;
  return pattern.test(content);
}

function check(
  category: QualityCategory,
  name: string,
  passed: boolean,
  detail?: string,
): void {
  category.checks.push({ name, passed, detail });
  if (passed) {
    category.score += 1;
  } else if (detail) {
    WARN(`[${category.name}] ${name}: ${detail}`);
  }
}

function clampName(name: string): void {
  /* no-op — kept for API symmetry */
}

/* ------------------------------------------------------------------ */
/*  Categories                                                        */
/* ------------------------------------------------------------------ */

function auditReadme(projectDir: string): QualityCategory {
  const cat: QualityCategory = { name: 'README', score: 0, max: 6, checks: [] };
  const readme = read(projectDir, 'README.md') ?? read(projectDir, 'readme.md');

  check(cat, 'exists', readme !== null, 'README.md not found');
  if (!readme) return cat;

  check(cat, 'has_problem_statement', /problem\s+statement/i.test(readme), 'No "Problem Statement" section');
  check(cat, 'has_features', /features/i.test(readme), 'Missing "Features" section');
  check(cat, 'has_tech_stack', /tech\s*stack/i.test(readme), 'Missing "Tech Stack" section');
  check(cat, 'has_installation', /(quick\s*start|installation|getting\s*started)/i.test(readme), 'No installation instructions');
  check(cat, 'has_judging_criteria', /judging\s+criteria/i.test(readme), 'No judging-criteria mapping');

  const hasPlaceholder = /test-hackathon\.html|lorem\s+ipsum|placeholder/i.test(readme);
  check(cat, 'no_placeholder', !hasPlaceholder, hasPlaceholder ? 'Contains placeholder text' : 'OK');

  return cat;
}

function auditDeployment(projectDir: string): QualityCategory {
  const cat: QualityCategory = { name: 'Deployment', score: 0, max: 4, checks: [] };

  check(cat, 'has_license', fileExists(projectDir, 'LICENSE'), 'LICENSE missing');
  check(cat, 'has_vercel_json', fileExists(projectDir, 'vercel.json'), 'vercel.json missing');
  check(cat, 'has_env_example', fileExists(projectDir, '.env.example'), '.env.example missing');
  check(cat, 'has_favicon', fileExists(projectDir, 'public/favicon.ico') || fileExists(projectDir, 'app/favicon.ico'), 'favicon missing');

  return cat;
}

function auditFrontend(projectDir: string): QualityCategory {
  const cat: QualityCategory = { name: 'Frontend', score: 0, max: 6, checks: [] };
  const srcApp = path.join(projectDir, 'src', 'app');

  const hasLayout = dirExists(projectDir, 'src/app') && existsSync(path.join(srcApp, 'layout.tsx'));
  const hasPage = dirExists(projectDir, 'src/app') && existsSync(path.join(srcApp, 'page.tsx'));
  const hasLoading = existsSync(path.join(srcApp, 'loading.tsx'));
  const hasError = existsSync(path.join(srcApp, 'error.tsx'));
  const hasNotFound = existsSync(path.join(srcApp, 'not-found.tsx'));

  check(cat, 'has_landing_page', hasPage, 'src/app/page.tsx missing');
  check(cat, 'has_layout', hasLayout, 'src/app/layout.tsx missing');

  const layout = read(projectDir, 'src/app/layout.tsx');
  const hasViewport = hasPattern(layout, /viewport/i);
  check(cat, 'has_viewport_meta', hasViewport, 'No viewport meta in layout');

  check(cat, 'has_loading_page', hasLoading, 'loading.tsx missing');
  check(cat, 'has_error_page', hasError, 'error.tsx missing');
  check(cat, 'has_404_page', hasNotFound, 'not-found.tsx missing');

  return cat;
}

function auditMetadata(projectDir: string): QualityCategory {
  const cat: QualityCategory = { name: 'Metadata', score: 0, max: 3, checks: [] };
  const layout = read(projectDir, 'src/app/layout.tsx');

  check(cat, 'has_title', hasPattern(layout, /title:\s*['"][^'"]+['"]/), 'No metadata.title');
  check(cat, 'has_opengraph', hasPattern(layout, /openGraph/i), 'Missing OpenGraph tags');
  check(cat, 'has_lang', hasPattern(layout, /lang\s*=\s*["'][a-z]{2}["']/), 'No html lang attribute');

  return cat;
}

function auditSubmission(projectDir: string): QualityCategory {
  const cat: QualityCategory = { name: 'Submission', score: 0, max: 5, checks: [] };

  check(cat, 'has_setup_guide', fileExists(projectDir, 'SETUP.md') || fileExists(projectDir, 'SETUP.md'), 'SETUP.md missing');
  check(cat, 'has_deploy_guide', fileExists(projectDir, 'DEPLOY.md'), 'DEPLOY.md missing');
  check(cat, 'has_readme', fileExists(projectDir, 'README.md'), 'README.md missing');
  check(cat, 'has_package_json', fileExists(projectDir, 'package.json'), 'package.json missing');
  check(cat, 'has_tsconfig', fileExists(projectDir, 'tsconfig.json'), 'tsconfig.json missing');

  return cat;
}

function auditCodeQuality(projectDir: string): QualityCategory {
  const cat: QualityCategory = { name: 'CodeQuality', score: 0, max: 4, checks: [] };

  let todoCount = 0;
  let fixmeCount = 0;
  let loremCount = 0;
  let placeholderCount = 0;

  function walk(dir: string): void {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'dist' || entry.name === '.next') {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(tsx?|jsx?|md|json)$/.test(entry.name)) {
          const content = readFileSync(full, 'utf-8');
          const lines = content.split('\n');
          for (const line of lines) {
            if (/\bTODO\b/.test(line)) todoCount++;
            if (/\bFIXME\b/.test(line)) fixmeCount++;
            if (/lorem\s+ipsum/i.test(line)) loremCount++;
            if (/placeholder\s*text|your\s+\w+\s+here|replace\s+with/i.test(line)) placeholderCount++;
          }
        }
      }
    } catch {
      /* skip unreadable directories */
    }
  }

  if (dirExists(projectDir, 'src')) walk(path.join(projectDir, 'src'));
  if (dirExists(projectDir, 'app')) walk(path.join(projectDir, 'app'));

  check(cat, 'no_todo', todoCount === 0, todoCount > 0 ? `${todoCount} TODO(s) found` : 'OK');
  check(cat, 'no_fixme', fixmeCount === 0, fixmeCount > 0 ? `${fixmeCount} FIXME(s) found` : 'OK');
  check(cat, 'no_lorem', loremCount === 0, loremCount > 0 ? `${loremCount} Lorem Ipsum occurrence(s)` : 'OK');
  check(cat, 'no_placeholder', placeholderCount === 0, placeholderCount > 0 ? `${placeholderCount} placeholder occurrence(s)` : 'OK');

  return cat;
}

/* ------------------------------------------------------------------ */
/*  Top-level scoring                                                 */
/* ------------------------------------------------------------------ */

export function scoreProject(projectDir: string): QualityReport {
  globalWarnings = [];

  const readme = auditReadme(projectDir);
  const deployment = auditDeployment(projectDir);
  const frontend = auditFrontend(projectDir);
  const metadata = auditMetadata(projectDir);
  const submission = auditSubmission(projectDir);
  const codeQuality = auditCodeQuality(projectDir);

  const categories = [readme, deployment, frontend, metadata, submission, codeQuality];

  const totalScore = categories.reduce((sum, c) => sum + c.score, 0);
  const totalMax = categories.reduce((sum, c) => sum + c.max, 0);
  const overall = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : 0;

  return {
    categories,
    overall,
    max: totalMax,
    passed: overall >= 70,
    warnings: globalWarnings,
  };
}

/* ------------------------------------------------------------------ */
/*  Display helper                                                    */
/* ------------------------------------------------------------------ */

export function formatQualityReport(report: QualityReport): string {
  const lines: string[] = [];

  for (const cat of report.categories) {
    const pct = cat.max > 0 ? Math.round((cat.score / cat.max) * 100) : 0;
    const bar = '█'.repeat(Math.round(pct / 10)) + '░'.repeat(10 - Math.round(pct / 10));
    lines.push(`  ${cat.name.padEnd(14)} ${bar} ${cat.score}/${cat.max}`);
    for (const check of cat.checks.filter((c) => !c.passed)) {
      lines.push(`    ⚠ ${check.name}: ${check.detail ?? 'failed'}`);
    }
  }

  lines.push('');
  lines.push(`  Overall quality: ${report.overall}/100`);
  if (report.passed) {
    lines.push(`  Status: ready for submission`);
  } else {
    lines.push(`  Status: needs improvement`);
  }

  if (report.warnings.length > 0) {
    lines.push('');
    lines.push('  Warnings:');
    for (const w of report.warnings.slice(0, 15)) {
      lines.push(`    • ${w}`);
    }
  }

  return lines.join('\n');
}
