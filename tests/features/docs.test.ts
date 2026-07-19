import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { generateDocs } from '../../features/docs/generator.js';

let root: string;
let outDir: string;
let manual: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'hag-docs-'));
  outDir = path.join(root, 'generated-docs');
  // A "manual" doc OUTSIDE the generated dir (should never be touched).
  manual = path.join(root, 'MANUAL.md');
  writeFileSync(manual, '# Manual Doc\n\nThis must survive doc generation.\n', 'utf-8');
});

afterAll(() => {
  if (existsSync(root)) rmSync(root, { recursive: true });
});

describe('documentation generator', () => {
  it('generates the full doc set into a dedicated dir', () => {
    const { files } = generateDocs({ outDir });
    const names = files.map((f) => path.basename(f));
    for (const expected of [
      'index.md',
      'cli-reference.md',
      'configuration.md',
      'architecture.md',
      'api.md',
      'developer.md',
      'examples.md',
      'migration.md',
    ]) {
      expect(names).toContain(expected);
    }
  });

  it('cli reference documents the new feature commands', () => {
    const md = readFileSync(path.join(outDir, 'cli-reference.md'), 'utf-8');
    expect(md).toContain('`hag analyze`');
    expect(md).toContain('`hag categories`');
    expect(md).toContain('`hag docs`');
  });

  it('architecture includes a real folder tree', () => {
    const md = readFileSync(path.join(outDir, 'architecture.md'), 'utf-8');
    expect(md).toContain('Folder Structure');
  });

  it('does NOT overwrite manual docs outside its own dir', () => {
    generateDocs({ outDir }); // run again
    expect(existsSync(manual)).toBe(true);
    expect(readFileSync(manual, 'utf-8')).toContain('must survive');
  });

  it('is deterministic for the same repo snapshot', () => {
    const a = readFileSync(path.join(outDir, 'cli-reference.md'), 'utf-8');
    generateDocs({ outDir });
    const b = readFileSync(path.join(outDir, 'cli-reference.md'), 'utf-8');
    expect(a).toBe(b);
  });
});
