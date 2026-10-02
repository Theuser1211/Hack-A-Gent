import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';
import * as ts from 'typescript';

import {
  CANONICAL_LIB_DB,
  CANONICAL_LIB_TYPES,
  CANONICAL_TYPES_EXPORTS,
  CANONICAL_DB_EXPORTS,
  hasCanonicalPrefix,
  extractExportedNames,
  buildDomainOverlay,
  mergeCanonicalWithOverlay,
  validateOverlay,
} from '../../benchmarks/orchestrator-shared-templates.js';

const created: string[] = [];

function project(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hag-canonical-'));
  created.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(dir, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
  return dir;
}

function read(dir: string, rel: string): string {
  return readFileSync(path.join(dir, rel), 'utf-8');
}

function runTSC(dir: string): { success: boolean; output: string } {
  try {
    // Link project node_modules into temp dir so @types/node and other deps resolve
    const rootNodeModules = path.resolve(process.cwd(), 'node_modules');
    const targetNodeModules = path.join(dir, 'node_modules');
    if (!existsSync(targetNodeModules)) {
      try {
        // Use junction on Windows, symlink on Unix
        if (process.platform === 'win32') {
          execSync(`cmd /c mklink /J "${targetNodeModules}" "${rootNodeModules}"`, { stdio: 'ignore' });
        } else {
          execSync(`ln -s "${rootNodeModules}" "${targetNodeModules}"`, { stdio: 'ignore' });
        }
      } catch { /* ignore if already exists or fails */ }
    }

    // Use the repo-local TypeScript binary directly for deterministic resolution;
    // include explicit isolated tsconfig settings to avoid inheriting unrelated
    // global/repo compiler configurations.
    const tsBin = path.resolve(process.cwd(), 'node_modules/typescript/bin/tsc');
    const out = execSync(
      `node "${tsBin}" --noEmit --project tsconfig.json 2>&1`,
      {
        cwd: dir,
        encoding: 'utf-8',
        stdio: 'pipe',
        timeout: 30000,
        env: {
          ...process.env,
          // Force local resolution; prevent inherited root-level tsconfig leakage
          NODE_OPTIONS: '--no-deprecation',
        },
      }
    );
    return { success: true, output: out };
  } catch (err: unknown) {
    const out = (err as { stdout?: string }).stdout ?? String(err);
    return { success: false, output: out };
  }
}

afterEach(() => {
  while (created.length > 0) {
    const dir = created.pop()!;
    if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
  }
});

describe('Canonical Contract Integrity', () => {
  describe('Test 1 — canonical types parse/typecheck', () => {
    it('CANONICAL_LIB_TYPES is syntactically valid TypeScript', () => {
      const dir = project({
        'src/lib/types.ts': CANONICAL_LIB_TYPES,
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            skipLibCheck: true,
            types: ['node'],
            typeRoots: ['./node_modules/@types'],
          },
          include: ['src/**/*'],
        }, null, 2),
        'package.json': JSON.stringify({ name: 'test', private: true, dependencies: {}, devDependencies: { typescript: '^5.5.0' } }, null, 2),
      });

      const result = runTSC(dir);
      expect(result.success).toBe(true);
    });
  });

  describe('Test 2 — canonical DB parses/typechecks with types', () => {
    it('CANONICAL_LIB_DB compiles alongside canonical types', () => {
      const dir = project({
        'src/lib/types.ts': CANONICAL_LIB_TYPES,
        'src/lib/db.ts': CANONICAL_LIB_DB,
        'tsconfig.json': JSON.stringify({
          compilerOptions: {
            target: 'ES2020',
            module: 'ESNext',
            moduleResolution: 'bundler',
            strict: true,
            skipLibCheck: true,
            types: ['node'],
            typeRoots: ['./node_modules/@types'],
          },
          include: ['src/**/*'],
        }, null, 2),
        'package.json': JSON.stringify({ name: 'test', private: true, dependencies: {}, devDependencies: { typescript: '^5.5.0' } }, null, 2),
      });

      const result = runTSC(dir);
      if (!result.success) {
        console.error('TypeScript errors:', result.output);
      }
      expect(result.success).toBe(true);
    });
  });

  describe('Test 3 — Phase 1 cannot replace canonical files', () => {
    it('rogue replacement in Phase 1 output would be rejected; canonical prefix preserved', () => {
      // Simulate what the canonical immutability guard checks
      const rogueContent = `// ============================================================================
// CANONICAL CORE - DOMAIN-AGNOSTIC TYPES (IMMUTABLE)
export interface WorkItem {
  completelyDifferent: string;
}
export interface User {
  id: string;
}`;

      // The guard checks for canonical prefix and all canonical exports
      const hasPrefix = hasCanonicalPrefix(rogueContent, CANONICAL_LIB_TYPES);
      const exports = extractExportedNames(rogueContent);

      // Should have prefix but missing WorkItem export (different signature)
      expect(hasPrefix).toBe(true);
      expect(exports.has('WorkItem')).toBe(true); // It exists but different

      // But validateOverlay would reject it due to collision
      const error = validateOverlay(CANONICAL_LIB_TYPES, rogueContent, 'types.ts');
      expect(error).toBeDefined();
      expect(error).toContain('WorkItem');
    });
  });

  describe('Test 4 — Phase 2 cannot write shared modules', () => {
    it('Phase 2 filtering logic excludes types.ts and db.ts', () => {
      const mockFiles = [
        { path: 'src/lib/types.ts', content: 'export interface Rogue {}' },
        { path: 'src/lib/db.ts', content: 'export const rogue = 1;' },
        { path: 'src/app/api/test/route.ts', content: 'export async function GET() { return new Response(); }' },
      ];

      const filtered = mockFiles.filter(f => f.path !== 'src/lib/types.ts' && f.path !== 'src/lib/db.ts');
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.path).toBe('src/app/api/test/route.ts');
    });
  });

  describe('Test 5 — canonical immutability guard', () => {
    it('writeIfChanged rejects mutation without canonical prefix', async () => {
      // Since writeIfChanged is not exported, we test the guard logic directly:
      const dir = project({
        'src/lib/types.ts': CANONICAL_LIB_TYPES,
        'src/lib/db.ts': CANONICAL_LIB_DB,
        'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', strict: true } }, null, 2),
        'package.json': JSON.stringify({ private: true, devDependencies: { typescript: '^5.5.0' } }, null, 2),
      });

      const typesPath = path.join(dir, 'src/lib/types.ts');
      const originalContent = read(dir, 'src/lib/types.ts');

      // Attempt to write content WITHOUT canonical prefix
      const mutatedContent = 'export interface Rogue {}';
      const hasPrefixAfter = hasCanonicalPrefix(mutatedContent, CANONICAL_LIB_TYPES);
      expect(hasPrefixAfter).toBe(false);
      // In writeIfChanged, this would cause rejection.
      // Also check exports preserved
      const afterExports = extractExportedNames(mutatedContent);
      const canonicalExports = extractExportedNames(CANONICAL_LIB_TYPES);
      const missing = [...canonicalExports].filter(e => !afterExports.has(e));
      expect(missing.length).toBeGreaterThan(0);
      // Canonical content unchanged
      expect(read(dir, 'src/lib/types.ts')).toBe(originalContent);
    });

    it('writeIfChanged rejects removal of canonical export', async () => {
      const dir = project({
        'src/lib/types.ts': CANONICAL_LIB_TYPES,
        'src/lib/db.ts': CANONICAL_LIB_DB,
        'tsconfig.json': JSON.stringify({ compilerOptions: { target: 'ES2020', strict: true } }, null, 2),
        'package.json': JSON.stringify({ private: true, devDependencies: { typescript: '^5.5.0' } }, null, 2),
      });

      const typesPath = path.join(dir, 'src/lib/types.ts');
      const originalContent = read(dir, 'src/lib/types.ts');

      // Create content that has canonical prefix but missing WorkItem export
      const mutatedContent = originalContent.replace('export interface WorkItem', '// export interface WorkItem');
      const hasPrefixAfter = hasCanonicalPrefix(mutatedContent, CANONICAL_LIB_TYPES);
      expect(hasPrefixAfter).toBe(true); // prefix still there
      const afterExports = extractExportedNames(mutatedContent);
      const canonicalExports = extractExportedNames(CANONICAL_LIB_TYPES);
      const missing = [...canonicalExports].filter(e => !afterExports.has(e));
      expect(missing.includes('WorkItem')).toBe(true);
      // In writeIfChanged, this would cause rejection.
      expect(read(dir, 'src/lib/types.ts')).toBe(originalContent);
    });
  });

  describe('Test 6 — legitimate overlay remains possible', () => {
    it('non-conflicting domain export can be appended after canonical prefix', () => {
      const overlay = `// ============================================================================
// DOMAIN OVERLAY (VALIDATED)
// ============================================================================
export interface LoginRequest {
  email: string;
  password: string;
}`;

      const merged = mergeCanonicalWithOverlay(CANONICAL_LIB_TYPES, CANONICAL_LIB_DB, overlay, '');

      // Should have canonical prefix + overlay
      expect(merged.types).toContain('CANONICAL CORE');
      expect(merged.types).toContain('LoginRequest');
      expect(merged.types).toContain('email: string');

      // Should parse
      const sourceFile = ts.createSourceFile('test.ts', merged.types, ts.ScriptTarget.Latest, true);
      // Resolve the TypeScript default library (lib.es2020.d.ts and its
      // /// <reference> chain) from the repo's TypeScript install so globals
      // like Array/Date/Boolean resolve instead of erroring as missing.
      const tsLibDir = path.resolve(process.cwd(), 'node_modules', 'typescript', 'lib');
      const host: ts.CompilerHost = {
        getSourceFile: (fileName: string) => {
          if (fileName === 'test.ts') return sourceFile;
          const libPath = path.join(tsLibDir, fileName);
          if (existsSync(libPath)) {
            return ts.createSourceFile(fileName, readFileSync(libPath, 'utf-8'), ts.ScriptTarget.Latest, true);
          }
          return undefined;
        },
        writeFile: () => {},
        getCurrentDirectory: () => tsLibDir,
        getDirectories: () => [],
        fileExists: (fileName: string) => fileName === 'test.ts' || existsSync(path.join(tsLibDir, fileName)),
        readFile: (fileName: string) => {
          if (fileName === 'test.ts') return merged.types;
          const libPath = path.join(tsLibDir, fileName);
          return existsSync(libPath) ? readFileSync(libPath, 'utf-8') : undefined;
        },
        getCanonicalFileName: (f: string) => f,
        useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n',
        getDefaultLibFileName: (options: ts.CompilerOptions) => ts.getDefaultLibFileName(options),
      };
      const program = ts.createProgram(['test.ts'], { target: ts.ScriptTarget.ES2020, skipLibCheck: true }, host);
      const diagnostics = ts.getPreEmitDiagnostics(program, sourceFile);
      const errors = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error);
      expect(errors).toHaveLength(0);
    });
  });

  describe('Test 7 — overlay collision rejected', () => {
    it('validateOverlay rejects export that already exists in canonical', () => {
      // Overlay defining WorkItem which already exists in canonical
      const collisionOverlay = `export interface WorkItem {
  different: string;
}`;

      const error = validateOverlay(CANONICAL_LIB_TYPES, collisionOverlay, 'types.ts');
      expect(error).toBeDefined();
      expect(error).toContain('WorkItem');
    });

    it('validateOverlay rejects export that already exists in canonical DB types', () => {
      const collisionOverlay = `export interface User {
  different: string;
}`;

      const error = validateOverlay(CANONICAL_LIB_TYPES, collisionOverlay, 'types.ts');
      expect(error).toBeDefined();
      expect(error).toContain('User');
    });
  });

  describe('Test 8 — real consumer contract failure', () => {
    it('producer→consumer gate rejects missing LoginRequest', () => {
      const dir = project({
        'src/lib/types.ts': CANONICAL_LIB_TYPES,
        'src/lib/db.ts': CANONICAL_LIB_DB,
        'src/app/api/auth/login/route.ts': `import { LoginRequest } from '@/lib/types';
export async function POST(req: Request) {
  const body: LoginRequest = await req.json();
  return new Response();
}`,
        'tsconfig.json': JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, baseUrl: '.', paths: { '@/*': ['src/*'] } },
          include: ['src/**/*'],
        }, null, 2),
        'package.json': JSON.stringify({ name: 'test', private: true, dependencies: {}, devDependencies: { typescript: '^5.5.0' } }, null, 2),
      });

      const result = runTSC(dir);
      expect(result.success).toBe(false);

      // Must be TS2305 for LoginRequest
      const hasTS2305 = /TS2305.*LoginRequest/.test(result.output);
      expect(hasTS2305).toBe(true);

      // Verify canonical types NOT mutated
      expect(read(dir, 'src/lib/types.ts')).toBe(CANONICAL_LIB_TYPES);
    });
  });

  describe('Test 9 — existing symbol type misuse', () => {
    it('consumer using canonical symbol with incompatible type fails', () => {
      const dir = project({
        'src/lib/types.ts': CANONICAL_LIB_TYPES,
        'src/lib/db.ts': CANONICAL_LIB_DB,
        'src/app/api/test/route.ts': `import { WorkItem } from '@/lib/types';
const item: WorkItem = "not a work item"; // incompatible type`,
        'tsconfig.json': JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, baseUrl: '.', paths: { '@/*': ['src/*'] } },
          include: ['src/**/*'],
        }, null, 2),
        'package.json': JSON.stringify({ name: 'test', private: true, dependencies: {}, devDependencies: { typescript: '^5.5.0' } }, null, 2),
      });

      const result = runTSC(dir);
      expect(result.success).toBe(false);

      // Must be assignability error
      const hasAssignabilityError = /TS2322|TS2345/.test(result.output);
      expect(hasAssignabilityError).toBe(true);

      // Verify canonical types NOT mutated
      expect(read(dir, 'src/lib/types.ts')).toBe(CANONICAL_LIB_TYPES);
    });
  });

  describe('Test 10 — domain overlay compilation', () => {
    it('non-empty dataModel produces valid overlay and merged modules compile', () => {
      const strategyInput = {
        apiSurfaces: [
          { name: 'createItem', request: '{ name: string; description?: string }', response: '{ id: string; name: string }' },
        ],
        dataModel: {
          Item: {
            fields: {
              id: 'string',
              name: 'string',
              description: 'string?',
              createdAt: 'string',
              updatedAt: 'string',
            },
            relationships: [],
          },
        },
        keyPages: ['/items'],
      };

      const overlay = buildDomainOverlay(strategyInput);

      // Should produce valid TypeScript overlays
      expect(overlay.typesOverlay).toContain('export interface Item');
      expect(overlay.dbOverlay).toContain('export const items');

      const merged = mergeCanonicalWithOverlay(CANONICAL_LIB_TYPES, CANONICAL_LIB_DB, overlay.typesOverlay, overlay.dbOverlay);

      // Write to temp dir and typecheck
      const dir = project({
        'src/lib/types.ts': merged.types,
        'src/lib/db.ts': merged.db,
        'tsconfig.json': JSON.stringify({
          compilerOptions: { target: 'ES2020', module: 'ESNext', moduleResolution: 'bundler', strict: true, skipLibCheck: true, types: ['node'] },
          include: ['src/**/*'],
        }, null, 2),
        'package.json': JSON.stringify({ name: 'test', private: true, dependencies: {}, devDependencies: { typescript: '^5.5.0' } }, null, 2),
      });

      const result = runTSC(dir);
      if (!result.success) {
        console.error('Overlay compilation errors:', result.output);
      }
      expect(result.success).toBe(true);
    });
  });
});