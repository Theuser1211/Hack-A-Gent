import { existsSync, readFileSync, readdirSync as fsReaddirSync } from 'node:fs';
import * as path from 'node:path';

import type { ProjectStateSnapshot } from '../../benchmarks/remote-project-state.js';
import type { CLIContext, CLIArgs, CLIResult, CLIExecutionState } from '../types.js';

export async function statusCommand(ctx: CLIContext, args: CLIArgs): Promise<CLIResult> {
  const projectId = args.positional[0];
  let state: ProjectStateSnapshot | null = null;

  if (projectId) {
    const statePath = path.resolve(ctx.stateDir, `${projectId}.state.json`);
    if (existsSync(statePath)) {
      try {
        state = JSON.parse(readFileSync(statePath, 'utf-8')) as ProjectStateSnapshot;
      } catch {
        return { success: false, message: `Failed to parse state for project: ${projectId}` };
      }
    } else {
      return { success: false, message: `No state found for project: ${projectId}` };
    }
  } else if (ctx.orchestrator) {
    // Try to get running state from orchestrator
    state = null; // would need orchestrator's internal state
  }

  if (!state) {
    // List available projects
    const stateDir = ctx.stateDir;
    if (!existsSync(stateDir)) {
      return { success: true, message: 'No projects found.', data: { projects: [] } };
    }
    const files = readdirSync(stateDir).filter((f) => f.endsWith('.state.json'));
    if (files.length === 0) {
      return { success: true, message: 'No projects found.', data: { projects: [] } };
    }

    const projects = files.map((f) => {
      const fullPath = path.join(stateDir, f);
      try {
        const data = JSON.parse(readFileSync(fullPath, 'utf-8')) as ProjectStateSnapshot;
        return {
          projectId: data.projectId,
          projectName: data.projectName,
          phase: data.phase,
          updatedAt: data.updatedAt,
        };
      } catch {
        return {
          projectId: f.replace('.state.json', ''),
          projectName: f.replace('.state.json', ''),
          phase: 'unknown',
          updatedAt: 'unknown',
        };
      }
    });

    console.log(`\n  Projects (${projects.length} total):\n`);
    for (const p of projects) {
      console.log(
        `  ${p.projectId.padEnd(20)} ${p.projectName.padEnd(25)} ${String(p.phase).padEnd(15)} ${p.updatedAt}`,
      );
    }
    console.log();

    return { success: true, message: `${projects.length} projects found`, data: { projects } };
  }

  // Single project status
  const executionState: CLIExecutionState = {
    projectId: state.projectId,
    phase: state.phase,
    startedAt: state.createdAt,
    taskGraphSnapshot: state.taskGraphState as unknown,
    decisionLog: [],
    errors: [],
    currentPhase: state.phase,
    blockedDependencies: [],
    activeAgents: state.agentLogs.filter((l) => l.status === 'running').length,
    deploymentUrl: state.deployment?.url ?? null,
    browserTestStatus: state.deployment?.status ?? null,
    repairCycles: state.deployment?.logs.length ?? 0,
  };

  console.log(`\n  Project: ${state.projectName}`);
  console.log(`  ${'='.repeat(50)}`);
  console.log(`  ID:           ${state.projectId}`);
  console.log(`  Phase:        ${state.phase}`);
  console.log(`  Created:      ${state.createdAt}`);
  console.log(`  Updated:      ${state.updatedAt}`);
  console.log(`  Seed:         ${state.seed}`);
  console.log();
  console.log(`  GitHub:       ${state.gitHub?.repoUrl ?? 'Not configured'}`);
  console.log(`  Deployment:   ${state.deployment?.url ?? 'Not deployed'}`);
  console.log(`  Deploy Status: ${state.deployment?.status ?? 'N/A'}`);
  console.log();
  console.log(`  Builds:       ${state.buildHistory.length}`);
  for (const b of state.buildHistory.slice(-3)) {
    console.log(`    #${b.buildNumber}: ${b.status}${b.durationMs ? ` (${b.durationMs}ms)` : ''}`);
  }
  console.log();
  console.log(`  Agent Logs:   ${state.agentLogs.length}`);
  const running = state.agentLogs.filter((l) => l.status === 'running').length;
  const failed = state.agentLogs.filter((l) => l.status === 'failed').length;
  console.log(`    Running: ${running}, Failed: ${failed}`);
  console.log();

  return {
    success: true,
    message: `Status for ${state.projectName}`,
    data: executionState as unknown as Record<string, unknown>,
  };
}

function readdirSync(dir: string): string[] {
  try {
    return fsReaddirSync(dir);
  } catch {
    return [];
  }
}
