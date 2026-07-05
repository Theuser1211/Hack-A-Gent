import { formatDuration } from './context.js';

const isTTY = process.stdout.isTTY && !process.env.CI;

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const COLORS: Record<string, string> = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

export function color(text: string, c: string): string {
  if (!isTTY) return text;
  return `${COLORS[c] ?? ''}${text}${RESET}`;
}

const ANSI_PATTERN = String.fromCharCode(0x1B) + '\\[[0-9;]*m';

function stripAnsi(text: string): string {
  return text.replace(new RegExp(ANSI_PATTERN, 'g'), '');
}

function center(text: string): string {
  const width = process.stdout.columns ?? 80;
  const pad = Math.max(0, Math.floor((width - stripAnsi(text).length) / 2));
  return ' '.repeat(pad) + text;
}

export function showWelcome(version: string): void {
  logRaw('');

  const logoLines = [
    '                           ██╗  ██╗ █████╗  ██████╗',
    '                           ██║  ██║██╔══██╗██╔════╝',
    '                           ███████║███████║██║  ███╗',
    '                           ██╔══██║██╔══██║██║   ██║',
    '                           ██║  ██║██║  ██║╚██████╔╝',
    '                           ╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝',
  ];
  const logoContentWidth = Math.max(...logoLines.map(l => l.trimStart().length));
  const logoPad = Math.max(0, Math.floor(((process.stdout.columns ?? 80) - logoContentWidth) / 2));
  const logoPadStr = ' '.repeat(logoPad);
  logoLines.forEach(line => logRaw(logoPadStr + line.trimStart()));
  logRaw('');

  logRaw(center(color('Hack-A-Gent v' + version, 'cyan')));
  logRaw(center(color('Autonomous Hackathon AI Agent', 'gray')));
  logRaw(center(color('─'.repeat(42), 'gray')));
  logRaw(center(color('Turn Devpost URLs into Working Projects', 'cyan')));

  logRaw('');

  function renderSection(header: string, commands: [string, string][], maxCmdLen: number): void {
    const cmdWidth = maxCmdLen + 6;
    logRaw(center(color(header, 'cyan')));
    for (const [cmd, desc] of commands) {
      const padding = ' '.repeat(Math.max(0, cmdWidth - cmd.length));
      logRaw(center(color(cmd, 'green') + padding + color(desc, 'gray')));
    }
  }

  renderSection('Quick Start', [
    ['hackagent setup', 'Configure your AI provider'],
    ['hackagent run <url>', 'Generate a hackathon project'],
    ['hackagent doctor', 'Verify your environment'],
    ['hackagent chat', 'Interactive AI assistant'],
  ], 18);

  logRaw('');

  renderSection('Useful Commands', [
    ['hackagent providers', 'List available AI providers'],
    ['hackagent models', 'List available models'],
    ['hackagent benchmark list', 'List available benchmarks'],
    ['hackagent config --show', 'Show current configuration'],
  ], 26);

  logRaw('');

  renderSection('Need more help?', [
    ['hackagent --help', 'Show all available commands'],
  ], 17);

  logRaw('');

  logRaw(center(color('GitHub', 'cyan')));
  logRaw(center(color('https://github.com/Theuser1211/Hack-A-Gent', 'gray')));
  logRaw('');
}

export const icons = {
  success: color('✔', 'green'),
  error: color('✘', 'red'),
  warning: color('⚠', 'yellow'),
  info: color('ℹ', 'blue'),
  arrow: color('→', 'cyan'),
  bull: color('•', 'magenta'),
};

export function log(message: string): void {
  console.log(`  ${message}`);
}

export function logRaw(message: string): void {
  console.log(message);
}

export function banner(): void {
  logRaw('');
  logRaw(`  ${BOLD}${color('┌─────────────────────────────────────────────┐', 'cyan')}${RESET}`);
  logRaw(`  ${BOLD}${color('│        Welcome to Hack-A-Gent! 🚀             │', 'cyan')}${RESET}`);
  logRaw(`  ${BOLD}${color('│  Autonomous Hackathon Engineering CLI          │', 'cyan')}${RESET}`);
  logRaw(`  ${BOLD}${color('└─────────────────────────────────────────────┘', 'cyan')}${RESET}`);
  logRaw('');
}

export function stageStart(label: string): void {
  log(`${icons.arrow} ${color(label, 'magenta')}...`);
}

export function stageDone(label: string, elapsedMs?: number): void {
  const time = elapsedMs !== undefined ? color(formatDuration(elapsedMs), 'gray') : '';
  console.log(`  \r  ${icons.success} ${label}${time ? ' ' + time : ''}`);
}

export function stageFail(label: string, detail?: string): void {
  const msg = detail ? ` — ${detail}` : '';
  console.log(`  \r  ${icons.error} ${label}${msg}`);
}

export function progressBar(current: number, total: number): string {
  const width = 20;
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  return `${bar} ${Math.round((current / total) * 100)}%`;
}

export function pipelineHeader(title: string): void {
  logRaw('');
  logRaw(`  ${BOLD}${color('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')}${RESET}`);
  logRaw(`  ${BOLD}${color('  🚀  ' + title, 'cyan')}${RESET}`);
  logRaw(`  ${color('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')}${RESET}`);
  logRaw('');
}

export function pipelineFooter(): void {
  logRaw(`  ${color('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'cyan')}${RESET}`);
  logRaw('');
}

export function success(message: string): void {
  console.log(`  ${icons.success} ${message}`);
}

export function error(message: string): void {
  console.log(`  ${icons.error} ${color(message, 'red')}`);
}

export function warn(message: string): void {
  console.log(`  ${icons.warning} ${color(message, 'yellow')}`);
}

export function info(message: string): void {
  console.log(`  ${icons.info} ${color(message, 'blue')}`);
}

export function dim(message: string): void {
  console.log(`  ${isTTY ? DIM : ''}${message}${isTTY ? RESET : ''}`);
}

export function header(title: string): void {
  logRaw('');
  logRaw(`  ${BOLD}${color(title, 'cyan')}${RESET}`);
  logRaw(`  ${color('─'.repeat(Math.min(stripAnsi(title).length + 2, 56)), 'gray')}`);
  logRaw('');
}

export function labeled(label: string, value: string): void {
  console.log(`  ${color(label + ':', 'cyan')} ${value}`);
}

export function step(description: string): void {
  console.log(`  ${icons.bull} ${color(description, 'gray')}...`);
}

export function divider(): void {
  console.log(`  ${color('-'.repeat(50), 'gray')}`);
}

export class Spinner {
  private frames = isTTY ? ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'] : ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.'];
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentFrame = 0;
  private message = '';

  start(message: string): void {
    this.message = message;
    if (!isTTY) {
      console.log(`  ${message}...`);
      return;
    }
    process.stdout.write(`  ${this.frames[0]} ${message}`);
    this.interval = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      process.stdout.write(`\r  ${this.frames[this.currentFrame]} ${this.message}`);
    }, 80);
  }

  succeed(message?: string): void {
    this.stop(icons.success, message);
  }

  fail(message?: string): void {
    this.stop(icons.error, message);
  }

  private stop(icon: string, message?: string): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    const msg = message ?? this.message;
    if (isTTY) {
      process.stdout.write(`\r  ${icon} ${msg}\n`);
    } else {
      console.log(`  ${icon} ${msg}`);
    }
  }
}
