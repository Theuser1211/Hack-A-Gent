import type { EventBus } from '../events/event-bus.js';
import type { EventEnvelope } from '../events/event-envelope.js';
import type { TaskError } from '../tasks/task-entity.js';
import type { TaskRepository, TaskFilter } from '../tasks/task-repository.js';
import type { AnomalyType, AnomalySeverity } from '../types/index.js';

// ── Anomaly ───────────────────────────────────────────────────────────────

export interface Anomaly {
  id: string;
  type: AnomalyType;
  severity: AnomalySeverity;
  detected_at: string;
  description: string;
  evidence: Record<string, unknown>;
  source_agent?: string;
  task_id?: string;
}

// ── Detector Configuration ────────────────────────────────────────────────

export interface DetectorConfig {
  /** Same task retried N times in window_ms = loop */
  loopThreshold: number;
  loopWindowMs: number;

  /** Same error across N tasks in window_ms = burst */
  failureBurstThreshold: number;
  failureBurstWindowMs: number;

  /** Consecutive build failures */
  buildFailureThreshold: number;

  /** Extra time after deadline before declaring stuck */
  checkpointGraceMs: number;

  /** Context compression reduces > this % but still over budget */
  contextThrashingRatio: number;
}

const DEFAULT_CONFIG: DetectorConfig = {
  loopThreshold: 3,
  loopWindowMs: 60000,
  failureBurstThreshold: 3,
  failureBurstWindowMs: 300000,
  buildFailureThreshold: 3,
  checkpointGraceMs: 60000,
  contextThrashingRatio: 0.5,
};

// ── Anomaly Detector ──────────────────────────────────────────────────────

export class AnomalyDetector {
  private readonly config: DetectorConfig;
  private readonly taskRepository: TaskRepository;
  private readonly eventBus: EventBus;

  // Tracking state
  private taskRetries: Map<string, number[]> = new Map();
  private errorHistory: Array<{ error: string; timestamp: number }> = [];
  private buildFailures: number = 0;
  private anomalies: Anomaly[] = [];

  constructor(taskRepository: TaskRepository, eventBus: EventBus, config?: Partial<DetectorConfig>) {
    this.taskRepository = taskRepository;
    this.eventBus = eventBus;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ── Loop Detection ──────────────────────────────────────────────────

  recordTaskRetry(taskId: string): void {
    const now = Date.now();
    const retries = this.taskRetries.get(taskId) ?? [];
    retries.push(now);

    // Keep only retries within the window
    const windowStart = now - this.config.loopWindowMs;
    const recent = retries.filter((t) => t >= windowStart);
    this.taskRetries.set(taskId, recent);

    if (recent.length >= this.config.loopThreshold) {
      this.emitAnomaly({
        id: `loop-${taskId}-${now}`,
        type: 'infinite_loop',
        severity: 'high',
        detected_at: new Date(now).toISOString(),
        description: `Task ${taskId} retried ${recent.length} times in ${this.config.loopWindowMs}ms`,
        evidence: { taskId, retryCount: recent.length, windowMs: this.config.loopWindowMs },
        task_id: taskId,
      });
    }
  }

  // ── Failure Burst Detection ─────────────────────────────────────────

  recordError(errorCode: string): void {
    const now = Date.now();
    this.errorHistory.push({ error: errorCode, timestamp: now });

    const windowStart = now - this.config.failureBurstWindowMs;
    const recent = this.errorHistory.filter((e) => e.timestamp >= windowStart);

    // Count distinct errors within window
    const errorCounts = new Map<string, number>();
    for (const e of recent) {
      errorCounts.set(e.error, (errorCounts.get(e.error) ?? 0) + 1);
    }

    for (const [error, count] of errorCounts) {
      if (count >= this.config.failureBurstThreshold) {
        this.emitAnomaly({
          id: `burst-${error}-${now}`,
          type: 'failure_burst',
          severity: 'critical',
          detected_at: new Date(now).toISOString(),
          description: `Error "${error}" occurred ${count} times in ${this.config.failureBurstWindowMs}ms across tasks`,
          evidence: { error, count, windowMs: this.config.failureBurstWindowMs },
        });
      }
    }

    // Prune old entries
    const cutoff = now - this.config.failureBurstWindowMs * 2;
    this.errorHistory = this.errorHistory.filter((e) => e.timestamp >= cutoff);
  }

  // ── Hallucinated File Detection ─────────────────────────────────────

  async checkHallucinatedFiles(taskId: string, declaredArtifacts: string[]): Promise<string[]> {
    const missing: string[] = [];

    for (const artifact of declaredArtifacts) {
      try {
        const { access, constants } = await import('node:fs/promises');
        await access(artifact, constants.F_OK);
      } catch {
        missing.push(artifact);
      }
    }

    if (missing.length > 0) {
      const { existsSync } = await import('node:fs');
      const trulyMissing = missing.filter((f) => !existsSync(f));

      if (trulyMissing.length > 0) {
        this.emitAnomaly({
          id: `hallucination-${taskId}-${Date.now()}`,
          type: 'hallucinated_file',
          severity: 'medium',
          detected_at: new Date().toISOString(),
          description: `Task ${taskId} declared ${trulyMissing.length} artifact(s) that do not exist`,
          evidence: { taskId, missingFiles: trulyMissing, declared: declaredArtifacts },
          task_id: taskId,
        });
      }
    }

    return missing;
  }

  // ── Broken Build Detection ──────────────────────────────────────────

  recordBuildFailure(): void {
    this.buildFailures++;
    if (this.buildFailures >= this.config.buildFailureThreshold) {
      this.emitAnomaly({
        id: `build-${Date.now()}`,
        type: 'broken_build',
        severity: 'critical',
        detected_at: new Date().toISOString(),
        description: `Build failed ${this.buildFailures} consecutive times`,
        evidence: { consecutiveFailures: this.buildFailures },
      });
    }
  }

  recordBuildSuccess(): void {
    this.buildFailures = 0;
  }

  // ── Stuck Checkpoint Detection ──────────────────────────────────────

  async checkStuckCheckpoints(deadline: string): Promise<boolean> {
    const deadlineMs = new Date(deadline).getTime();
    const now = Date.now();
    const graceMs = this.config.checkpointGraceMs;

    if (now > deadlineMs + graceMs) {
      this.emitAnomaly({
        id: `checkpoint-${Date.now()}`,
        type: 'stuck_checkpoint',
        severity: 'high',
        detected_at: new Date().toISOString(),
        description: `Checkpoint with deadline ${deadline} has exceeded its deadline by more than ${graceMs}ms grace period`,
        evidence: { deadline, currentTime: new Date(now).toISOString(), graceMs },
      });
      return true;
    }

    return false;
  }

  // ── Context Thrashing Detection ─────────────────────────────────────

  recordContextCompression(taskId: string, originalTokens: number, compressedTokens: number, budget: number): void {
    const ratio = 1 - compressedTokens / originalTokens;

    if (ratio > this.config.contextThrashingRatio && compressedTokens > budget) {
      this.emitAnomaly({
        id: `thrashing-${taskId}-${Date.now()}`,
        type: 'context_thrashing',
        severity: 'medium',
        detected_at: new Date().toISOString(),
        description: `Context compression reduced by ${(ratio * 100).toFixed(0)}% but still exceeds budget`,
        evidence: {
          taskId,
          originalTokens,
          compressedTokens,
          budget,
          compressionRatio: ratio,
        },
        task_id: taskId,
      });
    }
  }

  // ── Anomaly Management ──────────────────────────────────────────────

  private emitAnomaly(anomaly: Anomaly): void {
    this.anomalies.push(anomaly);
    // Keep last 100
    if (this.anomalies.length > 100) {
      this.anomalies = this.anomalies.slice(-100);
    }
  }

  getAnomalies(filter?: { type?: AnomalyType; severity?: AnomalySeverity }): Anomaly[] {
    let results = [...this.anomalies];
    if (filter?.type) results = results.filter((a) => a.type === filter.type);
    if (filter?.severity) results = results.filter((a) => a.severity === filter.severity);
    return results.sort((a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime());
  }

  getRecentAnomalies(count: number = 10): Anomaly[] {
    return this.anomalies.slice(-count).reverse();
  }

  clearAnomalies(): void {
    this.anomalies = [];
    this.taskRetries.clear();
    this.errorHistory = [];
    this.buildFailures = 0;
  }
}
