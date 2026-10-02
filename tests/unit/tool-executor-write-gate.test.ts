import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

import { ToolExecutor } from '../../benchmarks/tool-executor.js';

describe('ToolExecutor write-path syntax gate', () => {
  let executor: ToolExecutor;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'hag-tool-exec-test-'));
    executor = new ToolExecutor(tempDir, 12345);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('write operation', () => {
    it('writes a component that contains imports (no harness error)', async () => {
      const result = await executor.execute('file', 'write', {
        path: 'src/app/layout.tsx',
        content: [
          "import './globals.css';",
          "import { NavBar } from '@/components/navbar';",
          '',
          'export default function RootLayout({ children }: { children: React.ReactNode }) {',
          '  return <html lang="en"><body><NavBar />{children}</body></html>;',
          '}',
        ].join('\n'),
      });

      expect(result.success).toBe(true);
      expect(result.error).toBeNull();
      expect(existsSync(resolve(tempDir, 'src/app/layout.tsx'))).toBe(true);
    });

    it('rejects malformed TSX syntax', async () => {
      const result = await executor.execute('file', 'write', {
        path: 'src/components/Broken.tsx',
        content: 'export const Broken = () => <div>Unclosed',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Syntax gate failed');
      expect(result.error).toContain('src/components/Broken.tsx');
      expect(existsSync(resolve(tempDir, 'src/components/Broken.tsx'))).toBe(false);
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
      expect(readFileSync(resolve(tempDir, 'src/App.tsx'), 'utf-8')).toContain('Hello');
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

    it('accepts valid append and persists the appended content', async () => {
      const result = await executor.execute('file', 'patch', {
        path: 'src/App.tsx',
        append: '\nexport const Helper = () => <span>help</span>;',
      });

      expect(result.success).toBe(true);
      expect(readFileSync(resolve(tempDir, 'src/App.tsx'), 'utf-8')).toContain(
        'export const Helper',
      );
    });
  });
});
