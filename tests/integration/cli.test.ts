import { describe, it, expect } from 'vitest';

import { createContext, formatDuration } from '../../cli/context.js';
import type { CLIArgs, CLIResult, CommandName } from '../../cli/types.js';

describe('CLI Context', () => {
  it('creates context with default seed', () => {
    const ctx = createContext();
    expect(ctx.seed).toBe(42);
    expect(ctx.workspaceRoot).toBeTruthy();
    expect(ctx.memory).toBeTruthy();
    expect(ctx.startTime).toBeGreaterThan(0);
  });

  it('creates context with custom seed', () => {
    const ctx = createContext(123);
    expect(ctx.seed).toBe(123);
  });

  it('formats duration correctly', () => {
    expect(formatDuration(500)).toBe('0.500s');
    expect(formatDuration(1500)).toBe('1.500s');
    expect(formatDuration(65000)).toBe('1m 5s');
    expect(formatDuration(3665000)).toBe('1h 1m 5s');
  });
});

describe('Command Parsing', () => {
  it('parses help command', () => {
    const result = parseArgs(['hackagent', 'help']);
    expect(result.command).toBe('help');
  });

  it('parses run with URL', () => {
    const result = parseArgs(['hackagent', 'run', 'https://devpost.com/software/test']);
    expect(result.command).toBe('run');
    expect(result.positional[0]).toBe('https://devpost.com/software/test');
  });

  it('parses run with flags', () => {
    const result = parseArgs(['hackagent', 'run', 'test-spec', '--seed', '42', '--dry-run']);
    expect(result.command).toBe('run');
    expect(result.positional[0]).toBe('test-spec');
    expect(result.flags.seed).toBe(42);
    expect(result.flags['dry-run']).toBe(true);
  });

  it('parses memory query', () => {
    const result = parseArgs(['hackagent', 'memory', 'query', 'React dashboard']);
    expect(result.command).toBe('memory');
    expect(result.subcommand).toBe('query');
    expect(result.positional).toContain('React dashboard');
  });

  it('parses memory stats', () => {
    const result = parseArgs(['hackagent', 'memory', 'stats']);
    expect(result.command).toBe('memory');
    expect(result.subcommand).toBe('stats');
  });

  it('parses benchmark with flags', () => {
    const result = parseArgs(['hackagent', 'benchmark', 'run', '--adversarial', '--mutation-level=0.5']);
    expect(result.command).toBe('benchmark');
    expect(result.subcommand).toBe('run');
    expect(result.flags.adversarial).toBe(true);
    expect(result.flags['mutation-level']).toBe(0.5);
  });

  it('parses resume command', () => {
    const result = parseArgs(['hackagent', 'resume', 'my-project-42']);
    expect(result.command).toBe('resume');
    expect(result.positional[0]).toBe('my-project-42');
  });

  it('parses deploy command', () => {
    const result = parseArgs(['hackagent', 'deploy', 'project-123']);
    expect(result.command).toBe('deploy');
    expect(result.positional[0]).toBe('project-123');
  });

  it('parses test with URL flag', () => {
    const result = parseArgs(['hackagent', 'test', 'proj-1', '--url', 'https://example.com']);
    expect(result.command).toBe('test');
    expect(result.positional[0]).toBe('proj-1');
    expect(result.flags.url).toBe('https://example.com');
  });

  it('parses explain without args', () => {
    const result = parseArgs(['hackagent', 'explain']);
    expect(result.command).toBe('explain');
  });

  it('parses health command', () => {
    const result = parseArgs(['hackagent', 'health']);
    expect(result.command).toBe('health');
  });

  it('parses chat command', () => {
    const result = parseArgs(['hackagent', 'chat']);
    expect(result.command).toBe('chat');
  });

  it('defaults to help for unknown command', () => {
    const result = parseArgs(['hackagent', 'unknown-cmd']);
    expect(result.command).toBe('help');
  });

  it('parses --json flag', () => {
    const result = parseArgs(['hackagent', 'health', '--json']);
    expect(result.command).toBe('health');
    expect(result.flags.json).toBe(true);
  });
});

describe('Memory Command', () => {
  it('memory stats returns summary', async () => {
    const ctx = createContext(42);
    const { memoryCommand } = await import('../../cli/commands/memory.js');

    const result = await memoryCommand(ctx, {
      command: 'memory',
      subcommand: 'stats',
      positional: [],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('memory query returns results', async () => {
    const ctx = createContext(42);
    ctx.memory.addProjectSnapshot({
      snapshotId: 'test-1',
      projectName: 'Test App',
      projectDescription: 'A test app',
      strategy: {
        id: 's1',
        projectName: 'test',
        winningStrategy: 'MVP',
        mvpScope: [],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.7,
        recommendedTimeAllocation: {},
        createdAt: 'now',
      },
      techStack: ['React', 'Node'],
      judgeCriteria: ['Impact'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      overallScore: 0.85,
      errors: [],
      failurePatterns: [],
      mutations: [],
      startedAt: 'now',
      completedAt: 'now',
      tags: ['test'],
    });

    const { memoryCommand } = await import('../../cli/commands/memory.js');
    const result = await memoryCommand(ctx, {
      command: 'memory',
      subcommand: 'query',
      positional: ['Test App'],
      flags: {},
    });

    expect(result.success).toBe(true);
  });
});

describe('Health Command', () => {
  it('returns system health', async () => {
    const ctx = createContext(42);
    const { healthCommand } = await import('../../cli/commands/health.js');

    const result = await healthCommand(ctx, {
      command: 'health',
      subcommand: undefined,
      positional: [],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(result.metrics).toBeDefined();
    expect(result.data).toBeDefined();
  });
});

describe('Explain Command', () => {
  it('returns explain info for active session', async () => {
    const ctx = createContext(42);
    const { Phase12Orchestrator } = await import('../../benchmarks/phase-12-orchestrator.js');
    const orch = new Phase12Orchestrator(42);
    ctx.phase12orchestrator = orch;

    const { explainCommand } = await import('../../cli/commands/explain.js');
    const result = await explainCommand(ctx, {
      command: 'explain',
      subcommand: undefined,
      positional: [],
      flags: {},
    });

    expect(result.success).toBe(true);
  });
});

describe('Benchmark Command', () => {
  it('lists available benchmarks', async () => {
    const ctx = createContext(42);
    const { benchmarkCommand } = await import('../../cli/commands/benchmark.js');

    const result = await benchmarkCommand(ctx, {
      command: 'benchmark',
      subcommand: 'list',
      positional: [],
      flags: {},
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('dispatches real subcommand without positional off-by-one (regression)', async () => {
    const ctx = createContext(42);
    const { benchmarkCommand } = await import('../../cli/commands/benchmark.js');

    // `real list` previously failed because the handler read positional[0]
    // ('real') instead of the normalized rest[0]. This reproduces that path.
    const result = await benchmarkCommand(ctx, {
      command: 'benchmark',
      subcommand: undefined,
      positional: ['real', 'list'],
      flags: {},
    });

    expect(result.success).toBe(true);
  });

  it('reports usage error for unknown real subcommand', async () => {
    const ctx = createContext(42);
    const { benchmarkCommand } = await import('../../cli/commands/benchmark.js');

    const result = await benchmarkCommand(ctx, {
      command: 'benchmark',
      subcommand: undefined,
      positional: ['real', 'bogus'],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage');
  });
});

describe('Deploy Command - validation', () => {
  it('rejects deploy without projectId', async () => {
    const ctx = createContext(42);
    const { deployCommand } = await import('../../cli/commands/deploy.js');

    const result = await deployCommand(ctx, {
      command: 'deploy',
      subcommand: undefined,
      positional: [],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage');
  });
});

describe('Test Command - validation', () => {
  it('rejects test without projectId', async () => {
    const ctx = createContext(42);
    const { testCommand } = await import('../../cli/commands/test.js');

    const result = await testCommand(ctx, {
      command: 'test',
      subcommand: undefined,
      positional: [],
      flags: {},
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Usage');
  });
});

function parseArgs(argv: string[]): CLIArgs {
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
  ];

  const args = argv.slice(1);
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
      if (typeof value === 'string' && /^\d+(\.\d+)?$/.test(value) && !isNaN(Number(value))) {
        value = Number(value);
      }
      flags[key] = value;
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
