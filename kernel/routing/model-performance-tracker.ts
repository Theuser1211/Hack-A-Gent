import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { ModelSpec } from '../llm/llm-types.js';

interface ModelRecord {
  attempts: number;
  successes: number;
  failures: number;
  timeouts: number;
  emaLatencyMs: number;
  consecutiveTimeouts: number;
  demotedUntil: number | null;
  lastAttempt: number | null;
  lastSuccess: number | null;
}

interface PerformanceFile {
  version: 1;
  updatedAt: string;
  models: Record<string, ModelRecord>;
}

const DEMOTION_DURATION_MS = 5 * 60 * 1000;
const SAVE_DEBOUNCE_MS = 1000;
const ALPHA = 0.3;

function perfFilePath(): string {
  const dir = path.join(os.homedir(), '.hackagent');
  return path.join(dir, 'model-performance.json');
}

function createEmptyStore(): PerformanceFile {
  return { version: 1, updatedAt: new Date().toISOString(), models: {} };
}

function loadStore(): PerformanceFile {
  const p = perfFilePath();
  try {
    const raw = readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw) as PerformanceFile;
    if (parsed && parsed.version === 1) {
      if (!parsed.models) parsed.models = {};
      return parsed;
    }
  } catch {
    // file missing, corrupt, or old version — start fresh
  }
  return createEmptyStore();
}

function saveStore(store: PerformanceFile): void {
  store.updatedAt = new Date().toISOString();
  const p = perfFilePath();
  const dir = path.dirname(p);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const tmp = p + '.tmp';
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf-8');
  renameSync(tmp, p);
}

function makeKey(providerId: string, modelId: string): string {
  return `${providerId}::${modelId}`;
}

function ema(prev: number, latest: number): number {
  if (prev <= 0) return latest;
  return ALPHA * latest + (1 - ALPHA) * prev;
}

function isDemoted(r: ModelRecord | undefined): boolean {
  if (!r || r.demotedUntil === null) return false;
  return Date.now() < r.demotedUntil;
}

function hasData(r: ModelRecord | undefined): boolean {
  return r !== undefined && r.attempts > 0;
}

function successRate(r: ModelRecord): number {
  if (r.attempts === 0) return 0;
  return r.successes / r.attempts;
}

export class ModelPerformanceTracker {
  private store: PerformanceFile;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.store = loadStore();
  }

  getRanked(models: ModelSpec[]): ModelSpec[] {
    const scored = models.map((m, idx) => {
      const rec = this.store.models[makeKey(m.provider, m.model_id)];
      return { model: m, index: idx, record: rec };
    });

    scored.sort((a, b) => {
      const aDemoted = isDemoted(a.record);
      const bDemoted = isDemoted(b.record);
      if (aDemoted !== bDemoted) return aDemoted ? 1 : -1;

      const aKnown = hasData(a.record);
      const bKnown = hasData(b.record);
      if (aKnown !== bKnown) return aKnown ? -1 : 1;

      if (aKnown && bKnown) {
        const sa = successRate(a.record!);
        const sb = successRate(b.record!);
        if (sa !== sb) return sb - sa;
        if (a.record!.emaLatencyMs !== b.record!.emaLatencyMs) {
          return a.record!.emaLatencyMs - b.record!.emaLatencyMs;
        }
      }

      return a.index - b.index;
    });

    return scored.map(s => s.model);
  }

  recordSuccess(providerId: string, modelId: string, latencyMs: number): void {
    const key = makeKey(providerId, modelId);
    let rec = this.store.models[key];
    if (!rec) {
      rec = {
        attempts: 0, successes: 0, failures: 0, timeouts: 0,
        emaLatencyMs: 0, consecutiveTimeouts: 0,
        demotedUntil: null, lastAttempt: null, lastSuccess: null,
      };
      this.store.models[key] = rec;
    }
    rec.attempts++;
    rec.successes++;
    rec.emaLatencyMs = ema(rec.emaLatencyMs, latencyMs);
    rec.consecutiveTimeouts = 0;
    rec.demotedUntil = null;
    rec.lastAttempt = Date.now();
    rec.lastSuccess = Date.now();
    this.scheduleSave();
  }

  recordTimeout(providerId: string, modelId: string): void {
    const key = makeKey(providerId, modelId);
    let rec = this.store.models[key];
    if (!rec) {
      rec = {
        attempts: 0, successes: 0, failures: 0, timeouts: 0,
        emaLatencyMs: 0, consecutiveTimeouts: 0,
        demotedUntil: null, lastAttempt: null, lastSuccess: null,
      };
      this.store.models[key] = rec;
    }
    rec.attempts++;
    rec.failures++;
    rec.timeouts++;
    rec.consecutiveTimeouts++;
    if (rec.consecutiveTimeouts >= 2) {
      rec.demotedUntil = Date.now() + DEMOTION_DURATION_MS;
    }
    rec.lastAttempt = Date.now();
    this.scheduleSave();
  }

  recordFailure(providerId: string, modelId: string): void {
    const key = makeKey(providerId, modelId);
    let rec = this.store.models[key];
    if (!rec) {
      rec = {
        attempts: 0, successes: 0, failures: 0, timeouts: 0,
        emaLatencyMs: 0, consecutiveTimeouts: 0,
        demotedUntil: null, lastAttempt: null, lastSuccess: null,
      };
      this.store.models[key] = rec;
    }
    rec.attempts++;
    rec.failures++;
    rec.consecutiveTimeouts = 0;
    rec.lastAttempt = Date.now();
    this.scheduleSave();
  }

  getRecord(providerId: string, modelId: string): ModelRecord | undefined {
    return this.store.models[makeKey(providerId, modelId)];
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      saveStore(this.store);
      this.saveTimer = null;
    }, SAVE_DEBOUNCE_MS);
  }
}
