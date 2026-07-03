import { describe, it, expect } from 'vitest';

import { SkillMetadataSchema, ResolvedSkillSchema, ConflictReportSchema } from '../../kernel/skills/skill-types.js';

describe('SkillMetadataSchema', () => {
  it('validates a skill', () => {
    const s = SkillMetadataSchema.parse({
      skill_id: 'react',
      name: 'React',
      type: 'framework',
      technology: 'TypeScript',
      version: '2.0.0',
    });
    expect(s.description).toBe('');
    expect(s.version).toBe('2.0.0');
  });

  it('rejects invalid type', () => {
    expect(() =>
      SkillMetadataSchema.parse({
        skill_id: 'x',
        name: 'X',
        type: 'invalid',
        technology: 'T',
      }),
    ).toThrow();
  });
});

describe('ResolvedSkillSchema', () => {
  it('validates a resolved skill', () => {
    const r = ResolvedSkillSchema.parse({
      metadata: { skill_id: 'r', name: 'React', type: 'framework', technology: 'TS', version: '1.0.0' },
    });
    expect(r.content).toBe('');
    expect(r.resolution_path).toEqual([]);
  });
});

describe('ConflictReportSchema', () => {
  it('validates a conflict report', () => {
    const r = ConflictReportSchema.parse({});
    expect(r.has_conflicts).toBe(false);
    expect(r.conflicts).toEqual([]);
  });
});
