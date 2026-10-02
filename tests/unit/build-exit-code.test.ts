import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const pkg = JSON.parse(readFileSync(join(__dirname, '../../package.json'), 'utf-8')) as {
  scripts: Record<string, string>;
};
const build: string = pkg.scripts.build ?? '';

describe('build script failure propagation', () => {
  it('has a build script', () => {
    expect(typeof build).toBe('string');
    expect(build.length).toBeGreaterThan(0);
  });

  it('never uses the bare & operator, which discards the first exit code on Windows', () => {
    expect(build).not.toMatch(/(?<!&)&(?!&)/);
  });

  it('chains tsc into the fixture copy with && so a tsc failure fails the build', () => {
    expect(build).toMatch(/tsc[^\n&]*&&[^\n&]*copy-fixtures\.mjs/);
  });

  it('runs tsc before the fixture copy', () => {
    expect(build.indexOf('tsc ')).toBeGreaterThanOrEqual(0);
    expect(build.indexOf('tsc ')).toBeLessThan(build.indexOf('copy-fixtures.mjs'));
  });
});

describe.skipIf(process.platform !== 'win32')('cmd.exe && vs & (root cause)', () => {
  let dir: string;

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* win */
    }
  });

  const run = (cmdline: string): number | null => {
    dir = mkdtempSync(join(tmpdir(), 'hag-build-exit-'));
    writeFileSync(join(dir, 'fail.js'), 'process.exit(1);\n');
    writeFileSync(join(dir, 'ok.js'), 'process.exit(0);\n');
    return spawnSync('cmd', ['/d', '/s', '/c', cmdline], { cwd: dir, encoding: 'utf-8' }).status;
  };

  it('a bare & lets a later success mask an earlier failure (the original bug)', () => {
    expect(run('node fail.js & node ok.js')).toBe(0);
  });

  it('&& propagates the first failure (CASE B: tsc fails)', () => {
    expect(run('node fail.js && node ok.js')).not.toBe(0);
  });

  it('&& propagates the second failure (CASE C: fixture copy fails)', () => {
    expect(run('node ok.js && node fail.js')).not.toBe(0);
  });

  it('&& succeeds only when both succeed (CASE A)', () => {
    expect(run('node ok.js && node ok.js')).toBe(0);
  });
});
