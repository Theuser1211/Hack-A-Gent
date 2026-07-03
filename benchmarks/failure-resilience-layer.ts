import { DecisionLogger } from './decision-trace.js';
import { createDeterministicUuid, deterministicNow, getSeededRandom } from './determinism-kernel.js';

export interface RetryPolicy {
  toolType: string;
  maxRetries: number;
  baseDelayMs: number;
  useExponentialBackoff: boolean;
  fallbackStrategy: 'abort' | 'continue' | 'use_mock' | 'skip_task';
}

export interface ResilienceResult {
  success: boolean;
  attempts: number;
  totalDurationMs: number;
  strategyUsed: string;
  fallbackTriggered: boolean;
  partialSuccess: boolean;
  error: string | null;
  recoveryAction: string | null;
}

export interface ToolFailureRecord {
  toolType: string;
  attempts: number;
  lastError: string;
  lastFailure: string;
  totalFailures: number;
  successRate: number;
}

export class FailureResilienceLayer {
  private readonly seed: number;
  private readonly layerId: string;
  private readonly decisionLogger: DecisionLogger;
  private readonly policies: Map<string, RetryPolicy> = new Map();
  private failureRecords: Map<
    string,
    { totalFailures: number; totalAttempts: number; lastError: string; lastFailure: string }
  > = new Map();

  constructor(seed = 42) {
    this.seed = seed;
    this.layerId = 'fail-res-' + createDeterministicUuid(seed, 0).slice(0, 6);
    this.decisionLogger = new DecisionLogger(seed + 8000);
    this.registerDefaultPolicies();
  }

  getDecisionLogger(): DecisionLogger {
    return this.decisionLogger;
  }

  private registerDefaultPolicies(): void {
    this.registerPolicy({
      toolType: 'github',
      maxRetries: 3,
      baseDelayMs: 1000,
      useExponentialBackoff: true,
      fallbackStrategy: 'continue',
    });
    this.registerPolicy({
      toolType: 'deploy',
      maxRetries: 3,
      baseDelayMs: 2000,
      useExponentialBackoff: true,
      fallbackStrategy: 'use_mock',
    });
    this.registerPolicy({
      toolType: 'browser_test',
      maxRetries: 3,
      baseDelayMs: 500,
      useExponentialBackoff: true,
      fallbackStrategy: 'skip_task',
    });
    this.registerPolicy({
      toolType: 'shell',
      maxRetries: 2,
      baseDelayMs: 500,
      useExponentialBackoff: true,
      fallbackStrategy: 'abort',
    });
    this.registerPolicy({
      toolType: 'fetch',
      maxRetries: 2,
      baseDelayMs: 300,
      useExponentialBackoff: true,
      fallbackStrategy: 'continue',
    });
    this.registerPolicy({
      toolType: 'filesystem',
      maxRetries: 1,
      baseDelayMs: 100,
      useExponentialBackoff: false,
      fallbackStrategy: 'continue',
    });
  }

  registerPolicy(policy: RetryPolicy): void {
    this.policies.set(policy.toolType, policy);
  }

  getPolicy(toolType: string): RetryPolicy {
    return (
      this.policies.get(toolType) ?? {
        toolType,
        maxRetries: 2,
        baseDelayMs: 500,
        useExponentialBackoff: true,
        fallbackStrategy: 'continue',
      }
    );
  }

  async executeWithRetry<T>(
    toolType: string,
    action: string,
    fn: () => Promise<T>,
    context?: Record<string, unknown>,
  ): Promise<ResilienceResult & { result: T | null }> {
    const policy = this.getPolicy(toolType);
    const startTime = Date.now();
    let lastError: Error | null = null;
    let attempts = 0;

    this.decisionLogger.log('debug', `retry_start:${toolType}`, `Starting ${toolType}:${action}`, 0.8, [], {
      policy: policy.maxRetries,
      action,
      ...context,
    });

    for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
      attempts = attempt + 1;
      try {
        const result = await fn();
        const elapsed = Date.now() - startTime;

        this.recordSuccess(toolType);
        this.decisionLogger.log(
          'debug',
          `retry_ok:${toolType}`,
          `${toolType}:${action} succeeded after ${attempts} attempt(s)`,
          0.95,
          [],
          { attempts, durationMs: elapsed, action },
        );

        return {
          success: true,
          attempts,
          totalDurationMs: elapsed,
          strategyUsed: 'direct',
          fallbackTriggered: false,
          partialSuccess: false,
          error: null,
          recoveryAction: null,
          result,
        };
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        this.recordFailure(toolType, lastError.message);

        if (attempt < policy.maxRetries) {
          const delay = policy.useExponentialBackoff
            ? policy.baseDelayMs * Math.pow(2, attempt) + getSeededRandom(this.seed + attempt).nextInt(0, 100)
            : policy.baseDelayMs;

          this.decisionLogger.log(
            'debug',
            `retry_wait:${toolType}`,
            `Retry ${attempt + 1}/${policy.maxRetries} for ${toolType}:${action} after ${delay}ms`,
            0.5,
            [],
            { attempt, maxRetries: policy.maxRetries, delayMs: delay, error: lastError.message },
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    const elapsed = Date.now() - startTime;
    const msg = lastError?.message ?? 'Unknown error';

    // Fallback
    let fallbackTriggered = false;
    let recoveryAction: string | null = null;
    let partialSuccess = false;
    const result: T | null = null;

    switch (policy.fallbackStrategy) {
      case 'continue':
        recoveryAction = `Continuing despite ${toolType} failure`;
        partialSuccess = true;
        break;
      case 'use_mock':
        recoveryAction = `Using mock result for ${toolType}`;
        fallbackTriggered = true;
        partialSuccess = true;
        break;
      case 'skip_task':
        recoveryAction = `Skipping failed ${toolType} task`;
        fallbackTriggered = true;
        break;
      case 'abort':
        recoveryAction = null;
        break;
    }

    this.decisionLogger.log(
      'debug',
      `retry_fail:${toolType}`,
      `${toolType}:${action} failed after ${attempts} attempts`,
      0.2,
      [],
      { attempts, durationMs: elapsed, error: msg, fallback: policy.fallbackStrategy },
    );

    return {
      success: false,
      attempts,
      totalDurationMs: elapsed,
      strategyUsed: 'retry_exhausted',
      fallbackTriggered,
      partialSuccess,
      error: msg,
      recoveryAction,
      result,
    };
  }

  private recordSuccess(toolType: string): void {
    const rec = this.failureRecords.get(toolType) ?? {
      totalFailures: 0,
      totalAttempts: 0,
      lastError: '',
      lastFailure: '',
    };
    rec.totalAttempts++;
    this.failureRecords.set(toolType, rec);
  }

  private recordFailure(toolType: string, error: string): void {
    const rec = this.failureRecords.get(toolType) ?? {
      totalFailures: 0,
      totalAttempts: 0,
      lastError: '',
      lastFailure: '',
    };
    rec.totalFailures++;
    rec.totalAttempts++;
    rec.lastError = error;
    rec.lastFailure = deterministicNow(this.seed);
    this.failureRecords.set(toolType, rec);
  }

  getToolFailureRecords(): ToolFailureRecord[] {
    return Array.from(this.failureRecords.entries()).map(([toolType, rec]) => ({
      toolType,
      attempts: rec.totalAttempts,
      lastError: rec.lastError,
      lastFailure: rec.lastFailure,
      totalFailures: rec.totalFailures,
      successRate: rec.totalAttempts > 0 ? Math.round((1 - rec.totalFailures / rec.totalAttempts) * 100) / 100 : 1,
    }));
  }

  getFailureSummary(): string {
    const records = this.getToolFailureRecords();
    if (records.length === 0) return 'No failures recorded';
    return records
      .map(
        (r) => `${r.toolType}: ${r.totalFailures} fail / ${r.attempts} attempts (${(r.successRate * 100).toFixed(0)}%)`,
      )
      .join('; ');
  }
}
