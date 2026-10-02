import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

export interface GenerationMetricsSnapshot {
  total_generation_requests: number;
  successful_generations: number;
  failed_generations: number;
  total_tokens_used: number;
  total_latency_ms: number;
  total_repair_requests: number;
  successful_repairs: number;
  failed_repairs: number;
  total_retries: number;
  fallback_used_count: number;
  build_pass_count: number;
  build_fail_count: number;
  test_pass_count: number;
  test_fail_count: number;
  last_updated: string;
}

export class GenerationMetricsTracker {
  private metrics: GenerationMetricsSnapshot;
  private filePath: string;

  constructor(persistDir: string) {
    this.filePath = join(persistDir, 'generation-metrics.json');
    this.metrics = this.load();
  }

  getMetrics(): GenerationMetricsSnapshot {
    return { ...this.metrics };
  }

  recordGeneration(success: boolean, tokens: number, latencyMs: number, retried: boolean, fallbackUsed: boolean): void {
    this.metrics.total_generation_requests++;
    if (success) {
      this.metrics.successful_generations++;
    } else {
      this.metrics.failed_generations++;
    }
    this.metrics.total_tokens_used += tokens;
    this.metrics.total_latency_ms += latencyMs;
    if (retried) this.metrics.total_retries++;
    if (fallbackUsed) this.metrics.fallback_used_count++;
    this.save();
  }

  recordRepair(success: boolean, latencyMs: number): void {
    this.metrics.total_repair_requests++;
    if (success) {
      this.metrics.successful_repairs++;
    } else {
      this.metrics.failed_repairs++;
    }
    this.metrics.total_latency_ms += latencyMs;
    this.save();
  }

  recordBuildResult(success: boolean): void {
    if (success) {
      this.metrics.build_pass_count++;
    } else {
      this.metrics.build_fail_count++;
    }
    this.save();
  }

  recordTestResult(success: boolean): void {
    if (success) {
      this.metrics.test_pass_count++;
    } else {
      this.metrics.test_fail_count++;
    }
    this.save();
  }

  reset(): void {
    this.metrics = this.createInitial();
    this.save();
  }

  private load(): GenerationMetricsSnapshot {
    try {
      if (existsSync(this.filePath)) {
        const data = readFileSync(this.filePath, 'utf-8');
        return { ...this.createInitial(), ...JSON.parse(data), last_updated: new Date().toISOString() };
      }
    } catch {
      // ignore corrupt file
    }
    return this.createInitial();
  }

  private save(): void {
    try {
      this.metrics.last_updated = new Date().toISOString();
      const dir = dirname(this.filePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      writeFileSync(this.filePath, JSON.stringify(this.metrics, null, 2), 'utf-8');
    } catch {
      // non-critical
    }
  }

  private createInitial(): GenerationMetricsSnapshot {
    return {
      total_generation_requests: 0,
      successful_generations: 0,
      failed_generations: 0,
      total_tokens_used: 0,
      total_latency_ms: 0,
      total_repair_requests: 0,
      successful_repairs: 0,
      failed_repairs: 0,
      total_retries: 0,
      fallback_used_count: 0,
      build_pass_count: 0,
      build_fail_count: 0,
      test_pass_count: 0,
      test_fail_count: 0,
      last_updated: new Date().toISOString(),
    };
  }
}
