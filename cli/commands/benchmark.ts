import { getSeededRandom, createDeterministicUuid, nextTraceCounter } from '../../benchmarks/determinism-kernel.js';
import { HackathonBenchmarkRunner, type BenchmarkRunnerConfig } from '../../benchmarks/hackathon-benchmark-runner.js';
import { ALL_BENCHMARKS } from '../../benchmarks/hackathon-benchmarks.js';
import { BenchmarkHistory } from '../../benchmarks/measurement/history.js';
import type { RunConfig } from '../../benchmarks/measurement/history.js';
import { buildLeaderboard, compareConfigs, suggestImprovements, type GroupKey } from '../../benchmarks/measurement/leaderboard.js';
import { measureProject } from '../../benchmarks/measurement/measure.js';
import { runBenchmark, runAllBenchmarks, formatBenchmarkResult, formatBenchmarkSummary } from '../../benchmarks/real-benchmark-runner.js';
import { REAL_BENCHMARKS, getBenchmark, getAllBenchmarkIds } from '../../benchmarks/real-benchmark-suite.js';
import type { ArchitectureBlueprint } from '../../kernel/planning/architect-types.js';
import type { PlannerOutput } from '../../kernel/planning/planner-types.js';
import { color, dim, log, logRaw, success, info, warn, labeled } from '../output.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

/** Build a RunConfig from CLI flags (used to tag benchmark runs). */
function configFromFlags(args: CLIArgs): RunConfig {
  const f = args.flags;
  const cfg: RunConfig = {};
  if (typeof f.model === 'string') cfg.model = f.model;
  if (typeof f.provider === 'string') cfg.provider = f.provider;
  if (typeof f.prompt === 'string') cfg.promptVersion = f.prompt;
  if (typeof f.architecture === 'string') cfg.architecture = f.architecture;
  if (typeof f.repair === 'string') cfg.repairStrategy = f.repair;
  if (typeof f.agent === 'string') cfg.agentStrategy = f.agent;
  if (typeof f.seed === 'number') cfg.seed = f.seed;
  return cfg;
}

export async function benchmarkCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  // The shared arg parser only promotes a fixed allow-list to `subcommand`.
  // Benchmark subcommands beyond that list arrive in `positional[0]`, so we
  // normalize here and expose the remaining positional args as `rest`.
  const sub = args.subcommand ?? args.positional[0] ?? 'run';
  const rest = args.subcommand ? args.positional : args.positional.slice(1);

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
      // NOTE: This `run` subcommand uses stubbed planner/architect/builder
      // providers and therefore produces SIMULATED scores, not measured ones.
      // For real, code-analysis-based evaluation use `hag benchmark real`.
      const totalPhases = result.phases?.length ?? 0;
      const passedPhases = result.phases?.filter(p => p.success).length ?? 0;
      const phaseScore = totalPhases > 0 ? (passedPhases / totalPhases) * 100 : 0;
      const overallScore = result.overall_success ? Math.min(100, phaseScore + (result.judge_score ?? 0)) : phaseScore;

      warn('SIMULATION — scores are synthetic (stub providers). Use `hag benchmark real` for measured results.');
      log(`Overall Score (simulated): ${overallScore.toFixed(1)}%`);
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
        traceId: createDeterministicUuid(seed, nextTraceCounter()).slice(0, 12),
      };
    }

    case 'real': {
      const realSub = rest[0] ?? 'list';

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
        const targetId = rest[1];
        const projectDir = rest[2] ?? process.cwd();

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
        const projectDir = rest[1] ?? process.cwd();
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

    case 'measure': {
      const projectDir = rest[0] ?? process.cwd();
      const fast = args.flags.fast === true || args.flags['skip-slow'] === true;
      const record = args.flags.record !== false; // default record:true
      const config = configFromFlags(args);

      log(`Measuring project: ${projectDir}`);
      if (fast) dim('Fast mode: performance dimension skipped.');
      const result = measureProject(projectDir, { skipSlow: fast });

      const measuredCount = result.dimensions.filter((d) => d.measured).length;
      for (const d of result.dimensions) {
        const tag = d.measured ? (d.score === null ? color('raw', 'yellow') : color('ok', 'green')) : color('n/a', 'gray');
        labeled(`${tag} ${d.name}`, d.detail);
      }
      labeled('Measured dimensions', `${measuredCount}/${result.dimensions.length}`);

      if (record) {
        const history = new BenchmarkHistory(ctx.dataDir);
        const run = history.record({
          config,
          benchmarks: args.flags.benchmark ? String(args.flags.benchmark).split(',') : [],
          dimensions: result.dimensions,
          note: typeof args.flags.note === 'string' ? args.flags.note : undefined,
        });
        success(`Recorded run ${run.id} (composite ${run.compositeScore}).`);
      }

      return {
        success: true,
        message: `Measured ${measuredCount} dimensions`,
        data: { projectDir, dimensions: result.dimensions, composite: result.byName },
      };
    }

    case 'history': {
      const history = new BenchmarkHistory(ctx.dataDir);
      const runs = history.all();
      if (!runs.length) {
        info('No benchmark history yet. Run `hackagent benchmark measure <dir> --model X --provider Y`.');
        return { success: true, message: 'No history', data: { runs: [] } };
      }
      log(`Benchmark history (${runs.length} runs):`);
      for (const r of runs.slice(-20)) {
        labeled(r.id, `composite=${r.compositeScore} model=${r.config.model ?? '-'} prompt=${r.config.promptVersion ?? '-'} arch=${r.config.architecture ?? '-'}`);
      }
      return { success: true, message: `${runs.length} runs`, data: { runs } as unknown as Record<string, unknown> };
    }

    case 'leaderboard': {
      const group = (typeof args.flags.group === 'string' ? args.flags.group : 'model') as GroupKey;
      const valid: GroupKey[] = ['model', 'provider', 'promptVersion', 'architecture', 'repairStrategy', 'agentStrategy'];
      if (!valid.includes(group)) {
        return { success: false, message: `Invalid group "${group}". Use one of: ${valid.join(', ')}` };
      }
      const history = new BenchmarkHistory(ctx.dataDir);
      const boards = buildLeaderboard(history, group);
      if (!boards.length) {
        info('No data for leaderboard. Record benchmark runs first.');
        return { success: true, message: 'Empty leaderboard', data: { boards: [] } };
      }
      log(`Leaderboard by ${group}:`);
      for (const b of boards) {
        labeled(`${color(b.key, 'cyan')} (${b.runs} runs)`, `mean=${b.meanComposite} best=${b.bestComposite}`);
      }
      return { success: true, message: `Leaderboard by ${group}`, data: { group, boards } as unknown as Record<string, unknown> };
    }

    case 'compare': {
      // compare --baseline "model=a" --candidate "model=b"  (key=val pairs)
      const parse = (s?: string): RunConfig => {
        const cfg: RunConfig = {};
        if (!s) return cfg;
        for (const part of s.split(',')) {
          const [k, v] = part.split('=');
          if (k && v) (cfg as Record<string, string>)[k] = v;
        }
        return cfg;
      };
      const baseline = parse(typeof args.flags.baseline === 'string' ? args.flags.baseline : undefined);
      const candidate = parse(typeof args.flags.candidate === 'string' ? args.flags.candidate : undefined);
      if (!Object.keys(baseline).length || !Object.keys(candidate).length) {
        return { success: false, message: 'Usage: hackagent benchmark compare --baseline "model=a" --candidate "model=b"' };
      }
      const history = new BenchmarkHistory(ctx.dataDir);
      const cmp = compareConfigs(history, baseline, candidate);
      log('Comparison:');
      labeled('baseline', JSON.stringify(baseline));
      labeled('candidate', JSON.stringify(candidate));
      labeled('composite delta', `${cmp.deltaComposite > 0 ? '+' : ''}${cmp.deltaComposite}`);
      for (const d of cmp.dimensionDeltas.slice(0, 12)) {
        labeled(`  ${d.dimension}`, `${d.baseline} → ${d.candidate} (${d.delta > 0 ? '+' : ''}${d.delta})`);
      }
      return { success: true, message: 'Comparison complete', data: cmp as unknown as Record<string, unknown> };
    }

    case 'suggest': {
      const history = new BenchmarkHistory(ctx.dataDir);
      const suggestions = suggestImprovements(history);
      log('Suggestions (grounded in recorded history):');
      if (!suggestions.length) {
        info('No suggestions yet — need at least 2 recorded runs.');
      }
      for (const s of suggestions) {
        labeled(color(s.type, 'magenta'), s.text);
      }
      return { success: true, message: 'Suggestions generated', data: { suggestions } as unknown as Record<string, unknown> };
    }

    default:
      return { success: false, message: `Unknown benchmark subcommand: ${sub}. Use: list, run` };
  }
}
