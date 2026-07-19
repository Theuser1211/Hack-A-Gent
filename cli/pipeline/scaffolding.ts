import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

import { warn } from '../output.js';
import type { CompetitionAnalysis, WinningStrategy, QualityCheck, GeneratedFile } from './types.js';

export class ProjectScaffolder {
  /**
   * Check a generated project for quality scaffolding.
   * Identifies missing elements that should be present.
   */
  check(params: {
    analysis?: CompetitionAnalysis;
    strategy?: WinningStrategy;
    features: string[];
    errors: string[];
  }): QualityCheck[] {
    const checks: QualityCheck[] = [];
    const features = params.features.map(f => f.toLowerCase());
    const allText = [...features, ...params.errors.map(e => e.toLowerCase())].join(' ');

    // README check
    checks.push({
      check: 'README.md',
      passed: features.some(f => f.includes('readme') || f.includes('documentation')),
      message: features.some(f => f.includes('readme'))
        ? 'README present'
        : 'README missing — judges expect documentation',
      severity: 'required',
    });

    // License check
    checks.push({
      check: 'LICENSE',
      passed: features.some(f => f.includes('license')),
      message: features.some(f => f.includes('license'))
        ? 'License present'
        : 'LICENSE missing — required for open source',
      severity: 'recommended',
    });

    // .gitignore check
    checks.push({
      check: '.gitignore',
      passed: features.some(f => f.includes('gitignore') || f.includes('.gitignore')),
      message: features.some(f => f.includes('gitignore'))
        ? '.gitignore present'
        : '.gitignore missing — repository hygiene',
      severity: 'required',
    });

    // .env.example check
    checks.push({
      check: '.env.example',
      passed: features.some(f => f.includes('.env')),
      message: features.some(f => f.includes('.env'))
        ? 'Environment config present'
        : '.env.example missing — deployment setup',
      severity: 'recommended',
    });

    // Docker support
    checks.push({
      check: 'Dockerfile',
      passed: features.some(f => f.includes('docker') || f.includes('container')),
      message: features.some(f => f.includes('docker'))
        ? 'Docker support present'
        : 'Dockerfile missing — portable deployment',
      severity: 'optional',
    });

    // CI/CD workflow
    checks.push({
      check: 'CI/CD',
      passed: features.some(f => f.includes('ci') || f.includes('workflow') || f.includes('github actions')),
      message: features.some(f => f.includes('ci'))
        ? 'CI/CD workflow present'
        : 'CI/CD workflow missing — automated testing',
      severity: 'optional',
    });

    // Tests
    checks.push({
      check: 'Tests',
      passed: features.some(f => f.includes('test') || f.includes('spec') || f.includes('vitest') || f.includes('jest')),
      message: features.some(f => f.includes('test'))
        ? 'Tests present'
        : 'Tests missing — build confidence',
      severity: 'recommended',
    });

    // Deployment configuration
    checks.push({
      check: 'Deployment Config',
      passed: features.some(f => f.includes('deploy') || f.includes('vercel') || f.includes('netlify')),
      message: features.some(f => f.includes('deploy'))
        ? 'Deployment configured'
        : 'Deployment not configured',
      severity: 'recommended',
    });

    // Responsive UI
    checks.push({
      check: 'Responsive UI',
      passed: features.some(f => f.includes('responsive') || f.includes('mobile') || f.includes('tailwind')),
      message: features.some(f => f.includes('responsive'))
        ? 'Responsive design detected'
        : 'Responsive design not confirmed',
      severity: 'recommended',
    });

    return checks;
  }

  /**
   * Generate missing scaffolding files for a project.
   * Only generates files that don't already exist.
   */
  generate(params: {
    projectDir: string;
    checks: QualityCheck[];
    features: string[];
    techStack: string[];
    projectName: string;
    description?: string;
    deployUrl?: string | null;
    sponsorAPIs?: string[];
    force?: boolean;
  }): GeneratedFile[] {
    const generated: GeneratedFile[] = [];
    const dir = params.projectDir;
    if (existsSync(dir)) {
      let entries: string[];
      try {
        entries = readdirSync(dir);
      } catch {
        if (!params.force) {
          warn(`Scaffold target '${dir}' exists but is not readable — skipping to avoid overwriting your work. Use --force to override.`);
          return [];
        }
        entries = [];
      }
      if (entries.length > 0 && !params.force) {
        warn(`Scaffold target '${dir}' already exists and is non-empty — skipping to avoid overwriting your work. Use --force to override.`);
        return [];
      }
    }
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    const failedChecks = params.checks.filter(c => !c.passed);
    const checkNames = failedChecks.map(c => c.check);

    const stackLower = params.techStack.map(s => s.toLowerCase());

    // README.md
    if (checkNames.includes('README.md') && !existsSync(path.join(dir, 'README.md'))) {
      const readmeLines: string[] = [];
      readmeLines.push(`# ${params.projectName}`);
      readmeLines.push('');
      readmeLines.push(params.description ?? 'A hackathon project.');
      readmeLines.push('');
      readmeLines.push('## Tech Stack');
      readmeLines.push('');
      for (const t of params.techStack) readmeLines.push(`- ${t}`);
      readmeLines.push('');
      readmeLines.push('## Features');
      readmeLines.push('');
      for (const f of params.features) readmeLines.push(`- ${f}`);
      readmeLines.push('');
      if (params.sponsorAPIs && params.sponsorAPIs.length > 0) {
        readmeLines.push('## Sponsor APIs Used');
        readmeLines.push('');
        for (const api of params.sponsorAPIs) readmeLines.push(`- ${api}`);
        readmeLines.push('');
      }
      readmeLines.push('## Getting Started');
      readmeLines.push('');
      readmeLines.push('```bash');
      readmeLines.push('npm install');
      readmeLines.push('npm run dev');
      readmeLines.push('```');
      readmeLines.push('');
      if (params.deployUrl) {
        readmeLines.push(`## Live Demo`);
        readmeLines.push('');
        readmeLines.push(`[${params.deployUrl}](${params.deployUrl})`);
        readmeLines.push('');
      }
      writeFileSync(path.join(dir, 'README.md'), readmeLines.join('\n'), 'utf-8');
      generated.push({ file: 'README.md', path: path.join(dir, 'README.md') });
    }

    // LICENSE (MIT)
    if (checkNames.includes('LICENSE') && !existsSync(path.join(dir, 'LICENSE'))) {
      const year = new Date().getFullYear();
      const license = `MIT License

Copyright (c) ${year} ${params.projectName}

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;
      writeFileSync(path.join(dir, 'LICENSE'), license, 'utf-8');
      generated.push({ file: 'LICENSE', path: path.join(dir, 'LICENSE') });
    }

    // .gitignore
    if (checkNames.includes('.gitignore') && !existsSync(path.join(dir, '.gitignore'))) {
      const isNode = stackLower.some(s => s.includes('node') || s.includes('javascript') || s.includes('typescript'));
      const gitignoreLines: string[] = [];
      gitignoreLines.push('# Dependencies');
      gitignoreLines.push(isNode ? 'node_modules/' : '');
      gitignoreLines.push('# Build output');
      gitignoreLines.push('dist/');
      gitignoreLines.push('build/');
      gitignoreLines.push('.next/');
      gitignoreLines.push('out/');
      gitignoreLines.push('');
      gitignoreLines.push('# Environment');
      gitignoreLines.push('.env');
      gitignoreLines.push('.env.local');
      gitignoreLines.push('.env.*.local');
      gitignoreLines.push('');
      gitignoreLines.push('# IDE');
      gitignoreLines.push('.vscode/');
      gitignoreLines.push('.idea/');
      gitignoreLines.push('*.swp');
      gitignoreLines.push('*.swo');
      gitignoreLines.push('');
      gitignoreLines.push('# OS');
      gitignoreLines.push('.DS_Store');
      gitignoreLines.push('Thumbs.db');
      gitignoreLines.push('');
      gitignoreLines.push('# Logs');
      gitignoreLines.push('*.log');
      gitignoreLines.push('npm-debug.log*');
      const content = gitignoreLines.filter(l => l !== '' || l === '').join('\n');
      writeFileSync(path.join(dir, '.gitignore'), content, 'utf-8');
      generated.push({ file: '.gitignore', path: path.join(dir, '.gitignore') });
    }

    // .env.example
    if (checkNames.includes('.env.example') && !existsSync(path.join(dir, '.env.example'))) {
      const envLines: string[] = [];
      envLines.push('# Environment Configuration');
      envLines.push('# Copy this file to .env and fill in your values');
      envLines.push('');
      if (stackLower.some(s => s.includes('node') || s.includes('express'))) {
        envLines.push('PORT=3000');
        envLines.push('NODE_ENV=development');
      }
      if (stackLower.some(s => s.includes('postgres') || s.includes('prisma') || s.includes('database'))) {
        envLines.push('DATABASE_URL=postgresql://localhost:5432/mydb');
      }
      if (stackLower.some(s => s.includes('redis'))) {
        envLines.push('REDIS_URL=redis://localhost:6379');
      }
      if (stackLower.some(s => s.includes('openai') || s.includes('ai'))) {
        envLines.push('OPENAI_API_KEY=sk-your-key-here');
      }
      envLines.push('');
      envLines.push('# Add other environment variables here');
      writeFileSync(path.join(dir, '.env.example'), envLines.join('\n'), 'utf-8');
      generated.push({ file: '.env.example', path: path.join(dir, '.env.example') });
    }

    // Dockerfile
    if (checkNames.includes('Dockerfile') && !existsSync(path.join(dir, 'Dockerfile'))) {
      const dockerLines: string[] = [];
      dockerLines.push('FROM node:20-alpine AS builder');
      dockerLines.push('WORKDIR /app');
      dockerLines.push('COPY package*.json ./');
      dockerLines.push('RUN npm ci');
      dockerLines.push('COPY . .');
      dockerLines.push('RUN npm run build');
      dockerLines.push('');
      dockerLines.push('FROM node:20-alpine AS runner');
      dockerLines.push('WORKDIR /app');
      dockerLines.push('COPY --from=builder /app/dist ./dist');
      dockerLines.push('COPY --from=builder /app/node_modules ./node_modules');
      dockerLines.push('COPY --from=builder /app/package.json ./');
      dockerLines.push('');
      dockerLines.push('EXPOSE 3000');
      dockerLines.push('CMD ["node", "dist/index.js"]');
      writeFileSync(path.join(dir, 'Dockerfile'), dockerLines.join('\n'), 'utf-8');
      generated.push({ file: 'Dockerfile', path: path.join(dir, 'Dockerfile') });
    }

    // CI/CD — GitHub Actions workflow
    if (checkNames.includes('CI/CD') && !existsSync(path.join(dir, '.github/workflows/ci.yml'))) {
      const workflowsDir = path.join(dir, '.github', 'workflows');
      if (!existsSync(workflowsDir)) mkdirSync(workflowsDir, { recursive: true });
      const ciLines: string[] = [];
      ciLines.push('name: CI');
      ciLines.push('on:');
      ciLines.push('  push:');
      ciLines.push('    branches: [main]');
      ciLines.push('  pull_request:');
      ciLines.push('    branches: [main]');
      ciLines.push('jobs:');
      ciLines.push('  build:');
      ciLines.push('    runs-on: ubuntu-latest');
      ciLines.push('    steps:');
      ciLines.push('      - uses: actions/checkout@v4');
      ciLines.push('      - uses: actions/setup-node@v4');
      ciLines.push('        with:');
      ciLines.push('          node-version: 20');
      ciLines.push('          cache: npm');
      ciLines.push('      - run: npm ci');
      ciLines.push('      - run: npm run build --if-present');
      ciLines.push('      - run: npm run lint --if-present');
      ciLines.push('      - run: npm test --if-present');
      writeFileSync(path.join(workflowsDir, 'ci.yml'), ciLines.join('\n'), 'utf-8');
      generated.push({ file: '.github/workflows/ci.yml', path: path.join(workflowsDir, 'ci.yml') });
    }

    return generated;
  }

  /**
   * Generate markdown report of quality checks.
   */
  formatChecks(checks: QualityCheck[]): string {
    const lines: string[] = [];
    lines.push('## Project Quality Checklist');
    lines.push('');
    lines.push('| Check | Status | Severity | Note |');
    lines.push('|-------|--------|----------|------|');
    const severityOrder = { required: 0, recommended: 1, optional: 2 };
    const sorted = [...checks].sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
    for (const c of sorted) {
      const icon = c.passed ? '✅' : '❌';
      const sev = c.severity === 'required' ? '🔴' : c.severity === 'recommended' ? '🟡' : '🟢';
      lines.push(`| ${icon} ${c.check} | ${c.passed ? 'Pass' : 'Fail'} | ${sev} ${c.severity} | ${c.message} |`);
    }
    lines.push('');
    const required = checks.filter(c => c.severity === 'required');
    const failedRequired = required.filter(c => !c.passed);
    if (failedRequired.length > 0) {
      lines.push(`⚠️ ${failedRequired.length} required check(s) failing`);
    }
    lines.push('');
    return lines.join('\n');
  }
}
