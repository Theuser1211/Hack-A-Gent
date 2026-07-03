import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { InternetToolGateway } from '../../benchmarks/internet-tool-gateway.js';
import { LiveBrowserTestAgent } from '../../benchmarks/live-browser-test-agent.js';
import { TaskGraph } from '../../benchmarks/task-graph.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function testCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const projectId = args.positional[0];
  const url = args.flags.url as string | undefined;

  if (!projectId && !url) {
    return { success: false, message: 'Usage: hackagent test <projectId> [--url <url>]' };
  }

  const targetUrl = url;
  if (!targetUrl) {
    return { success: false, message: 'No URL available. Provide --url flag or run deploy first.' };
  }

  console.log(`\n  Running Browser Tests`);
  console.log(`  URL: ${targetUrl}`);
  console.log(`  ${'='.repeat(50)}\n`);

  const toolGateway = new InternetToolGateway({ workingDir: process.cwd() }, ctx.seed);
  const taskGraph = new TaskGraph(`test-${projectId ?? 'unknown'}`, ctx.seed);
  const browserAgent = new LiveBrowserTestAgent(toolGateway, ctx.seed);

  console.log('  • Running UX journey simulation...');
  const executionTime = Date.now();

  try {
    const spec = browserAgent.buildTestSpec('Live Test', targetUrl, [], []);
    const result = await browserAgent.runTest(spec);
    const elapsed = Date.now() - executionTime;

    console.log(`  Test completed in ${Math.floor(elapsed / 1000)}s`);
    console.log(`  Passed: ${result.passed ? 'YES' : 'NO'}`);
    console.log(`  Status code: ${result.statusCode}`);
    console.log(`  DOM elements found: ${result.domElements.length}`);
    console.log(`  Console errors: ${result.consoleErrors.length}`);
    console.log(`  Failures:`);
    for (const f of result.failures) {
      console.log(`    • [${f.type}] ${f.message.slice(0, 80)}`);
    }
    console.log();

    // Run UX journey evaluation
    console.log('  • Running UX journey evaluation...');
    // Use fetch + analysis for a quick UX check
    const uxSpec = browserAgent.buildTestSpec('UX Evaluation', targetUrl, ['nav', 'main', 'footer'], []);
    const uxResult = await browserAgent.runTest(uxSpec);
    const completeness = uxResult.domElements.length > 0 ? Math.min(1, uxResult.domElements.length / 10) : 0;
    const flowScore = uxResult.passed ? Math.min(1, 1 - uxResult.failures.length * 0.2) : 0;
    console.log(`  UI completeness: ${(completeness * 100).toFixed(1)}%`);
    console.log(`  UI flow score: ${(flowScore * 100).toFixed(1)}%`);
    console.log();

    return {
      success: result.passed,
      message: `Tests ${result.passed ? 'passed' : 'failed'} for ${targetUrl}`,
      data: {
        url: targetUrl,
        passed: result.passed,
        failures: result.failures.length,
        consoleErrors: result.consoleErrors.length,
        domElements: result.domElements.length,
        uxCompleteness: completeness,
        uxFlowScore: flowScore,
      },
      metrics: { durationMs: elapsed, passed: result.passed ? 1 : 0, failures: result.failures.length },
      traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
    };
  } catch (err) {
    const elapsed = Date.now() - executionTime;
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  ✗ Tests failed: ${msg}`);
    return {
      success: false,
      message: `Browser test failed: ${msg}`,
      metrics: { durationMs: elapsed },
    };
  }
}
