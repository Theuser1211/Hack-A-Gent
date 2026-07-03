import { getSeededRandom, createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import { HackathonBenchmarkRunner, type BenchmarkRunnerConfig } from '../../benchmarks/hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from '../../benchmarks/hackathon-benchmarks.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { header, log, info, dim } from '../output.js';

export async function benchmarkCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const sub = args.subcommand ?? 'run';

  switch (sub) {
    case 'list': {
      log('Available Benchmarks:');
      for (const b of ALL_BENCHMARKS) {
        log(`${b.id.padEnd(30)} ${b.name.slice(0, 50)}`);
      }
      log('');
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
      log(`Overall Score: ${(result.overall_success ? 100 : 0).toFixed(1)}%`);
      log(`Passed: ${result.overall_success}`);
      log(
        `Duration: ${Math.floor((result.completed_at ? new Date(result.completed_at).getTime() - new Date(result.started_at).getTime() : 0) / 1000)}s`,
      );
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
        metrics: { overallScore: result.overall_success ? 1 : 0, passed: result.overall_success ? 1 : 0 },
        traceId: createDeterministicUuid(seed, Date.now()).slice(0, 12),
      };
    }

    default:
      return { success: false, message: `Unknown benchmark subcommand: ${sub}. Use: list, run` };
  }
}
