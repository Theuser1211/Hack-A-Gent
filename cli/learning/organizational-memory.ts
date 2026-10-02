/**
 * Organizational Memory (Part 4).
 *
 * Every completed project teaches Hack-A-Gent something. This module durably
 * records that experience so future runs can reuse what worked and avoid what
 * failed. It complements the `failure-tracker` (which focuses on failure
 * patterns) by capturing the broader set of signals the mission calls for:
 * successful/failed architectures, common bugs, repair strategies, build
 * times, deployment issues, provider/tool performance, and prompt outcomes.
 *
 * Storage is append-only JSONL per category under `<dataDir>/memory/`. Pure
 * filesystem access, no external dependencies.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { createDeterministicUuid, deterministicNow } from '../../benchmarks/determinism-kernel.js';

export interface ArchitectureRecord {
  id: string;
  projectName: string;
  stack: string[];
  deployTarget: string;
  judgeScore: number;
  success: boolean;
  notes: string;
  timestamp: string;
}

export interface BugRecord {
  id: string;
  projectName: string;
  category: string;
  signature: string;
  message: string;
  fix?: string;
  resolved: boolean;
  timestamp: string;
}

export interface RepairStrategyRecord {
  id: string;
  errorSignature: string;
  strategy: string;
  success: boolean;
  timestamp: string;
}

export interface TimingRecord {
  id: string;
  projectName: string;
  phase: string;
  durationMs: number;
  timestamp: string;
}

export interface DeploymentIssueRecord {
  id: string;
  projectName: string;
  issue: string;
  resolved: boolean;
  timestamp: string;
}

export interface ProviderPerformanceRecord {
  id: string;
  provider: string;
  operation: string;
  success: boolean;
  durationMs: number;
  errorMessage?: string;
  timestamp: string;
}

export interface ToolPerformanceRecord {
  id: string;
  tool: string;
  success: boolean;
  durationMs: number;
  timestamp: string;
}

export interface PromptRecord {
  id: string;
  purpose: string;
  outcome: 'success' | 'failure';
  notes: string;
  timestamp: string;
}

type Category =
  | 'architectures'
  | 'bugs'
  | 'repairs'
  | 'timings'
  | 'deployments'
  | 'providers'
  | 'tools'
  | 'prompts';

function memoryDir(dataDir: string): string {
  return path.resolve(dataDir, 'memory');
}

function append(category: Category, dataDir: string, record: unknown): void {
  const dir = memoryDir(dataDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.resolve(dir, `${category}.jsonl`);
  appendFileSync(file, JSON.stringify(record) + '\n', 'utf-8');
}

function readAll<T>(dataDir: string, category: Category): T[] {
  const file = path.resolve(memoryDir(dataDir), `${category}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

let uidCounter = 0;

function uid(_salt: string): string {
  uidCounter += 1;
  return createDeterministicUuid(0, uidCounter).slice(0, 10);
}

function now(): string {
  return new Date(deterministicNow(0)).toISOString();
}

/**
 * The production organizational memory store. Instances are cheap; create one
 * per run and call the `record*` methods as the pipeline progresses.
 */
export class OrganizationalMemory {
  constructor(private readonly dataDir: string) {}

  recordArchitecture(r: Omit<ArchitectureRecord, 'id' | 'timestamp'>): ArchitectureRecord {
    const rec: ArchitectureRecord = { ...r, id: uid(r.projectName), timestamp: now() };
    append('architectures', this.dataDir, rec);
    return rec;
  }

  recordBug(r: Omit<BugRecord, 'id' | 'timestamp'>): BugRecord {
    const rec: BugRecord = { ...r, id: uid(r.signature), timestamp: now() };
    append('bugs', this.dataDir, rec);
    return rec;
  }

  recordRepairStrategy(r: Omit<RepairStrategyRecord, 'id' | 'timestamp'>): RepairStrategyRecord {
    const rec: RepairStrategyRecord = { ...r, id: uid(r.errorSignature), timestamp: now() };
    append('repairs', this.dataDir, rec);
    return rec;
  }

  recordTiming(r: Omit<TimingRecord, 'id' | 'timestamp'>): TimingRecord {
    const rec: TimingRecord = { ...r, id: uid(r.projectName + r.phase), timestamp: now() };
    append('timings', this.dataDir, rec);
    return rec;
  }

  recordDeploymentIssue(r: Omit<DeploymentIssueRecord, 'id' | 'timestamp'>): DeploymentIssueRecord {
    const rec: DeploymentIssueRecord = { ...r, id: uid(r.projectName + r.issue), timestamp: now() };
    append('deployments', this.dataDir, rec);
    return rec;
  }

  recordProviderPerformance(r: Omit<ProviderPerformanceRecord, 'id' | 'timestamp'>): ProviderPerformanceRecord {
    const rec: ProviderPerformanceRecord = { ...r, id: uid(r.provider + r.operation), timestamp: now() };
    append('providers', this.dataDir, rec);
    return rec;
  }

  recordToolPerformance(r: Omit<ToolPerformanceRecord, 'id' | 'timestamp'>): ToolPerformanceRecord {
    const rec: ToolPerformanceRecord = { ...r, id: uid(r.tool), timestamp: now() };
    append('tools', this.dataDir, rec);
    return rec;
  }

  recordPrompt(r: Omit<PromptRecord, 'id' | 'timestamp'>): PromptRecord {
    const rec: PromptRecord = { ...r, id: uid(r.purpose), timestamp: now() };
    append('prompts', this.dataDir, rec);
    return rec;
  }

  // ── Query helpers (cheap, full-scan over JSONL) ──────────────────────────

  successfulArchitectures(): ArchitectureRecord[] {
    return readAll<ArchitectureRecord>(this.dataDir, 'architectures').filter((a) => a.success);
  }

  failedArchitectures(): ArchitectureRecord[] {
    return readAll<ArchitectureRecord>(this.dataDir, 'architectures').filter((a) => !a.success);
  }

  commonBugs(limit = 10): BugRecord[] {
    return readAll<BugRecord>(this.dataDir, 'bugs').slice(-limit);
  }

  repairStrategiesFor(signature: string): RepairStrategyRecord[] {
    return readAll<RepairStrategyRecord>(this.dataDir, 'repairs').filter((r) => r.errorSignature === signature);
  }

  averageBuildTimeMs(): number {
    const timings = readAll<TimingRecord>(this.dataDir, 'timings').filter((t) => t.phase === 'build');
    if (timings.length === 0) return 0;
    return timings.reduce((s, t) => s + t.durationMs, 0) / timings.length;
  }

  providerSuccessRate(provider: string): number {
    const recs = readAll<ProviderPerformanceRecord>(this.dataDir, 'providers').filter((r) => r.provider === provider);
    if (recs.length === 0) return 0;
    return recs.filter((r) => r.success).length / recs.length;
  }

  successfulPrompts(): PromptRecord[] {
    return readAll<PromptRecord>(this.dataDir, 'prompts').filter((p) => p.outcome === 'success');
  }

  failedPrompts(): PromptRecord[] {
    return readAll<PromptRecord>(this.dataDir, 'prompts').filter((p) => p.outcome === 'failure');
  }
}
