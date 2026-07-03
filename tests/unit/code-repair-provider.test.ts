import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { BuildFailure } from '../../kernel/execution/execution-types.js';
import { CodeRepairProvider } from '../../kernel/generation/code-repair-provider.js';
import type { FilePatch } from '../../kernel/generation/generation-types.js';
import type { JudgeIssue } from '../../kernel/judge/judge-types.js';
import type { LLMProvider } from '../../kernel/llm/llm-provider.js';
import { RouterEngine } from '../../kernel/llm/router-engine.js';

function createMockProvider(): LLMProvider {
  return {
    providerId: 'local',
    getModels: () => [
      {
        model_id: 'mock-model',
        provider: 'local' as const,
        capabilities: ['code_generation'],
        context_window: 128000,
        supports_json_mode: true,
        supports_tool_calling: false,
        typical_latency_ms: 100,
        cost_per_1k_input: 0,
        cost_per_1k_output: 0,
      },
    ],
    getHealth: () => ({
      provider_id: 'local' as const,
      status: 'healthy' as const,
      last_check: new Date().toISOString(),
      consecutive_failures: 0,
      total_requests: 10,
      failed_requests: 0,
      avg_latency_ms: 100,
    }),
    execute: vi.fn().mockResolvedValue({
      content: JSON.stringify({
        file_path: 'src/index.ts',
        operations: [{ type: 'replace', target: 'old function', content: 'new function' }],
        language: 'typescript',
      }),
      model_id: 'mock-model',
      provider: 'local' as const,
      usage: { prompt_tokens: 50, completion_tokens: 30, total_tokens: 80 },
      finish_reason: 'stop',
      latency_ms: 100,
    }),
  };
}

describe('CodeRepairProvider', () => {
  let provider: CodeRepairProvider;
  let router: RouterEngine;

  beforeEach(() => {
    const mockProvider = createMockProvider();
    router = new RouterEngine(
      [mockProvider],
      {},
      { coding: { preferred: 'mock-model', fallback: 'mock-model', emergency: 'mock-model' } },
    );
    provider = new CodeRepairProvider({ max_attempts: 1, routerEngine: router, taskType: 'coding' });
  });

  describe('applyPatch', () => {
    it('applies replace operation', async () => {
      const patch: FilePatch = {
        file_path: 'test.ts',
        operations: [{ type: 'replace', target: 'old', content: 'new', line: null }],
        language: 'typescript',
      };
      const result = await provider.applyPatch(patch, 'line with old code');
      expect(result.success).toBe(true);
      expect(result.patched_content).toBe('line with new code');
    });

    it('applies insert_before operation', async () => {
      const patch: FilePatch = {
        file_path: 'test.ts',
        operations: [{ type: 'insert_before', target: 'TARGET1', content: 'NEW_STUFF', line: null }],
        language: 'typescript',
      };
      const result = await provider.applyPatch(patch, 'before TARGET1 after');
      expect(result.success).toBe(true);
      expect(result.patched_content).toBe('before NEW_STUFF\nTARGET1 after');
    });

    it('applies insert_after operation', async () => {
      const patch: FilePatch = {
        file_path: 'test.ts',
        operations: [{ type: 'insert_after', target: 'TARGET2', content: 'NEW_STUFF', line: null }],
        language: 'typescript',
      };
      const result = await provider.applyPatch(patch, 'before TARGET2 after');
      expect(result.success).toBe(true);
      expect(result.patched_content).toBe('before TARGET2\nNEW_STUFF after');
    });

    it('applies delete operation', async () => {
      const patch: FilePatch = {
        file_path: 'test.ts',
        operations: [{ type: 'delete', target: 'DELETEME', content: '', line: null }],
        language: 'typescript',
      };
      const result = await provider.applyPatch(patch, 'keep DELETEME here');
      expect(result.success).toBe(true);
      expect(result.patched_content).toBe('keep  here');
    });

    it('appends content', async () => {
      const patch: FilePatch = {
        file_path: 'test.ts',
        operations: [{ type: 'append', target: '', content: 'new line at end', line: null }],
        language: 'typescript',
      };
      const result = await provider.applyPatch(patch, 'existing content');
      expect(result.patched_content).toBe('existing content\nnew line at end');
    });

    it('prepends content', async () => {
      const patch: FilePatch = {
        file_path: 'test.ts',
        operations: [{ type: 'prepend', target: '', content: 'new line at start', line: null }],
        language: 'typescript',
      };
      const result = await provider.applyPatch(patch, 'existing content');
      expect(result.patched_content).toBe('new line at start\nexisting content');
    });

    it('returns failure when replace target not found', async () => {
      const patch: FilePatch = {
        file_path: 'test.ts',
        operations: [{ type: 'replace', target: 'nonexistent text', content: 'new', line: null }],
        language: 'typescript',
      };
      const result = await provider.applyPatch(patch, 'some content');
      expect(result.success).toBe(false);
    });
  });

  describe('repairFromBuildFailure', () => {
    it('attempts to repair from build failure', async () => {
      const failure: BuildFailure = {
        type: 'compilation',
        message: 'Cannot find name "foo"',
        file: 'src/index.ts',
        line: 5,
        column: 10,
        code: 'TS2304',
        command: 'tsc',
      };
      const content = 'const x = foo;';
      const result = await provider.repairFromBuildFailure(failure, content);
      expect(result.file_path).toBe('src/index.ts');
    });
  });

  describe('repairFromJudgeIssue', () => {
    it('attempts to repair from judge issue', async () => {
      const issue: JudgeIssue = {
        category: 'code_quality',
        severity: 'high',
        message: 'Missing error handling',
        file: 'src/index.ts',
        line: 10,
        recommendation: 'Add try-catch block',
      };
      const content = 'function risky() { JSON.parse(input); }';
      const result = await provider.repairFromJudgeIssue(issue, content);
      expect(result.file_path).toBe('src/index.ts');
    });
  });

  describe('repairFromPlaywrightFailure', () => {
    it('attempts to repair from playwright failure', async () => {
      const content = 'test("should work", () => { /* ... */ })';
      const result = await provider.repairFromPlaywrightFailure(
        {
          type: 'playwright',
          test_file: 'test.spec.ts',
          test_name: 'should work',
          error_message: 'Timed out',
          location: { file: 'src/component.tsx', line: 15 },
        },
        content,
      );
      expect(result.file_path).toBeTruthy();
    });
  });
});
