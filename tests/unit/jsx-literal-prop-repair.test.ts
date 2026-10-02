import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  hasUsableNodeModules,
  materializeMissingSharedTypes,
  reconcileSharedTypeContracts,
  repairBrokenClassNameTuple,
  repairEscapedNewlineArtifacts,
  repairJsxLiteralProps,
  repairStylesAliasImport,
} from '../../benchmarks/internet-hackathon-orchestrator.js';

describe('repairJsxLiteralProps', () => {
  it('repairs malformed array literal props in JSX', () => {
    const before = `<Stepper steps=["Input", "Processing", "Output"] current={0} />`;
    const after = repairJsxLiteralProps(before);

    expect(after).toContain('steps={["Input", "Processing", "Output"]}');
    expect(after).toContain('current={0}');
  });

  it('does not change already-valid JSX props', () => {
    const before = `<Stepper steps={["Input", "Processing"]} current={0} />`;
    const after = repairJsxLiteralProps(before);

    expect(after).toBe(before);
  });
});

describe('repairBrokenClassNameTuple', () => {
  it('repairs malformed className tuple syntax', () => {
    const before = `<span className="base classes", {isCurrent ? 'text-primary' : 'text-muted'}>{idx + 1}</span>`;
    const after = repairBrokenClassNameTuple(before);

    expect(after).toContain("className={[\"base classes\", isCurrent ? 'text-primary' : 'text-muted'].join(' ')}");
  });

  it('does not change valid className expressions', () => {
    const before = `<span className={["base", isCurrent ? 'text-primary' : 'text-muted'].join(' ')}>{idx + 1}</span>`;
    const after = repairBrokenClassNameTuple(before);

    expect(after).toBe(before);
  });
});

describe('reconcileSharedTypeContracts', () => {
  it('rewrites missing shared type imports/usages to existing exports', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-type-contract-'));
    try {
      const typesDir = path.join(dir, 'src', 'lib');
      const routeDir = path.join(dir, 'src', 'app', 'api', 'ai', 'run');
      mkdirSync(typesDir, { recursive: true });
      mkdirSync(routeDir, { recursive: true });

      writeFileSync(
        path.join(typesDir, 'types.ts'),
        [
          'export interface RunRequest { userId: string; inputs: string; }',
          'export interface ApiResponse<T> { data?: T; error?: { message: string } }',
        ].join('\n'),
        'utf-8',
      );

      const routePath = path.join(routeDir, 'route.ts');
      writeFileSync(
        routePath,
        [
          "import type { AiRunRequest, AiRunResponse } from '@/lib/types';",
          'const payload: AiRunRequest = { userId: "u", inputs: "x" };',
          'const response: AiRunResponse = { data: payload };',
          'void response;',
        ].join('\n'),
        'utf-8',
      );

      const errors = [
        `src/app/api/ai/run/route.ts(1,15): error TS2724: '"@/lib/types"' has no exported member named 'AiRunRequest'. Did you mean 'RunRequest'?`,
        `src/app/api/ai/run/route.ts(1,29): error TS2724: '"@/lib/types"' has no exported member named 'AiRunResponse'. Did you mean 'ApiResponse'?`,
      ];

      const patched = reconcileSharedTypeContracts(dir, errors);
      expect(patched).toBe(1);

      const after = readFileSync(routePath, 'utf-8');
      expect(after).toContain("import type { RunRequest, ApiResponse } from '@/lib/types';");
      expect(after).toContain('const payload: RunRequest');
      expect(after).toContain('const response: ApiResponse');
      expect(after.includes(': any')).toBe(false);
      expect(after.toLowerCase().includes('placeholder')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not modify files when contract is already valid', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-type-contract-valid-'));
    try {
      const typesDir = path.join(dir, 'src', 'lib');
      const routeDir = path.join(dir, 'src', 'app', 'api');
      mkdirSync(typesDir, { recursive: true });
      mkdirSync(routeDir, { recursive: true });

      writeFileSync(path.join(typesDir, 'types.ts'), 'export interface RunRequest { userId: string }\n', 'utf-8');
      const routePath = path.join(routeDir, 'route.ts');
      const before = "import type { RunRequest } from '@/lib/types';\nconst p: RunRequest = { userId: 'u' };\n";
      writeFileSync(routePath, before, 'utf-8');

      const patched = reconcileSharedTypeContracts(dir, []);
      expect(patched).toBe(0);
      const after = readFileSync(routePath, 'utf-8');
      expect(after).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('materializeMissingSharedTypes', () => {
  it('creates missing shared interfaces from typed object usage', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-materialize-types-'));
    try {
      const typesDir = path.join(dir, 'src', 'lib');
      const routeDir = path.join(dir, 'src', 'app', 'api', 'ai', 'run');
      mkdirSync(typesDir, { recursive: true });
      mkdirSync(routeDir, { recursive: true });

      writeFileSync(path.join(typesDir, 'types.ts'), 'export type RunResponse = { status: "ok" };\n', 'utf-8');

      writeFileSync(
        path.join(routeDir, 'route.ts'),
        [
          "import { AiRun } from '@/lib/types';",
          'const newRun: AiRun = {',
          "  id: 'x',",
          "  userId: 'u',",
          "  inputs: ['a'],",
          "  status: 'completed',",
          '  output: { type: "mock" },',
          '  createdAt: new Date().toISOString(),',
          '};',
        ].join('\n'),
        'utf-8',
      );

      const errors = [
        `src/app/api/ai/run/route.ts(1,10): error TS2305: Module '"@/lib/types"' has no exported member 'AiRun'.`,
      ];

      const created = materializeMissingSharedTypes(dir, errors);
      expect(created).toBe(1);

      const typesAfter = readFileSync(path.join(typesDir, 'types.ts'), 'utf-8');
      expect(typesAfter).toContain('export interface AiRun');
      expect(typesAfter).toContain('id: string;');
      expect(typesAfter).toContain('userId: string;');
      expect(typesAfter).toContain('inputs: string[];');
      expect(typesAfter).toContain('status: string;');
      expect(typesAfter).toContain('output: Record<string, unknown>;');
      expect(typesAfter).toContain('createdAt: string;');
      expect(typesAfter.includes(': any')).toBe(false);
      expect(typesAfter.toLowerCase().includes('placeholder')).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('does not rewrite existing shared contracts', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-materialize-existing-'));
    try {
      const typesDir = path.join(dir, 'src', 'lib');
      mkdirSync(typesDir, { recursive: true });
      const before = [
        'export interface AiRun {',
        '  id: string;',
        '}',
        '',
      ].join('\n');
      writeFileSync(path.join(typesDir, 'types.ts'), before, 'utf-8');

      const errors = [
        `src/app/api/ai/run/route.ts(1,10): error TS2305: Module '"@/lib/types"' has no exported member 'AiRun'.`,
      ];

      const created = materializeMissingSharedTypes(dir, errors);
      expect(created).toBe(0);
      const after = readFileSync(path.join(typesDir, 'types.ts'), 'utf-8');
      expect(after).toBe(before);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('repairEscapedNewlineArtifacts', () => {
  it('repairs leaked escaped newlines in TSX parameter lists', () => {
    const before = [
      'export function InputField({',
      '  multiline = false,\\n  rows = 4,',
      '}: InputProps) {',
      '  return null;',
      '}',
    ].join('\n');

    const after = repairEscapedNewlineArtifacts(before);
    expect(after).toContain('multiline = false,\n  rows = 4,');
    expect(after.includes('\\n  rows')).toBe(false);
  });
});

describe('repairStylesAliasImport', () => {
  it('rewrites missing @/styles/globals.css alias to App Router globals path', () => {
    const before = [
      "import '@/styles/globals.css';",
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return <html><body>{children}</body></html>;',
      '}',
    ].join('\n');

    const after = repairStylesAliasImport(before);
    expect(after).toContain("import '@/app/globals.css';");
    expect(after.includes("@/styles/globals.css")).toBe(false);
  });

  it('does not modify already-correct globals import', () => {
    const before = "import '@/app/globals.css';\nexport const x = 1;\n";
    const after = repairStylesAliasImport(before);
    expect(after).toBe(before);
  });
});

describe('hasUsableNodeModules', () => {
  it('returns false for an empty node_modules directory', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-nm-empty-'));
    try {
      mkdirSync(path.join(dir, 'node_modules'), { recursive: true });
      expect(hasUsableNodeModules(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns true when node_modules has install footprint', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-nm-ok-'));
    try {
      mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true });
      writeFileSync(path.join(dir, 'node_modules', '.bin', 'tsc.cmd'), '@echo off\n', 'utf-8');
      expect(hasUsableNodeModules(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns false for a partial install (packages but no .bin)', () => {
    // Regression: an install killed mid-flight leaves package folders but no
    // linked shims. That used to count as "usable", so every later install was
    // skipped and the project ended up without `tsc`.
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-nm-partial-'));
    try {
      mkdirSync(path.join(dir, 'node_modules', 'next'), { recursive: true });
      expect(hasUsableNodeModules(dir)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns false when a declared dependency is missing from node_modules', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'hag-nm-missing-dep-'));
    try {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ name: 'demo', devDependencies: { typescript: '^5.5.0' } }),
        'utf-8',
      );
      mkdirSync(path.join(dir, 'node_modules', '.bin'), { recursive: true });
      expect(hasUsableNodeModules(dir)).toBe(false);

      mkdirSync(path.join(dir, 'node_modules', 'typescript'), { recursive: true });
      expect(hasUsableNodeModules(dir)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
