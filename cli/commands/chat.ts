import * as readline from 'node:readline';

import type { CLIContext, CLIArgs, CLIResult, CommandName } from '../types.js';
import { log, dim } from '../output.js';

const VALID_COMMANDS: CommandName[] = [
  'run', 'status', 'memory', 'deploy', 'test', 'explain', 'health',
  'config', 'benchmark', 'replay', 'resume', 'simulate', 'doctor',
  'models', 'providers', 'version', 'setup',
];

async function dispatchCommand(ctx: CLIContext, chatArgs: CLIArgs): Promise<CLIResult> {
  switch (chatArgs.command) {
    case 'run': {
      const { runCommand } = await import('./run.js');
      return await runCommand(ctx, chatArgs);
    }
    case 'status': {
      const { statusCommand } = await import('./status.js');
      return await statusCommand(ctx, chatArgs);
    }
    case 'memory': {
      const { memoryCommand } = await import('./memory.js');
      return await memoryCommand(ctx, chatArgs);
    }
    case 'deploy': {
      const { deployCommand } = await import('./deploy.js');
      return await deployCommand(ctx, chatArgs);
    }
    case 'test': {
      const { testCommand } = await import('./test.js');
      return await testCommand(ctx, chatArgs);
    }
    case 'explain': {
      const { explainCommand } = await import('./explain.js');
      return await explainCommand(ctx, chatArgs);
    }
    case 'health': {
      const { healthCommand } = await import('./health.js');
      return await healthCommand(ctx, chatArgs);
    }
    case 'benchmark': {
      const { benchmarkCommand } = await import('./benchmark.js');
      return await benchmarkCommand(ctx, chatArgs);
    }
    case 'replay': {
      const { replayCommand } = await import('./replay.js');
      return await replayCommand(ctx, chatArgs);
    }
    case 'resume': {
      const { resumeCommand } = await import('./resume.js');
      return await resumeCommand(ctx, chatArgs);
    }
    case 'simulate': {
      const { simulateCommand } = await import('./simulate.js');
      return await simulateCommand(ctx, chatArgs);
    }
    case 'doctor': {
      const { doctorCommand } = await import('./doctor.js');
      return await doctorCommand(ctx, chatArgs);
    }
    case 'models': {
      const { modelsCommand } = await import('./models.js');
      return await modelsCommand(ctx, chatArgs);
    }
    case 'providers': {
      const { providersCommand } = await import('./providers.js');
      return await providersCommand(ctx, chatArgs);
    }
    case 'version': {
      const { versionCommand } = await import('./version.js');
      return await versionCommand(ctx, chatArgs);
    }
    case 'config': {
      const { configCommand } = await import('./config.js');
      return await configCommand(ctx, chatArgs);
    }
    case 'setup': {
      const { setupCommand } = await import('./setup.js');
      return await setupCommand(ctx, chatArgs);
    }
    default:
      return { success: false, message: `Unknown command: ${chatArgs.command}` };
  }
}

export async function chatCommand(ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
  log('Hack-A-Gent Interactive Mode');
  dim('='.repeat(50));
  log(`Commands: run <input> | status | memory query <text> | memory stats`);
  log(`          deploy <id> | test <id> --url <url> | explain <id>`);
  log(`          health | exit | help`);
  dim('='.repeat(50));
  log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'hackagent> ',
  });

  rl.prompt();

  return new Promise((resolve) => {
    rl.on('line', async (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) {
        rl.prompt();
        return;
      }

      if (trimmed === 'exit' || trimmed === 'quit') {
        log('Goodbye.');
        rl.close();
        resolve({ success: true, message: 'Interactive session ended' });
        return;
      }

      if (trimmed === 'help') {
        log('Available commands:');
        log('  run <input>        \u2014 Run full pipeline (Devpost URL, file, or description)');
        log('  status             \u2014 Show current project status');
        log('  memory query <txt> \u2014 Search organizational memory');
        log('  memory stats       \u2014 Show memory statistics');
        log('  deploy <id>        \u2014 Deploy a project');
        log('  test <id> --url     \u2014 Run browser tests');
        log('  explain <id>       \u2014 Debug/explain analysis');
        log('  health             \u2014 System health check');
        log('  exit               \u2014 Exit interactive mode');
        log('');
        log('Tip: Just type a description like "Build a weather app" to run directly.');
        rl.prompt();
        return;
      }

      const parts = trimmed.split(/\s+/);
      const firstWord = parts[0] as CommandName;

      if (VALID_COMMANDS.includes(firstWord)) {
        const chatArgs: CLIArgs = {
          command: firstWord,
          subcommand: parts[1] === 'query' || parts[1] === 'stats' || parts[1] === 'clear' ? parts[1] : undefined,
          positional: parts.slice(1),
          flags: {},
        };
        try {
          const result = await dispatchCommand(ctx, chatArgs);
          log(`\u2192 ${result.success ? 'OK' : 'FAIL'}: ${result.message.slice(0, 100)}`);
        } catch (err) {
          log(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        const chatArgs: CLIArgs = {
          command: 'run' as CommandName,
          subcommand: undefined,
          positional: [trimmed],
          flags: {},
        };
        try {
          log(`Running: "${trimmed.slice(0, 80)}"`);
          const result = await dispatchCommand(ctx, chatArgs);
          log(`\u2192 ${result.success ? 'OK' : 'FAIL'}: ${result.message.slice(0, 100)}`);
        } catch (err) {
          log(`Error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      rl.prompt();
    });

    rl.on('close', () => {
      resolve({ success: true, message: 'Interactive session ended' });
    });
  });
}