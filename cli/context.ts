import { existsSync, mkdirSync } from 'node:fs';
import * as path from 'node:path';

import { initializeGlobalRNG } from '../benchmarks/determinism-kernel.js';
import { OrganizationalMemoryBank } from '../benchmarks/organizational-memory-bank.js';

import type { CLIContext } from './types.js';

const DEFAULT_SEED = 42;

export function createContext(seed?: number): CLIContext {
  const resolvedSeed = seed ?? DEFAULT_SEED;
  initializeGlobalRNG(resolvedSeed);

  const workspaceRoot = process.cwd();
  const stateDir = path.resolve(workspaceRoot, '.hackagent', 'state');
  const dataDir = path.resolve(workspaceRoot, '.hackagent', 'data');
  for (const dir of [stateDir, dataDir]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  return {
    seed: resolvedSeed,
    workspaceRoot,
    stateDir,
    dataDir,
    config: {},
    orchestrator: null,
    phase12orchestrator: null,
    memory: new OrganizationalMemoryBank(resolvedSeed + 1000),
    startTime: Date.now(),
    outputFormat: 'pretty',
    verbose: false,
    dryRun: false,
    decisionLog: [],
  };
}

export function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}.${String(ms % 1000).padStart(3, '0')}s`;
}

export function prettyPrint(obj: Record<string, unknown>, indent = ''): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      lines.push(`${indent}${key}: [${value.length} items]`);
      for (const item of value.slice(0, 5)) {
        if (typeof item === 'object' && item !== null) {
          lines.push(prettyPrint(item as Record<string, unknown>, indent + '  '));
        } else {
          lines.push(`${indent}  - ${String(item).slice(0, 80)}`);
        }
      }
      if (value.length > 5) lines.push(`${indent}  ... and ${value.length - 5} more`);
    } else if (typeof value === 'object' && value !== null) {
      lines.push(`${indent}${key}:`);
      lines.push(prettyPrint(value as Record<string, unknown>, indent + '  '));
    } else {
      lines.push(`${indent}${key}: ${String(value).slice(0, 120)}`);
    }
  }
  return lines.join('\n');
}
