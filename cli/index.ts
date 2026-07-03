#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import * as path from 'node:path';

import { createContext, formatDuration } from './context.js';
import type { CLIArgs, CLIResult, CommandName } from './types.js';

const VALID_COMMANDS: CommandName[] = [
  'run',
  'resume',
  'status',
  'memory',
  'benchmark',
  'replay',
  'deploy',
  'test',
  'explain',
  'health',
  'chat',
  'help',
  'simulate',
  'hack-agent',
  'config',
];

function parseArgs(argv: string[]): CLIArgs {
  const args = argv.slice(2);
  const command = (args[0] ?? 'help') as CommandName;
  const flags: Record<string, string | number | boolean | undefined> = {};
  const positional: string[] = [];
  let subcommand: string | undefined;

  if (!VALID_COMMANDS.includes(command)) {
    return { command: 'help', subcommand: undefined, positional: [], flags: {} };
  }

  let i = 1;
  let seenSubcommand = false;

  while (i < args.length) {
    const arg = args[i]!;

    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      let key: string;
      let value: string | boolean | number;
      if (eqIdx >= 0) {
        key = arg.slice(2, eqIdx);
        value = arg.slice(eqIdx + 1);
      } else {
        key = arg.slice(2);
        if (i + 1 < args.length && !args[i + 1]!.startsWith('-')) {
          value = args[i + 1]!;
          i++;
        } else {
          value = true;
        }
      }
      // try numeric
      if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) && !isNaN(Number(value))) {
        value = Number(value);
      }
      flags[key] = value;
    } else if (arg.startsWith('-') && !arg.startsWith('--')) {
      flags[arg.slice(1)] = true;
    } else if (
      !seenSubcommand &&
      (command === 'memory' || command === 'benchmark' || command === 'replay' || command === 'run') &&
      (arg === 'query' || arg === 'stats' || arg === 'clear' || arg === 'list' || arg === 'run')
    ) {
      subcommand = arg;
      seenSubcommand = true;
    } else {
      positional.push(arg);
    }
    i++;
  }

  return { command, subcommand, positional, flags };
}

function showHelp(): void {
  console.log(`
  Hack-A-Gent — Autonomous Software Engineering Organization CLI
  
  Usage:
    hackagent <command> [options] [args]

  Commands:
    run <input>          Run full hackathon pipeline (Devpost URL, file, or text)
                          --demo           Demo mode: compilation + simulation only
                          --simulate-only  Simulation only: no execution/deploy
                          --resume         Resume from saved snapshot
    simulate <input>     Run simulation only (alias for --simulate-only)
                          --demo           Demo simulation mode
    resume <projectId>   Resume a paused execution
    status [projectId]   Show project status / list projects
    memory query <text>  Search organizational memory
    memory stats         Show memory statistics
    memory clear         Clear session memory
    benchmark list       List available benchmarks
    benchmark run [id]   Run benchmark suite [--adversarial] [--seed N]
    replay <runId>       Deterministic replay of a past run
    deploy <projectId>   Deploy a built project
    test <projectId>     Run browser tests [--url <url>]
    explain [projectId]  Show decision traces and debug analysis
    health               System health check
    chat                 Interactive conversational mode
    help                 Show this help message

  Global Flags:
    --seed <N>           Set deterministic seed
    --json               Output raw JSON
    --quiet              Minimal output
    --verbose            Verbose logging
    --dry-run            Simulate without executing

  Examples:
    hackagent run https://devpost.com/software/example
    hackagent run spec.txt
    hackagent run "Build a chatbot"
    hackagent resume my-project
    hackagent memory query "React dashboard with charts"
    hackagent benchmark run --adversarial --seed 42
    hackagent replay run-2026-01-15
    hackagent chat
`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  if (args.command === 'help' || args.command === undefined) {
    showHelp();
    process.exit(0);
  }

  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : 42;
  const ctx = createContext(seed);
  ctx.outputFormat = args.flags.json === true ? 'json' : args.flags.quiet === true ? 'quiet' : 'pretty';
  ctx.verbose = args.flags.verbose === true;
  ctx.dryRun = args.flags['dry-run'] === true;

  let result: CLIResult;

  const executionTime = Date.now();

  try {
    switch (args.command) {
      case 'run': {
        const { runCommand } = await import('./commands/run.js');
        result = await runCommand(ctx, args);
        break;
      }
      case 'resume': {
        const { resumeCommand } = await import('./commands/resume.js');
        result = await resumeCommand(ctx, args);
        break;
      }
      case 'status': {
        const { statusCommand } = await import('./commands/status.js');
        result = await statusCommand(ctx, args);
        break;
      }
      case 'memory': {
        const { memoryCommand } = await import('./commands/memory.js');
        result = await memoryCommand(ctx, args);
        break;
      }
      case 'benchmark': {
        const { benchmarkCommand } = await import('./commands/benchmark.js');
        result = await benchmarkCommand(ctx, args);
        break;
      }
      case 'replay': {
        const { replayCommand } = await import('./commands/replay.js');
        result = await replayCommand(ctx, args);
        break;
      }
      case 'deploy': {
        const { deployCommand } = await import('./commands/deploy.js');
        result = await deployCommand(ctx, args);
        break;
      }
      case 'test': {
        const { testCommand } = await import('./commands/test.js');
        result = await testCommand(ctx, args);
        break;
      }
      case 'explain': {
        const { explainCommand } = await import('./commands/explain.js');
        result = await explainCommand(ctx, args);
        break;
      }
      case 'health': {
        const { healthCommand } = await import('./commands/health.js');
        result = await healthCommand(ctx, args);
        break;
      }
      case 'chat': {
        const { chatCommand } = await import('./commands/chat.js');
        result = await chatCommand(ctx, args);
        break;
      }
      case 'simulate': {
        const { simulateCommand } = await import('./commands/simulate.js');
        result = await simulateCommand(ctx, args);
        break;
      }
      case 'hack-agent': {
        const { runHackAgentFromArgs } = await import('./hack-agent.js');
        result = await runHackAgentFromArgs(ctx, args);
        break;
      }
      case 'config': {
        const { configCommand } = await import('./commands/config.js');
        result = await configCommand(ctx, args);
        break;
      }
      default:
        result = { success: false, message: `Unknown command: ${args.command}. Use 'hackagent help'.` };
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    result = { success: false, message: `Fatal error: ${msg}` };
  }

  result.durationMs = Date.now() - executionTime;

  if (ctx.outputFormat === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (ctx.outputFormat === 'pretty') {
    if (result.success) {
      console.log(`  ✓ ${result.message}`);
    } else {
      console.log(`  ✗ ${result.message}`);
    }
    if (result.metrics) {
      const entries = Object.entries(result.metrics);
      if (entries.length > 0) {
        console.log(`  Metrics: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
    }
    if (result.traceId) {
      console.log(`  Trace: ${result.traceId}`);
    }
    console.log();
  }

  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
