import { describe, it, expect } from 'vitest';

import { ContextItemSchema, ContextPackageSchema } from '../../kernel/context/context-types.js';

describe('ContextItemSchema', () => {
  it('validates a complete context item', () => {
    const item = ContextItemSchema.parse({
      id: 'item-1',
      source: 'memory',
      content: 'test content',
    });
    expect(item.id).toBe('item-1');
    expect(item.relevance_score).toBe(0);
    expect(item.metadata).toEqual({});
  });

  it('rejects invalid source', () => {
    expect(() => ContextItemSchema.parse({ id: 'x', source: 'invalid', content: 'test' })).toThrow();
  });
});

describe('ContextPackageSchema', () => {
  it('validates with defaults', () => {
    const pkg = ContextPackageSchema.parse({});
    expect(pkg.items).toEqual([]);
    expect(pkg.sufficient).toBe(false);
  });

  it('validates with items', () => {
    const pkg = ContextPackageSchema.parse({
      items: [{ id: 'a', source: 'file', content: 'hello' }],
      total_tokens: 5,
      budget: 100,
      sufficient: true,
    });
    expect(pkg.items).toHaveLength(1);
  });
});
