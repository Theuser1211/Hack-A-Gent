import { describe, it, expect, beforeEach } from 'vitest';

import { ContextEngine } from '../../kernel/context/context-engine.js';
import type { ContextItem, ContextOptions } from '../../kernel/context/context-types.js';

describe('ContextEngine', () => {
  let engine: ContextEngine;

  beforeEach(() => {
    engine = new ContextEngine();
  });

  function makeItem(overrides: Partial<ContextItem> & { id: string }): ContextItem {
    return {
      source: 'memory',
      content: 'Some content for testing context engine functionality',
      relevance_score: 0,
      token_count: 0,
      timestamp: new Date().toISOString(),
      metadata: {},
      ...overrides,
    };
  }

  describe('item management', () => {
    it('adds a single item', () => {
      engine.addItem(makeItem({ id: 'item-1' }));
      expect(engine.getAll()).toHaveLength(1);
    });

    it('adds multiple items', () => {
      engine.addItems([makeItem({ id: 'item-1' }), makeItem({ id: 'item-2' })]);
      expect(engine.getAll()).toHaveLength(2);
    });

    it('clears all items', () => {
      engine.addItem(makeItem({ id: 'item-1' }));
      engine.clear();
      expect(engine.getAll()).toHaveLength(0);
    });

    it('getAll returns a copy', () => {
      engine.addItem(makeItem({ id: 'item-1' }));
      const all = engine.getAll();
      all.push(makeItem({ id: 'item-2' }));
      expect(engine.getAll()).toHaveLength(1);
    });
  });

  describe('relevance scoring', () => {
    it('scores direct reference match highest', () => {
      const score = engine.scoreRelevance(
        makeItem({ id: 'auth-module', content: 'Handles user authentication' }),
        'Implement auth-module',
      );
      expect(score).toBeGreaterThanOrEqual(40);
    });

    it('scores keyword overlap', () => {
      const score = engine.scoreRelevance(
        makeItem({ id: 'item-1', content: 'database connection pooling' }),
        'database performance tuning',
      );
      expect(score).toBeGreaterThan(0);
    });

    it('scores low for unrelated content (baseline from recency + type)', () => {
      const score = engine.scoreRelevance(makeItem({ id: 'item-1', content: 'zzz' }), 'something completely different');
      // Baseline: recency ~15 + type affinity~5 = ~20
      expect(score).toBeGreaterThanOrEqual(15);
      expect(score).toBeLessThan(30);
    });

    it('scores type affinity for file sources', () => {
      const score = engine.scoreRelevance(
        makeItem({ id: 'item-1', source: 'file', content: 'code content' }),
        'file system operations',
      );
      expect(score).toBeGreaterThanOrEqual(15);
    });

    it('handles missing timestamp', () => {
      const score = engine.scoreRelevance({ ...makeItem({ id: 'item-1' }), timestamp: undefined }, 'test');
      expect(score).toBeGreaterThanOrEqual(5);
    });
  });

  describe('ranking', () => {
    it('sorts items by relevance descending', () => {
      engine.addItem(makeItem({ id: 'low-match', content: 'unrelated content here' }));
      engine.addItem(makeItem({ id: 'high-match', content: 'database connection' }));
      const ranked = engine.rank('database');
      expect(ranked[0]!.id).toBe('high-match');
    });
  });

  describe('compression', () => {
    it('drops low relevance items when over budget', () => {
      const items = [
        makeItem({ id: 'keep', content: 'A'.repeat(100), relevance_score: 80 }),
        makeItem({ id: 'drop', content: 'B'.repeat(50), relevance_score: 5 }),
      ];
      const result = engine.compress(items, 80);
      expect(result.items.find((i) => i.id === 'drop')).toBeUndefined();
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('summarizes medium relevance items', () => {
      const longContent = Array.from(
        { length: 30 },
        (_, i) => `Line ${i + 1}: This is a line of text for summarization testing purposes.`,
      ).join('\n');
      const originalLength = longContent.length;
      const items = [makeItem({ id: 'summarize', content: longContent, relevance_score: 30 })];
      const result = engine.compress(items, 10);
      expect(result.items[0]!.content.length).toBeLessThan(originalLength);
    });

    it('truncates oldest items when still over budget', () => {
      const items = [
        makeItem({ id: 'old', content: 'X'.repeat(1000), relevance_score: 60, timestamp: '2024-01-01T00:00:00Z' }),
      ];
      const result = engine.compress(items, 100);
      expect(result.items[0]!.content).toContain('[truncated]');
    });

    it('handles empty items array', () => {
      const result = engine.compress([], 100);
      expect(result.items).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });
  });

  describe('assemble', () => {
    it('produces a context package with items', () => {
      engine.addItem(makeItem({ id: 'item-1', content: 'relevant content about database' }));
      const options: ContextOptions = { taskType: 'coding', modelContextWindow: 4000 };
      const pkg = engine.assemble('database query optimization', options);
      expect(pkg.items.length).toBeGreaterThan(0);
      expect(pkg.budget).toBeGreaterThan(0);
    });

    it('uses coding-specific budget ratios', () => {
      engine.addItem(makeItem({ id: 'item-1', content: 'test' }));
      const pkg = engine.assemble('test', { taskType: 'coding', modelContextWindow: 4000 });
      expect(pkg.sufficient).toBe(true);
    });

    it('uses planning-specific budget ratios', () => {
      engine.addItem(makeItem({ id: 'item-1', content: 'test' }));
      const pkg = engine.assemble('test', { taskType: 'planning', modelContextWindow: 4000 });
      expect(pkg).toBeDefined();
    });

    it('handles unknown task type with defaults', () => {
      engine.addItem(makeItem({ id: 'item-1', content: 'test' }));
      const pkg = engine.assemble('test', { taskType: 'unknown', modelContextWindow: 4000 });
      expect(pkg).toBeDefined();
    });
  });
});
