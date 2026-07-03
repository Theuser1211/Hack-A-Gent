import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function versionCommand(_ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
  let version = '0.1.0';
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(__dirname, '../../package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    if (pkg.version) version = pkg.version;
  } catch {
    // fallback to default
  }

  console.log(`  Hack-A-Gent v${version}`);
  return { success: true, message: `v${version}`, data: { version } };
}
