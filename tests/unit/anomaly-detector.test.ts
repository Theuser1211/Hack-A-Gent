import { mkdtempSync, rmSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach } from 'vitest';

import { EventBus } from '../../kernel/events/event-bus.js';
import { AnomalyDetector } from '../../kernel/recovery/anomaly-detector.js';
import { TaskRepository } from '../../kernel/tasks/task-repository.js';

function createDetector() {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-test-'));
  const repo = new TaskRepository(tmpDir);
  const bus = new EventBus(path.join(tmpDir, 'events'));
  const detector = new AnomalyDetector(repo, bus, {
    loopThreshold: 3,
    loopWindowMs: 60000,
    failureBurstThreshold: 3,
    failureBurstWindowMs: 300000,
    buildFailureThreshold: 3,
    checkpointGraceMs: 60000,
    contextThrashingRatio: 0.5,
  });
  return { detector, tmpDir };
}

describe('AnomalyDetector', () => {
  it('detects infinite loops', () => {
    const { detector, tmpDir } = createDetector();

    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');

    const anomalies = detector.getAnomalies({ type: 'infinite_loop' });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.task_id).toBe('task-1');
    expect(anomalies[0]!.severity).toBe('high');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not detect loop below threshold', () => {
    const { detector, tmpDir } = createDetector();

    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');

    const anomalies = detector.getAnomalies({ type: 'infinite_loop' });
    expect(anomalies).toHaveLength(0);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects failure bursts', () => {
    const { detector, tmpDir } = createDetector();

    detector.recordError('TIMEOUT');
    detector.recordError('TIMEOUT');
    detector.recordError('TIMEOUT');

    const anomalies = detector.getAnomalies({ type: 'failure_burst' });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.evidence).toHaveProperty('error', 'TIMEOUT');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects broken builds', () => {
    const { detector, tmpDir } = createDetector();

    detector.recordBuildFailure();
    detector.recordBuildFailure();
    detector.recordBuildFailure();

    const anomalies = detector.getAnomalies({ type: 'broken_build' });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.severity).toBe('critical');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('resets build failure count on success', () => {
    const { detector, tmpDir } = createDetector();

    detector.recordBuildFailure();
    detector.recordBuildSuccess();
    detector.recordBuildFailure();

    const anomalies = detector.getAnomalies({ type: 'broken_build' });
    expect(anomalies).toHaveLength(0);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects stuck checkpoints', async () => {
    const { detector, tmpDir } = createDetector();

    // Past deadline
    const pastDeadline = new Date(Date.now() - 120000).toISOString(); // 2 min ago
    const stuck = await detector.checkStuckCheckpoints(pastDeadline);

    expect(stuck).toBe(true);

    const anomalies = detector.getAnomalies({ type: 'stuck_checkpoint' });
    expect(anomalies).toHaveLength(1);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not flag recent checkpoints as stuck', async () => {
    const { detector, tmpDir } = createDetector();

    const futureDeadline = new Date(Date.now() + 3600000).toISOString();
    const stuck = await detector.checkStuckCheckpoints(futureDeadline);
    expect(stuck).toBe(false);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects context thrashing', () => {
    const { detector, tmpDir } = createDetector();

    // 10000 -> 3000 = 70% reduction (above 50% threshold), budget is 2000, so still over budget
    detector.recordContextCompression('task-1', 10000, 3000, 2000);

    const anomalies = detector.getAnomalies({ type: 'context_thrashing' });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.task_id).toBe('task-1');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns recent anomalies in reverse chronological order', () => {
    const { detector, tmpDir } = createDetector();

    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1'); // loop detected

    detector.recordBuildFailure();
    detector.recordBuildFailure();
    detector.recordBuildFailure(); // build detected

    const recent = detector.getRecentAnomalies(5);
    expect(recent).toHaveLength(2);

    // Most recent should be build failure
    expect(recent[0]!.type).toBe('broken_build');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects hallucinated files that do not exist', async () => {
    const { detector, tmpDir } = createDetector();
    const missingArtifacts = [
      path.join(tmpDir, 'nonexistent-file.ts'),
      path.join(tmpDir, 'nonexistent-folder', 'file.ts'),
    ];
    const missing = await detector.checkHallucinatedFiles('task-hall', missingArtifacts);
    expect(missing).toHaveLength(2);

    const anomalies = detector.getAnomalies({ type: 'hallucinated_file' });
    expect(anomalies).toHaveLength(1);
    expect(anomalies[0]!.evidence).toHaveProperty('taskId', 'task-hall');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('does not flag existing files as hallucinated', async () => {
    const { detector, tmpDir } = createDetector();
    const { writeFileSync } = await import('node:fs');
    const existingFile = path.join(tmpDir, 'real-file.ts');
    writeFileSync(existingFile, 'content');

    const missing = await detector.checkHallucinatedFiles('task-real', [existingFile]);
    expect(missing).toHaveLength(0);

    const anomalies = detector.getAnomalies({ type: 'hallucinated_file' });
    expect(anomalies).toHaveLength(0);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('prunes anomaly history beyond 100 entries', () => {
    const { detector, tmpDir } = createDetector();

    // Generate 105 anomalies by triggering the loop detector
    // We need to create unique task IDs to get multiple loop anomalies
    for (let i = 0; i < 35; i++) {
      const taskId = `prune-task-${i}`;
      detector.recordTaskRetry(taskId);
      detector.recordTaskRetry(taskId);
      detector.recordTaskRetry(taskId);
    }

    const all = detector.getAnomalies();
    expect(all.length).toBeLessThanOrEqual(100);

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('filters anomalies by severity', () => {
    const { detector, tmpDir } = createDetector();

    // Build failure generates 'critical' severity
    detector.recordBuildFailure();
    detector.recordBuildFailure();
    detector.recordBuildFailure();
    // Loop generates 'high' severity
    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');

    const criticalAnomalies = detector.getAnomalies({ severity: 'critical' });
    expect(criticalAnomalies).toHaveLength(1);
    expect(criticalAnomalies[0]!.type).toBe('broken_build');

    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('clears all anomalies', () => {
    const { detector, tmpDir } = createDetector();

    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');
    detector.recordTaskRetry('task-1');

    expect(detector.getAnomalies()).toHaveLength(1);

    detector.clearAnomalies();
    expect(detector.getAnomalies()).toHaveLength(0);

    rmSync(tmpDir, { recursive: true, force: true });
  });
});
