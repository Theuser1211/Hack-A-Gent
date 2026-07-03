import { createDeterministicUuid, deterministicNow } from './determinism-kernel.js';

export interface AdversarialEventRecord {
  eventId: string;
  timestamp: string;
  attackerId: string;
  defenderId: string;
  eventType: 'interference' | 'deception' | 'sabotage' | 'manipulation' | 'mutation' | 'conflict';
  success: boolean;
  cost: number;
  impact: number;
  costImpactRatio: number;
  seed: number;
}

export interface DeceptionDetectionRecord {
  detectorId: string;
  targetId: string;
  deceptionType: string;
  detected: boolean;
  confidence: number;
  timestamp: string;
}

export interface JudgeBiasDriftRecord {
  judgeId: string;
  timestamp: string;
  previousBias: Record<string, number>;
  newBias: Record<string, number>;
  driftMagnitude: number;
  trigger: string;
}

export interface SystemStabilitySnapshot {
  timestamp: string;
  stabilityScore: number;
  activeConflicts: number;
  pendingResolutions: number;
  resourceContentionIndex: number;
}

export class AdversarialMetrics {
  private readonly seed: number;
  private _eventCounter = 0;
  private readonly events: AdversarialEventRecord[] = [];

  private totalInterferenceEvents = 0;
  private successfulSabotages = 0;
  private totalSabotageAttempts = 0;
  private deceptionDetections = 0;
  private deceptionDetectionAttempts = 0;
  private totalDeceptionEvents = 0;
  private judgeBiasDrifts: JudgeBiasDriftRecord[] = [];
  private stabilitySnapshots: SystemStabilitySnapshot[] = [];
  private eventLog: AdversarialEventRecord[] = [];
  private detectionLog: DeceptionDetectionRecord[] = [];

  constructor(seed = 42) {
    this.seed = seed;
  }

  recordInterference(params: {
    attackerId: string;
    defenderId: string;
    eventType: AdversarialEventRecord['eventType'];
    success: boolean;
    cost: number;
    impact: number;
  }): AdversarialEventRecord {
    this.totalInterferenceEvents++;
    if (params.eventType === 'sabotage') {
      this.totalSabotageAttempts++;
      if (params.success) this.successfulSabotages++;
    }

    const event: AdversarialEventRecord = {
      eventId: `evt-${createDeterministicUuid(this.seed, ++this._eventCounter)}`,
      timestamp: deterministicNow(this.seed + this._eventCounter),
      attackerId: params.attackerId,
      defenderId: params.defenderId,
      eventType: params.eventType,
      success: params.success,
      cost: params.cost,
      impact: params.impact,
      costImpactRatio: params.cost > 0 ? params.impact / params.cost : 0,
      seed: this.seed,
    };

    this.eventLog.push(event);
    return event;
  }

  recordDeception(params: {
    sourceId: string;
    targetId: string;
    deceptionType: string;
    success: boolean;
    cost: number;
  }): void {
    this.totalDeceptionEvents++;
    this.recordInterference({
      attackerId: params.sourceId,
      defenderId: params.targetId,
      eventType: 'deception',
      success: params.success,
      cost: params.cost,
      impact: params.success ? params.cost * 2 : 0,
    });
  }

  recordDeceptionDetection(params: {
    detectorId: string;
    targetId: string;
    deceptionType: string;
    detected: boolean;
    confidence: number;
  }): void {
    this.deceptionDetectionAttempts++;
    if (params.detected) this.deceptionDetections++;

    this.detectionLog.push({
      detectorId: params.detectorId,
      targetId: params.targetId,
      deceptionType: params.deceptionType,
      detected: params.detected,
      confidence: params.confidence,
      timestamp: deterministicNow(this.seed),
    });
  }

  recordJudgeBiasDrift(record: JudgeBiasDriftRecord): void {
    this.judgeBiasDrifts.push(record);
  }

  recordStabilitySnapshot(snapshot: SystemStabilitySnapshot): void {
    this.stabilitySnapshots.push(snapshot);
  }

  getTotalInterferenceEvents(): number {
    return this.totalInterferenceEvents;
  }

  getSuccessfulSabotageRate(): number {
    if (this.totalSabotageAttempts === 0) return 0;
    return this.successfulSabotages / this.totalSabotageAttempts;
  }

  getDeceptionDetectionAccuracy(): number {
    if (this.deceptionDetectionAttempts === 0) return 0;
    return this.deceptionDetections / this.deceptionDetectionAttempts;
  }

  getJudgeBiasDriftMagnitude(): number {
    if (this.judgeBiasDrifts.length === 0) return 0;
    return this.judgeBiasDrifts.reduce((sum, d) => sum + d.driftMagnitude, 0) / this.judgeBiasDrifts.length;
  }

  getSystemStabilityUnderPressure(): number {
    if (this.stabilitySnapshots.length === 0) return 1;
    const latest = this.stabilitySnapshots[this.stabilitySnapshots.length - 1];
    return latest?.stabilityScore ?? 1;
  }

  getEventLog(): readonly AdversarialEventRecord[] {
    return [...this.eventLog];
  }

  getDetectionLog(): readonly DeceptionDetectionRecord[] {
    return [...this.detectionLog];
  }

  getJudgeBiasDrifts(): readonly JudgeBiasDriftRecord[] {
    return [...this.judgeBiasDrifts];
  }

  getStabilitySnapshots(): readonly SystemStabilitySnapshot[] {
    return [...this.stabilitySnapshots];
  }

  toJSON(): Record<string, unknown> {
    return {
      totalInterferenceEvents: this.totalInterferenceEvents,
      successfulSabotageRate: this.getSuccessfulSabotageRate(),
      deceptionDetectionAccuracy: this.getDeceptionDetectionAccuracy(),
      judgeBiasDriftMagnitude: this.getJudgeBiasDriftMagnitude(),
      systemStability: this.getSystemStabilityUnderPressure(),
      eventLog: this.eventLog,
      detectionLog: this.detectionLog,
      judgeBiasDrifts: this.judgeBiasDrifts,
      stabilitySnapshots: this.stabilitySnapshots,
    };
  }
}
