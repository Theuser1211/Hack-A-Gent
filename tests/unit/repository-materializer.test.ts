import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import type { GeneratedRepository } from '../../kernel/builders/builder-types.js';
import {
  DefaultRepositoryMaterializer,
  RollbackableRepositoryMaterializer,
} from '../../kernel/execution/repository-materializer.js';

function makeRepo(overrides?: Partial<GeneratedRepository>): GeneratedRepository {
  return {
    project_name: 'test-project',
    blueprint_version: '1.0.0',
    modules: [
      {
        name: 'frontend',
        type: 'frontend',
        files: [
          { path: 'src/index.ts', content: 'console.log("hello");' },
          { path: 'src/app.tsx', content: 'export const App = () => null;' },
        ],
        description: 'Frontend module',
      },
      {
        name: 'backend',
        type: 'backend',
        files: [{ path: 'server.ts', content: 'const app = express();' }],
        description: 'Backend module',
      },
    ],
    total_files: 3,
    total_lines: 3,
    generated_at: '2026-01-01T00:00:00.000Z',
    build_results: [],
    ...overrides,
  };
}

describe('DefaultRepositoryMaterializer', () => {
  let tmpDir: string;
  let materializer: DefaultRepositoryMaterializer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'materializer-test-'));
    materializer = new DefaultRepositoryMaterializer(tmpDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writes all files to disk', async () => {
    const repo = makeRepo();
    const result = await materializer.materialize(repo, 'output');

    expect(result.success).toBe(true);
    expect(result.files_written).toHaveLength(3);
    expect(result.files_written).toContain('src/index.ts');
    expect(result.files_written).toContain('src/app.tsx');
    expect(result.files_written).toContain('server.ts');
  });

  it('creates directories as needed', async () => {
    const repo = makeRepo();
    const result = await materializer.materialize(repo, 'output');

    expect(result.success).toBe(true);
    expect(result.directories_created).toContain(path.join(tmpDir, 'output', 'src'));
    expect(result.directories_created).toContain(path.join(tmpDir, 'output'));
  });

  it('writes correct file content', async () => {
    const repo = makeRepo();
    await materializer.materialize(repo, 'output');

    const content = fs.readFileSync(path.join(tmpDir, 'output', 'src', 'index.ts'), 'utf-8');
    expect(content).toBe('console.log("hello");');
  });

  it('handles empty modules gracefully', async () => {
    const repo = makeRepo({ modules: [] });
    const result = await materializer.materialize(repo, 'output');

    expect(result.success).toBe(true);
    expect(result.files_written).toHaveLength(0);
  });

  it('blocks path traversal attacks', async () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'malicious',
          type: 'config',
          files: [{ path: '../../etc/passwd', content: 'hacked' }],
          description: '',
        },
      ],
      total_files: 1,
    });

    const result = await materializer.materialize(repo, 'output');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Path traversal');
  });

  it('returns error on failure with partial files', async () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'valid',
          type: 'config',
          files: [{ path: 'good.txt', content: 'ok' }],
          description: '',
        },
        {
          name: 'bad',
          type: 'config',
          files: [{ path: '../../escape.txt', content: 'bad' }],
          description: '',
        },
      ],
      total_files: 2,
    });

    const result = await materializer.materialize(repo, 'output');
    expect(result.success).toBe(false);
    expect(result.files_written).toHaveLength(1);
    expect(result.files_written[0]).toBe('good.txt');
  });
});

describe('RollbackableRepositoryMaterializer', () => {
  let tmpDir: string;
  let rollbackable: RollbackableRepositoryMaterializer;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rollback-test-'));
    rollbackable = new RollbackableRepositoryMaterializer(new DefaultRepositoryMaterializer(tmpDir));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('delegates to inner and returns result', async () => {
    const repo = makeRepo();
    const result = await rollbackable.materialize(repo, 'output');
    expect(result.success).toBe(true);
    expect(result.files_written).toHaveLength(3);
  });

  it('rolls back files on failure', async () => {
    const repo = makeRepo({
      modules: [
        {
          name: 'valid',
          type: 'config',
          files: [{ path: 'good.txt', content: 'ok' }],
          description: '',
        },
        {
          name: 'evil',
          type: 'config',
          files: [{ path: '../../escape.txt', content: 'bad' }],
          description: '',
        },
      ],
      total_files: 2,
    });

    const result = await rollbackable.materialize(repo, 'output');
    expect(result.success).toBe(false);

    const goodFile = path.join(tmpDir, 'output', 'good.txt');
    expect(fs.existsSync(goodFile)).toBe(false);
  });
});
