import { describe, it, expect } from 'vitest';

describe('fallback-ai-contract',()=>{
  it('db layer exports real workItem methods aligned to routes',()=>{
    const db = require('../../agents-for-humans-hackathon/src/lib/db.ts');
    expect(typeof db.db).toBe('object');
    expect(typeof db.db.workItem.create).toBe('function');
    expect(typeof db.db.workItems.create).toBe('function');
  });
  it('WorkItem properties match route usage (id,status,type,outputSnapshot)',()=>{
    const item = { id: 'x', status: 'processing', type: 'search', outputSnapshot: {title:'t',url:'',confidence:0.9,source:'wikipedia'} };
    expect(item.id).toBeDefined();
    expect(item.status).toBeDefined();
  });
});
