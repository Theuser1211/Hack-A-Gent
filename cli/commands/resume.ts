import { existsSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid, nextTraceCounter } from '../../benchmarks/determinism-kernel.js';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';
import { RemoteProjectState } from '../../benchmarks/remote-project-state.js';
import { log, dim, warn, error as showError, labeled } from '../output.js';
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

  log(`Resuming project: ${projectId}`);
  labeled('Phase', loaded.phase);
  labeled('Resume point', resumeResult.resumePoint);
  if (resumeResult.warnings.length > 0) {
    for (const w of resumeResult.warnings) warn(w);
  }
  dim('='.repeat(50));
  log('');

  const internetOrch = new InternetHackathonOrchestrator(ctx.workspaceRoot, ctx.stateDir, ctx.seed);
  ctx.orchestrator = internetOrch;

  // Restore the saved execution state so we continue from where the previous
  // run stopped (already-completed tasks are skipped) instead of restarting.
  const applied = internetOrch.loadState(loaded);
  if (!applied) {
    return { success: false, message: `Failed to restore state for project "${projectId}"` };
  }

  log('Continuing execution from saved state...');
  const executionTime = Date.now();

  try {
    const result = await internetOrch.resumeExecution();
    const elapsed = Date.now() - executionTime;

    dim('='.repeat(50));
    log(`Resume complete in ${Math.floor(elapsed / 1000)}s`);
    labeled('Phase', result.phase);
    labeled('URL', result.deployUrl ?? 'N/A');
    labeled('Errors', String(result.errors.length));

    return {
      success: result.errors.length === 0,
      message: `Resumed and completed project "${projectId}"`,
      data: { projectId, phase: result.phase, deployUrl: result.deployUrl, errors: result.errors.length },
      metrics: { durationMs: elapsed },
      traceId: createDeterministicUuid(ctx.seed, nextTraceCounter()).slice(0, 12),
    };
  } catch (err) {
    const elapsed = Date.now() - executionTime;
    const msg = err instanceof Error ? err.message : String(err);
    showError(`Resume failed after ${Math.floor(elapsed / 1000)}s: ${msg}`);
    return {
      success: false,
      message: `Resume failed: ${msg}`,
      data: { projectId, errors: [msg] },
      metrics: { durationMs: elapsed },
      traceId: createDeterministicUuid(ctx.seed, nextTraceCounter()).slice(0, 12),
    };
  }
}
