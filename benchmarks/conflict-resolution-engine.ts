import { AdversarialMetrics } from './adversarial-metrics.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface ConflictResolution {
  resolutionId: string;
  timestamp: string;
  attackerId: string;
  defenderId: string;
  success: boolean;
  netAdversarialImpact: number;
  cost: number;
  costImpactRatio: number;
  priorityRuleApplied: string;
  overlapCount: number;
}

export interface PendingConflict {
  conflictId: string;
  attackerId: string;
  defenderId: string;
  interferenceType: string;
  magnitude: number;
  cost: number;
  timestamp: string;
  priority: number;
}

export class ConflictResolutionEngine {
  private readonly seed: number;
  private readonly rng: ReturnType<typeof getSeededRandom>;
  private readonly metrics: AdversarialMetrics;
  private pendingConflicts: PendingConflict[] = [];
  private resolutions: ConflictResolution[] = [];
  private _counter = 0;

  constructor(seed = 42, metrics = new AdversarialMetrics(seed)) {
    this.seed = seed;
    this.rng = getSeededRandom(this.seed + 52000);
    this.metrics = metrics;
  }

  submitConflict(params: {
    attackerId: string;
    defenderId: string;
    interferenceType: string;
    magnitude: number;
    cost: number;
  }): PendingConflict {
    const conflict: PendingConflict = {
      conflictId: `conflict-${createDeterministicUuid(this.seed, ++this._counter)}`,
      attackerId: params.attackerId,
      defenderId: params.defenderId,
      interferenceType: params.interferenceType,
      magnitude: params.magnitude,
      cost: params.cost,
      timestamp: deterministicNow(this.seed + this._counter),
      priority: this.computePriority(params.interferenceType, params.magnitude),
    };

    this.pendingConflicts.push(conflict);
    return conflict;
  }

  resolveOverlaps(): ConflictResolution[] {
    const sorted = [...this.pendingConflicts].sort((a, b) => b.priority - a.priority);
    const resolved: ConflictResolution[] = [];
    const handledPairs = new Set<string>();

    for (const conflict of sorted) {
      const pairKey = [conflict.attackerId, conflict.defenderId].sort().join('::');
      if (handledPairs.has(pairKey)) continue;
      handledPairs.add(pairKey);

      const overlapping = this.pendingConflicts.filter(
        (c) => c.attackerId === conflict.attackerId && c.defenderId === conflict.defenderId,
      );

      const resolution = this.resolveSingleConflict(overlapping);
      resolved.push(resolution);
    }

    this.pendingConflicts = [];
    this.resolutions.push(...resolved);
    return resolved;
  }

  resolveSingleConflict(overlapping: PendingConflict[]): ConflictResolution {
    const deterministicIndex = overlapping.length > 1 ? this.rng.nextInt(0, overlapping.length - 1) : 0;
    const primary = overlapping[deterministicIndex]!;
    const totalImpact = overlapping.reduce((sum, c) => sum + c.magnitude, 0);
    const totalCost = overlapping.reduce((sum, c) => sum + c.cost, 0);
    const netImpact = totalImpact * (1 + overlapping.length * 0.1);

    const successChance = Math.min(
      1,
      Math.max(0, (primary.magnitude / (primary.magnitude + 1)) * (1 - totalCost / (totalCost + 10))),
    );
    const success = this.rng.next() < successChance;

    const resolution: ConflictResolution = {
      resolutionId: `res-${createDeterministicUuid(this.seed, ++this._counter)}`,
      timestamp: deterministicNow(this.seed + this._counter),
      attackerId: primary.attackerId,
      defenderId: primary.defenderId,
      success,
      netAdversarialImpact: Math.round(netImpact * 100) / 100,
      cost: totalCost,
      costImpactRatio: totalCost > 0 ? Math.round((netImpact / totalCost) * 100) / 100 : 0,
      priorityRuleApplied: 'highest_priority_first',
      overlapCount: overlapping.length,
    };

    this.metrics.recordInterference({
      attackerId: primary.attackerId,
      defenderId: primary.defenderId,
      eventType: 'conflict',
      success,
      cost: totalCost,
      impact: netImpact,
    });

    return resolution;
  }

  private computePriority(interferenceType: string, magnitude: number): number {
    const basePriorities: Record<string, number> = {
      sabotage_competitor: 10,
      manipulate_judge: 9,
      disrupt_evolution: 8,
      condemn_resource_allocation: 7,
      covert_oppression: 9,
      influence_agent: 6,
      exploit_weakness: 7,
      create_false_data: 5,
    };
    const base = basePriorities[interferenceType] ?? 5;
    return base + Math.floor(magnitude * 10);
  }

  getResolutions(): readonly ConflictResolution[] {
    return [...this.resolutions];
  }

  getPendingConflicts(): readonly PendingConflict[] {
    return [...this.pendingConflicts];
  }

  toJSON(): Record<string, unknown> {
    return { resolutions: this.resolutions, pendingCount: this.pendingConflicts.length };
  }
}
