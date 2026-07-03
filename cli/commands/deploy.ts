import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { InternetHackathonOrchestrator } from '../../benchmarks/internet-hackathon-orchestrator.js';
import { RemoteProjectState } from '../../benchmarks/remote-project-state.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { header, log, success, error as showError, dim } from '../output.js';

export async function deployCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const projectId = args.positional[0];
  if (!projectId) {
    return { success: false, message: 'Usage: hackagent deploy <projectId>' };
  }

  const statePath = path.resolve(ctx.stateDir, `${projectId}.state.json`);
  if (!existsSync(statePath)) {
    return { success: false, message: `No project found: ${projectId}. Run 'hackagent run' first.` };
  }

  log(`Deploying Project: ${projectId}`);
  dim('='.repeat(50));
  log('');

  const stateManager = new RemoteProjectState(ctx.stateDir, ctx.seed);
  const state = stateManager.load(projectId);
  if (!state) {
    return { success: false, message: `Failed to load project state: ${projectId}` };
  }

  const internetOrch = new InternetHackathonOrchestrator(ctx.workspaceRoot, ctx.stateDir, ctx.seed);
  ctx.orchestrator = internetOrch;

  log('Starting deployment repair controller...');
  log(`Target: ${state.metadata.deployTarget ?? 'vercel'}`);
  log(`GitHub repo: ${state.gitHub?.repoName ?? 'N/A'}`);
  log('');

  const executionTime = Date.now();

  try {
    const projectDir = path.resolve(ctx.workspaceRoot, 'projects', projectId);
    const deployResult = await internetOrch.getToolGateway().deploy({ target: 'vercel', projectDir });
    const elapsed = Date.now() - executionTime;

    log(`Deployment status: ${deployResult.success ? 'success' : 'failed'}`);
    log(`URL: ${deployResult.url ?? 'N/A'}`);
    if (deployResult.error) log(`Error: ${deployResult.error}`);

    // Run browser validation
    if (deployResult.url) {
      log('');
      log('Running post-deploy browser validation...');
      try {
        const spec = internetOrch
          .getBrowserAgent()
          .buildTestSpec('deploy-validation', deployResult.url, ['main', 'h1'], ['Welcome']);
        const testResult = await internetOrch.getBrowserAgent().runTest(spec);
        const validation = { allPassed: testResult.passed, results: [testResult] };
        log(`Tests passed: ${validation.allPassed}`);
        log(
          `Results: ${validation.results.length} tests, ${validation.results.filter((r: { passed: boolean }) => r.passed).length} passed`,
        );
      } catch (browserErr) {
        log(
          `Browser validation error: ${browserErr instanceof Error ? browserErr.message : String(browserErr)}`,
        );
      }
    }

    return {
      success: deployResult.success,
      message: deployResult.url
        ? `Deployed to ${deployResult.url}`
        : `Deployment status: ${deployResult.success ? 'success' : 'failed'}`,
      data: { projectId, url: deployResult.url, status: deployResult.success ? 'deployed' : 'failed' },
      metrics: { durationMs: elapsed },
      traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
    };
  } catch (err) {
    const elapsed = Date.now() - executionTime;
    const msg = err instanceof Error ? err.message : String(err);
    showError(`Deployment failed after ${Math.floor(elapsed / 1000)}s: ${msg}`);
    return {
      success: false,
      message: `Deployment failed: ${msg}`,
      data: { projectId },
      metrics: { durationMs: elapsed },
    };
  }
}
