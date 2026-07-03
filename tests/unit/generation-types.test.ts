import { describe, it, expect } from 'vitest';

import {
  CodeGenerationContextSchema,
  CodeGenerationPromptSchema,
  StructuredCodeOutputSchema,
  FileGenerationResultSchema,
  ModuleGenerationResultSchema,
  SelfRepairConfigSchema,
  PatchOperationSchema,
  FilePatchSchema,
  CodeRepairResultSchema,
  RepositoryGenerationResultSchema,
} from '../../kernel/generation/generation-types.js';

describe('CodeGenerationContextSchema', () => {
  it('validates a complete context', () => {
    const result = CodeGenerationContextSchema.safeParse({
      blueprint: { project_name: 'Test' },
      build_report: null,
      previous_fix_tasks: [],
      level: 'module',
      module_type: 'frontend',
      target_file: null,
      project_name: 'TestProject',
      project_type: 'node',
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults correctly', () => {
    const result = CodeGenerationContextSchema.parse({
      blueprint: {},
      project_name: 'Test',
    });
    expect(result.level).toBe('module');
    expect(result.project_type).toBe('unknown');
    expect(result.build_report).toBeNull();
    expect(result.previous_fix_tasks).toEqual([]);
  });
});

describe('CodeGenerationPromptSchema', () => {
  it('validates a correct prompt', () => {
    const result = CodeGenerationPromptSchema.safeParse({
      system_prompt: 'You are an expert',
      user_prompt: 'Generate code',
      response_format: 'json_object',
    });
    expect(result.success).toBe(true);
  });

  it('applies default values', () => {
    const result = CodeGenerationPromptSchema.parse({
      system_prompt: 'System',
      user_prompt: 'User',
    });
    expect(result.response_format).toBe('json_object');
    expect(result.model_preference).toBeNull();
    expect(result.max_tokens).toBe(8192);
    expect(result.temperature).toBe(0.3);
  });

  it('rejects missing required fields', () => {
    const result = CodeGenerationPromptSchema.safeParse({ system_prompt: 'Only system' });
    expect(result.success).toBe(false);
  });
});

describe('StructuredCodeOutputSchema', () => {
  it('validates complete output', () => {
    const result = StructuredCodeOutputSchema.safeParse({
      path: 'src/index.ts',
      content: 'export const x = 1;',
      language: 'typescript',
      dependencies: [{ source: 'react', type: 'import', specifier: 'react' }],
      exports: [{ name: 'x', type: 'const' }],
      imports: ['import React from "react"'],
    });
    expect(result.success).toBe(true);
  });

  it('applies defaults', () => {
    const result = StructuredCodeOutputSchema.parse({
      path: 'test.ts',
      content: '// empty',
      language: 'typescript',
    });
    expect(result.dependencies).toEqual([]);
    expect(result.exports).toEqual([]);
    expect(result.imports).toEqual([]);
    expect(result.validation_errors).toEqual([]);
    expect(result.validated).toBe(false);
  });
});

describe('FileGenerationResultSchema', () => {
  it('validates a success result', () => {
    const result = FileGenerationResultSchema.safeParse({
      file: { path: 'test.ts', content: 'code', language: 'typescript' },
      attempt: 0,
      success: true,
      error: null,
      latency_ms: 100,
      tokens_used: 50,
      model_used: 'gemini-2.5-pro',
    });
    expect(result.success).toBe(true);
  });

  it('validates a failure result', () => {
    const result = FileGenerationResultSchema.safeParse({
      file: { path: 'test.ts', content: '', language: 'typescript' },
      attempt: 2,
      success: false,
      error: 'LLM call failed',
      latency_ms: 5000,
    });
    expect(result.success).toBe(true);
  });
});

describe('ModuleGenerationResultSchema', () => {
  it('validates a module result', () => {
    const result = ModuleGenerationResultSchema.safeParse({
      module_name: 'frontend',
      module_type: 'frontend',
      files: [
        {
          file: { path: 'App.tsx', content: 'export function App() {}', language: 'typescript' },
          attempt: 0,
          success: true,
          error: null,
          latency_ms: 100,
          tokens_used: 50,
        },
      ],
      success: true,
      total_latency_ms: 100,
      total_tokens: 50,
    });
    expect(result.success).toBe(true);
  });
});

describe('RepositoryGenerationResultSchema', () => {
  it('validates repository result', () => {
    const result = RepositoryGenerationResultSchema.safeParse({
      project_name: 'Test',
      modules: [],
      success: true,
      total_latency_ms: 0,
      total_tokens: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe('SelfRepairConfigSchema', () => {
  it('applies defaults', () => {
    const result = SelfRepairConfigSchema.parse({});
    expect(result.max_attempts).toBe(3);
    expect(result.prompt_variation_strategy).toBe('more_detailed');
    expect(result.use_fallback_model).toBe(true);
    expect(result.use_alternative_provider).toBe(true);
  });
});

describe('PatchOperationSchema', () => {
  it('validates replace operation', () => {
    const result = PatchOperationSchema.safeParse({ type: 'replace', target: 'old code', content: 'new code' });
    expect(result.success).toBe(true);
  });

  it('validates delete operation', () => {
    const result = PatchOperationSchema.safeParse({ type: 'delete', target: 'code to remove', content: '' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid type', () => {
    const result = PatchOperationSchema.safeParse({ type: 'invalid', target: 'x', content: 'y' });
    expect(result.success).toBe(false);
  });
});

describe('FilePatchSchema', () => {
  it('validates a complete patch', () => {
    const result = FilePatchSchema.safeParse({
      file_path: 'src/index.ts',
      operations: [{ type: 'replace', target: 'old', content: 'new' }],
      language: 'typescript',
    });
    expect(result.success).toBe(true);
  });
});

describe('CodeRepairResultSchema', () => {
  it('validates a repair result', () => {
    const result = CodeRepairResultSchema.safeParse({
      file_path: 'src/index.ts',
      original_content: 'old code',
      patched_content: 'new code',
      operations_applied: [{ type: 'replace', target: 'old', content: 'new' }],
      success: true,
      error: null,
      latency_ms: 200,
    });
    expect(result.success).toBe(true);
  });
});
