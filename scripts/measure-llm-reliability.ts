#!/usr/bin/env node
/**
 * LLM Reliability Measurement Harness
 *
 * Drives the real InternetHackathonOrchestrator through its 5-phase LLM code
 * generation repeatedly and reports the per-phase LLM success rate.
 *
 * Usage:
 *   npx tsx scripts/measure-llm-reliability.ts [--runs <n>] [--seed <n>] [--json]
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { InternetHackathonOrchestrator } from '../benchmarks/internet-hackathon-orchestrator.js';
import { initializeProviders } from '../cli/provider-init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(WORKSPACE_ROOT, '.hackagent-state', 'measure');

const PHASE_NAMES = ['Types/Config', 'API Routes', 'Frontend', 'README', 'CI/CD'];

interface PhaseStats {
  success: number;
  total: number;
  totalFiles: number;
}

function parseArgs(): { runs: number; seed: number; json: boolean } {
  const args = process.argv.slice(2);
  let runs = 5;
  let seed = 42;
  let json = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--runs' || arg === '-r') runs = parseInt(args[++i] ?? '5', 10);
    else if (arg === '--seed' || arg === '-s') seed = parseInt(args[++i] ?? '42', 10);
    else if (arg === '--json' || arg === '-j') json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`
LLM Reliability Measurement Harness

Usage:
  npx tsx scripts/measure-llm-reliability.ts [options]

Options:
  -r, --runs <n>      Number of runs (default: 5)
  -s, --seed <n>      Deterministic seed (default: 42)
  -j, --json          Output JSON
  -h, --help          Show this help

Output: per-phase LLM success rate table (or JSON).
`);
      process.exit(0);
    }
  }
  return { runs, seed, json };
}

const TEST_DEVPOST_DATA = {
  title: 'Reliability Test',
  problemStatement: 'Build a web app that helps hackathon teams track their submission progress.',
  judgingCriteria: ['Innovation', 'Technical Complexity', 'UX'],
  constraints: ['Must use Next.js', 'Must use React', 'Must use TypeScript', 'Must use Tailwind CSS'],
  recommendedStack: ['Next.js', 'React', 'TypeScript', 'Tailwind CSS'],
  submissionRequirements: ['Provide a working demo', 'Include setup instructions'],
  rawText: 'Reliability Test competition',
};

const TEST_CONTEXT = {
  projectName: 'measure-test',
  description: 'Test project for LLM reliability measurement',
  techStack: ['nextjs', 'react', 'typescript', 'tailwind'],
  judgingCriteria: ['Innovation', 'Technical Complexity', 'UX'],
  constraints: ['Must use Next.js', 'Must use React', 'Must use TypeScript', 'Must use Tailwind CSS'],
};

async function runOneGeneration(routerEngine: unknown, seed: number): Promise<Map<number, { path: string; content: string }[]>> {
  const orch = new InternetHackathonOrchestrator(WORKSPACE_ROOT, STATE_DIR, seed, routerEngine as never);
  orch.setDevpostData(TEST_DEVPOST_DATA);

  // Intentionally leave plan = null so writeAndVerifyPhase / typecheck are
  // skipped (they guard on projectDir) — this measures PURE LLM generation.
  await (orch as unknown as { generateFilesWithLLMPhased(c: typeof TEST_CONTEXT): Promise<unknown> }).generateFilesWithLLMPhased(TEST_CONTEXT);

  return (orch as unknown as { generatedFilesByPhase: Map<number, { path: string; content: string }[]> }).generatedFilesByPhase;
}

async function main(): Promise<void> {
  const { runs, seed, json } = parseArgs();

  process.stderr.write('[measure] Initializing providers...\n');
  let router: unknown;
  try {
    const result = await initializeProviders();
    router = result.router;
    process.stderr.write('[measure] Providers initialized\n');
  } catch (err) {
    process.stderr.write(`[measure] Provider init failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  }

  const stats: PhaseStats[] = PHASE_NAMES.map(() => ({ success: 0, total: 0, totalFiles: 0 }));
  const perRun = new Array<number[]>(runs);

  for (let runIdx = 0; runIdx < runs; runIdx++) {
    process.stderr.write(`\n[measure] === Run ${runIdx + 1}/${runs} ===\n`);
    const phaseFiles = new Array<number>(5).fill(0);
    // Each run mirrors a fresh `hag run`: reset run-scoped router state so a
    // failure in one run never carries into the next.
    (router as { resetBlacklist?: () => void }).resetBlacklist?.();
    try {
      const map = await runOneGeneration(router, seed + runIdx);
      for (let p = 1; p <= 5; p++) {
        const files = map.get(p) ?? [];
        const slot = stats[p - 1]!;
        slot.total++;
        slot.totalFiles += files.length;
        if (files.length > 0) slot.success++;
        phaseFiles[p - 1] = files.length;
      }
      process.stderr.write(`[measure] Run ${runIdx + 1} done: ${phaseFiles.join(',')} files per phase\n`);
    } catch (err) {
      process.stderr.write(`[measure] Run ${runIdx + 1} FAILED: ${err instanceof Error ? err.message : String(err)}\n`);
      for (const s of stats) s.total++;
    }
    perRun[runIdx] = phaseFiles;
  }

  if (json) {
    const output = {
      runs,
      seed,
      perRun,
      phases: PHASE_NAMES.map((name, i) => {
        const s = stats[i]!;
        return {
          phase: i + 1,
          name,
          successRate: s.total > 0 ? s.success / s.total : 0,
          successes: s.success,
          total: s.total,
          avgFiles: s.total > 0 ? s.totalFiles / s.total : 0,
        };
      }),
    };
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log('\n=== LLM Reliability Measurement ===');
    console.log(`Runs: ${runs} | Seed: ${seed}`);
    console.log('');
    console.log('Phase | Name          | Success Rate | Successes | Total | Avg Files');
    console.log('------|---------------|--------------|-----------|-------|----------');
    for (let p = 1; p <= 5; p++) {
      const s = stats[p - 1]!;
      const name = PHASE_NAMES[p - 1]!;
      const rate = s.total > 0 ? ((s.success / s.total) * 100).toFixed(1) : 'N/A';
      const avgFiles = s.total > 0 ? (s.totalFiles / s.total).toFixed(1) : 'N/A';
      console.log(
        `${String(p).padStart(4)} | ${name.padEnd(13)} | ${String(rate).padStart(11)}% | ${String(s.success).padStart(9)} | ${String(s.total).padStart(5)} | ${avgFiles}`,
      );
    }
    console.log('');
    const overallSuccess = stats.reduce((sum, s) => sum + s.success, 0);
    const overallTotal = stats.reduce((sum, s) => sum + s.total, 0);
    console.log(
      `Overall: ${overallSuccess}/${overallTotal} = ${overallTotal > 0 ? ((overallSuccess / overallTotal) * 100).toFixed(1) : 'N/A'}%`,
    );
  }

  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`[measure] FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
