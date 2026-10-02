import { existsSync } from 'node:fs';
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';

import type { EventEnvelope } from './event-envelope.js';

const LINE_TERMINATOR = '\n';

export interface ReplayOptions {
  eventTypes?: string[];
  since?: string;
  until?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export class JsonlEventStore {
  private readonly baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  private datePath(ts: string): string {
    const date = ts.slice(0, 10);
    return path.join(this.baseDir, `${date}.jsonl`);
  }

  private async ensureFile(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  async append(event: EventEnvelope): Promise<void> {
    if (!event.metadata.persist) return;

    const filePath = this.datePath(event.timestamp);
    await this.ensureFile(filePath);
    const line = JSON.stringify(event) + LINE_TERMINATOR;
    await appendFile(filePath, line, 'utf-8');
  }

  async *replay(options?: ReplayOptions): AsyncGenerator<EventEnvelope> {
    const dir = this.baseDir;
    if (!existsSync(dir)) return;

    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(dir)).filter((f) => f.endsWith('.jsonl')).sort();

    let count = 0;
    const limit = options?.limit ?? Number.POSITIVE_INFINITY;
    const offset = options?.offset ?? 0;
    let skipped = 0;

    for (const file of files) {
      const filePath = path.join(dir, file);
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split(LINE_TERMINATOR).filter((l) => l.length > 0);

      for (const line of lines) {
        let event: EventEnvelope;
        try {
          event = JSON.parse(line) as EventEnvelope;
        } catch {
          continue;
        }

        if (options?.eventTypes && !options.eventTypes.includes(event.type)) continue;
        if (options?.source && event.source !== options.source) continue;
        if (options?.since && event.timestamp < options.since) continue;
        if (options?.until && event.timestamp > options.until) continue;

        if (skipped < offset) {
          skipped++;
          continue;
        }
        if (count >= limit) return;

        count++;
        yield event;
      }
    }
  }
}
