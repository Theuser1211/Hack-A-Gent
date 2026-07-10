import { getSeededRandom, createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { HackathonBenchmarkRunner, type BenchmarkRunnerConfig } from '../../benchmarks/hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from '../../benchmarks/hackathon-benchmarks.js';
import { runBenchmark, runAllBenchmarks, formatBenchmarkResult, formatBenchmarkSummary } from '../../benchmarks/real-benchmark-runner.js';
import { REAL_BENCHMARKS, getBenchmark, getAllBenchmarkIds } from '../../benchmarks/real-benchmark-suite.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';
import { color, dim, log, logRaw, success, error, info, labeled } from '../output.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function benchmarkCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const sub = args.subcommand ?? 'run';

  switch (sub) {
    case 'list': {
      const maxIdLen = Math.max(...ALL_BENCHMARKS.map(b => b.id.length));
      logRaw('');
      logRaw(`  ${color('Available Benchmarks', 'cyan')}`);
      logRaw('');
      logRaw(`  ${color('ID'.padEnd(maxIdLen), 'gray')}   ${color('Description', 'gray')}`);
      logRaw(`  ${color('─'.repeat(maxIdLen + 4 + 48), 'gray')}`);
      for (const b of ALL_BENCHMARKS) {
        logRaw(`  ${color(b.id.padEnd(maxIdLen), 'white')}   ${color(b.name.slice(0, 48), 'gray')}`);
      }
      logRaw('');
      return {
        success: true,
        message: `${ALL_BENCHMARKS.length} benchmarks available`,
        data: { benchmarks: ALL_BENCHMARKS },
      };
    }

    case 'run': {
      const benchmarkId = args.positional[0] || 'default';
      const seed = typeof args.flags.seed === 'number' ? args.flags.seed : ctx.seed;
      const mutationLevel = typeof args.flags['mutation-level'] === 'number' ? args.flags['mutation-level'] : 0.3;
      const adversarial = args.flags.adversarial === true;
      const curriculum = args.flags.curriculum === true;

      const benchmark = ALL_BENCHMARKS.find((b) => b.id === benchmarkId);
      if (!benchmark && benchmarkId !== 'default') {
        return { success: false, message: `Unknown benchmark: ${benchmarkId}. Use 'hackagent benchmark list'` };
      }

      log(`Running Benchmark: ${benchmarkId}`);
      log(`Seed: ${seed} | Mutation Level: ${mutationLevel} | Adversarial: ${adversarial}`);
      dim('='.repeat(50));
      log('');

      const config: BenchmarkRunnerConfig = {
        seed,
        adversarialMode: adversarial,
        repairLimit: 3,
        planner: { execute: async () => ({ output: {} as PlannerOutput }) },
        architect: { execute: async () => ({ output: {} as ArchitectureBlueprint }) },
        builderProvider: {
          build: async () => ({ status: 'success' as const, output: '', artifacts: [] }),
          execute: async () => ({}),
        } as never as import('../../kernel/builders/builder-provider.js').BuilderProvider,
      };

      const runner = new HackathonBenchmarkRunner(config);

      const mutationsEnabled = adversarial;
      const rng = getSeededRandom(seed);

      const target = benchmark ?? ALL_BENCHMARKS[0]!;
      const result = await runner.runBenchmark(target);

      log('Results:');
      // Calculate score based on phase pass rate
      const totalPhases = result.phases?.length ?? 0;
      const passedPhases = result.phases?.filter(p => p.success).length ?? 0;
      const phaseScore = totalPhases > 0 ? (passedPhases / totalPhases) * 100 : 0;
      const overallScore = result.overall_success ? Math.min(100, phaseScore + (result.judge_score ?? 0)) : phaseScore;
      
      log(`Overall Score: ${overallScore.toFixed(1)}%`);
      log(`Passed: ${result.overall_success}`);
      log(`Duration: ${Math.floor((result.total_duration_ms ?? 0) / 1000)}s`);
      log('');

      if (result.phases) {
        log('Phase Breakdown:');
        for (const phase of result.phases) {
          log(
            `  ${phase.phase ?? 'unknown'}: ${phase.success ? 'PASS' : 'FAIL'} (${(phase.success ? 100 : 0).toFixed(1)}%)`,
          );
        }
        log('');
      }

      return {
        success: result.overall_success,
        message: `Benchmark "${benchmarkId}" completed: ${result.overall_success ? 'PASS' : 'FAIL'}`,
        data: result as unknown as Record<string, unknown>,
        metrics: { overallScore: overallScore, passed: result.overall_success ? 1 : 0, durationMs: result.total_duration_ms ?? 0 },
        traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
      };
    }

    case 'real': {
      const realSub = args.positional[0] ?? 'list';

      if (realSub === 'list') {
        const ids = getAllBenchmarkIds();
        logRaw('');
        logRaw(`  ${color('Real Benchmarks', 'cyan')}`);
        logRaw('');
        for (const id of ids) {
          const b = getBenchmark(id);
          if (b) {
            logRaw(`  ${color(b.id, 'white')}   ${color(b.name, 'gray')} [${b.difficulty}]`);
            logRaw(`    ${color(b.description, 'gray')}`);
          }
        }
        logRaw('');
        return { success: true, message: `${ids.length} real benchmarks available`, data: { benchmarks: ids } };
      }

      if (realSub === 'run') {
        const targetId = args.positional[1];
        const projectDir = args.positional[2] ?? process.cwd();

        if (!targetId) {
          return { success: false, message: 'Usage: hackagent benchmark real run <benchmark-id> [project-dir]' };
        }

        log(`Running real benchmark: ${targetId}`);
        labeled('project', projectDir);
        log('');

        const result = runBenchmark({ benchmarkId: targetId, projectDir, timeout: 60000 });
        log(formatBenchmarkResult(result));

        return {
          success: result.passed,
          message: `Benchmark ${targetId}: ${result.passed ? 'PASS' : 'FAIL'} (${result.score}/${result.maxScore})`,
          data: result as unknown as Record<string, unknown>,
        };
      }

      if (realSub === 'run-all') {
        const projectDir = args.positional[1] ?? process.cwd();
        const filter = args.flags.filter ? String(args.flags.filter).split(',') : undefined;

        log('Running all real benchmarks...');
        labeled('project', projectDir);
        log('');

        const results = runAllBenchmarks({ projectDir, filter });
        log(formatBenchmarkSummary(results));

        const passed = results.filter(r => r.passed).length;
        return {
          success: passed === results.length,
          message: `${passed}/${results.length} benchmarks passed`,
          data: { results: results.map(r => ({ id: r.benchmarkId, passed: r.passed, score: r.score })) },
        };
      }

      return { success: false, message: 'Usage: hackagent benchmark real <list|run|run-all>' };
    }

    default:
      return { success: false, message: `Unknown benchmark subcommand: ${sub}. Use: list, run` };
  }
}
