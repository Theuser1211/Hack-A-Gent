#!/usr/bin/env node
/**
 * Copies the fixture project trees into dist/fixtures for the published package.
 * Excludes node_modules and dist so the distributed package stays lean and the
 * copied fixtures are always pristine source trees.
 */
import { cpSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const src = resolve('fixtures');
const dest = resolve('dist/fixtures');

const SKIP = new Set(['node_modules', 'dist', '.git']);

if (!existsSync(src)) {
  console.log('No fixtures directory found; skipping copy.');
  process.exit(0);
}

function walk(from, to) {
  for (const entry of readdirSync(from)) {
    if (SKIP.has(entry)) continue;
    const f = join(from, entry);
    const t = join(to, entry);
    if (statSync(f).isDirectory()) walk(f, t);
    else {
      cpSync(f, t, { recursive: true });
    }
  }
}

walk(src, dest);
console.log(`Copied fixtures → ${dest} (node_modules/dist excluded)`);
