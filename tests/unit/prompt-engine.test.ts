import { describe, it, expect, beforeEach } from 'vitest';

import { PromptEngine } from '../../kernel/prompts/prompt-engine.js';
import type { PromptAssembly } from '../../kernel/prompts/prompt-types.js';

describe('PromptEngine', () => {
  let engine: PromptEngine;

  beforeEach(() => {
    engine = new PromptEngine();
  });

  describe('assembly', () => {
    it('produces a system prompt and user message', async () => {
      const result = await engine.assemble({ task_description: 'Build a login form' });
      expect(result.system_prompt).toBeTruthy();
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]!.role).toBe('system');
      expect(result.messages[1]!.role).toBe('user');
    });

    it('includes required components even with small budget', async () => {
      const result = await engine.assemble({ task_description: 'Test' }, 100);
      // Required components always included; total may exceed tight budget
      expect(result.messages.length).toBeGreaterThanOrEqual(1);
      expect(result.system_prompt.length).toBeGreaterThan(0);
    });

    it('generates warnings when component budget exceeded', async () => {
      engine.setComponentContent('skills', 'x'.repeat(6000));
      engine.setComponentContent('memory_context', 'y'.repeat(5000));
      const result = await engine.assemble({ task_description: 'Test' }, 500);
      // Skills/memory are non-required and skipped when over budget
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('includes task description in user message', async () => {
      const result = await engine.assemble({ task_description: 'Specific task' });
      expect(result.messages[1]!.content).toContain('Specific task');
    });

    it('omits user message when no task description', async () => {
      const result = await engine.assemble({});
      expect(result.messages).toHaveLength(1);
    });
  });

  describe('component registration', () => {
    it('sets and gets component content', () => {
      engine.setComponentContent('agent_role', 'You are a test agent');
      const comp = engine.getComponent('agent_role');
      expect(comp).toBeDefined();
      expect(comp!.content).toBe('You are a test agent');
    });

    it('returns undefined for unknown component', () => {
      const comp = engine.getComponent('nonexistent');
      expect(comp).toBeUndefined();
    });
  });

  describe('custom renderers', () => {
    it('invokes registered renderer', async () => {
      engine.registerRenderer('agent_role', async (ctx) => `Rendered: ${ctx.custom_value}`);
      const result = await engine.assemble({ task_description: 'Test', custom_value: 'Hello' });
      expect(result.system_prompt).toContain('Rendered: Hello');
    });

    it('falls back to content when renderer fails', async () => {
      engine.setComponentContent('agent_role', 'Fallback content');
      engine.registerRenderer('agent_role', async () => {
        throw new Error('Render failure');
      });
      const result = await engine.assemble({ task_description: 'Test' });
      expect(result.system_prompt).toContain('Fallback content');
    });
  });

  describe('validation', () => {
    it('returns empty errors for valid assembly with all components filled', async () => {
      engine.setComponentContent('agent_role', 'a');
      engine.setComponentContent('task_instructions', 'b');
      engine.setComponentContent('output_format', 'c');
      engine.setComponentContent('project_state', 'd');
      engine.setComponentContent('skills', 'e');
      engine.setComponentContent('constraints', 'f');
      engine.setComponentContent('memory_context', 'g');
      const assembly = await engine.assemble({
        task_description:
          'A long user message that makes the system ratio less than 40 percent of total content. '.repeat(5),
      });
      const errors = await engine.validate(assembly);
      expect(errors).toEqual([]);
    });

    it('flags missing required components', async () => {
      const assembly: PromptAssembly = {
        system_prompt: 'Hello',
        messages: [
          { role: 'system', content: 'Hello' },
          { role: 'user', content: '' },
        ],
        token_count: 5,
        budget: 4096,
        within_budget: true,
        warnings: [],
      };
      const errors = await engine.validate(assembly);
      expect(errors.length).toBeGreaterThan(0);
    });

    it('flags system prompt ratio exceeding 40%', async () => {
      const assembly: PromptAssembly = {
        system_prompt: 'x'.repeat(500),
        messages: [
          { role: 'system', content: 'x'.repeat(500) },
          { role: 'user', content: 'short' },
        ],
        token_count: 505,
        budget: 4096,
        within_budget: true,
        warnings: [],
      };
      engine.setComponentContent('agent_role', 'x'.repeat(500));
      const errors = await engine.validate(assembly);
      expect(errors).toContain('System prompt exceeds 40% of total message content');
    });

    it('flags assembly exceeding budget', async () => {
      const assembly: PromptAssembly = {
        system_prompt: 'test',
        messages: [{ role: 'system', content: 'test' }],
        token_count: 100,
        budget: 50,
        within_budget: false,
        warnings: [],
      };
      const errors = await engine.validate(assembly);
      expect(errors).toContain('Prompt exceeds token budget');
    });
  });
});
