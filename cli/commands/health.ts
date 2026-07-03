import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function healthCommand(ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
  const memoryUsage = process.memoryUsage();
  const memMB = (memoryUsage.heapUsed / 1024 / 1024).toFixed(1);
  const rssMB = (memoryUsage.rss / 1024 / 1024).toFixed(1);

  // Count state files
  let projectCount = 0;
  let stateFiles: string[] = [];
  if (existsSync(ctx.stateDir)) {
    stateFiles = readdirSync(ctx.stateDir).filter((f) => f.endsWith('.state.json'));
    projectCount = stateFiles.length;
  }

  // Count snapshots
  let snapshotCount = 0;
  const snapshotsDir = path.resolve(ctx.dataDir, 'snapshots');
  if (existsSync(snapshotsDir)) {
    snapshotCount = readdirSync(snapshotsDir).filter((f) => f.endsWith('.snapshot.json')).length;
  }

  // Memory stats
  const memSummary = ctx.memory.getMemorySummary();

  // Recent runs
  const recentRuns = stateFiles.slice(-5).map((f) => {
    try {
      const data = JSON.parse(readFileSync(path.join(ctx.stateDir, f), 'utf-8'));
      return { projectName: data.projectName, phase: data.phase, updatedAt: data.updatedAt };
    } catch {
      return { projectName: f, phase: 'unknown', updatedAt: 'unknown' };
    }
  });

  console.log(`\n  System Health`);
  console.log(`  ${'='.repeat(50)}`);
  console.log();
  console.log(`  Runtime:`);
  console.log(`  Memory (heap):   ${memMB} MB / ${rssMB} MB RSS`);
  console.log(`  Uptime:          ${Math.floor(process.uptime())}s`);
  console.log(`  Seed:            ${ctx.seed}`);
  console.log(`  Workspace:       ${ctx.workspaceRoot}`);
  console.log();
  console.log(`  Projects:`);
  console.log(`  Total:           ${projectCount}`);
  console.log(`  State dir:       ${ctx.stateDir}`);
  console.log(`  Snapshots:       ${snapshotCount}`);
  console.log();
  console.log(`  Memory Bank:`);
  console.log(`  Projects:        ${memSummary.totalProjects}`);
  console.log(`  Avg score:       ${(memSummary.averageScore * 100).toFixed(1)}%`);
  console.log(`  Top techs:       ${memSummary.topTechnologies.slice(0, 5).join(', ') || 'none'}`);
  console.log();
  console.log(`  Recent Runs:`);
  for (const run of recentRuns) {
    console.log(`  • ${run.projectName.padEnd(25)} ${String(run.phase).padEnd(15)} ${run.updatedAt}`);
  }
  if (recentRuns.length === 0) console.log('  (no recent runs)');
  console.log();

  return {
    success: true,
    message: 'System healthy',
    data: {
      memory: { heapMB: parseFloat(memMB), rssMB: parseFloat(rssMB) },
      projects: projectCount,
      snapshots: snapshotCount,
      memoryBank: memSummary,
      recentRuns,
    },
    metrics: {
      projectCount,
      memoryMB: parseFloat(memMB),
      memoryProjects: memSummary.totalProjects,
    },
  };
}
