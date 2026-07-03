import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function memoryCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const sub = args.subcommand ?? 'stats';

  switch (sub) {
    case 'query': {
      const queryText = args.positional.join(' ') || args.flags.text;
      if (!queryText || typeof queryText !== 'string') {
        return { success: false, message: 'Usage: hackagent memory query "<text>"' };
      }
      const results = ctx.memory.querySimilarProjects(queryText, 5);
      console.log(`\n  Memory Query: "${queryText}"`);
      console.log(`  ${'='.repeat(50)}`);
      console.log(`  Similarity: ${(results.similarity * 100).toFixed(1)}%`);
      console.log(`  Matches: ${results.snapshots.length}`);
      console.log();
      for (const snap of results.snapshots) {
        console.log(`  • ${snap.projectName}`);
        console.log(`    Score: ${(snap.overallScore * 100).toFixed(1)}% | Deploy: ${snap.deploySuccess}`);
        console.log(`    Strategy: ${snap.strategy.winningStrategy.slice(0, 60)}`);
        console.log(`    Stack: ${snap.techStack.join(', ').slice(0, 60)}`);
        console.log();
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

      console.log(`\n  Organizational Memory`);
      console.log(`  ${'='.repeat(50)}`);
      console.log(`  Total Projects: ${summary.totalProjects}`);
      console.log(`  Average Score:  ${(summary.averageScore * 100).toFixed(1)}%`);
      console.log(`  Top Technologies:`);
      for (const tech of summary.topTechnologies.slice(0, 10)) {
        console.log(`    • ${tech}`);
      }
      console.log();
      console.log(`  Failure Patterns: ${patterns.length}`);
      for (const fp of patterns.slice(0, 5)) {
        console.log(`    [${fp.category}] ${fp.description.slice(0, 60)} (x${fp.frequency})`);
      }
      console.log();
      console.log(`  Winning Patterns: ${wins.length}`);
      for (const wp of wins.slice(0, 5)) {
        console.log(`    ${wp.strategy.slice(0, 60)} — avg ${(wp.avgScore * 100).toFixed(1)}% (${wp.count}x)`);
      }
      console.log();

      return {
        success: true,
        message: `Memory stats: ${summary.totalProjects} projects`,
        data: { summary, failurePatterns: patterns, winningPatterns: wins },
      };
    }

    case 'clear': {
      // Memory is in-memory; this just resets the current session
      console.log('  Memory cleared (session only — persistent storage not affected)');
      return { success: true, message: 'Session memory cleared' };
    }

    default:
      return { success: false, message: `Unknown memory subcommand: ${sub}. Use: query, stats, clear` };
  }
}
