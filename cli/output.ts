import * as readline from 'node:readline';
import { formatDuration } from './context.js';

const isTTY = process.stdout.isTTY && !process.env.CI;

// Verbose mode reveals internal details (provider routing, retry logic,
// fallback chains, HTTP payloads, model names, timings, stack traces).
// It is only enabled via the `--verbose` flag and never leaks into normal mode.
let verboseMode = false;

export function setVerbose(enabled: boolean): void {
  verboseMode = enabled;
}

export function isVerbose(): boolean {
  return verboseMode;
}

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

export function showVersion(version: string): void {
  console.log(`  ${color('Hack-A-Gent', 'cyan')} ${color('v' + version, 'gray')}`);
  console.log(`  ${color('Paste a hackathon link. I\'ll handle the rest.', 'gray')}`);
  console.log();
}

export const icons = {
  success: '\u2713',
  error: '\u2717',
  warning: '\u26A0',
  info: '\u2139',
  arrow: '\u2192',
  bull: '\u2022',
  skip: '\u203E',
  recover: '\u21BB',
};

export function log(message: string): void {
  console.log(`  ${message}`);
}

export function logRaw(message: string): void {
  console.log(message);
}

export function stageStart(label: string): void {
  log(`${color(icons.arrow, 'cyan')} ${label}...`);
}

export function stageDone(label: string, elapsedMs?: number): void {
  const time = elapsedMs !== undefined ? color(formatDuration(elapsedMs), 'gray') : '';
  console.log(`  \r  ${color(icons.success, 'green')} ${label}${time ? ' ' + time : ''}`);
}

export function stageFail(label: string, detail?: string): void {
  const msg = detail ? ` \u2014 ${detail}` : '';
  console.log(`  \r  ${color(icons.error, 'red')} ${label}${msg}`);
}

export function stageSkipped(label: string): void {
  console.log(`  \r  ${color(icons.skip, 'gray')} ${color(label, 'gray')}`);
}

export function stageRecovered(label: string): void {
  console.log(`  \r  ${color(icons.recover, 'yellow')} ${color(label, 'yellow')} ${color('Continuing...', 'gray')}`);
}

export function progressBar(current: number, total: number): string {
  const width = 20;
  const filled = Math.round((current / total) * width);
  const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
  return `${bar} ${Math.round((current / total) * 100)}%`;
}

export function pipelineHeader(title: string): void {
  logRaw('');
  logRaw(`  ${BOLD}${color(title, 'cyan')}${RESET}`);
  logRaw(`  ${color('\u2500'.repeat(Math.min(title.length + 2, 58)), 'gray')}`);
  logRaw('');
}

export function pipelineFooter(): void {
  logRaw(`  ${color('\u2500'.repeat(40), 'gray')}`);
  logRaw('');
}

// ── Output hierarchy ─────────────────────────────────────────────────────────

/** Critical: something the user must fix (red). Always shown. */
export function critical(message: string): void {
  console.log(`  ${color(icons.error, 'red')} ${color(message, 'red')}`);
}

/** Warning: something to be aware of (yellow). Optional detail follows. */
export function warn(message: string, detail?: string): void {
  console.log(`  ${color(icons.warning, 'yellow')} ${color(message, 'yellow')}`);
  if (detail) console.log(`    ${color(detail, 'gray')}`);
}

/** Progress: what's happening now (green check or cyan arrow). Use stageStart/Done/Fail. */

/** Informational: additional context (blue). */
export function info(message: string): void {
  console.log(`  ${color(icons.info, 'blue')} ${color(message, 'blue')}`);
}

// ── Collapsed AI-failure notice ────────────────────────────────────────────────
// AI generation may fail repeatedly (per file-type). We collapse all of those
// into a single, calm, user-facing message instead of a retry chain.

export function aiUnavailable(params: {
  reason: string;
  fallback: string;
  help: string[];
}): void {
  logRaw('');
  warn('AI generation unavailable');
  log(`  Reason: ${params.reason}`);
  log(`  Fallback: ${params.fallback}`);
  log('');
  log('  Need help?');
  for (const h of params.help) {
    log(`    ${color(h, 'cyan')}`);
  }
  logRaw('');
}

// ── GitHub integration disabled notice (shown once) ───────────────────────────

export function githubDisabled(): void {
  info('GitHub integration disabled.');
  log(`  ${color('Repository analysis will use local information only.', 'gray')}`);
}

/**
 * Debug: internal diagnostics. Only printed in verbose mode (`--verbose`)
 * or when stdout is a TTY and verbose is on. Never shown in normal mode.
 */
export function debug(message: string): void {
  if (!verboseMode) return;
  if (!isTTY) {
    console.log(`  ${message}`);
    return;
  }
  console.log(`  ${DIM}${message}${RESET}`);
}

// ── Utility display helpers ──────────────────────────────────────────────────

export function success(message: string): void {
  console.log(`  ${color(icons.success, 'green')} ${message}`);
}

export function error(message: string): void {
  console.log(`  ${color(icons.error, 'red')} ${color(message, 'red')}`);
}

export function dim(message: string): void {
  console.log(`  ${isTTY ? DIM : ''}${message}${isTTY ? RESET : ''}`);
}

export function header(title: string): void {
  logRaw('');
  logRaw(`  ${BOLD}${color(title, 'cyan')}${RESET}`);
  logRaw(`  ${color('\u2500'.repeat(Math.min(stripAnsi(title).length + 2, 56)), 'gray')}`);
  logRaw('');
}

export function labeled(label: string, value: string): void {
  console.log(`  ${color(label + ':', 'cyan')} ${value}`);
}

export function divider(): void {
  console.log(`  ${color('\u2500'.repeat(50), 'gray')}`);
}

/**
 * Prompt the user for input. Returns null if stdin is not a TTY (non-interactive).
 * Readline is cleaned up after a single answer or if the interface closes.
 */
export function ask(question: string): Promise<string | null> {
  if (!isTTY) return Promise.resolve(null);

  return new Promise((resolve) => {
    let resolved = false;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    const cleanup = (): void => {
      rl.close();
      rl.removeAllListeners();
    };

    const finish = (answer: string | null) => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve(answer);
    };

    rl.on('SIGINT', () => finish(null));
    rl.on('close', () => finish(null));

    rl.question(`  ${color('?', 'cyan')} ${question}`, (answer) => {
      finish(answer.trim());
    });
  });
}

// ── Spinner ──────────────────────────────────────────────────────────────────

export class Spinner {
  private frames = isTTY ? ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u280F', '\u280F'] : ['.', '.', '.', '.', '.', '.', '.', '.', '.', '.'];
  private interval: ReturnType<typeof setInterval> | null = null;
  private currentFrame = 0;
  private message = '';
  private disposed = false;

  start(message: string): void {
    if (this.disposed) return;
    this.message = message;
    if (!isTTY) {
      console.log(`  ${message}`);
      return;
    }
    process.stdout.write(`  ${this.frames[0]} ${message}`);
    this.interval = setInterval(() => {
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
      process.stdout.write(`\r  ${this.frames[this.currentFrame]} ${this.message}`);
    }, 120);
    this.interval.unref();
  }

  succeed(message?: string): void {
    this.stop(color(icons.success, 'green'), message);
  }

  fail(message?: string): void {
    this.stop(color(icons.error, 'red'), message);
  }

  /** Dispose the spinner and clear its interval. Safe to call multiple times. */
  dispose(): void {
    this.disposed = true;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
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

// ── Error summary (condensed, actionable) ────────────────────────────────────

export function showErrorSummary(params: {
  phase: string;
  reason: string;
  fallback?: string;
  fix: string;
}): void {
  logRaw('');
  critical(`${params.phase} failed`);
  log(`  Reason: ${params.reason}`);
  if (params.fallback) log(`  Fallback: ${params.fallback}`);
  log(`  Fix: ${params.fix}`);
  logRaw('');
}

// ── Completion screen ────────────────────────────────────────────────────────

export interface CompletionInfo {
  status: 'succeeded' | 'failed' | 'partial';
  project: string;
  duration: string;
  completedSteps?: string[];
  blockedBy?: string[];
  details: Array<{ label: string; value: string }>;
  nextSteps: string[];
}

export function showCompletionScreen(completion: CompletionInfo): void {
  divider();

  if (completion.status === 'succeeded') {
    success(`Project generation complete`);
  } else if (completion.status === 'failed') {
    critical('Project generation incomplete');
  } else {
    info('Project generation completed with issues');
  }

  log('');
  
  if (completion.completedSteps && completion.completedSteps.length > 0) {
    log('Completed');
    for (const step of completion.completedSteps) {
      log(`  ${color(icons.success, 'green')} ${step}`);
    }
    log('');
  }
  
  if (completion.blockedBy && completion.blockedBy.length > 0) {
    log(completion.status === 'succeeded' ? 'Errors / Warnings' : 'Blocked by');
    for (const block of completion.blockedBy) {
      log(`  ${color('\u2022', 'red')} ${block}`);
    }
    log('');
  }

  if (completion.nextSteps.length > 0) {
    log('Next');
    for (const step of completion.nextSteps) {
      log(`  ${step}`);
    }
    log('');
  }

  for (const detail of completion.details) {
    labeled(detail.label, detail.value);
  }
  
  labeled('Duration', completion.duration);
  logRaw('');
}

// ── Risks display ────────────────────────────────────────────────────────────

/** Display risks grouped by severity */
export function showRisks(risks: Array<{
  description: string;
  severity: string;
  category: string;
  mitigation: string;
  resolved: boolean;
}>): void {
  const active = risks.filter(r => !r.resolved);
  if (active.length === 0) return;

  logRaw('');
  log(`  ${color('Active Risks:', 'gray')}`);
  for (const r of active) {
    const sevColor = r.severity === 'critical' ? 'red' : r.severity === 'high' ? 'yellow' : 'gray';
    const icon = r.severity === 'critical' ? icons.warning : icons.bull;
    log(`    ${color(icon, sevColor)} ${color(r.description, sevColor)}`);
    log(`      ${color(icons.arrow, 'cyan')} ${r.mitigation}`);
  }
  logRaw('');
}

// ── Readiness report ─────────────────────────────────────────────────────────

/** Display a submission readiness report */
export function showReadiness(report: {
  ready: boolean;
  checks: Array<{ name: string; passed: boolean; detail: string; severity: string }>;
  blockers: string[];
  warnings: string[];
}): void {
  logRaw('');
  logRaw(`  ${BOLD}${color('Submission Readiness', 'cyan')}${RESET}`);
  logRaw(`  ${color('\u2500'.repeat(40), 'gray')}`);
  logRaw('');
  for (const c of report.checks) {
    const icon = c.passed ? color(icons.success, 'green') : color(icons.error, 'red');
    const sevTag = c.severity === 'required' ? color(' required', 'yellow') : '';
    log(`  ${icon} ${c.name}${sevTag}`);
    log(`    ${c.detail}`);
  }
  if (report.blockers.length > 0) {
    logRaw('');
    log(`  ${color('Blockers:', 'red')}`);
    for (const b of report.blockers) {
      log(`    ${color(icons.warning, 'red')} ${b}`);
    }
  }
  if (report.warnings.length > 0) {
    logRaw('');
    log(`  ${color('Notes:', 'gray')}`);
    for (const w of report.warnings) {
      log(`    ${color(icons.info, 'blue')} ${w}`);
    }
  }
  logRaw('');
  const status = report.ready
    ? color('Ready to submit', 'green')
    : color('Needs work', 'red');
  log(`  ${status}`);
  logRaw('');
}

// ── Execution plan ───────────────────────────────────────────────────────────

/** Display a concise execution plan summary */
export function showPlan(plan: {
  title: string;
  targetPrize: string;
  estimatedTime: string;
  strategy: string[];
  architecture: string;
  features: Array<{ name: string; reason: string }>;
  risks: Array<{ risk: string; mitigation: string }>;
  timeline: string[];
  demoStrategy?: string[];
  submissionStrategy?: string[];
}): void {
  logRaw('');
  logRaw(`  ${BOLD}${color('Execution Plan', 'cyan')}${RESET}`);
  logRaw(`  ${color('\u2500'.repeat(40), 'gray')}`);
  logRaw('');
  labeled('Project', plan.title);
  if (plan.targetPrize) labeled('Target', plan.targetPrize);
  labeled('Est. time', plan.estimatedTime);
  logRaw('');
  log(`  ${color('Strategy:', 'gray')}`);
  for (const s of plan.strategy) {
    log(`    ${color('\u2713', 'green')} ${s}`);
  }
  logRaw('');
  labeled('Architecture', plan.architecture);
  logRaw('');
  log(`  ${color('Features:', 'gray')}`);
  for (const f of plan.features) {
    log(`    ${color('\u2022', 'cyan')} ${f.name}`);
    log(`      ${color(f.reason, 'gray')}`);
  }
  if (plan.risks.length > 0) {
    logRaw('');
    log(`  ${color('Risks:', 'gray')}`);
    for (const r of plan.risks) {
      log(`    ${color('\u26A0', 'yellow')} ${r.risk} ${color('\u2192', 'cyan')} ${r.mitigation}`);
    }
  }
  if (plan.timeline.length > 0) {
    logRaw('');
    log(`  ${color('Timeline:', 'gray')}`);
    for (const t of plan.timeline) {
      log(`    ${color('\u2022', 'gray')} ${t}`);
    }
  }
  if (plan.demoStrategy && plan.demoStrategy.length > 0) {
    logRaw('');
    log(`  ${color('Demo Plan:', 'gray')}`);
    for (const d of plan.demoStrategy) {
      const trimmed = d.trim();
      if (trimmed) {
        log(`    ${trimmed}`);
      } else {
        logRaw('');
      }
    }
  }
  if (plan.submissionStrategy && plan.submissionStrategy.length > 0) {
    logRaw('');
    log(`  ${color('Submission Prep:', 'gray')}`);
    for (const s of plan.submissionStrategy) {
      log(`    ${color('\u2022', 'gray')} ${s}`);
    }
  }
  logRaw('');
}
