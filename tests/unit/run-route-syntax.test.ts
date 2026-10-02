import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { getSourceSyntaxErrors } from '../../benchmarks/source-syntax-gate.js';

describe('run/route synthesis must not emit malformed .reduce', () => {
  it('generated ai/run/route.ts has valid .map/.reduce syntax', () => {
    const p = path.join(__dirname, '../../agents-for-humans-hackathon/src/app/api/ai/run/route.ts');
    const src = fs.readFileSync(p, 'utf8');
    // The known corruption was an unclosed .reduce inside a .map arrow. The
    // invariant is that the synthesized route still parses as valid source;
    // a specific call shape (.map) is not part of the contract, because a
    // regeneration may legitimately restructure the same handler.
    expect(src).toContain('export async function POST');
    expect(getSourceSyntaxErrors(p, src)).toEqual([]);
  });
});
