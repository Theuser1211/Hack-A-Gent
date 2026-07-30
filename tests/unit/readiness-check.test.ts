import { describe, it, expect } from 'vitest';
import { checkReadiness } from '../../cli/submission/readiness-check.js';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

function createProject(files: Record<string, string>): string {
  const dir = join(import.meta.dirname, '__temp_readiness__');
  if (existsSync(dir)) rmSync(dir, { recursive: true });
  mkdirSync(dir, { recursive: true });
  for (const [filePath, content] of Object.entries(files)) {
    const full = join(dir, filePath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content);
  }
  return dir;
}

describe('checkReadiness', () => {
  it('passes a complete project', () => {
    const dir = createProject({
      'package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
      'README.md': '# Test\n\n```bash\nnpm install\nnpm run dev\n```\n\n## Deploy\nDeploy to Vercel.\n',
      'vercel.json': '{}',
      'LICENSE': 'MIT',
      '.gitignore': 'node_modules\n.env',
      'src/index.ts': 'export const foo = 1;',
    });
    try {
      const result = checkReadiness(dir);
      expect(result.ready).toBe(true);
      expect(result.checks.length).toBeGreaterThanOrEqual(6);
      for (const c of result.checks) {
        expect(c.status).not.toBe('fail');
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('fails when README is missing', () => {
    const dir = createProject({
      'package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
      '.gitignore': 'node_modules',
      'src/index.ts': 'const x = 1;',
    });
    try {
      const result = checkReadiness(dir);
      const readmeCheck = result.checks.find(c => c.name === 'README exists');
      expect(readmeCheck?.status).toBe('fail');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('fails when no deployment config', () => {
    const dir = createProject({
      'package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
      'README.md': '# Hi\n\nSetup instructions.\n',
      '.gitignore': 'node_modules',
    });
    try {
      const result = checkReadiness(dir);
      const deployCheck = result.checks.find(c => c.name === 'Deployment config');
      expect(deployCheck?.status).toBe('fail');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('warns when no .gitignore', () => {
    const dir = createProject({
      'package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
      'README.md': '# Hi\nSetup and deploy instructions.\n',
      'vercel.json': '{}',
    });
    try {
      const result = checkReadiness(dir);
      const gitignoreCheck = result.checks.find(c => c.name === '.gitignore');
      expect(gitignoreCheck?.status).toBe('fail');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('warns when todos exist in source', () => {
    const dir = createProject({
      'package.json': JSON.stringify({ scripts: { build: 'tsc' } }),
      'README.md': '# Hi\n\nSetup and deploy instructions.\n',
      '.gitignore': 'node_modules',
      'vercel.json': '{}',
      'src/app.tsx': '// TODO: implement auth\nexport default function App() { return null; }',
    });
    try {
      const result = checkReadiness(dir);
      const todoCheck = result.checks.find(c => c.name === 'No placeholder content');
      expect(todoCheck?.status).toBe('warn');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('returns ready=false when critical checks fail', () => {
    const dir = createProject({
      'src/index.ts': 'const x = 1;',
    });
    try {
      const result = checkReadiness(dir);
      expect(result.ready).toBe(false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it('detects Dockerfile as deployment config', () => {
    const dir = createProject({
      'package.json': JSON.stringify({}),
      'README.md': '# Hi\nSetup and deploy.\n',
      '.gitignore': 'node_modules',
      'Dockerfile': 'FROM node:20\n',
    });
    try {
      const result = checkReadiness(dir);
      const deployCheck = result.checks.find(c => c.name === 'Deployment config');
      expect(deployCheck?.status).toBe('pass');
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
