#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from './config-manager.js';
import { createContext } from './context.js';
import { formatError, printError } from './errors.js';
import { success as logSuccess, error as logError, info, dim, showVersion, setVerbose } from './output.js';
import type { CLIArgs, CLIResult, CommandName } from './types.js';

// Feature commands live under features/commands/<name>.ts (kept out of the
// refactored cli/ production files). Register them here only. The
// command functions live in features/, so this stays isolated from the
// files the other engineer is actively refactoring.
/* eslint-disable @typescript-eslint/no-explicit-any */
const FEATURE_COMMANDS: Record<string, { mod: () => Promise<any>; fn: string }> = {
  analyze: { mod: () => import('../features/commands/intelligence.js'), fn: 'analyzeCommand' },
  inspect: { mod: () => import('../features/commands/intelligence.js'), fn: 'inspectCommand' },
  opportunities: { mod: () => import('../features/commands/intelligence.js'), fn: 'opportunitiesCommand' },
  sponsors: { mod: () => import('../features/commands/intelligence.js'), fn: 'sponsorsCommand' },
  timeline: { mod: () => import('../features/commands/intelligence.js'), fn: 'timelineCommand' },
  strategy: { mod: () => import('../features/commands/intelligence.js'), fn: 'strategyCommand' },
  compare: { mod: () => import('../features/commands/intelligence.js'), fn: 'compareCommand' },
  categories: { mod: () => import('../features/commands/categories.js'), fn: 'categoriesCommand' },
  docs: { mod: () => import('../features/commands/docs.js'), fn: 'docsCommand' },
  knowledge: { mod: () => import('../features/commands/knowledge.js'), fn: 'knowledgeCommand' },
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const VALID_COMMANDS: string[] = [
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
  'setup',
  'doctor',
  'models',
  'providers',
  'version',
  'analyze',
  'inspect',
  'opportunities',
  'sponsors',
  'timeline',
  'strategy',
  'compare',
  'categories',
  'docs',
  'knowledge',
];

const COMMAND_ALIASES: Record<string, CommandName> = {
  c: 'config',
  s: 'setup',
};

function parseArgs(argv: string[]): CLIArgs {
  const args = argv.slice(2);
  const rawCommand = args[0] ?? 'help';
  const command = (COMMAND_ALIASES[rawCommand] ?? rawCommand) as CommandName;
  const flags: Record<string, string | number | boolean | undefined> = {};
  const positional: string[] = [];
  let subcommand: string | undefined;

  const aliasKeys = Object.keys(COMMAND_ALIASES) as CommandName[];
  const allValid = [...VALID_COMMANDS, ...aliasKeys];

  if (rawCommand === 'version' || rawCommand === '--version' || rawCommand === '-v') {
    return { command: 'version' as CommandName, subcommand: undefined, positional: [], flags: {} };
  }
  if (rawCommand === 'help' || rawCommand === '--help' || rawCommand === '-h') {
    return { command: 'help' as CommandName, subcommand: undefined, positional: [], flags: {} };
  }
  if (!allValid.includes(command)) {
    console.error(`  Unknown command: '${rawCommand}'. Run 'hag help' to see available commands.`);
    return { command: 'help' as CommandName, subcommand: undefined, positional: [], flags: { unknownCommand: rawCommand } };
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
      (arg === 'query' || arg === 'stats' || arg === 'clear' || arg === 'list' || arg === 'run' || arg === 'real' || arg === 'measure' || arg === 'history' || arg === 'leaderboard' || arg === 'compare' || arg === 'suggest')
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

function getVersion(): string {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates: string[] = [
    '../../package.json',
    '../package.json',
  ];
  for (const rel of candidates) {
    try {
      const pkgPath = path.resolve(moduleDir, rel);
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      if (pkg.version) return pkg.version;
    } catch { /* try next */ }
  }
  return '0.1.0';
}

function showSimpleHelp(): void {
  console.log(`
  Hack-A-Gent — Autonomous Hackathon Teammate

  Usage:
    hag                          Interactive entry point (paste URL, answer a few questions)
    hag run <url|file|text>      Build a hackathon submission from a URL, file, or description
    hag resume <projectId>       Resume a paused build
    hag explain [projectId]      Show decision traces and debug analysis
    hag setup                    Interactive setup wizard
    hag doctor                   System diagnostics
    hag providers                Show configured provider status
    hag models                   List available models from configured provider
    hag --help                   Show all commands (public + internal)
    hag --version                Show version

  Examples:
    hag
    hag run https://devpost.com/software/example
    hag setup
    hag doctor

  Flags:
    --seed <N>           Set deterministic seed (default: 42)
    --json               Output raw JSON
    --quiet              Minimal output
    --verbose            Verbose logging
    --dry-run            Simulate without executing
    --debug              Show full error stack traces
  `);
}

/** Detailed help shown on --help: includes all commands (public and internal). */
function showDetailedHelp(): void {
  console.log(`
  Hack-A-Gent — Autonomous Hackathon Teammate

  Usage:
    hackagent <command> [options]
    hag <command> [options]

  Public Commands:
    run <url|file|text>      Build a hackathon submission from a URL, file, or description
    resume <projectId>       Resume a paused build
    explain [projectId]      Show decision traces and debug analysis
    setup                    Interactive first-time setup wizard
    doctor                   System diagnostics
    providers                Show configured provider status
    models                   List available models from configured provider

  Internal / Advanced Commands:
    config                   Configure LLM provider, API keys, deploy tokens
    status [projectId]       Show project status / list projects
    memory                   Search organizational memory, show stats
    benchmark                Run benchmark suite, list benchmarks, measure projects
    replay <runId>           Deterministic replay of a past run
    deploy <projectId>       Deploy a built project
    test <projectId>         Run browser tests
    health                   System health check
    chat                     Interactive conversational mode
    simulate <input>         Run simulation only
    hack-agent               Internal pipeline runner
    version                  Show version

  Intelligence (Hackathon Features):
    analyze <url|file|text>     Full competition analysis
    inspect <url|file|text>     Verbose analysis with risks + winners
    opportunities <url|text>    Scoring opportunities + MVP focus
    sponsors <url|text>         Sponsor API breakdown
    timeline <url|text>         Timeline and milestone analysis
    strategy <url|text>         Winning strategy generator
    compare <a> <b>             Diff two competitions
    categories list             Benchmark categories
    docs generate               Generate project documentation
    knowledge update/search     Knowledge base operations

  Global Flags:
    --seed <N>           Set deterministic seed (default: 42)
    --json               Output raw JSON
    --quiet              Minimal output
    --verbose            Verbose logging
    --dry-run            Simulate without executing
    --debug              Show full error stack traces

  Examples:
    hag
    hag run https://devpost.com/software/example
    hag setup
    hag memory query "React dashboard"
    hag benchmark list
    hag analyze https://devpost.com/software/example
  `);
}

async function ensureConfig(command: CommandName): Promise<boolean> {
  const needsLLM: CommandName[] = ['run', 'simulate', 'chat', 'explain', 'deploy', 'test', 'models'];
  if (!needsLLM.includes(command)) return true;

  const config = getConfig();
  if (config?.llm.apiKey) return true;

  if (command === 'run') {
    console.log();
    info('No AI provider configured.');
    console.log('  Setting up now...\n');
    const { setupCommand } = await import('./commands/setup.js');
    const result = await setupCommand(createContext(42), {
      command: 'setup' as CommandName,
      subcommand: undefined,
      positional: [],
      flags: {},
    });
    if (!result.success) {
      console.log('\n  Setup cancelled. Run `hag setup` to configure later.\n');
      return false;
    }
    console.log();
    return true;
  }

  return true;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);
  const seed = typeof args.flags.seed === 'number' ? args.flags.seed : 42;
  const ctx = createContext(seed);

  if (args.command === 'help' || args.command === undefined) {
    const rawArgs = process.argv.slice(2);
    const unknownCommand = typeof args.flags.unknownCommand === 'string';
    if (rawArgs.length === 0) {
      // `hag` with no args launches the interactive entry point
      showVersion(getVersion());
      const { runInteractiveEntry } = await import('./interactive.js');
      const result = await runInteractiveEntry(ctx);
      process.exitCode = result.success ? 0 : 1;
      return;
    } else if (unknownCommand) {
      showSimpleHelp();
    } else {
      showDetailedHelp();
    }
    process.exitCode = unknownCommand ? 1 : 0;
    return;
  }

  process.on('SIGINT', () => {
    console.log('\n  Interrupted. Use `hag resume` to continue where you left off.');
    process.exitCode = 130;
    process.exit();
  });
  process.on('SIGTERM', () => {
    console.log('\n  Terminated. Use `hag resume` to continue where you left off.');
    process.exitCode = 143;
    process.exit();
  });
  ctx.outputFormat = args.flags.json === true ? 'json' : args.flags.quiet === true ? 'quiet' : 'pretty';
  ctx.verbose = args.flags.verbose === true;
  ctx.dryRun = args.flags['dry-run'] === true;
  setVerbose(ctx.verbose);

  if (!(await ensureConfig(args.command))) {
    process.exitCode = 1;
    return;
  }

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
      case 'setup': {
        const { setupCommand } = await import('./commands/setup.js');
        result = await setupCommand(ctx, args);
        break;
      }
      case 'doctor': {
        const { doctorCommand } = await import('./commands/doctor.js');
        result = await doctorCommand(ctx, args);
        break;
      }
      case 'models': {
        const { modelsCommand } = await import('./commands/models.js');
        result = await modelsCommand(ctx, args);
        break;
      }
      case 'providers': {
        const { providersCommand } = await import('./commands/providers.js');
        result = await providersCommand(ctx, args);
        break;
      }
      case 'version': {
        const { versionCommand } = await import('./commands/version.js');
        result = await versionCommand(ctx, args);
        break;
      }
      default: {
        // Feature commands: dynamically load from features/commands/<name>.ts.
        // Kept out of the main switch so new capabilities never touch
        // the refactored production pipeline files.
        const name = String(args.command);
        const feature = FEATURE_COMMANDS[name];
        if (feature) {
          try {
            const mod = await feature.mod();
            result = await mod[feature.fn](ctx, args);
            break;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            result = { success: false, message: `Feature command "${name}" failed: ${msg}` };
            break;
          }
        }
        result = { success: false, message: `Unknown command: ${args.command}. Use 'hackagent help'.` };
      }
    }
  } catch (err) {
    const debug = args.flags.debug === true || ctx.verbose;
    if (debug) {
      result = { success: false, message: err instanceof Error ? `Fatal error: ${err.message}` : `Fatal error: ${String(err)}` };
      console.error('  Stack:', err instanceof Error ? err.stack : '');
    } else {
      const suggestion = formatError(err, args.command);
      printError(suggestion);
      result = { success: false, message: suggestion.what };
    }
  }

  result.durationMs = Date.now() - executionTime;


  if (ctx.outputFormat === 'json') {
    console.log(JSON.stringify(result, null, 2));
  } else if (ctx.outputFormat === 'pretty') {
    if (result.success && result.message) {
      logSuccess(result.message);
    } else if (!result.success && result.message) {
      logError(result.message);
    }
    if (result.metrics) {
      const entries = Object.entries(result.metrics);
      if (entries.length > 0) {
        info(`Metrics: ${entries.map(([k, v]) => `${k}=${v}`).join(', ')}`);
      }
    }
    if (result.traceId) {
      dim(`Trace: ${result.traceId}`);
    }
    console.log();
  }

  process.exitCode = result.success ? 0 : 1;

  // We no longer force exit. The process will exit naturally when the event loop is empty.
  // process.exit(process.exitCode);
}

main().catch((err) => {
  const debug = process.argv.includes('--debug');
  if (debug) {
    console.error('Fatal error:', err);
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
  } else {
    const suggestion = formatError(err, 'fatal');
    printError(suggestion);
  }
  process.exitCode = 1;
});
