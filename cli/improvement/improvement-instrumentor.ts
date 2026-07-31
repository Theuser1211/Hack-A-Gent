import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { log, dim } from '../output.js';
import { formatDuration } from '../context.js';

export interface IterationRecord {
  iteration: number;
  subStages: Array<{ name: string; durationMs: number; status: string }>;
  scoreBefore: number;
  scoreAfter: number;
  decision: string;
  reason: string;
}

export interface ImprovementSummary {
  iterations: IterationRecord[];
  totalDurationMs: number;
  startTime: number;
  initialScore: number;
  finalScore: number;
  reason: string;
}

export class ImprovementInstrumentor {
  iterations: IterationRecord[] = [];
  currentIter: IterationRecord | null = null;
  currentStageStart = 0;
  t0 = Date.now();
  totalBudgetMs: number;
  iterBudgetMs: number;

  constructor(totalBudgetMs = 720_000, iterBudgetMs = 180_000) {
    this.totalBudgetMs = totalBudgetMs;
    this.iterBudgetMs = iterBudgetMs;
  }

  startIteration(iteration: number, scoreBefore: number): void {
    this.currentIter = {
      iteration,
      subStages: [],
      scoreBefore,
      scoreAfter: scoreBefore,
      decision: 'continue',
      reason: '',
    };
  }

  startSubStage(name: string): void {
    this.currentStageStart = Date.now();
    this.currentIter!.subStages.push({ name, durationMs: 0, status: 'running' });
    process.stdout.write(`${name}........`);
  }

  endSubStage(status = 'completed'): void {
    const dur = Date.now() - this.currentStageStart;
    const sub = this.currentIter!.subStages[this.currentIter!.subStages.length - 1]!;
    sub.durationMs = dur;
    sub.status = status;
    process.stdout.write(`\r${sub.name.padEnd(25)} ${formatDuration(dur)}\n`);
  }

  skipSubStage(name: string): void {
    this.currentIter!.subStages.push({ name, durationMs: 0, status: 'skipped' });
    process.stdout.write(`${name.padEnd(25)} skipped\n`);
  }

  endIteration(scoreAfter: number, decision: string, reason: string): void {
    if (this.currentIter) {
      this.currentIter.scoreAfter = scoreAfter;
      this.currentIter.decision = decision;
      this.currentIter.reason = reason;
      this.iterations.push(this.currentIter);
      this.currentIter = null;
    }
  }

  get elapsedMs(): number {
    return Date.now() - this.t0;
  }

  get remainingMs(): number {
    return Math.max(0, this.totalBudgetMs - this.elapsedMs);
  }

  get iterElapsedMs(): number {
    return this.currentIter
      ? this.currentIter.subStages.reduce((s, ss) => s + ss.durationMs, 0) + (Date.now() - this.currentStageStart)
      : 0;
  }

  get iterRemainingMs(): number {
    return Math.max(0, this.iterBudgetMs - this.iterElapsedMs);
  }

  get ranOutOfTime(): boolean {
    return this.remainingMs <= 0;
  }

  get iterRanOutOfTime(): boolean {
    return this.iterRemainingMs <= 0;
  }

  shouldStop(scoreDelta: number, iteration: number): 'converged' | 'max_iterations' | 'continue' {
    if (this.ranOutOfTime) return 'converged';
    if (this.iterRanOutOfTime) return 'converged';
    if (iteration >= 2) return 'max_iterations';
    if (scoreDelta <= 0 && iteration > 0) return 'converged';
    return 'continue';
  }

  elapsedSince(start: number): number {
    return Date.now() - start;
  }

  buildSummary(initialScore: number, finalScore: number, reason: string): ImprovementSummary {
    return {
      iterations: this.iterations,
      totalDurationMs: this.elapsedMs,
      startTime: this.t0,
      initialScore,
      finalScore,
      reason,
    };
  }
}

export function computeProjectHash(projectDir: string): string {
  const hash = createHash('sha256');
  try {
    const files = collectProjectFiles(projectDir);
    const sorted = files.sort();
    for (const f of sorted) {
      const rel = f.startsWith(projectDir) ? f.slice(projectDir.length) : f;
      try {
        const content = readFileSync(f, 'utf-8');
        hash.update(rel);
        hash.update('\x00');
        hash.update(content);
        hash.update('\x00');
      } catch {
        hash.update(rel);
        hash.update('\x00FAILED\x00');
      }
    }
  } catch {
    hash.update('empty');
  }
  return hash.digest('hex').slice(0, 16);
}

function collectProjectFiles(projectDir: string): string[] {
  const files: string[] = [];
  function walk(dir: string): void {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (entry.isFile()) files.push(full);
      }
    } catch { /* skip */ }
  }
  if (existsSync(projectDir)) walk(projectDir);
  return files;
}

export function generateProjectName(competitionName: string, theme?: string): { slug: string; displayName: string; folderName: string } {
  const prefixes = ['Vision', 'Pulse', 'Med', 'Skill', 'Eco', 'Code', 'Nova', 'Aero', 'Zen', 'Flux', 'Apex', 'Cascade', 'Vertex', 'Orbit', 'Moment'];
  const suffixes = ['Forge', 'AI', 'Lens', 'Sprint', 'Flow', 'Canvas', 'Sync', 'Shift', 'Link', 'Grid', 'Core', 'Edge', 'Spark', 'Wave', 'Hub'];
  let seed = 0;
  const nameStr = competitionName ?? 'hackathon';
  for (let i = 0; i < nameStr.length; i++) seed = ((seed << 5) - seed) + nameStr.charCodeAt(i)!;
  const prefix = prefixes[Math.abs(seed) % prefixes.length]!;
  const suffix = suffixes[Math.abs(seed >> 8) % suffixes.length]!;
  const displayName = `${prefix}${suffix}`;
  const slug = displayName.toLowerCase();
  const folderName = slug;
  return { slug, displayName, folderName };
}

export function printImprovementSummary(summary: ImprovementSummary): void {
  log('');
  dim('── Improvement Summary ──');
  log(`Total: ${formatDuration(summary.totalDurationMs)}  Iterations: ${summary.iterations.length}  Initial: ${summary.initialScore}  Final: ${summary.finalScore}  Change: ${summary.finalScore - summary.initialScore > 0 ? '+' : ''}${summary.finalScore - summary.initialScore}`);
  log(`Stopped: ${summary.reason}`);
}
