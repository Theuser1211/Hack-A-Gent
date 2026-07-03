import { describe, it, expect } from 'vitest';

import {
  PromptComponentSchema,
  PromptTemplateSchema,
  PromptAssemblySchema,
} from '../../kernel/prompts/prompt-types.js';

describe('PromptComponentSchema', () => {
  it('validates a component', () => {
    const c = PromptComponentSchema.parse({ id: 'test', priority: 0, max_tokens: 500 });
    expect(c.required).toBe(false);
    expect(c.content).toBe('');
  });
});

describe('PromptTemplateSchema', () => {
  it('validates a template', () => {
    const t = PromptTemplateSchema.parse({ template_id: 't1', role: 'system', description: 'test' });
    expect(t.components).toEqual([]);
    expect(t.typical_tokens).toBe(4096);
  });
});

describe('PromptAssemblySchema', () => {
  it('validates an assembly', () => {
    const a = PromptAssemblySchema.parse({ system_prompt: 'hello', messages: [{ role: 'system', content: 'hello' }] });
    expect(a.within_budget).toBe(true);
  });

  it('rejects invalid role', () => {
    expect(() =>
      PromptAssemblySchema.parse({
        system_prompt: '',
        messages: [{ role: 'admin', content: 'x' }],
      }),
    ).toThrow();
  });
});
