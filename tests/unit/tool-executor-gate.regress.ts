import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { ToolExecutor } from '../../benchmarks/tool-executor.js';

describe('tool-executor write/patch/append syntax gate', () => {
  let executor: ToolExecutor;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'hag-tool-exec-test-'));
    executor = new ToolExecutor(tempDir, 12345);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {
      // ignore cleanup errors
    }
  });

  describe('write operation', () => {
    it('rejects malformed TSX syntax', async () => {
      const result = await executor.execute('file', 'write', {
        path: 'src/components/Broken.tsx',
        content: 'export const Broken = () => <div>Unclosed',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Syntax gate failed');
      expect(result.error).toContain('src/components/Broken.tsx');
    });

    it('accepts valid TSX syntax', async () => {
      const result = await executor.execute('file', 'write', {
        path: 'src/components/Valid.tsx',
        content: 'export const Valid = () => <div>Valid</div>;',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Written src/components/Valid.tsx');
    });

    it('allows non-source files to pass through', async () => {
      const result = await executor.execute('file', 'write', {
        path: 'README.md',
        content: '# Hello World\n',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Written README.md');
    });
  });

  describe('patch operation', () => {
    beforeEach(async () => {
      // Create initial valid file
      await executor.execute('file', 'write', {
        path: 'src/App.tsx',
        content: 'export const App = () => <div>Hello</div>;',
      });
    });

    it('rejects patch that creates malformed TSX', async () => {
      const result = await executor.execute('file', 'patch', {
        path: 'src/App.tsx',
        oldString: 'Hello',
        newString: 'Unclosed {',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Syntax gate failed');
      expect(result.error).toContain('src/App.tsx');
    });

    it('accepts valid patch', async () => {
      const result = await executor.execute('file', 'patch', {
        path: 'src/App.tsx',
        oldString: 'Hello',
        newString: 'World',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Patched src/App.tsx');
    });

    it('rejects append that creates malformed TSX', async () => {
      const result = await executor.execute('file', 'patch', {
        path: 'src/App.tsx',
        append: 'const broken = () => <div>',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Syntax gate failed');
      expect(result.error).toContain('src/App.tsx');
    });

    it('accepts valid append', async () => {
      const result = await executor.execute('file', 'patch', {
        path: 'src/App.tsx',
        append: '\nexport const Helper = () => <span>help</span>;',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Appended to src/App.tsx');
    });
  });
});