import { describe, expect, it } from 'vitest';

import { TEMPLATE_LIB_DB } from '../../benchmarks/orchestrator-shared-templates.js';

/**
 * A backslash inside a template literal is consumed by the template itself, so
 * `\s` in a template emits a bare `s`. For a regex that is not a cosmetic
 * slip: the canonical `prepare()` matcher turned into `/^s*selects+*s+froms+/`,
 * which is `error TS1507: There is nothing available for repetition` in every
 * generated project. These tests pin the emitted text so the class of bug
 * cannot come back unnoticed.
 */
describe('emitted code templates keep their regex escapes', () => {
  it('TEMPLATE_LIB_DB emits a SQL matcher that is a valid regex', () => {
    const line = TEMPLATE_LIB_DB.split('\n').find((l) => l.includes('select'));

    expect(line).toBeDefined();
    expect(line).toContain('\\s');
    expect(line).toContain('\\*');
  });

  it('the emitted SQL matcher compiles and matches real statements', () => {
    const line = TEMPLATE_LIB_DB.split('\n').find((l) => l.includes('select'))!;
    const literal = line
      .trim()
      .replace(/^const match = /, '')
      .replace(/\.exec\(sql\);?$/, '');

    // `new Function` surfaces the same SyntaxError a generated project would
    // hit at build time, without needing a TypeScript compile per assertion.
    const matcher = new Function(`return ${literal}`)() as RegExp;

    expect(matcher.exec('select * from users')?.[1]).toBe('users');
    expect(matcher.exec('SELECT   *   FROM   workItems ;')?.[1]).toBe('workItems');
    expect(matcher.exec('   select * from UserPrefs  ')?.[1]).toBe('UserPrefs');
  });

  it('does not reject valid SQL that differs only in whitespace', () => {
    const line = TEMPLATE_LIB_DB.split('\n').find((l) => l.includes('select'))!;
    const literal = line.trim().replace(/^const match = /, '').replace(/\.exec\(sql\);?$/, '');
    const matcher = new Function(`return ${literal}`)() as RegExp;

    // A matcher built from the mangled `s` only ever matched the literal
    // letter "s", so spacing variants were silently rejected.
    expect(matcher.exec('select * from users')).not.toBeNull();
    expect(matcher.exec('select  *  from  users')).not.toBeNull();
  });
});
