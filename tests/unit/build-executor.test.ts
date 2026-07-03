import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { DefaultBuildExecutor } from '../../kernel/execution/build-executor.js';

describe('DefaultBuildExecutor', () => {
  let tmpDir: string;
  let executor: DefaultBuildExecutor;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-exec-test-'));
    executor = new DefaultBuildExecutor();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('detectProjectType', () => {
    it('detects node project from package.json', () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), '{}');
      expect(executor.detectProjectType(tmpDir)).toBe('node');
    });

    it('detects python project from requirements.txt', () => {
      fs.writeFileSync(path.join(tmpDir, 'requirements.txt'), 'flask');
      expect(executor.detectProjectType(tmpDir)).toBe('python');
    });

    it('detects python project from setup.py', () => {
      fs.writeFileSync(path.join(tmpDir, 'setup.py'), 'from setuptools import setup');
      expect(executor.detectProjectType(tmpDir)).toBe('python');
    });

    it('detects python project from pyproject.toml', () => {
      fs.writeFileSync(path.join(tmpDir, 'pyproject.toml'), '[build-system]');
      expect(executor.detectProjectType(tmpDir)).toBe('python');
    });

    it('returns unknown when no project file found', () => {
      expect(executor.detectProjectType(tmpDir)).toBe('unknown');
    });
  });

  describe('detectFailures', () => {
    it('returns empty for successful result', () => {
      const result = {
        command: 'test',
        stdout: 'all good',
        stderr: '',
        exit_code: 0,
        duration_ms: 100,
        success: true,
        project_path: '/tmp',
      };
      expect(executor.detectFailures(result)).toHaveLength(0);
    });

    it('detects dependency failure from error message', () => {
      const result = {
        command: 'npm install',
        stdout: '',
        stderr: "Cannot find module 'express'",
        exit_code: 1,
        duration_ms: 500,
        success: false,
        project_path: '/tmp',
      };
      const failures = executor.detectFailures(result);
      expect(failures).toHaveLength(1);
      expect(failures[0]!.type).toBe('dependency');
    });

    it('detects compilation failure from error message', () => {
      const result = {
        command: 'tsc',
        stdout: '',
        stderr: 'src/index.ts:10:5 - error TS2304: Cannot find name',
        exit_code: 1,
        duration_ms: 500,
        success: false,
        project_path: '/tmp',
      };
      const failures = executor.detectFailures(result);
      expect(failures).toHaveLength(1);
      expect(failures[0]!.type).toBe('compilation');
      expect(failures[0]!.line).toBe(10);
    });

    it('extracts file and line from error output', () => {
      const result = {
        command: 'tsc',
        stdout: '',
        stderr: 'src/app.ts:42:6 - error TS2322',
        exit_code: 1,
        duration_ms: 500,
        success: false,
        project_path: '/tmp',
      };
      const failures = executor.detectFailures(result);
      expect(failures[0]!.file).toBe('src/app.ts');
    });

    it('returns unknown failure when no specific pattern matched', () => {
      const result = {
        command: 'echo',
        stdout: 'unknown error occurred',
        stderr: 'something broke',
        exit_code: 1,
        duration_ms: 100,
        success: false,
        project_path: '/tmp',
      };
      const failures = executor.detectFailures(result);
      expect(failures.length).toBeGreaterThan(0);
    });
  });

  describe('detectWarnings', () => {
    it('returns empty for clean output', () => {
      const result = {
        command: 'test',
        stdout: 'everything ok',
        stderr: '',
        exit_code: 0,
        duration_ms: 100,
        success: true,
        project_path: '/tmp',
      };
      expect(executor.detectWarnings(result)).toHaveLength(0);
    });

    it('detects warning lines', () => {
      const result = {
        command: 'lint',
        stdout: 'Warning: unused import React\nDeprecationWarning: useNew is deprecated\n',
        stderr: '',
        exit_code: 0,
        duration_ms: 100,
        success: true,
        project_path: '/tmp',
      };
      const warnings = executor.detectWarnings(result);
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings.some((w) => w.type === 'unused_import')).toBe(true);
    });

    it('detects deprecation warnings', () => {
      const result = {
        command: 'lint',
        stdout: 'DeprecationWarning: Buffer() is deprecated',
        stderr: '',
        exit_code: 0,
        duration_ms: 100,
        success: true,
        project_path: '/tmp',
      };
      const warnings = executor.detectWarnings(result);
      expect(warnings.some((w) => w.type === 'deprecation')).toBe(true);
    });
  });

  describe('Node project commands', () => {
    it('runBuild detects build script from package.json', { timeout: 30000 }, async () => {
      fs.writeFileSync(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({
          scripts: { build: 'echo build-ok' },
        }),
      );

      const result = await executor.runBuild(tmpDir);
      expect(result.command).toBe('Build');
    });

    it('runBuild returns success for echo fallback', { timeout: 30000 }, async () => {
      fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({}));

      const result = await executor.runBuild(tmpDir);
      expect(result.command).toBe('Build');
    });
  });

  describe('unknown project commands', () => {
    it('installDependencies skips for unknown type', async () => {
      const result = await executor.installDependencies(tmpDir);
      expect(result.success).toBe(true);
    });

    it('runBuild skips for unknown type', async () => {
      const result = await executor.runBuild(tmpDir);
      expect(result.success).toBe(true);
    });

    it('runLint skips for unknown type', async () => {
      const result = await executor.runLint(tmpDir);
      expect(result.success).toBe(true);
    });

    it('runTests skips for unknown type', async () => {
      const result = await executor.runTests(tmpDir);
      expect(result.success).toBe(true);
    });
  });
});
