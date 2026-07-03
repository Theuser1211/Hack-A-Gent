import { existsSync, readdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';

import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { header, log, labeled, dim } from '../output.js';

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

  log('System Health');
  dim('='.repeat(50));
  log('');
  log('Runtime:');
  labeled('Memory (heap)', `${memMB} MB / ${rssMB} MB RSS`);
  labeled('Uptime', `${Math.floor(process.uptime())}s`);
  labeled('Seed', String(ctx.seed));
  labeled('Workspace', ctx.workspaceRoot);
  log('');
  log('Projects:');
  labeled('Total', String(projectCount));
  labeled('State dir', ctx.stateDir);
  labeled('Snapshots', String(snapshotCount));
  log('');
  log('Memory Bank:');
  labeled('Projects', String(memSummary.totalProjects));
  labeled('Avg score', `${(memSummary.averageScore * 100).toFixed(1)}%`);
  labeled('Top techs', `${memSummary.topTechnologies.slice(0, 5).join(', ') || 'none'}`);
  log('');
  log('Recent Runs:');
  for (const run of recentRuns) {
    log(`${run.projectName.padEnd(25)} ${String(run.phase).padEnd(15)} ${run.updatedAt}`);
  }
  if (recentRuns.length === 0) log('(no recent runs)');
  log('');

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
