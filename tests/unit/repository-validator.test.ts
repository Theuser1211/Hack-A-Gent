import { describe, it, expect } from 'vitest';

import type { GeneratedRepository } from '../../kernel/builders/builder-types.js';
import { RepositoryValidator } from '../../kernel/builders/repository-validator.js';

function makeRepo(overrides?: Partial<GeneratedRepository>): GeneratedRepository {
  return {
    project_name: 'test',
    blueprint_version: '1.0.0',
    modules: [],
    total_files: 0,
    total_lines: 0,
    generated_at: '2026-06-25T00:00:00Z',
    build_results: [],
    ...overrides,
  };
}

describe('RepositoryValidator', () => {
  const validator = new RepositoryValidator();

  it('validates a valid repository with no issues', () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'frontend',
          type: 'frontend',
          files: [{ path: 'src/index.ts', content: 'export {};' }],
        },
      ],
      total_files: 1,
      total_lines: 1,
    });
    const report = validator.validate(repo);
    expect(report.valid).toBe(true);
    expect(report.issues).toHaveLength(0);
  });

  it('detects empty file path', () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'frontend',
          type: 'frontend',
          files: [{ path: '', content: 'test' }],
        },
      ],
      total_files: 1,
      total_lines: 1,
    });
    const report = validator.validate(repo);
    expect(report.issues.some((i) => i.message.includes('Empty file path'))).toBe(true);
  });

  it('detects path traversal', () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'frontend',
          type: 'frontend',
          files: [{ path: '../../etc/passwd', content: 'hack' }],
        },
      ],
      total_files: 1,
      total_lines: 1,
    });
    const report = validator.validate(repo);
    expect(report.issues.some((i) => i.message.includes('Path traversal'))).toBe(true);
  });

  it('detects duplicate file paths across modules', () => {
    const repo = makeRepo({
      modules: [
        { name: 'frontend', type: 'frontend', files: [{ path: 'shared/file.ts', content: 'a' }] },
        { name: 'backend', type: 'backend', files: [{ path: 'shared/file.ts', content: 'b' }] },
      ],
      total_files: 2,
      total_lines: 2,
    });
    const report = validator.validate(repo);
    expect(report.issues.some((i) => i.message.includes('Duplicate file path'))).toBe(true);
  });

  it('detects empty file content', () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'frontend',
          type: 'frontend',
          files: [{ path: 'empty.txt', content: '' }],
        },
      ],
      total_files: 1,
      total_lines: 0,
    });
    const report = validator.validate(repo);
    expect(report.issues.some((i) => i.message.includes('Empty file'))).toBe(true);
  });

  it('detects module with no files', () => {
    const repo = makeRepo({
      modules: [{ name: 'empty-module', type: 'docs', files: [] }],
      total_files: 0,
      total_lines: 0,
    });
    const report = validator.validate(repo);
    expect(report.issues.some((i) => i.message.includes('has no files'))).toBe(true);
  });

  it('reports correct total file and line counts', () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'frontend',
          type: 'frontend',
          files: [{ path: 'a.ts', content: '12345' }],
        },
      ],
      total_files: 1,
      total_lines: 1,
    });
    const report = validator.validate(repo);
    expect(report.total_files).toBe(1);
    expect(report.total_lines).toBe(1);
  });
});
