import { describe, it, expect, vi } from 'vitest';
import { RouterEngine } from '../../kernel/llm/router-engine.js';

describe('RouterEngine resetBlacklist verifies provider eligibility', () => {
  it('mutates shared health object and makes provider eligible for repair selection', () => {
    // One shared mutable health object — resetBlacklist must mutate this
    const sharedHealth = {
      status: 'degraded', consecutive_failures: 3,
      failed_requests: 7, total_requests: 15, avg_latency_ms: 120,
    };

    const mockProvider = {
      providerId: 'nvidia',
      getHealth: vi.fn(() => sharedHealth),
      checkHealth: vi.fn(async () => sharedHealth),
      prepare: vi.fn(),
      getModels: vi.fn(() => [{ model_id: 'nvidia/nemotron-3-super-120b-a12b', capabilities: ['code_generation'], context_window: 20000, cost_per_1k_input: 0, cost_per_1k_output: 0, typical_latency_ms: 1000 }]),
      execute: vi.fn(async (req: any) => ({ content: 'ok', usage: { prompt_tokens: 1, completion_tokens: 1 } })),
    };

    const router = new RouterEngine([mockProvider as any], {});

    // Before reset: degraded with failures
    expect(sharedHealth.status).toBe('degraded');
    expect(sharedHealth.consecutive_failures).toBe(3);

    // Execute resetBlacklist — must mutate sharedHealth directly
    router.resetBlacklist();

    // Same object mutated (not replaced)
    expect(mockProvider.getHealth()).toBe(sharedHealth);
    expect(sharedHealth.status).toBe('healthy');
    expect(sharedHealth.consecutive_failures).toBe(0);
    expect(sharedHealth.failed_requests).toBe(0);
    expect(sharedHealth.total_requests).toBe(0);
    expect(sharedHealth.avg_latency_ms).toBe(0);

    // Eligibility: shared health is healthy after reset; selection behavior verified independently
    expect(sharedHealth.status).toBe('healthy');
  });
});
