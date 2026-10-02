import { describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import {
  canWriteSource,
  getSourceSyntaxErrors,
  pruneUnparsableSourceFiles,
} from '../../benchmarks/source-syntax-gate.js';

const REPO_ROOT = path.resolve(__dirname, '../..');

/**
 * The exact defect a real `hag run` shipped: a `{steps.map(...)}` JSX
 * expression container opened on one line and closed with `))` instead of
 * `))}`. It parsed badly enough to survive on disk but never well enough to
 * satisfy the final tree integrity gate.
 */
const MALFORMED_STEPPER_TSX = [
  'export function Stepper({ steps }: { steps: { id: string }[] }) {',
  '  return (',
  '    <nav aria-label="Stepper">',
  '      {steps.map((step, index) => (',
  '        <button key={step.id}>{index}</button>',
  '      ))',
  '    </nav>',
  '  );',
  '}',
].join('\n');

const VALID_STEPPER_TSX = MALFORMED_STEPPER_TSX.replace('      ))\n', '      ))}\n');

function makeTree(files: Record<string, string>): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hag-invalid-source-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(dir, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content, 'utf-8');
  }
  return dir;
}

describe('invalid source can never reach the worktree', () => {
  describe('canWriteSource', () => {
    it('refuses content that does not parse', () => {
      expect(canWriteSource('src/components/Stepper.tsx', MALFORMED_STEPPER_TSX)).toBe(false);
    });

    it('allows content that parses', () => {
      expect(canWriteSource('src/components/Stepper.tsx', VALID_STEPPER_TSX)).toBe(true);
    });

    it('never blocks non-source files', () => {
      expect(canWriteSource('src/app/globals.css', '@tailwind base; {')).toBe(true);
      expect(canWriteSource('package.json', '{ not json for the gate')).toBe(true);
    });
  });

  describe('pruneUnparsableSourceFiles', () => {
    it('removes files that do not parse and keeps their valid neighbours', () => {
      const dir = makeTree({
        'src/components/Stepper.tsx': MALFORMED_STEPPER_TSX,
        'src/components/Button.tsx': VALID_STEPPER_TSX,
        'src/app/globals.css': '@tailwind base;',
      });
      try {
        const removed = pruneUnparsableSourceFiles(dir);

        expect(removed).toEqual(['src/components/Stepper.tsx']);
        expect(existsSync(path.join(dir, 'src/components/Stepper.tsx'))).toBe(false);
        expect(existsSync(path.join(dir, 'src/components/Button.tsx'))).toBe(true);
        expect(existsSync(path.join(dir, 'src/app/globals.css'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('returns POSIX-relative paths sorted for stable reporting', () => {
      const dir = makeTree({
        'src/b/Second.tsx': MALFORMED_STEPPER_TSX,
        'src/a/First.tsx': MALFORMED_STEPPER_TSX,
      });
      try {
        expect(pruneUnparsableSourceFiles(dir)).toEqual(['src/a/First.tsx', 'src/b/Second.tsx']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('never walks dependency or build output directories', () => {
      const dir = makeTree({
        'node_modules/pkg/index.tsx': MALFORMED_STEPPER_TSX,
        '.next/server/page.tsx': MALFORMED_STEPPER_TSX,
        'src/app/ok.tsx': VALID_STEPPER_TSX,
      });
      try {
        expect(pruneUnparsableSourceFiles(dir)).toEqual([]);
        expect(existsSync(path.join(dir, 'node_modules/pkg/index.tsx'))).toBe(true);
        expect(existsSync(path.join(dir, '.next/server/page.tsx'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('returns an empty list for a directory that does not exist yet', () => {
      expect(pruneUnparsableSourceFiles(path.join(tmpdir(), 'hag-missing-project-dir'))).toEqual([]);
    });

    it('leaves a valid tree completely untouched', () => {
      const dir = makeTree({
        'src/app/page.tsx': VALID_STEPPER_TSX,
        'src/lib/db.ts': 'export const db = {};\n',
      });
      try {
        expect(pruneUnparsableSourceFiles(dir)).toEqual([]);
        expect(readdirSync(path.join(dir, 'src/app'))).toEqual(['page.tsx']);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('every mutating write path consults the same gate', () => {
    const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf-8');

    it('cross-file contract repair refuses a rewrite that would not parse', () => {
      expect(read('benchmarks/cross-file-contract-repair.ts')).toContain('canWriteSource(file, after)');
    });

    it('orchestrator repair/type/stub writes are all gated', () => {
      const source = read('benchmarks/internet-hackathon-orchestrator.ts');
      for (const guard of [
        'canWriteSource(typesPath, next)',
        'canWriteSource(full, updated)',
        'canWriteSource(fullPath, after)',
        'canWriteSource(fullPath, content)',
        'pruneUnparsableSourceFiles(existingProjectDir)',
      ]) {
        expect(source).toContain(guard);
      }
    });

    it('repository materialization validates before touching disk', () => {
      expect(read('kernel/execution/repository-materializer.ts')).toContain(
        'assertSourceSyntax(filePath, content)',
      );
    });
  });

  describe('the generated project tree this repo ships', () => {
    it('contains no source file that fails to parse', () => {
      const projectSrc = path.join(REPO_ROOT, 'agents-for-humans-hackathon', 'src');
      const offenders: string[] = [];

      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(full);
          } else if (/\.(tsx?|jsx?)$/i.test(entry.name)) {
            const errors = getSourceSyntaxErrors(entry.name, readFileSync(full, 'utf-8'));
            if (errors.length > 0) offenders.push(`${path.relative(projectSrc, full)}: ${errors[0]}`);
          }
        }
      };

      walk(projectSrc);
      expect(offenders).toEqual([]);
    });
  });
});
