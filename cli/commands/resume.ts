import { existsSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';
import { RemoteProjectState } from '../../benchmarks/remote-project-state.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function resumeCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const projectId = args.positional[0];
  if (!projectId) {
    return { success: false, message: 'Usage: hackagent resume <projectId>' };
  }

  const statePath = path.resolve(ctx.stateDir, `${projectId}.state.json`);
  if (!existsSync(statePath)) {
    return { success: false, message: `No saved state found for project: ${projectId}` };
  }

  const stateManager = new RemoteProjectState(ctx.stateDir, ctx.seed);
  const loaded = stateManager.load(projectId);
  if (!loaded) {
    return { success: false, message: `Failed to load state for project: ${projectId}` };
  }

  const resumeResult = stateManager.canResume();
  if (!resumeResult.canResume) {
    return { success: false, message: `Cannot resume project "${projectId}": ${resumeResult.warnings.join('; ')}` };
  }

  console.log(`\n  Resuming project: ${projectId}`);
  console.log(`  Phase: ${loaded.phase}`);
  console.log(`  Resume point: ${resumeResult.resumePoint}`);
  if (resumeResult.warnings.length > 0) {
    for (const w of resumeResult.warnings) console.log(`  ⚠ ${w}`);
  }
  console.log(`  ${'='.repeat(50)}\n`);

  const internetOrch = new InternetHackathonOrchestrator(ctx.workspaceRoot, ctx.stateDir, ctx.seed);
  ctx.orchestrator = internetOrch;

  // Reload state into the orchestrator
  (internetOrch as unknown).loadState(loaded);

  console.log('  • Continuing execution...');
  const executionTime = Date.now();

  try {
    const result = await internetOrch.executeFullPipeline();
    const elapsed = Date.now() - executionTime;

    console.log(`\n  ${'='.repeat(50)}`);
    console.log(`  Resume complete in ${Math.floor(elapsed / 1000)}s`);
    console.log(`  Phase: ${result.phase}`);
    console.log(`  URL: ${result.deployUrl ?? 'N/A'}`);
    console.log(`  Errors: ${result.errors.length}`);

    return {
      success: result.errors.length === 0,
      message: `Resumed and completed project "${projectId}"`,
      data: { projectId, phase: result.phase, deployUrl: result.deployUrl, errors: result.errors.length },
      metrics: { durationMs: elapsed },
      traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
    };
  } catch (err) {
    const elapsed = Date.now() - executionTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Resume failed after ${Math.floor(elapsed / 1000)}s: ${msg}`);
    return {
      success: false,
      message: `Resume failed: ${msg}`,
      data: { projectId, errors: [msg] },
      metrics: { durationMs: elapsed },
      traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
    };
  }
}
