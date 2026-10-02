#!/usr/bin/env node
/**
 * Enhanced reliability harness with failure categorization
 */

import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { InternetHackathonOrchestrator } from '../benchmarks/internet-hackathon-orchestrator.js';
import { initializeProviders } from '../cli/provider-init.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WORKSPACE_ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(WORKSPACE_ROOT, '.hackagent-state', 'measure');

const PHASE_NAMES = ['Types/Config', 'API Routes', 'Frontend', 'README', 'CI/CD'] as const;

function phaseNameFor(phase: number): string {
  return PHASE_NAMES[phase - 1] ?? `Phase-${phase}`;
}

interface FailureRecord {
  phase: number;
  phaseName: string;
  run: number;
  category: string;
  detail: string;
  rawPreview?: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let runs = 3;
  let seed = 42;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--runs' || args[i] === '-r') runs = parseInt(args[++i] ?? '3', 10);
    else if (args[i] === '--seed' || args[i] === '-s') seed = parseInt(args[++i] ?? '42', 10);
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

  const failures: FailureRecord[] = [];
  const successes: { phase: number; run: number; files: number }[] = [];

  for (let runIdx = 0; runIdx < runs; runIdx++) {
    process.stderr.write(`\n[measure] === Run ${runIdx + 1}/${runs} ===\n`);
    (router as { resetBlacklist?: () => void }).resetBlacklist?.();
    
    const orch = new InternetHackathonOrchestrator(WORKSPACE_ROOT, STATE_DIR, seed + runIdx, router as never);
    orch.setDevpostData(TEST_DEVPOST_DATA);

    const orchestrationAdapter = orch as unknown as {
      generateFilesWithLLMPhased: (context: typeof TEST_CONTEXT) => Promise<Array<{ path: string; content: string }>>;
      generatedFilesByPhase: Map<number, Array<{ path: string; content: string }>>;
    };

    try {
      await orchestrationAdapter.generateFilesWithLLMPhased(TEST_CONTEXT);

      // Check each phase
      for (let p = 1; p <= 5; p++) {
        const files = orchestrationAdapter.generatedFilesByPhase.get(p) ?? [];
        if (files.length > 0) {
          successes.push({ phase: p, run: runIdx, files: files.length });
        } else {
          failures.push({
            phase: p,
            phaseName: phaseNameFor(p),
            run: runIdx,
            category: 'ZERO_FILES',
            detail: 'No files generated for this phase',
          });
        }
      }
      
      const phaseFiles = Array.from({ length: 5 }, (_, p) =>
        (orchestrationAdapter.generatedFilesByPhase.get(p + 1) ?? []).length,
      );
      process.stderr.write(`[measure] Run ${runIdx + 1} done: ${phaseFiles.join(',')} files per phase\n`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`[measure] Run ${runIdx + 1} FAILED: ${errMsg}\n`);
      
      // Categorize the failure
      let category = 'UNKNOWN';
      if (errMsg.includes('fetch failed')) category = 'NETWORK_FETCH_FAILED';
      else if (errMsg.includes('invalid JSON content')) category = 'ROUTER_JSON_INVALID';
      else if (errMsg.includes('empty content')) category = 'EMPTY_RESPONSE';
      else if (errMsg.includes('timeout') || errMsg.includes('AbortError')) category = 'TIMEOUT';
      else if (errMsg.includes('rate limit') || errMsg.includes('429')) category = 'RATE_LIMIT';
      else if (errMsg.includes('401') || errMsg.includes('403') || errMsg.includes('Unauthorized')) category = 'AUTH_ERROR';
      else if (errMsg.includes('schema') || errMsg.includes('ParseValidationError')) category = 'SCHEMA_VALIDATION';
      else if (errMsg.includes('JSON')) category = 'JSON_PARSE_ERROR';
      
      for (let p = 1; p <= 5; p++) {
        failures.push({
          phase: p,
          phaseName: phaseNameFor(p),
          run: runIdx,
          category,
          detail: errMsg.slice(0, 200),
        });
      }
    }
  }

  // Summary
  console.log('\n=== FAILURE CATEGORIZATION ===');
  const byCategory: Record<string, number> = {};
  for (const f of failures) {
    byCategory[f.category] = (byCategory[f.category] || 0) + 1;
  }
  console.log('By category:');
  for (const [cat, count] of Object.entries(byCategory).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  console.log('\nBy phase:');
  for (let p = 1; p <= 5; p++) {
    const phaseFailures = failures.filter(f => f.phase === p);
    const phaseSuccesses = successes.filter(s => s.phase === p);
    console.log(`  Phase ${p} (${phaseNameFor(p)}): ${phaseSuccesses.length} success, ${phaseFailures.length} fail`);
    if (phaseFailures.length > 0) {
      const cats: Record<string, number> = {};
      for (const f of phaseFailures) cats[f.category] = (cats[f.category] || 0) + 1;
      for (const [cat, count] of Object.entries(cats).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${cat}: ${count}`);
      }
    }
  }

  console.log('\n=== SUCCESS STATS ===');
  for (let p = 1; p <= 5; p++) {
    const phaseSuccesses = successes.filter(s => s.phase === p);
    if (phaseSuccesses.length > 0) {
      const avgFiles = phaseSuccesses.reduce((sum, s) => sum + s.files, 0) / phaseSuccesses.length;
      console.log(`  Phase ${p}: ${phaseSuccesses.length}/${runs} success, avg ${avgFiles.toFixed(1)} files`);
    }
  }

  const totalAttempts = runs * 5;
  const totalSuccesses = successes.length;
  console.log(`\nOverall: ${totalSuccesses}/${totalAttempts} = ${((totalSuccesses / totalAttempts) * 100).toFixed(1)}%`);
}

main().catch((err) => {
  process.stderr.write(`[measure] FATAL: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});