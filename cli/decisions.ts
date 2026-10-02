/**
 * Autonomous Decision system (Part 2).
 *
 * Every non-trivial engineering choice an agent makes is recorded here with
 * its reasoning, alternatives considered, confidence, expected impact, and
 * tradeoffs. Decisions are persisted durably (append-only JSONL) so future
 * runs can audit and learn from them.
 *
 * This is a pure, dependency-light module: it only touches the filesystem and
 * the determinism kernel for stable ids.
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import { createDeterministicUuid, deterministicNow } from '../benchmarks/determinism-kernel.js';

export type DecisionCategory =
  | 'architecture'
  | 'tech_stack'
  | 'sponsor_api'
  | 'deployment'
  | 'repair'
  | 'retry'
  | 'generation'
  | 'validation'
  | 'strategy';

export interface Decision {
  id: string;
  runId: string;
  category: DecisionCategory;
  /** The question the agent faced, e.g. "Should we use React?". */
  question: string;
  /** The chosen answer. */
  choice: string;
  /** Why this choice was made. */
  reasoning: string;
  /** Other options the agent considered. */
  alternatives: string[];
  /** 0..1 confidence in the choice. */
  confidence: number;
  /** Human-readable expected impact, e.g. "+15 judge points on UX". */
  expectedImpact: string;
  /** Tradeoffs accepted by choosing this option. */
  tradeoffs: string;
  agentId: string;
  timestamp: string;
}

function decisionsDir(dataDir: string): string {
  return path.resolve(dataDir, 'decisions');
}

export function persistDecision(dataDir: string, decision: Decision): void {
  const dir = decisionsDir(dataDir);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const file = path.resolve(dir, `${decision.runId}.jsonl`);
  appendFileSync(file, JSON.stringify(decision) + '\n', 'utf-8');
}

export function loadDecisions(dataDir: string, runId: string): Decision[] {
  const file = path.resolve(decisionsDir(dataDir), `${runId}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as Decision);
}

/** Append-only store scoped to a single run. */
export class DecisionStore {
  private readonly dataDir: string;
  private readonly runId: string;
  private buffer: Decision[] = [];

  constructor(dataDir: string, runId: string) {
    this.dataDir = dataDir;
    this.runId = runId;
  }

  /** Record a decision. Returns the persisted decision (with id + timestamp). */
  record(params: {
    category: DecisionCategory;
    question: string;
    choice: string;
    reasoning: string;
    alternatives?: string[];
    confidence?: number;
    expectedImpact?: string;
    tradeoffs?: string;
    agentId?: string;
  }): Decision {
    const decision: Decision = {
      id: 'dec-' + createDeterministicUuid(this.runId.length, this.buffer.length + 1).slice(0, 10),
      runId: this.runId,
      category: params.category,
      question: params.question,
      choice: params.choice,
      reasoning: params.reasoning,
      alternatives: params.alternatives ?? [],
      confidence: params.confidence ?? 0.5,
      expectedImpact: params.expectedImpact ?? '',
      tradeoffs: params.tradeoffs ?? '',
      agentId: params.agentId ?? 'unknown',
      timestamp: new Date(deterministicNow(0)).toISOString(),
    };
    this.buffer.push(decision);
    persistDecision(this.dataDir, decision);
    return decision;
  }

  all(): readonly Decision[] {
    return this.buffer;
  }
}
