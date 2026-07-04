import type { FailurePatternRecord, CapabilityMutation } from './capability-evolution-engine.js';
import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';
import type { StrategyPlan } from './strategic-planner.js';
import type { UXEvaluationResult } from './ux-evaluation-agent.js';

export interface ProjectSnapshot {
  snapshotId: string;
  projectName: string;
  projectDescription: string;
  strategy: StrategyPlan;
  techStack: string[];
  judgeCriteria: string[];
  constraints: string[];
  uxResults: UXEvaluationResult[];
  deploySuccess: boolean;
  overallScore: number;
  errors: string[];
  failurePatterns: FailurePatternRecord[];
  mutations: CapabilityMutation[];
  startedAt: string;
  completedAt: string;
  tags: string[];
}

export interface WinningPattern {
  patternId: string;
  strategy: string;
  description: string;
  frequency: number;
  count: number;
  avgScore: number;
  commonTraits: string[];
  lastObserved: string;
}

export interface MemoryQueryResult {
  snapshots: ProjectSnapshot[];
  similarity: number;
  extractedPatterns: FailurePatternRecord[];
  extractedWins: WinningPattern[];
}

export class OrganizationalMemoryBank {
  private readonly seed: number;
  private readonly bankId: string;
  private readonly decisionLogger: DecisionLogger;
  private snapshots: ProjectSnapshot[] = [];
  private readonly storageKey = 'hackagent-memory';

  constructor(seed = 42) {
    this.seed = seed;
    this.bankId = 'mem-' + createDeterministicUuid(seed, 0).slice(0, 8);
    this.decisionLogger = new DecisionLogger(seed + 8000);
    this.loadFromStorage();
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }
  getSnapshotCount(): number {
    return this.snapshots.length;
  }
  getAllSnapshots(): ProjectSnapshot[] {
    return [...this.snapshots];
  }

  addProjectSnapshot(snapshot: ProjectSnapshot): void {
    this.snapshots.push(snapshot);
    this.persistToStorage();
    this.decisionLogger.log(
      'planner',
      'store_snapshot',
      `Stored project "${snapshot.projectName}" (score: ${snapshot.overallScore})`,
      0.9,
      [],
      { snapshotId: snapshot.snapshotId, projectName: snapshot.projectName, overallScore: snapshot.overallScore },
    );
  }

  querySimilarProjects(context: string, maxResults = 3): MemoryQueryResult {
    const rng = getSeededRandom(this.seed + context.length);
    const keywords = context
      .toLowerCase()
      .split(/[\s,;.:!?]+/)
      .filter((k) => k.length > 3);

    const scored = this.snapshots.map((snap) => {
      const haystack = (
        snap.projectName +
        ' ' +
        snap.projectDescription +
        ' ' +
        snap.strategy.winningStrategy +
        ' ' +
        snap.tags.join(' ')
      ).toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score += 0.15;
      }
      if (snap.techStack.some((t) => context.toLowerCase().includes(t.toLowerCase()))) score += 0.3;
      if (snap.judgeCriteria.some((c) => context.toLowerCase().includes(c.toLowerCase()))) score += 0.2;
      return { snapshot: snap, score: Math.min(1, score + rng.next() * 0.05) };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, maxResults);

    const extractedPatterns: FailurePatternRecord[] = top.flatMap((s) => s.snapshot.failurePatterns);
    const extractedWins = this.computeWinningPatterns(top.map((s) => s.snapshot));

    this.decisionLogger.log(
      'planner',
      'query_memory',
      `Found ${top.length} similar projects for context (${keywords.length} keywords)`,
      top.length > 0 ? 0.8 : 0.3,
      [],
      { keywordCount: keywords.length, matches: top.length },
    );

    return {
      snapshots: top.map((s) => s.snapshot),
      similarity: top.length > 0 ? top[0]!.score : 0,
      extractedPatterns: extractedPatterns.slice(0, 5),
      extractedWins: extractedWins.slice(0, 3),
    };
  }

  getFailurePatterns(): FailurePatternRecord[] {
    const patternMap = new Map<string, FailurePatternRecord>();
    for (const snap of this.snapshots) {
      for (const p of snap.failurePatterns) {
        const existing = patternMap.get(p.description);
        if (existing) {
          existing.frequency += p.frequency;
          existing.lastOccurrence = p.lastOccurrence;
        } else {
          patternMap.set(p.description, { ...p });
        }
      }
    }
    return Array.from(patternMap.values()).sort((a, b) => b.frequency - a.frequency);
  }

  getWinningPatterns(): WinningPattern[] {
    return this.computeWinningPatterns(this.snapshots);
  }

  private computeWinningPatterns(snapshots: ProjectSnapshot[]): WinningPattern[] {
    const winMap = new Map<string, { count: number; totalScore: number; traits: Set<string>; lastSeen: string }>();

    for (const snap of snapshots) {
      if (snap.overallScore < 0.5) continue;
      const desc = `Score > 0.5 with stack: ${snap.techStack.join(', ')}`;
      const entry = winMap.get(desc) ?? { count: 0, totalScore: 0, traits: new Set(), lastSeen: '' };
      entry.count++;
      entry.totalScore += snap.overallScore;
      snap.techStack.forEach((t) => entry.traits.add(t));
      entry.lastSeen = snap.completedAt > entry.lastSeen ? snap.completedAt : entry.lastSeen;
      winMap.set(desc, entry);
    }

    return Array.from(winMap.entries())
      .map(([desc, data]) => ({
        patternId: 'wp-' + createDeterministicUuid(this.seed, desc.length).slice(0, 6),
        strategy: desc,
        description: desc,
        frequency: data.count,
        count: data.count,
        avgScore: Math.round((data.totalScore / data.count) * 100) / 100,
        commonTraits: Array.from(data.traits),
        lastObserved: data.lastSeen,
      }))
      .sort((a, b) => b.avgScore - a.avgScore);
  }

  getMemorySummary(): {
    totalProjects: number;
    totalFailures: number;
    totalWins: number;
    topTechnologies: string[];
    averageScore: number;
  } {
    const techSet = new Set<string>();
    let totalScore = 0;
    let totalFailures = 0;
    for (const snap of this.snapshots) {
      snap.techStack.forEach((t) => techSet.add(t));
      totalScore += snap.overallScore;
      totalFailures += snap.errors.length;
    }
    return {
      totalProjects: this.snapshots.length,
      totalFailures,
      totalWins: this.snapshots.filter((s) => s.overallScore > 0.6).length,
      topTechnologies: Array.from(techSet).slice(0, 5),
      averageScore: this.snapshots.length > 0 ? Math.round((totalScore / this.snapshots.length) * 100) / 100 : 0,
    };
  }

  private persistToStorage(): void {
    try {
      const data = JSON.stringify({ snapshots: this.snapshots, updatedAt: deterministicNow(this.seed) });
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        (globalThis as any).localStorage.setItem(this.storageKey, data);
      }
    } catch {}
  }

  private loadFromStorage(): void {
    try {
      if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
        const raw = (globalThis as any).localStorage.getItem(this.storageKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed.snapshots)) this.snapshots = parsed.snapshots;
        }
      }
    } catch {}
  }

  toJSON(): Record<string, unknown> {
    return { bankId: this.bankId, snapshots: this.snapshots, snapshotCount: this.snapshots.length };
  }
}
