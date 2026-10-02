export interface StageRecord {
  name: string;
  startMs: number;
  endMs?: number;
  durationMs?: number;
  status: string;
}

export class PipelineTimer {
  stages = new Map<string, StageRecord>();
  order: string[] = [];
  t0: number;

  constructor() {
    this.t0 = Date.now();
  }

  start(name: string): void {
    if (!this.stages.has(name)) {
      this.order.push(name);
    }
    this.stages.set(name, { name, startMs: Date.now(), status: 'running' });
  }

  end(name: string, status = 'completed'): void {
    const s = this.stages.get(name);
    if (s) {
      s.endMs = Date.now();
      s.durationMs = s.endMs - s.startMs;
      s.status = status;
    }
  }

  getDuration(name: string): number | undefined {
    return this.stages.get(name)?.durationMs;
  }

  getStatus(name: string): string | undefined {
    return this.stages.get(name)?.status;
  }

  getOrder(): string[] {
    return [...this.order];
  }

  getTotalMs(): number {
    return Date.now() - this.t0;
  }

  format(): string {
    const lines: string[] = [];
    let total = 0;
    for (const name of this.order) {
      const s = this.stages.get(name);
      if (!s || s.durationMs === undefined) continue;
      total += s.durationMs;
      const timeStr = formatStageTime(s.durationMs);
      const icon = s.status === 'completed' ? '\u2713' : s.status === 'failed' ? '\u2717' : '\u25CB';
      lines.push(`  ${icon} ${name.padEnd(20)} ${timeStr}`);
    }
    lines.push(`  ${'\u2500'.repeat(30)}`);
    lines.push(`  Total              ${formatStageTime(total)}`);
    return lines.join('\n');
  }
}

function formatStageTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const secs = ms / 1000;
  if (secs < 60) return `${secs.toFixed(1)}s`;
  const mins = Math.floor(secs / 60);
  const remainSecs = secs - mins * 60;
  return `${mins}m${remainSecs.toFixed(0)}s`;
}
