import { existsSync } from 'node:fs';
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import * as path from 'node:path';

import type { EventEnvelope } from './event-envelope.js';

export interface DeadLetterEntry {
  event: EventEnvelope;
  failed_at: string;
  reason: string;
  retry_count: number;
}

export class DeadLetterQueue {
  private readonly filePath: string;

  constructor(baseDir: string) {
    this.filePath = path.join(baseDir, 'dead-letter.jsonl');
  }

  private async ensureFile(): Promise<void> {
    const dir = path.dirname(this.filePath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  async send(event: EventEnvelope, reason: string): Promise<void> {
    await this.ensureFile();
    const entry: DeadLetterEntry = {
      event,
      failed_at: new Date().toISOString(),
      reason,
      retry_count: event.metadata.retry_count,
    };
    const line = JSON.stringify(entry) + '\n';
    await appendFile(this.filePath, line, 'utf-8');
  }

  async replay(): Promise<DeadLetterEntry[]> {
    if (!existsSync(this.filePath)) return [];
    const content = await readFile(this.filePath, 'utf-8');
    return content
      .split('\n')
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as DeadLetterEntry);
  }

  async count(): Promise<number> {
    const entries = await this.replay();
    return entries.length;
  }
}
