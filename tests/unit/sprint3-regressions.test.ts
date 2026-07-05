import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import * as path from 'node:path';

import { RouterEngine } from '../../kernel/llm/router-engine.js';
import { allMockProviders } from '../../kernel/llm/mock-providers.js';
import { formatError } from '../../cli/errors.js';
import { OrganizationalMemoryBank } from '../../benchmarks/organizational-memory-bank.js';
import type { LLMRequest } from '../../kernel/llm/llm-types.js';

const TEST_DIR = path.resolve(process.cwd(), '.test-regression');

describe('Sprint 3 Regression Tests', () => {
  beforeEach(() => {
    if (!existsSync(TEST_DIR)) mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe('P1: RouterEngine fallback chain', () => {
    it('tries multiple models before throwing', async () => {
      const engine = new RouterEngine(allMockProviders);
      const req: LLMRequest = {
        model_id: 'gemini-2.5-pro',
        provider: 'gemini',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.3,
        max_tokens: 100,
        response_format: 'text',
      };
      const result = await engine.execute('coding', req);
      expect(result.response).toBeDefined();
    });

    it('error message includes task type when no provider available', async () => {
      const engine = new RouterEngine([]);
      const req: LLMRequest = {
        model_id: 'none',
        provider: 'local',
        messages: [{ role: 'user', content: 'test' }],
        temperature: 0.3,
        max_tokens: 100,
        response_format: 'text',
      };
      try {
        await engine.execute('nonexistent-task', req);
        expect.fail('Should have thrown');
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        expect(msg).toContain('nonexistent-task');
      }
    });
  });

  describe('P1: AbortError detection', () => {
    it('formatError handles AbortError with actionable message', () => {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      const suggestion = formatError(err, 'LLM');
      expect(suggestion.what).toContain('timed out');
      expect(suggestion.fix).toContain('Try again');
    });

    it('formatError handles "all models failed"', () => {
      const err = new Error('All models failed for task "coding". Tried: [model-a, model-b]. Last error: timeout.');
      const suggestion = formatError(err, 'Pipeline');
      expect(suggestion.what).toContain('all models failed');
      expect(suggestion.fix).toContain('hag doctor');
    });
  });

  describe('P2: File-based memory persistence', () => {
    it('persists snapshots to disk and reloads', () => {
      const storagePath = path.resolve(TEST_DIR, 'memory.json');
      const mem = new OrganizationalMemoryBank(42, storagePath);

      mem.addProjectSnapshot({
        snapshotId: 'snap-1',
        projectName: 'test-project',
        projectDescription: 'A test project',
        strategy: { winningStrategy: 'fast-win', differentiators: [], risks: [] } as any,
        techStack: ['React', 'TypeScript'],
        judgeCriteria: ['Innovation'],
        constraints: [],
        uxResults: [],
        deploySuccess: true,
        overallScore: 0.85,
        errors: [],
        failurePatterns: [],
        mutations: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        tags: ['test'],
      });

      expect(existsSync(storagePath)).toBe(true);

      const mem2 = new OrganizationalMemoryBank(42, storagePath);
      expect(mem2.getSnapshotCount()).toBeGreaterThanOrEqual(1);
    });

    it('clear() removes all data', () => {
      const storagePath = path.resolve(TEST_DIR, 'memory-clear.json');
      const mem = new OrganizationalMemoryBank(42, storagePath);
      mem.addProjectSnapshot({
        snapshotId: 'snap-2',
        projectName: 'test',
        projectDescription: 'test',
        strategy: { winningStrategy: 'fast-win', differentiators: [], risks: [] } as any,
        techStack: ['React'],
        judgeCriteria: [],
        constraints: [],
        uxResults: [],
        deploySuccess: true,
        overallScore: 0.8,
        errors: [],
        failurePatterns: [],
        mutations: [],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        tags: [],
      });
      expect(mem.getSnapshotCount()).toBeGreaterThanOrEqual(1);
      mem.clear();
      expect(mem.getSnapshotCount()).toBe(0);
    });
  });

  describe('P5: Honest metrics', () => {
    it('formatError does not produce fake scores', () => {
      const err = new Error('test error');
      const suggestion = formatError(err);
      expect(suggestion.what).not.toMatch(/\d+\/100/);
      expect(suggestion.why).not.toMatch(/\d+%/);
    });
  });

  describe('P6: Error reporting', () => {
    it('formatError categorizes API key errors', () => {
      const err = new Error('401 Unauthorized: invalid api key');
      const suggestion = formatError(err);
      expect(suggestion.what).toContain('Authentication');
      expect(suggestion.fix).toContain('hag config');
    });

    it('formatError categorizes timeout errors', () => {
      const err = new Error('ETIMEDOUT connect timeout');
      const suggestion = formatError(err);
      expect(suggestion.what).toContain('Connection');
      expect(suggestion.fix).toContain('internet');
    });

    it('formatError categorizes rate limit errors', () => {
      const err = new Error('429 Too Many Requests');
      const suggestion = formatError(err);
      expect(suggestion.what).toContain('Rate limited');
    });

    it('formatError categorizes model not found', () => {
      const err = new Error('model not found: gpt-99');
      const suggestion = formatError(err);
      expect(suggestion.what).toContain('unavailable');
      expect(suggestion.fix).toContain('hag models');
    });

    it('formatError categorizes disk space errors', () => {
      const err = new Error('ENOSPC: not enough space');
      const suggestion = formatError(err);
      expect(suggestion.what).toContain('Disk space');
    });

    it('formatError categorizes permission errors', () => {
      const err = new Error('EACCES: permission denied');
      const suggestion = formatError(err);
      expect(suggestion.what).toContain('Permission');
    });

    it('formatError categorizes file not found', () => {
      const err = new Error('ENOENT: no such file or directory');
      const suggestion = formatError(err);
      expect(suggestion.what).toContain('File not found');
    });
  });

  describe('P7: Command validation', () => {
    it('error results have non-empty messages', () => {
      const errors = [
        new Error('api key invalid'),
        new Error('timeout'),
        new Error('random unknown error xyz'),
      ];
      for (const err of errors) {
        const s = formatError(err);
        expect(s.what.length).toBeGreaterThan(0);
        expect(s.why.length).toBeGreaterThan(0);
        expect(s.fix.length).toBeGreaterThan(0);
      }
    });
  });
});
