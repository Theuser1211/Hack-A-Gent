import { describe, it, expect, beforeEach } from 'vitest';

import { SkillEngine } from '../../kernel/skills/skill-engine.js';
import type { SkillMetadata } from '../../kernel/skills/skill-types.js';

function makeSkill(
  overrides: Partial<SkillMetadata> & {
    skill_id: string;
    name: string;
    type: 'framework' | 'database' | 'tool' | 'library' | 'pattern' | 'platform';
    technology: string;
  },
): SkillMetadata {
  return {
    description: '',
    dependencies: [],
    conflicts_with: [],
    keywords: [],
    estimated_tokens: 1000,
    version: '1.0.0',
    ...overrides,
  };
}

describe('SkillEngine', () => {
  let engine: SkillEngine;

  beforeEach(() => {
    engine = new SkillEngine();
  });

  describe('registration', () => {
    it('registers a single skill', () => {
      engine.register(makeSkill({ skill_id: 'react', name: 'React', type: 'framework', technology: 'TypeScript' }));
      expect(engine.get('react')).toBeDefined();
      expect(engine.get('react')!.name).toBe('React');
    });

    it('registers multiple skills', () => {
      engine.registerMany([
        makeSkill({ skill_id: 'react', name: 'React', type: 'framework', technology: 'TypeScript' }),
        makeSkill({ skill_id: 'fastapi', name: 'FastAPI', type: 'framework', technology: 'Python' }),
      ]);
      expect(engine.getAll()).toHaveLength(2);
    });

    it('returns undefined for unknown skill', () => {
      expect(engine.get('unknown')).toBeUndefined();
    });

    it('getAll returns all registered skills', () => {
      engine.register(makeSkill({ skill_id: 'a', name: 'A', type: 'tool', technology: 'Node.js' }));
      engine.register(makeSkill({ skill_id: 'b', name: 'B', type: 'library', technology: 'Python' }));
      expect(engine.getAll()).toHaveLength(2);
    });
  });

  describe('index-based lookup', () => {
    beforeEach(() => {
      engine.registerMany([
        makeSkill({
          skill_id: 'react',
          name: 'React',
          type: 'framework',
          technology: 'TypeScript',
          keywords: ['ui', 'components'],
        }),
        makeSkill({
          skill_id: 'fastapi',
          name: 'FastAPI',
          type: 'framework',
          technology: 'Python',
          keywords: ['api', 'rest'],
        }),
        makeSkill({
          skill_id: 'postgres',
          name: 'PostgreSQL',
          type: 'database',
          technology: 'SQL',
          keywords: ['sql', 'relational'],
        }),
      ]);
    });

    it('finds by technology', () => {
      const results = engine.findByTechnology('TypeScript');
      expect(results).toHaveLength(1);
      expect(results[0]!.skill_id).toBe('react');
    });

    it('finds by keyword', () => {
      const results = engine.findByKeyword('ui');
      expect(results).toHaveLength(1);
      expect(results[0]!.skill_id).toBe('react');
    });

    it('finds by type', () => {
      const results = engine.findByType('database');
      expect(results).toHaveLength(1);
      expect(results[0]!.skill_id).toBe('postgres');
    });

    it('returns empty for non-matching technology', () => {
      expect(engine.findByTechnology('Rust')).toHaveLength(0);
    });
  });

  describe('keyword discovery', () => {
    beforeEach(() => {
      engine.registerMany([
        makeSkill({
          skill_id: 'react',
          name: 'React',
          type: 'framework',
          technology: 'TypeScript',
          keywords: ['ui', 'frontend', 'components'],
        }),
        makeSkill({
          skill_id: 'express',
          name: 'Express',
          type: 'framework',
          technology: 'Node.js',
          keywords: ['api', 'backend', 'server'],
        }),
        makeSkill({
          skill_id: 'docker',
          name: 'Docker',
          type: 'tool',
          technology: 'DevOps',
          keywords: ['container', 'deployment'],
        }),
      ]);
    });

    it('discovers skills by technology match', () => {
      const results = engine.discover('TypeScript');
      expect(results).toHaveLength(1);
    });

    it('discovers skills by keyword match', () => {
      const results = engine.discover('frontend');
      expect(results).toHaveLength(1);
      expect(results[0]!.skill_id).toBe('react');
    });

    it('discovers skills by type match', () => {
      const results = engine.discover('framework');
      expect(results).toHaveLength(2);
    });

    it('returns multiple matches for broad query', () => {
      const results = engine.discover('api');
      expect(results.length).toBeGreaterThanOrEqual(1);
    });

    it('returns empty for no matches', () => {
      expect(engine.discover('quantum')).toHaveLength(0);
    });
  });

  describe('dependency resolution', () => {
    it('resolves a simple dependency graph', () => {
      engine.registerMany([
        makeSkill({ skill_id: 'base', name: 'Base', type: 'library', technology: 'TypeScript', dependencies: [] }),
        makeSkill({
          skill_id: 'derived',
          name: 'Derived',
          type: 'library',
          technology: 'TypeScript',
          dependencies: ['base'],
        }),
      ]);
      const resolved = engine.resolve(['derived']);
      expect(resolved).toHaveLength(2);
      expect(resolved[0]!.metadata.skill_id).toBe('base');
      expect(resolved[1]!.metadata.skill_id).toBe('derived');
    });

    it('throws on circular dependencies', () => {
      engine.registerMany([
        makeSkill({ skill_id: 'a', name: 'A', type: 'library', technology: 'TypeScript', dependencies: ['b'] }),
        makeSkill({ skill_id: 'b', name: 'B', type: 'library', technology: 'TypeScript', dependencies: ['a'] }),
      ]);
      expect(() => engine.resolve(['a'])).toThrow('Circular dependency');
    });

    it('resolves empty skill list', () => {
      const resolved = engine.resolve([]);
      expect(resolved).toHaveLength(0);
    });

    it('resolves skills with no dependencies', () => {
      engine.register(makeSkill({ skill_id: 'standalone', name: 'Standalone', type: 'tool', technology: 'Any' }));
      const resolved = engine.resolve(['standalone']);
      expect(resolved).toHaveLength(1);
      expect(resolved[0]!.metadata.skill_id).toBe('standalone');
    });
  });

  describe('conflict detection', () => {
    it('detects no conflicts for non-conflicting skills', () => {
      engine.registerMany([
        makeSkill({ skill_id: 'a', name: 'A', type: 'library', technology: 'TypeScript' }),
        makeSkill({ skill_id: 'b', name: 'B', type: 'library', technology: 'Python' }),
      ]);
      const report = engine.detectConflicts(['a', 'b']);
      expect(report.has_conflicts).toBe(false);
      expect(report.conflicts).toHaveLength(0);
    });

    it('detects conflicts between skills', () => {
      engine.registerMany([
        makeSkill({
          skill_id: 'vue',
          name: 'Vue',
          type: 'framework',
          technology: 'TypeScript',
          conflicts_with: ['react'],
        }),
        makeSkill({
          skill_id: 'react',
          name: 'React',
          type: 'framework',
          technology: 'TypeScript',
          conflicts_with: ['vue'],
        }),
      ]);
      const report = engine.detectConflicts(['vue', 'react']);
      expect(report.has_conflicts).toBe(true);
      expect(report.conflicts.length).toBeGreaterThanOrEqual(2);
    });

    it('handles empty skill list', () => {
      const report = engine.detectConflicts([]);
      expect(report.has_conflicts).toBe(false);
    });
  });

  describe('getDependencyGraph', () => {
    it('returns empty graph for empty registry', () => {
      const graph = engine.getDependencyGraph();
      expect(graph.size).toBe(0);
    });

    it('returns graph with registered skills', () => {
      engine.registerMany([
        makeSkill({ skill_id: 'a', name: 'A', type: 'library', technology: 'TS', dependencies: ['b'] }),
        makeSkill({ skill_id: 'b', name: 'B', type: 'library', technology: 'TS' }),
      ]);
      const graph = engine.getDependencyGraph();
      expect(graph.has('a')).toBe(true);
      expect(graph.has('b')).toBe(true);
      expect(graph.get('a')).toEqual(['b']);
    });
  });
});
