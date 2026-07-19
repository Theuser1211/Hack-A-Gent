import { describe, it, expect, vi } from 'vitest';
import { ExecutionStateStore } from '../../cli/orchestration/execution-state.js';
import { OrchestrationEmitter } from '../../cli/orchestration/events.js';
import { BaseOrchestrator, type PipelineOrchestrator } from '../../cli/orchestration/orchestrator.js';
import { CompetitionIntelligenceAgent } from '../../cli/agents/intelligence-agent.js';
import type { AgentContext } from '../../cli/agents/types.js';

describe('ExecutionStateStore', () => {
  it('starts idle with zero progress', () => {
    const store = new ExecutionStateStore(42);
    const s = store.getState();
    expect(s.phase).toBe('idle');
    expect(s.progress).toBe(0);
    expect(s.failures).toEqual([]);
  });

  it('tracks task lifecycle and recomputes progress', () => {
    const store = new ExecutionStateStore();
    store.startTask('t1', 'build');
    store.startTask('t2', 'test');
    expect(store.getState().currentTaskId).toBe('t2');
    store.completeTask('t1');
    expect(store.getState().progress).toBeCloseTo(0.5);
    store.completeTask('t2');
    expect(store.getState().progress).toBe(1);
  });

  it('records failures and retries', () => {
    const store = new ExecutionStateStore();
    store.recordFailure('building', 'boom', 't1');
    store.recordRetry();
    expect(store.getState().failures).toHaveLength(1);
    expect(store.getState().failures[0]!.error).toBe('boom');
    expect(store.getState().retries).toBe(1);
  });

  it('captures and restores checkpoints', () => {
    const store = new ExecutionStateStore();
    store.transitionPhase('building');
    store.checkpoint('cp1', { foo: 'bar' });
    const cp = store.getLatestCheckpoint();
    expect(cp?.id).toBe('cp1');
    expect(cp?.phase).toBe('building');
    expect(cp?.snapshot).toEqual({ foo: 'bar' });
  });
});

describe('OrchestrationEmitter', () => {
  it('delivers events to subscribers (including wildcard)', async () => {
    const emitter = new OrchestrationEmitter();
    const seen: string[] = [];
    emitter.on('phase.started', (e) => { seen.push(e.type); });
    emitter.on('*', (e) => { seen.push('*:' + e.type); });
    await emitter.emit({ type: 'phase.started', phase: 'building' });
    expect(seen).toContain('phase.started');
    expect(seen).toContain('*:phase.started');
  });

  it('keeps an event history', async () => {
    const emitter = new OrchestrationEmitter();
    await emitter.emit({ type: 'log', level: 'info', message: 'hi' });
    expect(emitter.getHistory()).toHaveLength(1);
  });
});

describe('BaseOrchestrator', () => {
  it('coordinates phases and tasks without business logic', async () => {
    const emitter = new OrchestrationEmitter();
    const phases: string[] = [];
    emitter.on('phase.started', (e) => { phases.push(e.phase!); });

    class DemoOrchestrator extends BaseOrchestrator {
      async run(): Promise<void> {
        await this.beginPhase('requirements');
        await this.withTask('t1', 'plan', async () => 'done');
        await this.endPhase('requirements');
      }
    }

    const orch: PipelineOrchestrator = new DemoOrchestrator(1, emitter);
    await orch.run();
    expect(phases).toEqual(['requirements']);
    expect(orch.getState().tasks['t1']!.status).toBe('completed');
    expect(orch.getState().progress).toBe(1);
  });

  it('records task failures and rethrows', async () => {
    const emitter = new OrchestrationEmitter();
    let failedTask = '';
    emitter.on('task.failed', (e) => { failedTask = e.taskId!; });

    class FailingOrchestrator extends BaseOrchestrator {
      async run(): Promise<void> {
        await this.beginPhase('building');
        await this.withTask('t1', 'boom', async () => {
          throw new Error('kaboom');
        });
      }
    }

    const orch = new FailingOrchestrator(1, emitter);
    await expect(orch.run()).rejects.toThrow('kaboom');
    expect(failedTask).toBe('t1');
    expect(orch.getState().failures).toHaveLength(1);
  });
});

describe('CompetitionIntelligenceAgent', () => {
  it('runs the full lifecycle over parsed input', async () => {
    const emitter = new OrchestrationEmitter();
    const agent = new CompetitionIntelligenceAgent();
    const ctx: AgentContext = {
      seed: 42,
      emitter,
      inputs: {
        parsed: {
          title: 'AI Climate Hack',
          problemStatement: 'Solve climate change',
          judgingCriteria: ['Innovation 40%', 'Impact 30%'],
          constraints: [],
          recommendedStack: ['openai', 'Next.js'],
          rawText: 'theme: climate sponsor openai prize',
          submissionRequirements: [],
        },
      },
      scratch: {},
    };

    const result = await agent.run(ctx);
    expect(result.status).toBe('completed');
    const out = result.output as { analysis: { judgingCriteria: unknown[]; sponsorAPIs: unknown[] } };
    expect(out.analysis.judgingCriteria.length).toBe(2);
    expect(out.analysis.sponsorAPIs.length).toBeGreaterThan(0);
    expect(agent.getStatus()).toBe('completed');
  });

  it('fails gracefully when no parsed input is given', async () => {
    const agent = new CompetitionIntelligenceAgent();
    const ctx: AgentContext = { seed: 1, inputs: {}, scratch: {} };
    const result = await agent.run(ctx);
    expect(result.status).toBe('failed');
  });
});
