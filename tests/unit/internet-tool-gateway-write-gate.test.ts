import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tmpdir } from 'node:os';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';

import { InternetToolGateway } from '../../benchmarks/internet-tool-gateway.js';

describe('InternetToolGateway.writeProjectFiles syntax gate', () => {
  let tempDir: string;
  let gateway: InternetToolGateway;

  beforeEach(() => {
    tempDir = mkdtempSync(resolve(tmpdir(), 'hag-gateway-write-test-'));
    gateway = new InternetToolGateway({ workingDir: tempDir }, 42);
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  it('writes a full scaffold, including files that import other modules', async () => {
    const files = [
      { path: 'package.json', content: '{ "name": "demo" }' },
      {
        path: 'src/app/layout.tsx',
        content: [
          "import './globals.css';",
          "import { NavBar } from '@/components/navbar';",
          '',
          'export default function RootLayout({ children }: { children: React.ReactNode }) {',
          '  return <html lang="en"><body><NavBar />{children}</body></html>;',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/app/api/feedback/route.ts',
        content: [
          "import { NextResponse } from 'next/server';",
          "import { db } from '@/lib/db';",
          '',
          'export async function POST(req: Request) {',
          '  const body = await req.json();',
          '  return NextResponse.json({ ok: true, body, row: db.prepare("select 1").get() });',
          '}',
        ].join('\n'),
      },
      {
        path: 'src/components/navbar.tsx',
        content: "import Link from 'next/link';\nexport const NavBar = () => <nav><Link href='/'>Home</Link></nav>;",
      },
    ];

    // Regression: a host with fileExists: () => true + readFile: () => content
    // threw "Maximum call stack size exceeded" for every importing file, so
    // nothing was ever written.
    await expect(gateway.writeProjectFiles('demo-project', files)).resolves.toBe(true);

    expect(existsSync(resolve(tempDir, 'demo-project/package.json'))).toBe(true);
    expect(readFileSync(resolve(tempDir, 'demo-project/src/app/layout.tsx'), 'utf-8')).toContain('NavBar');
    expect(readFileSync(resolve(tempDir, 'demo-project/src/app/api/feedback/route.ts'), 'utf-8')).toContain('NextResponse');
  });

  it('rejects malformed source and names the offending file', async () => {
    await expect(
      gateway.writeProjectFiles('demo-project', [
        { path: 'src/components/Broken.tsx', content: 'export const Broken = () => <div>Unclosed' },
      ]),
    ).rejects.toThrow(/src\/components\/Broken\.tsx/);

    expect(existsSync(resolve(tempDir, 'demo-project/src/components/Broken.tsx'))).toBe(false);
  });

  it('still accepts non-source files that are not valid TypeScript', async () => {
    await expect(
      gateway.writeProjectFiles('demo-project', [{ path: 'README.md', content: '# Hello\n\n<not-typescript>' }]),
    ).resolves.toBe(true);
    expect(existsSync(resolve(tempDir, 'demo-project/README.md'))).toBe(true);
  });
});
