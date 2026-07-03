import * as readline from 'node:readline';

import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';
import { log, dim } from '../output.js';

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
    rl.on('line', async (line) => {
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
        log('  run <input>        \u2014 Run full pipeline');
        log('  status             \u2014 Show current project status');
        log('  memory query <txt> \u2014 Search organizational memory');
        log('  memory stats       \u2014 Show memory statistics');
        log('  deploy <id>        \u2014 Deploy a project');
        log('  test <id> --url    \u2014 Run browser tests');
        log('  explain <id>       \u2014 Debug/explain analysis');
        log('  health             \u2014 System health check');
        log('  exit               \u2014 Exit interactive mode');
        rl.prompt();
        return;
      }

      const parts = trimmed.split(/\s+/);
      const chatArgs: CLIArgs = {
        command: parts[0] as unknown,
        subcommand: parts[1] === 'query' || parts[1] === 'stats' || parts[1] === 'clear' ? parts[1] : undefined,
        positional: parts.slice(1),
        flags: {},
      };

      try {
        const { runCommand } = await import('./run.js');
        const { statusCommand } = await import('./status.js');
        const { memoryCommand } = await import('./memory.js');
        const { deployCommand } = await import('./deploy.js');
        const { testCommand } = await import('./test.js');
        const { explainCommand } = await import('./explain.js');
        const { healthCommand } = await import('./health.js');

        let result: CLIResult;
        switch (chatArgs.command) {
          case 'run':
            result = await runCommand(ctx, chatArgs);
            break;
          case 'status':
            result = await statusCommand(ctx, chatArgs);
            break;
          case 'memory':
            result = await memoryCommand(ctx, chatArgs);
            break;
          case 'deploy':
            result = await deployCommand(ctx, chatArgs);
            break;
          case 'test':
            result = await testCommand(ctx, chatArgs);
            break;
          case 'explain':
            result = await explainCommand(ctx, chatArgs);
            break;
          case 'health':
            result = await healthCommand(ctx, chatArgs);
            break;
          default:
            log(`Unknown command: ${chatArgs.command}. Type 'help' for available commands.`);
            rl.prompt();
            return;
        }

        log(`\u2192 ${result.success ? 'OK' : 'FAIL'}: ${result.message.slice(0, 100)}`);
      } catch (err) {
        log(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }

      rl.prompt();
    }).on('close', () => {
      resolve({ success: true, message: 'Interactive session ended' });
    });
  });
}
