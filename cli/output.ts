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

function color(text: string, c: string): string {
  if (!isTTY) return text;
  return `${COLORS[c] ?? ''}${text}${RESET}`;
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
  console.log();
  console.log(`  ${BOLD}${title}${RESET}`);
  console.log(`  ${'='.repeat(Math.min(title.length, 50))}`);
  console.log();
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
