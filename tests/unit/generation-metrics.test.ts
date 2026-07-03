import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { GenerationMetricsTracker } from '../../kernel/generation/generation-metrics.js';

describe('GenerationMetricsTracker', () => {
  let tmpDir: string;
  let tracker: GenerationMetricsTracker;

  beforeEach(() => {
    tmpDir = mkdtempSync(path.join(os.tmpdir(), 'hackagent-metrics-'));
    tracker = new GenerationMetricsTracker(tmpDir);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts with zero counters', () => {
    const metrics = tracker.getMetrics();
    expect(metrics.total_generation_requests).toBe(0);
    expect(metrics.successful_generations).toBe(0);
    expect(metrics.failed_generations).toBe(0);
  });

  it('records successful generation', () => {
    tracker.recordGeneration(true, 150, 200, false, false);
    const metrics = tracker.getMetrics();
    expect(metrics.total_generation_requests).toBe(1);
    expect(metrics.successful_generations).toBe(1);
    expect(metrics.total_tokens_used).toBe(150);
    expect(metrics.total_latency_ms).toBe(200);
  });

  it('records failed generation', () => {
    tracker.recordGeneration(false, 0, 5000, true, true);
    const metrics = tracker.getMetrics();
    expect(metrics.total_generation_requests).toBe(1);
    expect(metrics.failed_generations).toBe(1);
    expect(metrics.total_retries).toBe(1);
    expect(metrics.fallback_used_count).toBe(1);
  });

  it('records repair requests', () => {
    tracker.recordRepair(true, 150);
    tracker.recordRepair(false, 300);
    const metrics = tracker.getMetrics();
    expect(metrics.total_repair_requests).toBe(2);
    expect(metrics.successful_repairs).toBe(1);
    expect(metrics.failed_repairs).toBe(1);
  });

  it('records build results', () => {
    tracker.recordBuildResult(true);
    tracker.recordBuildResult(false);
    const metrics = tracker.getMetrics();
    expect(metrics.build_pass_count).toBe(1);
    expect(metrics.build_fail_count).toBe(1);
  });

  it('records test results', () => {
    tracker.recordTestResult(true);
    tracker.recordTestResult(true);
    tracker.recordTestResult(false);
    const metrics = tracker.getMetrics();
    expect(metrics.test_pass_count).toBe(2);
    expect(metrics.test_fail_count).toBe(1);
  });

  it('persists metrics to disk', () => {
    tracker.recordGeneration(true, 100, 50, false, false);
    const metricsPath = path.join(tmpDir, 'generation-metrics.json');
    expect(existsSync(metricsPath)).toBe(true);
    const saved = JSON.parse(readFileSync(metricsPath, 'utf-8'));
    expect(saved.total_generation_requests).toBe(1);
    expect(saved.successful_generations).toBe(1);
  });

  it('loads persisted metrics on restart', () => {
    tracker.recordGeneration(true, 100, 50, false, false);
    const tracker2 = new GenerationMetricsTracker(tmpDir);
    const metrics = tracker2.getMetrics();
    expect(metrics.total_generation_requests).toBe(1);
    expect(metrics.successful_generations).toBe(1);
  });

  it('reset clears all counters', () => {
    tracker.recordGeneration(true, 100, 50, false, false);
    tracker.reset();
    const metrics = tracker.getMetrics();
    expect(metrics.total_generation_requests).toBe(0);
    expect(metrics.last_updated).toBeTruthy();
  });
});
