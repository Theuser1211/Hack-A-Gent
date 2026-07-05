import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { header, log, info, warn, dim } from '../output.js';

export async function memoryCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const sub = args.subcommand ?? 'stats';

  switch (sub) {
    case 'query': {
      const queryText = args.positional.join(' ') || args.flags.text;
      if (!queryText || typeof queryText !== 'string') {
        return { success: false, message: 'Usage: hackagent memory query "<text>"' };
      }
      const results = ctx.memory.querySimilarProjects(queryText, 5);
      log(`Memory Query: "${queryText}"`);
      dim('='.repeat(50));
      log(`Similarity: ${(results.similarity * 100).toFixed(1)}%`);
      log(`Matches: ${results.snapshots.length}`);
      log('');
      for (const snap of results.snapshots) {
        log(`${snap.projectName}`);
        log(`  Score: ${(snap.overallScore * 100).toFixed(1)}% | Deploy: ${snap.deploySuccess}`);
        log(`  Strategy: ${snap.strategy.winningStrategy.slice(0, 60)}`);
        log(`  Stack: ${snap.techStack.join(', ').slice(0, 60)}`);
        log('');
      }
      return {
        success: true,
        message: `Query returned ${results.snapshots.length} results`,
        data: { query: queryText, similarity: results.similarity, snapshots: results.snapshots },
        traceId: createDeterministicUuid(ctx.seed, Date.now()).slice(0, 12),
      };
    }

    case 'stats': {
      const summary = ctx.memory.getMemorySummary();
      const patterns = ctx.memory.getFailurePatterns();
      const wins = ctx.memory.getWinningPatterns();

      log('Organizational Memory');
      dim('='.repeat(50));
      log(`Total Projects: ${summary.totalProjects}`);
      log(`Average Score:  ${(summary.averageScore * 100).toFixed(1)}%`);
      log('Top Technologies:');
      for (const tech of summary.topTechnologies.slice(0, 10)) {
        log(`  ${tech}`);
      }
      log('');
      log(`Failure Patterns: ${patterns.length}`);
      for (const fp of patterns.slice(0, 5)) {
        log(`  [${fp.category}] ${fp.description.slice(0, 60)} (x${fp.frequency})`);
      }
      log('');
      log(`Winning Patterns: ${wins.length}`);
      for (const wp of wins.slice(0, 5)) {
        log(`  ${wp.strategy.slice(0, 60)} — avg ${(wp.avgScore * 100).toFixed(1)}% (${wp.count}x)`);
      }
      log('');

      return {
        success: true,
        message: `Memory stats: ${summary.totalProjects} projects`,
        data: { summary, failurePatterns: patterns, winningPatterns: wins },
      };
    }

    case 'clear': {
      ctx.memory.clear();
      return { success: true, message: 'Memory cleared' };
    }

    default:
      return { success: false, message: `Unknown memory subcommand: ${sub}. Use: query, stats, clear` };
  }
}
