import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

import { getSourceSyntaxErrors } from '../../benchmarks/source-syntax-gate.js';

describe('Production fallback page.tsx JSX validity', () => {
  it('produces syntactically valid JSX (no TS2657 JSX children must be wrapped)', () => {
    const file = resolve('agents-for-humans-hackathon/src/app/page.tsx');
    const content = readFileSync(file, 'utf8');

    // The gate that every write in the pipeline goes through, applied to the
    // fallback page itself.
    expect(getSourceSyntaxErrors(file, content)).toEqual([]);

    expect(content).toContain('<main');
    expect(content).toContain('</main>');
  });

  it('is the workflow page, not a marketing landing page', () => {
    const content = readFileSync(resolve('agents-for-humans-hackathon/src/app/page.tsx'), 'utf8');

    // It drives the challenge's own endpoint through step state.
    expect(content).toContain('/api/analyze');
    expect(content).toContain('useState');
    expect(content).toContain('setStep');
  });
});
