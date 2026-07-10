import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import type { GeneratedProjectValidation } from '../../benchmarks/internet-hackathon-orchestrator.js';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execSync, spawn } from 'node:child_process';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';

const execMock = execSync as unknown as ReturnType<typeof vi.fn>;
const spawnMock = spawn as unknown as ReturnType<typeof vi.fn>;

function makeOrchestrator(projectDir: string): InternetHackathonOrchestrator {
  return new InternetHackathonOrchestrator(projectDir, path.join(projectDir, '.hackagent'), 42, undefined);
}

function writeFiles(baseDir: string, files: Record<string, string>): void {
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(baseDir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
}

function makeMinimalPkg(overrides?: Record<string, unknown>): Record<string, unknown> {
  return {
    name: 'test-project',
    version: '0.1.0',
    private: true,
    scripts: { dev: 'next dev', build: 'next build', start: 'next start', test: 'vitest run', lint: 'next lint', typecheck: 'tsc --noEmit' },
    dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' },
    devDependencies: { typescript: '^5.5.0', vitest: '^1.6.0', '@types/react': '^18.3.3', '@types/node': '^20.14.0', eslint: '^8.57.0', 'eslint-config-next': '^14.2.0' },
    ...overrides,
  };
}

function fakeServer(behave: 'ready-200' | 'crash' | 'hang'): ReturnType<typeof spawn> {
  const listeners: Record<string, Array<(...args: unknown[]) => void>> = {};
  const server: unknown = {
    stdout: { on: (_e: string, cb: (...a: unknown[]) => void) => { if (_e === 'data' && behave === 'ready-200') cb(Buffer.from('Ready in 100ms')); } },
    stderr: { on: () => {} },
    on: (e: string, cb: (...a: unknown[]) => void) => { (listeners[e] ??= []).push(cb); if (e === 'error' && behave === 'crash') cb(new Error('spawn ENOENT')); },
    kill: vi.fn(),
  };
  // Simulate async start then http 200 (for ready-200) via event loop
  if (behave === 'ready-200') {
    setTimeout(() => { (listeners['close'] ?? []).forEach(cb => cb()); }, 0);
  }
  return server as ReturnType<typeof spawn>;
}

describe('GeneratedProjectValidation', () => {
  let projectDir: string;

  beforeEach(() => {
    projectDir = path.join(tmpdir(), `hag-test-${randomUUID().slice(0, 8)}`);
    fs.mkdirSync(projectDir, { recursive: true });
    execMock.mockReset();
    spawnMock.mockReset();
    // Default: npm install ok, typecheck/lint/build succeed
    execMock.mockImplementation((cmd: string) => {
      if (typeof cmd === 'string' && cmd.includes('npm install')) return '';
      return '';
    });
    spawnMock.mockImplementation(() => fakeServer('ready-200'));
  });

  afterEach(() => {
    try { fs.rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  describe('validateImports (private, exercised via public API)', () => {
    it('reports missing @/config when src/config.ts does not exist', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { NASA_API_KEY } from '@/config';\nexport default function Page() { return <div>{NASA_API_KEY}</div>; }\n`,
      });
      execMock.mockImplementation((cmd: string) => { if (typeof cmd === 'string' && cmd.includes('npm install')) return ''; throw new Error('typecheck failed'); });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(false);
      expect(result.errors.some(e => e.includes('@/config'))).toBe(true);
    });

    it('passes when @/config is generated', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { NASA_API_KEY } from '@/config';\nexport default function Page() { return <div>{NASA_API_KEY}</div>; }\n`,
        'src/config.ts': 'export const NASA_API_KEY = process.env.NASA_API_KEY ?? "";\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(true);
    });

    it('reports missing npm package not in dependencies', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/lib/api.ts': `import axios from 'axios';\n`,
      });
      execMock.mockImplementation((cmd: string) => { if (typeof cmd === 'string' && cmd.includes('npm install')) return ''; throw new Error('typecheck failed'); });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(false);
      expect(result.errors.some(e => e.includes('Missing package "axios"'))).toBe(true);
    });

    it('passes when npm package is in dependencies', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg({ dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1', axios: '^1.7.0' } })),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/lib/api.ts': `import axios from 'axios';\n`,
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(true);
    });

    it('reports missing relative import target', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { foo } from '../utils/missing';\nexport default function Page() { return <div>{foo}</div>; }\n`,
      });
      execMock.mockImplementation((cmd: string) => { if (typeof cmd === 'string' && cmd.includes('npm install')) return ''; throw new Error('typecheck failed'); });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(false);
      expect(result.errors.some(e => e.includes('Missing file') && e.includes('missing'))).toBe(true);
    });

    it('passes for valid relative import', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { foo } from '../utils/helper';\nexport default function Page() { return <div>{foo}</div>; }\n`,
        'src/utils/helper.ts': 'export const foo = 1;\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(true);
    });

    it('reports missing @/lib/* file', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/components/DataTable.tsx': `import { formatDate } from '@/lib/dates';\nexport default function DataTable() { return <div>{formatDate(new Date())}</div>; }\n`,
      });
      execMock.mockImplementation((cmd: string) => { if (typeof cmd === 'string' && cmd.includes('npm install')) return ''; throw new Error('typecheck failed'); });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(false);
      expect(result.errors.some(e => e.includes('@/lib/dates'))).toBe(true);
    });

    it('skips Node.js builtin modules', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { readFileSync } from 'fs';\nimport { join } from 'path';\nexport default function Page() { return <div>{readFileSync(join(__dirname, 'file.txt'), 'utf-8')}</div>; }\n`,
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(result.errors.some(e => e.includes('fs') || e.includes('path'))).toBe(false);
    });

    it('resolves nested @ alias paths', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { settings } from '@/config/features';\nexport default function Page() { return <div>{settings.theme}</div>; }\n`,
        'src/config/features.ts': 'export const settings = { theme: "dark" };\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(true);
    });

    it('resolves index file in directory', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { utils } from '@/lib';\nexport default function Page() { return <div>{utils.format}</div>; }\n`,
        'src/lib/index.ts': 'export const utils = { format: "csv" };\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(true);
    });

    it('handles dynamic imports', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `const mod = await import('@/config');\nexport default function Page() { return <div>{mod.default}</div>; }\n`,
        'src/config.ts': 'export default { key: "value" };\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(true);
    });

    it('handles @types/* packages for missing type imports', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg({ dependencies: { next: '^14.2.0', react: '^18.3.1', 'react-dom': '^18.3.1' }, devDependencies: { typescript: '^5.5.0', '@types/node': '^20.14.0' } })),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { readFileSync } from 'fs';\nexport default function Page() { return <div>{readFileSync('file.txt')}</div>; }\n`,
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(result.errors.filter(e => e.includes('fs') || e.includes('node'))).toHaveLength(0);
    });
  });

  describe('script validation', () => {
    it('reports missing required scripts', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify({ name: 'test', version: '0.1.0', scripts: { dev: 'next dev' } }),
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
      });
      execMock.mockImplementation((cmd: string) => { if (typeof cmd === 'string' && cmd.includes('npm install')) return ''; throw new Error('typecheck failed'); });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const scriptCheck = result.checks.find(c => c.name === 'Script validation');
      expect(scriptCheck?.passed).toBe(false);
      expect(scriptCheck?.error).toMatch(/build|start|lint|typecheck|test/);
    });

    it('passes when all required scripts are present', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const scriptCheck = result.checks.find(c => c.name === 'Script validation');
      expect(scriptCheck?.passed).toBe(true);
    });

    it('reports exactly which scripts are missing', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify({ name: 'test', version: '0.1.0', scripts: { dev: 'next dev', build: 'next build' } }),
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
      });
      execMock.mockImplementation((cmd: string) => { if (typeof cmd === 'string' && cmd.includes('npm install')) return ''; throw new Error('typecheck failed'); });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const scriptCheck = result.checks.find(c => c.name === 'Script validation');
      expect(scriptCheck?.passed).toBe(false);
      const missing = ['start', 'lint', 'typecheck', 'test'].filter(s => scriptCheck?.error?.includes(s));
      expect(missing.length).toBeGreaterThan(0);
    });
  });

  describe('build validation', () => {
    it('reports TypeScript validation failure', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/config.ts': 'export const config = {};\n',
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
      });
      execMock.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) return '';
        if (typeof cmd === 'string' && cmd.includes('typecheck')) throw new Error('TS2304: Cannot find name X');
        return '';
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const check = result.checks.find(c => c.name === 'TypeScript validation (typecheck)');
      expect(check?.passed).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('reports ESLint validation failure', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/config.ts': 'export const config = {};\n',
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
      });
      execMock.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) return '';
        if (typeof cmd === 'string' && cmd.includes('typecheck')) return '';
        if (typeof cmd === 'string' && cmd.includes('lint')) throw new Error('error  no-unused-vars');
        return '';
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const check = result.checks.find(c => c.name === 'ESLint validation (lint)');
      expect(check?.passed).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('reports production build failure', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/config.ts': 'export const config = {};\n',
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
      });
      execMock.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) return '';
        if (typeof cmd === 'string' && cmd.includes('typecheck')) return '';
        if (typeof cmd === 'string' && cmd.includes('lint')) return '';
        if (typeof cmd === 'string' && cmd.includes('build')) throw new Error('Module not found: ./missing');
        return '';
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const check = result.checks.find(c => c.name === 'Production build (build)');
      expect(check?.passed).toBe(false);
      expect(result.valid).toBe(false);
    });
  });

  describe('runtime validation', () => {
    it('reports failure when production server crashes', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/config.ts': 'export const config = {};\n',
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
        '.next': '',
      });
      execMock.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) return '';
        if (typeof cmd === 'string' && cmd.includes('typecheck')) return '';
        if (typeof cmd === 'string' && cmd.includes('lint')) return '';
        if (typeof cmd === 'string' && cmd.includes('build')) return '';
        return '';
      });
      spawnMock.mockImplementation(() => fakeServer('crash'));
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const check = result.checks.find(c => c.name === 'Runtime validation (start)');
      expect(check?.passed).toBe(false);
      expect(result.valid).toBe(false);
    });

    it('reports failure when server never responds', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/config.ts': 'export const config = {};\n',
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
        '.next': '',
      });
      execMock.mockImplementation((cmd: string) => {
        if (typeof cmd === 'string' && cmd.includes('npm install')) return '';
        if (typeof cmd === 'string' && cmd.includes('typecheck')) return '';
        if (typeof cmd === 'string' && cmd.includes('lint')) return '';
        if (typeof cmd === 'string' && cmd.includes('build')) return '';
        return '';
      });
      // hang server: emit nothing
      spawnMock.mockImplementation(() => {
        const server: unknown = { stdout: { on: () => {} }, stderr: { on: () => {} }, on: (e: string, cb: (...a: unknown[]) => void) => { if (e === 'error') cb(new Error('timeout')); }, kill: vi.fn() };
        return server as ReturnType<typeof spawn>;
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const check = result.checks.find(c => c.name === 'Runtime validation (start)');
      expect(check?.passed).toBe(false);
    });
  });

  describe('false positive prevention', () => {
    it('never returns valid=true when any check fails', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'src/app/page.tsx': `import { X } from '@/missing-file';\nexport default function Page() { return <div>{X}</div>; }\n`,
      });
      execMock.mockImplementation((cmd: string) => { if (typeof cmd === 'string' && cmd.includes('npm install')) return ''; throw new Error('fail'); });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      expect(result.valid).toBe(false);
    });

    it('returns valid=true only when all checks pass', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'next.config.js': 'module.exports = {};\n',
        'src/app/layout.tsx': "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n",
        'src/app/page.tsx': 'export default function Page() { return <div>Hello</div>; }\n',
        'src/config.ts': 'export const config = { key: "value" };\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const scriptCheck = result.checks.find(c => c.name === 'Script validation');
      expect(scriptCheck?.passed).toBe(true);
      const importCheck = result.checks.find(c => c.name === 'Import/dependency validation');
      expect(importCheck?.passed).toBe(true);
    });
  });

  describe('full validation flow', () => {
    it('includes all expected check names', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'next.config.js': 'module.exports = {};\n',
        'src/app/layout.tsx': "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n",
        'src/app/page.tsx': 'export default function Page() { return <div>Hello</div>; }\n',
        'src/config.ts': 'export const config = { key: "value" };\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      const checkNames = result.checks.map(c => c.name);
      expect(checkNames).toContain('Script validation');
      expect(checkNames).toContain('Import/dependency validation');
      expect(checkNames).toContain('TypeScript validation (typecheck)');
      expect(checkNames).toContain('ESLint validation (lint)');
      expect(checkNames).toContain('Production build (build)');
      expect(checkNames).toContain('Runtime validation (start)');
    });

    it('sets durationMs on result', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'next.config.js': 'module.exports = {};\n',
        'src/app/layout.tsx': "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n",
        'src/app/page.tsx': 'export default function Page() { return <div>Hello</div>; }\n',
        'src/config.ts': 'export const config = { key: "value" };\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      expect(typeof result.durationMs).toBe('number');
    });

    it('skips validation in tmp/__test directories', async () => {
      const tmpProjectDir = path.join(projectDir, 'tmp');
      fs.mkdirSync(tmpProjectDir, { recursive: true });
      writeFiles(tmpProjectDir, {
        'package.json': JSON.stringify({ scripts: {} }),
        'src/app/page.tsx': 'export default function Page() { return null; }\n',
      });
      const orch = makeOrchestrator(tmpProjectDir);
      const result = await orch.validateGeneratedProject(tmpProjectDir);
      expect(result.valid).toBe(true);
    });
  });

  describe('GeneratedProjectValidation interface', () => {
    it('has correct shape', async () => {
      writeFiles(projectDir, {
        'package.json': JSON.stringify(makeMinimalPkg()),
        'tsconfig.json': JSON.stringify({ compilerOptions: { paths: { '@/*': ['./src/*'] } } }),
        'next.config.js': 'module.exports = {};\n',
        'src/app/layout.tsx': "export default function Layout({ children }: { children: React.ReactNode }) { return <html><body>{children}</body></html>; }\n",
        'src/app/page.tsx': 'export default function Page() { return <div>Hello</div>; }\n',
        'src/config.ts': 'export const config = { key: "value" };\n',
      });
      const orch = makeOrchestrator(projectDir);
      const result = await orch.validateGeneratedProject(projectDir);
      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.checks)).toBe(true);
      expect(Array.isArray(result.errors)).toBe(true);
      for (const check of result.checks) {
        expect(typeof check.name).toBe('string');
        expect(typeof check.passed).toBe('boolean');
      }
    });
  });
});