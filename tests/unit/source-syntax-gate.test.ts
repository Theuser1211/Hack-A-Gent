import { describe, expect, it } from 'vitest';
import * as ts from 'typescript';

import { assertSourceSyntax, getSourceSyntaxErrors, isSourcePath, scriptKindFor } from '../../benchmarks/source-syntax-gate.js';

describe('source syntax gate', () => {
  it('classifies source paths only', () => {
    expect(isSourcePath('src/app/layout.tsx')).toBe(true);
    expect(isSourcePath('src/lib/db.ts')).toBe(true);
    expect(isSourcePath('scripts/build.mjs')).toBe(true);
    expect(isSourcePath('package.json')).toBe(false);
    expect(isSourcePath('README.md')).toBe(false);
    expect(isSourcePath('src/app/globals.css')).toBe(false);
  });

  it('maps extensions to script kinds', () => {
    expect(scriptKindFor('a.tsx')).toBe(ts.ScriptKind.TSX);
    expect(scriptKindFor('a.jsx')).toBe(ts.ScriptKind.JSX);
    expect(scriptKindFor('a.ts')).toBe(ts.ScriptKind.TS);
    expect(scriptKindFor('a.mjs')).toBe(ts.ScriptKind.JS);
    expect(scriptKindFor('a.cjs')).toBe(ts.ScriptKind.JS);
  });

  it('accepts valid TS/TSX including files that contain imports', () => {
    // Regression: the previous createProgram-based gates answered
    // fileExists/readFile with this same content, so module resolution of the
    // import recursed forever and threw "Maximum call stack size exceeded".
    const layout = [
      "import './globals.css';",
      "import { NavBar } from '@/components/navbar';",
      '',
      'export default function RootLayout({ children }: { children: React.ReactNode }) {',
      '  return (',
      '    <html lang="en">',
      '      <body>',
      '        <NavBar />',
      '        {children}',
      '      </body>',
      '    </html>',
      '  );',
      '}',
    ].join('\n');

    expect(() => getSourceSyntaxErrors('src/app/layout.tsx', layout)).not.toThrow();
    expect(getSourceSyntaxErrors('src/app/layout.tsx', layout)).toEqual([]);
    expect(() => assertSourceSyntax('src/app/layout.tsx', layout)).not.toThrow();
  });

  it('accepts a route module with imports and typed params', () => {
    const route = [
      "import { NextResponse } from 'next/server';",
      "import { db } from '@/lib/db';",
      '',
      'export async function POST(req: Request) {',
      '  const body = await req.json();',
      '  const row = db.prepare("select 1").get();',
      '  return NextResponse.json({ body, row });',
      '}',
    ].join('\n');

    expect(getSourceSyntaxErrors('src/app/api/feedback/route.ts', route)).toEqual([]);
  });

  it('rejects malformed TSX with a readable message', () => {
    const errors = getSourceSyntaxErrors('src/components/Broken.tsx', 'export const Broken = () => <div>Unclosed');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.join(' ')).toMatch(/expected|unclosed|<\//i);
  });

  it('rejects a missing closing brace', () => {
    const errors = getSourceSyntaxErrors('src/components/Stepper.tsx', 'export const A = () => {');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects unterminated string in object literal', () => {
    const errors = getSourceSyntaxErrors(
      'src/app/layout.tsx',
      "export const metadata = { title: 'slug'Quarry' }",
    );
    expect(errors.length).toBeGreaterThan(0);
  });

  it('throws with the file path when content is malformed', () => {
    expect(() => assertSourceSyntax('src/components/Bad.tsx', 'export const A = () => {')).toThrow(
      /src\/components\/Bad\.tsx/,
    );
  });

  it('never reports an internal harness error as a syntax error', () => {
    // The old gates surfaced "host.getDefaultLibFileName is not a function"
    // and "Maximum call stack size exceeded" as gate failures.
    const errors = getSourceSyntaxErrors('src/app/page.tsx', 'export const Page = () => null;');
    expect(errors).toEqual([]);
    for (const message of errors) {
      expect(message).not.toMatch(/getDefaultLibFileName|Maximum call stack|host\./i);
    }
  });
});
