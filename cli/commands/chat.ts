import * as readline from 'node:readline';

import { createDeterministicUuid } from '../../benchmarks/determinism-kernel.js';
import type { CLIContext, CLIArgs, CLIResult } from '../types.js';

export async function chatCommand(ctx: CLIContext, _args: CLIArgs): Promise<CLIResult> {
  console.log(`\n  Hack-A-Gent Interactive Mode`);
  console.log(`  ${'='.repeat(50)}`);
  console.log(`  Commands: run <input> | status | memory query <text> | memory stats`);
  console.log(`            deploy <id> | test <id> --url <url> | explain <id>`);
  console.log(`            health | exit | help`);
  console.log(`  ${'='.repeat(50)}\n`);

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
        console.log('Goodbye.');
        rl.close();
        resolve({ success: true, message: 'Interactive session ended' });
        return;
      }

      if (trimmed === 'help') {
        console.log('  Available commands:');
        console.log('    run <input>        — Run full pipeline');
        console.log('    status             — Show current project status');
        console.log('    memory query <txt> — Search organizational memory');
        console.log('    memory stats       — Show memory statistics');
        console.log('    deploy <id>        — Deploy a project');
        console.log('    test <id> --url    — Run browser tests');
        console.log('    explain <id>       — Debug/explain analysis');
        console.log('    health             — System health check');
        console.log('    exit               — Exit interactive mode');
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
            console.log(`  Unknown command: ${chatArgs.command}. Type 'help' for available commands.`);
            rl.prompt();
            return;
        }

        console.log(`  → ${result.success ? 'OK' : 'FAIL'}: ${result.message.slice(0, 100)}`);
      } catch (err) {
        console.log(`  Error: ${err instanceof Error ? err.message : String(err)}`);
      }

      rl.prompt();
    }).on('close', () => {
      resolve({ success: true, message: 'Interactive session ended' });
    });
  });
}
