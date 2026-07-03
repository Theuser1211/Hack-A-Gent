import { getSeededRandom, createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { HackathonBenchmarkRunner, type BenchmarkRunnerConfig } from '../../benchmarks/hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from '../../benchmarks/hackathon-benchmarks.js';
import { MutationEvolutionController } from '../../benchmarks/mutation-evolution-controller.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function benchmarkCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const sub = args.subcommand ?? 'run';

  switch (sub) {
    case 'list': {
      console.log('\n  Available Benchmarks:\n');
      for (const b of ALL_BENCHMARKS) {
        console.log(`  • ${b.id.padEnd(30)} ${b.name.slice(0, 50)}`);
      }
      console.log();
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

      console.log(`\n  Running Benchmark: ${benchmarkId}`);
      console.log(`  Seed: ${seed} | Mutation Level: ${mutationLevel} | Adversarial: ${adversarial}`);
      console.log(`  ${'='.repeat(50)}\n`);

      const config: BenchmarkRunnerConfig = {
        seed,
        adversarialMode: adversarial,
        repairLimit: 3,
        planner: { execute: (async () => ({ output: {} })) as unknown },
        architect: { execute: (async () => ({ output: {} })) as unknown },
        builderProvider: {
          build: async () => ({ status: 'success' as const, output: '', artifacts: [] }),
          execute: async () => ({}),
        } as unknown,
      };

      const runner = new HackathonBenchmarkRunner(config);

      const mutationsEnabled = adversarial;
      const rng = getSeededRandom(seed);

      const target = benchmark ?? ALL_BENCHMARKS[0]!;
      const result = await runner.runBenchmark(target);

      console.log(`  Results:`);
      console.log(`  Overall Score: ${(result.overall_success ? 100 : 0).toFixed(1)}%`);
      console.log(`  Passed: ${result.overall_success}`);
      console.log(
        `  Duration: ${Math.floor((result.completed_at ? new Date(result.completed_at).getTime() - new Date(result.started_at).getTime() : 0) / 1000)}s`,
      );
      console.log();

      if (result.phases) {
        console.log(`  Phase Breakdown:`);
        for (const phase of result.phases) {
          console.log(
            `    • ${phase.phase ?? 'unknown'}: ${phase.success ? 'PASS' : 'FAIL'} (${(phase.success ? 100 : 0).toFixed(1)}%)`,
          );
        }
        console.log();
      }

      return {
        success: result.overall_success,
        message: `Benchmark "${benchmarkId}" completed: ${result.overall_success ? 'PASS' : 'FAIL'}`,
        data: result as unknown as Record<string, unknown>,
        metrics: { overallScore: result.overall_success ? 1 : 0, passed: result.overall_success ? 1 : 0 },
        traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
      };
    }

    default:
      return { success: false, message: `Unknown benchmark subcommand: ${sub}. Use: list, run` };
  }
}
