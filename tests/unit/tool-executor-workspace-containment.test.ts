import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ToolExecutor, resolveInWorkspace } from '../../benchmarks/tool-executor.js';

const created: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hag-containment-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length) rmSync(created.pop()!, { recursive: true, force: true });
});

describe('tool paths stay inside the workspace', () => {
  it('accepts ordinary relative paths', () => {
    const root = workspace();
    expect(resolveInWorkspace(root, 'src/app/page.tsx')).toBe(
      path.join(root, 'src', 'app', 'page.tsx'),
    );
  });

  it('rejects traversal, absolute paths, and sibling-directory escapes', () => {
    const root = workspace();
    for (const escape of [
      '../outside.txt',
      '../../etc/passwd',
      'src/../../outside.txt',
      path.resolve(root, '..', 'absolute.txt'),
      process.platform === 'win32' ? 'C:/Windows/System32/drivers/etc/hosts' : '/etc/passwd',
    ]) {
      expect(resolveInWorkspace(root, escape)).toBeNull();
    }
  });

  it('does not treat a sibling directory with a shared prefix as inside', () => {
    // "<root>-evil" starts with "<root>" as a string but is a different
    // directory; a naive startsWith check would let it through.
    const root = workspace();
    expect(resolveInWorkspace(root, path.join('..', `${path.basename(root)}-evil`, 'x.txt'))).toBeNull();
  });

  it('refuses to write a file outside the workspace', async () => {
    const root = workspace();
    const executor = new ToolExecutor(root);
    // Unique per run: the escape target is the shared temp parent, so a
    // fixed name could collide with a leftover from another run.
    const escapeName = `escaped-${process.pid}-${created.length}.txt`;

    const result = await executor.execute('file', 'write', {
      path: `../${escapeName}`,
      content: 'should never land on disk',
    });

    const escaped = path.join(path.dirname(root), escapeName);
    try {
      expect(result.success).toBe(false);
      expect(result.error).toContain('escapes the workspace');
      expect(existsSync(escaped)).toBe(false);
    } finally {
      if (existsSync(escaped)) rmSync(escaped, { force: true });
    }
  });

  it('still writes files inside the workspace', async () => {
    const root = workspace();
    const executor = new ToolExecutor(root);

    const result = await executor.execute('file', 'write', {
      path: 'src/app/page.tsx',
      content: 'export default function Page() { return null; }\n',
    });

    expect(result.success).toBe(true);
    expect(existsSync(path.join(root, 'src', 'app', 'page.tsx'))).toBe(true);
  });

  it('refuses a shell working directory outside the workspace', async () => {
    const root = workspace();
    const executor = new ToolExecutor(root);

    const result = await executor.execute('shell', 'exec', {
      command: 'pwd',
      cwd: '..',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('escapes the workspace');
  });
});
