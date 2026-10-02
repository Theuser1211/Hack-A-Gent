import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

describe('syntax-gate parser',()=>{
  it('catches layout.tsx corruption that transpileModule missed',()=>{
    const content = "export const metadata = { title: 'slug'Quarry' }";
    const sf = ts.createSourceFile('layout.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const parseDiagnostics = (sf as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics || [];
    expect(parseDiagnostics.length).toBeGreaterThan(0);
  });
});
