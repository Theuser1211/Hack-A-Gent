import { describe, it, expect } from 'vitest';

import {
  ProjectType,
  BuildCommandResultSchema,
  BuildFailureSchema,
  BuildWarningSchema,
  BuildArtifactSchema,
  MaterializationResultSchema,
  RunningApplicationSchema,
  BuildSummarySchema,
  BuildReportSchema,
} from '../../kernel/execution/execution-types.js';

describe('Execution Types', () => {
  describe('ProjectType', () => {
    it('accepts valid project types', () => {
      expect(ProjectType.parse('node')).toBe('node');
      expect(ProjectType.parse('python')).toBe('python');
      expect(ProjectType.parse('unknown')).toBe('unknown');
    });

    it('rejects invalid project types', () => {
      expect(() => ProjectType.parse('java')).toThrow();
      expect(() => ProjectType.parse('')).toThrow();
    });
  });

  describe('BuildCommandResultSchema', () => {
    it('accepts valid result', () => {
      const result = {
        command: 'npm install',
        stdout: 'installed',
        stderr: '',
        exit_code: 0,
        duration_ms: 1000,
        success: true,
        project_path: '/tmp/project',
      };
      expect(BuildCommandResultSchema.parse(result)).toEqual(result);
    });

    it('accepts failure result', () => {
      const result = {
        command: 'npm build',
        stdout: '',
        stderr: 'error',
        exit_code: 1,
        duration_ms: 500,
        success: false,
        project_path: '/tmp/project',
      };
      expect(BuildCommandResultSchema.parse(result)).toEqual(result);
    });

    it('rejects missing required fields', () => {
      expect(() => BuildCommandResultSchema.parse({ command: 'test' })).toThrow();
    });
  });

  describe('BuildFailureSchema', () => {
    it('accepts valid failure', () => {
      const failure = {
        type: 'compilation',
        message: 'SyntaxError',
        file: 'src/index.ts',
        line: 10,
        column: 5,
        code: 'TS2304',
        command: 'tsc',
      };
      expect(BuildFailureSchema.parse(failure)).toEqual(failure);
    });

    it('accepts failure with null fields', () => {
      const failure = {
        type: 'unknown',
        message: 'Something went wrong',
        file: null,
        line: null,
        column: null,
        code: null,
        command: null,
      };
      expect(BuildFailureSchema.parse(failure)).toEqual(failure);
    });

    it('rejects invalid type', () => {
      expect(() =>
        BuildFailureSchema.parse({
          type: 'critical',
          message: 'x',
          file: null,
          line: null,
          column: null,
          code: null,
          command: null,
        }),
      ).toThrow();
    });
  });

  describe('BuildWarningSchema', () => {
    it('accepts valid warning', () => {
      const warning = {
        type: 'deprecation',
        message: 'useNew syntax is deprecated',
        file: 'src/app.ts',
        line: 5,
        code: 'DEP001',
      };
      expect(BuildWarningSchema.parse(warning)).toEqual(warning);
    });

    it('rejects invalid type', () => {
      expect(() =>
        BuildWarningSchema.parse({ type: 'critical', message: 'x', file: null, line: null, code: null }),
      ).toThrow();
    });
  });

  describe('BuildArtifactSchema', () => {
    it('accepts valid artifact', () => {
      const artifact = {
        name: 'bundle.js',
        path: 'dist/bundle.js',
        size_bytes: 1024,
        type: 'bundle',
      };
      expect(BuildArtifactSchema.parse(artifact)).toEqual(artifact);
    });

    it('accepts artifact with null size', () => {
      const artifact = {
        name: 'report.json',
        path: 'reports/report.json',
        size_bytes: null,
        type: 'report',
      };
      expect(BuildArtifactSchema.parse(artifact)).toEqual(artifact);
    });

    it('rejects invalid type', () => {
      expect(() => BuildArtifactSchema.parse({ name: 'x', path: 'x', size_bytes: null, type: 'archive' })).toThrow();
    });
  });

  describe('MaterializationResultSchema', () => {
    it('accepts success result', () => {
      const result = {
        success: true,
        files_written: ['src/index.ts'],
        directories_created: ['src'],
        root_path: '/tmp/project',
        timestamp: '2026-01-01T00:00:00.000Z',
        error: null,
      };
      expect(MaterializationResultSchema.parse(result)).toEqual(result);
    });

    it('accepts failure result with error message', () => {
      const result = {
        success: false,
        files_written: [],
        directories_created: [],
        root_path: '/tmp/project',
        timestamp: '2026-01-01T00:00:00.000Z',
        error: 'Permission denied',
      };
      expect(MaterializationResultSchema.parse(result)).toEqual(result);
    });
  });

  describe('RunningApplicationSchema', () => {
    it('accepts running app', () => {
      const app = {
        pid: 12345,
        port: 3000,
        url: 'http://localhost:3000',
        ready: true,
        process_path: 'npm start',
        started_at: '2026-01-01T00:00:00.000Z',
        project_path: '/tmp/project',
      };
      expect(RunningApplicationSchema.parse(app)).toEqual(app);
    });

    it('accepts failed app with null pid', () => {
      const app = {
        pid: null,
        port: null,
        url: 'http://localhost:3000',
        ready: false,
        process_path: 'npm start',
        started_at: '2026-01-01T00:00:00.000Z',
        project_path: '/tmp/project',
      };
      expect(RunningApplicationSchema.parse(app)).toEqual(app);
    });
  });

  describe('BuildSummarySchema', () => {
    it('accepts valid summary', () => {
      const summary = {
        total_commands: 4,
        passed: 3,
        failed: 1,
        warnings: 2,
        duration_ms: 10000,
        success: false,
      };
      expect(BuildSummarySchema.parse(summary)).toEqual(summary);
    });

    it('accepts perfect summary', () => {
      const summary = {
        total_commands: 4,
        passed: 4,
        failed: 0,
        warnings: 0,
        duration_ms: 5000,
        success: true,
      };
      expect(BuildSummarySchema.parse(summary)).toEqual(summary);
    });
  });

  describe('BuildReportSchema', () => {
    it('accepts complete report', () => {
      const report = {
        project_name: 'test-project',
        repository_path: '/tmp/project',
        materialized: {
          success: true,
          files_written: ['src/index.ts'],
          directories_created: ['src'],
          root_path: '/tmp/project',
          timestamp: '2026-01-01T00:00:00.000Z',
          error: null,
        },
        dependency_installation: {
          command: 'npm install',
          stdout: 'ok',
          stderr: '',
          exit_code: 0,
          duration_ms: 1000,
          success: true,
          project_path: '/tmp/project',
        },
        build_command: {
          command: 'Build',
          stdout: 'ok',
          stderr: '',
          exit_code: 0,
          duration_ms: 2000,
          success: true,
          project_path: '/tmp/project',
        },
        lint_command: null,
        test_command: null,
        failures: [],
        warnings: [],
        artifacts: [],
        summary: {
          total_commands: 4,
          passed: 2,
          failed: 0,
          warnings: 0,
          duration_ms: 10000,
          success: true,
        },
        generated_at: '2026-01-01T00:00:00.000Z',
      };
      expect(BuildReportSchema.parse(report)).toEqual(report);
    });

    it('accepts report with failures', () => {
      const report = {
        project_name: 'test-project',
        repository_path: '/tmp/project',
        materialized: {
          success: true,
          files_written: [],
          directories_created: [],
          root_path: '/tmp/project',
          timestamp: '2026-01-01T00:00:00.000Z',
          error: null,
        },
        dependency_installation: null,
        build_command: null,
        lint_command: null,
        test_command: null,
        failures: [
          {
            type: 'compilation' as const,
            message: 'Cannot find module',
            file: 'src/index.ts',
            line: 1,
            column: null,
            code: null,
            command: null,
          },
        ],
        warnings: [],
        artifacts: [],
        summary: {
          total_commands: 4,
          passed: 0,
          failed: 1,
          warnings: 0,
          duration_ms: 5000,
          success: false,
        },
        generated_at: '2026-01-01T00:00:00.000Z',
      };
      expect(BuildReportSchema.parse(report)).toBeTruthy();
    });
  });
});
