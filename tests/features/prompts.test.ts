import { describe, it, expect } from 'vitest';
import {
  PromptEngine,
  ALL_TEMPLATES,
  TEMPLATE_REGISTRY,
  getTemplate,
  renderTemplate,
  renderMessages,
  wantsJsonMode,
  META_SYSTEM,
} from '../../kernel/prompts/index.js';

describe('prompt template library', () => {
  it('registers all 9 canonical templates', () => {
    expect(ALL_TEMPLATES.length).toBe(9);
    const ids = ALL_TEMPLATES.map((t) => t.id).sort();
    expect(ids).toEqual(
      [
        'architect.v1',
        'backend-builder.v1',
        'database-builder.v1',
        'frontend-builder.v1',
        'judge.v1',
        'planner.v1',
        'repair.v1',
        'reporting.v1',
        'validation.v1',
      ].sort(),
    );
  });

  it('every JSON template declares required fields', () => {
    for (const t of ALL_TEMPLATES) {
      if (t.outputContract.format === 'json') {
        expect(t.outputContract.requiredFields.length).toBeGreaterThan(0);
        expect(t.outputContract.jsonMode).toBe(true);
      }
    }
  });

  it('renderTemplate is deterministic for a given seed', () => {
    const t = getTemplate('planner.v1')!;
    const a = renderTemplate(t, { seed: 7, task: 'Build X' });
    const b = renderTemplate(t, { seed: 7, task: 'Build X' });
    expect(a).toBe(b);
  });

  it('renderTemplate changes with seed (deterministic id, not random)', () => {
    const t = getTemplate('judge.v1')!;
    const a = renderTemplate(t, { seed: 1 });
    const b = renderTemplate(t, { seed: 2 });
    // Same body content; only the deterministic trace id differs.
    expect(a.split('trace=')[0]).toBe(b.split('trace=')[0]);
    expect(a).not.toBe(b);
  });

  it('renderTemplate injects meta-system, reasoning, constraints, anti-hallucination', () => {
    const t = getTemplate('architect.v1')!;
    const out = renderTemplate(t, { seed: 3 });
    expect(out).toContain(META_SYSTEM.slice(0, 20));
    expect(out).toContain('Reasoning steps');
    expect(out).toContain('Constraints');
    expect(out).toContain('Anti-hallucination');
    expect(out).toContain('Determinism');
  });

  it('renderMessages returns system + user roles', () => {
    const t = getTemplate('frontend-builder.v1')!;
    const msgs = renderMessages(t, { seed: 5, task: 'make a button' });
    expect(msgs[0]!.role).toBe('system');
    expect(msgs[1]!.role).toBe('user');
    expect(msgs[1]!.content).toContain('make a button');
  });

  it('wantsJsonMode reflects template contract', () => {
    expect(wantsJsonMode(getTemplate('planner.v1')!)).toBe(true);
    expect(wantsJsonMode(getTemplate('repair.v1')!)).toBe(false);
  });

  it('PromptEngine can register + assemble a template deterministically', async () => {
    const engine = new PromptEngine();
    engine.registerTemplate(getTemplate('planner.v1')!);
    const a = await engine.assembleFromTemplate('planner.v1', { seed: 9, task: 'idea' });
    const b = await engine.assembleFromTemplate('planner.v1', { seed: 9, task: 'idea' });
    expect(a.system_prompt).toBe(b.system_prompt);
    expect(a.jsonMode).toBe(true);
    expect(a.token_count).toBeGreaterThan(0);
    expect(engine.listTemplates()).toContain('planner.v1');
  });

  it('assembleFromTemplate throws on unknown template', async () => {
    const engine = new PromptEngine();
    await expect(engine.assembleFromTemplate('nope.v9', {})).rejects.toThrow();
  });

  it('TEMPLATE_REGISTRY is keyed by id', () => {
    expect(TEMPLATE_REGISTRY['planner.v1']!.title).toContain('Planner');
    expect(getTemplate('reporting.v1')!.tags).toContain('strategy');
  });
});
