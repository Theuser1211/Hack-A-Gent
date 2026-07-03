import { describe, it, expect } from 'vitest';

import {
  GeneratedFileSchema,
  GeneratedDirectorySchema,
  GeneratedModuleSchema,
  BuildIssueSchema,
  BuildResultSchema,
  GeneratedRepositorySchema,
} from '../../kernel/builders/builder-types.js';

describe('GeneratedFileSchema', () => {
  it('validates a complete file', () => {
    const file = GeneratedFileSchema.parse({
      path: 'src/index.ts',
      content: 'console.log("hi");',
    });
    expect(file.path).toBe('src/index.ts');
    expect(file.overwrite).toBe(true);
  });

  it('accepts optional fields', () => {
    const file = GeneratedFileSchema.parse({
      path: 'src/index.ts',
      content: 'test',
      language: 'ts',
      description: 'Entry point',
    });
    expect(file.language).toBe('ts');
    expect(file.description).toBe('Entry point');
  });
});

describe('GeneratedDirectorySchema', () => {
  it('validates a directory with no subdirectories', () => {
    const dir = GeneratedDirectorySchema.parse({ path: 'src' });
    expect(dir.path).toBe('src');
    expect(dir.files).toEqual([]);
    expect(dir.subdirectories).toEqual([]);
  });

  it('validates a directory with files', () => {
    const dir = GeneratedDirectorySchema.parse({
      path: 'src',
      files: [{ path: 'index.ts', content: 'export {};' }],
    });
    expect(dir.files).toHaveLength(1);
  });

  it('validates a directory with nested subdirectories', () => {
    const dir = GeneratedDirectorySchema.parse({
      path: 'src',
      subdirectories: [{ path: 'components' }],
    });
    expect(dir.subdirectories).toHaveLength(1);
    expect(dir.subdirectories![0]!.path).toBe('components');
  });
});

describe('GeneratedModuleSchema', () => {
  it('validates a frontend module', () => {
    const mod = GeneratedModuleSchema.parse({ name: 'frontend', type: 'frontend' });
    expect(mod.name).toBe('frontend');
    expect(mod.files).toEqual([]);
  });

  it('rejects invalid module type', () => {
    expect(() => GeneratedModuleSchema.parse({ name: 'x', type: 'invalid' })).toThrow();
  });
});

describe('BuildIssueSchema', () => {
  it('validates an error issue', () => {
    const issue = BuildIssueSchema.parse({ type: 'error', message: 'Build failed' });
    expect(issue.type).toBe('error');
  });
});

describe('BuildResultSchema', () => {
  it('validates a build result', () => {
    const result = BuildResultSchema.parse({
      success: true,
      summary: 'Build completed',
      started_at: '2026-06-25T00:00:00Z',
      completed_at: '2026-06-25T01:00:00Z',
    });
    expect(result.success).toBe(true);
    expect(result.modules).toEqual([]);
    expect(result.issues).toEqual([]);
  });
});

describe('GeneratedRepositorySchema', () => {
  it('validates a complete repository', () => {
    const repo = GeneratedRepositorySchema.parse({
      project_name: 'test-project',
      total_files: 10,
      total_lines: 500,
      generated_at: '2026-06-25T00:00:00Z',
    });
    expect(repo.blueprint_version).toBe('1.0.0');
    expect(repo.build_results).toEqual([]);
  });
});
