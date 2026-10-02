import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { log } from '../output.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

function readVersion(): string {
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [
    '../../../package.json',
    '../../package.json',
  ];
  for (const rel of candidates) {
    try {
      const pkgPath = resolve(moduleDir, rel);
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) return pkg.version;
    } catch { /* try next */ }
  }
  return '0.1.0';
}

export async function versionCommand(_ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
  const version = readVersion();
  log(`Hack-A-Gent v${version}`);
  return { success: true, message: `v${version}`, data: { version } };
}
