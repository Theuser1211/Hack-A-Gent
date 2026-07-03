import { describe, it, expect } from 'vitest';

import { DevpostIngestionLayer } from '../../benchmarks/devpost-ingestion-layer.js';
import { GlobalMemoryIndex } from '../../benchmarks/global-memory-index.js';
import { InterruptProtocol } from '../../benchmarks/interrupt-protocol.js';
import { ObservabilityLayer } from '../../benchmarks/observability-layer.js';
import type { ProjectSnapshot } from '../../benchmarks/organizational-memory-bank.js';
import { ToolExecutionGateway } from '../../benchmarks/tool-execution-gateway.js';
import { UnifiedRuntimeOS } from '../../benchmarks/unified-runtime-os.js';
import type { RuntimeSnapshot, RuntimeConfig, RuntimeInput, SystemStatus } from '../../benchmarks/unified-types.js';

describe('UnifiedRuntimeOS — Construction', () => {
  it('creates runtime with default config', () => {
    const runtime = new UnifiedRuntimeOS();
    expect(runtime.getRuntimeId()).toMatch(/^runtime-/);
    expect(runtime.getConfig().mode).toBe('hackathon');
    expect(runtime.getConfig().seed).toBe(42);
  });

  it('creates runtime with custom config', () => {
    const runtime = new UnifiedRuntimeOS({ seed: 123, mode: 'benchmark' });
    expect(runtime.getConfig().seed).toBe(123);
    expect(runtime.getConfig().mode).toBe('benchmark');
  });

  it('initializes all subsystems', () => {
    const runtime = new UnifiedRuntimeOS();
    expect(runtime.globalMemory).toBeTruthy();
    expect(runtime.toolGateway).toBeTruthy();
    expect(runtime.interruptProtocol).toBeTruthy();
    expect(runtime.observability).toBeTruthy();
    expect(runtime.decisionLogger).toBeTruthy();
  });

  it('initial state is not paused', () => {
    const runtime = new UnifiedRuntimeOS();
    expect(runtime.getState().paused).toBe(false);
    expect(runtime.getState().checkpointVersion).toBe(0);
  });
});

describe('UnifiedRuntimeOS — Mode Switching', () => {
  it('starts in configured mode', () => {
    const runtime = new UnifiedRuntimeOS({ mode: 'company' });
    expect(runtime.getSystemStatus().mode).toBe('company');
  });

  it('switches modes at runtime', () => {
    const runtime = new UnifiedRuntimeOS({ mode: 'hackathon' });
    runtime.switchMode('research');
    expect(runtime.getSystemStatus().mode).toBe('research');
    runtime.switchMode('benchmark');
    expect(runtime.getSystemStatus().mode).toBe('benchmark');
  });
});

describe('UnifiedRuntimeOS — Pause / Resume / Snapshot', () => {
  it('pauses and resumes execution state', () => {
    const runtime = new UnifiedRuntimeOS();
    expect(runtime.getSystemStatus().paused).toBe(false);
    runtime.pause();
    expect(runtime.getSystemStatus().paused).toBe(true);
    runtime.resume();
    expect(runtime.getSystemStatus().paused).toBe(false);
  });

  it('creates snapshot with all state fields', () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42 });
    const snapshot = runtime.snapshot();
    expect(snapshot.snapshotId).toMatch(/^snap-/);
    expect(snapshot.version).toBe('1.0.0');
    expect(snapshot.state.mode).toBe('hackathon');
    expect(snapshot.state.currentExecutionPointer).toBeDefined();
    expect(snapshot.state.deploymentHistory).toEqual([]);
    expect(snapshot.state.mutationHistory).toEqual([]);
  });

  it('restores from snapshot', () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42 });
    runtime.pause();
    runtime.switchMode('research');

    const snapshot = runtime.snapshot();
    expect(snapshot.state.mode).toBe('research');
    expect(snapshot.state.paused).toBe(true);

    const runtime2 = new UnifiedRuntimeOS({ seed: 99 });
    expect(runtime2.getSystemStatus().mode).toBe('hackathon');
    expect(runtime2.getSystemStatus().paused).toBe(false);

    runtime2.restore(snapshot);
    expect(runtime2.getSystemStatus().mode).toBe('research');
    expect(runtime2.getSystemStatus().paused).toBe(true);
  });

  it('snapshot includes checkpoint version', () => {
    const runtime = new UnifiedRuntimeOS();
    const s1 = runtime.snapshot();
    expect(s1.state.checkpointVersion).toBe(0);
  });
});

describe('UnifiedRuntimeOS — System Status', () => {
  it('returns status with all fields', () => {
    const runtime = new UnifiedRuntimeOS();
    const status = runtime.getSystemStatus();
    expect(status.mode).toBe('hackathon');
    expect(typeof status.uptimeMs).toBe('number');
    expect(typeof status.paused).toBe('boolean');
    expect(status.activeSubsystem).toBe('none');
    expect(status.tasks).toBeDefined();
    expect(status.tasks.total).toBeGreaterThanOrEqual(0);
    expect(typeof status.memory.heapMB).toBe('number');
    expect(status.decisions).toBe(0);
    expect(status.toolCalls).toBe(0);
    expect(status.mutations).toBe(0);
    expect(status.deployments).toBe(0);
    expect(status.errors).toBe(0);
  });
});

describe('UnifiedRuntimeOS — Run modes', () => {
  it('runs benchmark mode successfully', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'benchmark' });
    const input: RuntimeInput = { problemStatement: 'Test benchmark run' };
    const output = await runtime.run(input);
    expect(output.success).toBe(true);
    expect(output.mode).toBe('benchmark');
  }, 30000);

  it('runs research mode successfully', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'research' });
    const input: RuntimeInput = { problemStatement: 'Test research run' };
    const output = await runtime.run(input);
    expect(output.success).toBe(true);
    expect(output.mode).toBe('research');
  }, 30000);
});

describe('UnifiedRuntimeOS — Benchmark mode', () => {
  it('executes benchmark mode successfully', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'benchmark' });
    const input: RuntimeInput = {
      problemStatement: 'Test benchmark run',
    };

    const output = await runtime.run(input);
    expect(output.success).toBe(true);
    expect(output.mode).toBe('benchmark');
    expect(output.executionSummary.mutations).toBeGreaterThanOrEqual(0);
  }, 30000);
});

describe('UnifiedRuntimeOS — Research mode', () => {
  it('executes research mode successfully', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'research' });
    const input: RuntimeInput = {
      problemStatement: 'Test research run',
    };

    const output = await runtime.run(input);
    expect(output.success).toBe(true);
    expect(output.mode).toBe('research');
  }, 30000);
});

describe('UnifiedRuntimeOS — Full execution report', () => {
  it('generates full execution report after run', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const input: RuntimeInput = {
      problemStatement: 'Build a simple todo app',
    };

    await runtime.run(input);
    const report = runtime.getFullExecutionReport();
    expect(report.reportId).toMatch(/^report-/);
    expect(report.summary.totalDecisions).toBeGreaterThan(0);
    expect(report.systemTrace.length).toBeGreaterThan(0);
    expect(report.decisionTraces.length).toBeGreaterThan(0);
    expect(report.checkpointHistory.length).toBeGreaterThan(0);
  }, 30000);
});

describe('DevpostIngestionLayer', () => {
  it('parses raw text input', async () => {
    const parser = new DevpostIngestionLayer(42);
    const result = await parser.parse('Build an AI-powered chatbot with React and Python', 'text');
    expect(result.title).toBeTruthy();
    expect(result.problemStatement).toBeTruthy();
    expect(result.judgingCriteria.length).toBeGreaterThanOrEqual(3);
    expect(result.techStackHints).toContain('React');
    expect(result.techStackHints).toContain('Python');
  });

  it('parses devpost URL (fallback when fetch fails)', async () => {
    const parser = new DevpostIngestionLayer(42);
    const result = await parser.parse('https://devpost.com/software/ai-chatbot', 'devpost_url');
    expect(result.title).toBeTruthy();
    expect(result.judgingCriteria.length).toBeGreaterThanOrEqual(3);
    expect(result.implicitGoals.length).toBeGreaterThanOrEqual(1);
  }, 15000);
});

describe('GlobalMemoryIndex', () => {
  it('stores and retrieves project snapshots', () => {
    const mem = new GlobalMemoryIndex(42);
    const snap: ProjectSnapshot = {
      snapshotId: 'test-1',
      projectName: 'Test',
      projectDescription: 'Test project',
      strategy: {
        id: 's1',
        projectName: 'test',
        winningStrategy: 'MVP',
        mvpScope: [],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.7,
        recommendedTimeAllocation: {},
        createdAt: 'now',
      },
      techStack: ['React'],
      judgeCriteria: ['Impact'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      overallScore: 0.9,
      errors: [],
      failurePatterns: [],
      mutations: [],
      startedAt: 'now',
      completedAt: 'now',
      tags: [],
    };
    mem.store(snap);
    expect(mem.getSnapshotCount()).toBe(1);
  });

  it('extracts winning patterns', () => {
    const mem = new GlobalMemoryIndex(42);
    const snap: ProjectSnapshot = {
      snapshotId: 'test-2',
      projectName: 'Winner',
      projectDescription: 'Won before',
      strategy: {
        id: 's2',
        projectName: 'winner',
        winningStrategy: 'UX First',
        mvpScope: [],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.9,
        recommendedTimeAllocation: {},
        createdAt: 'now',
      },
      techStack: ['React'],
      judgeCriteria: ['Impact'],
      constraints: [],
      uxResults: [],
      deploySuccess: true,
      overallScore: 0.95,
      errors: [],
      failurePatterns: [],
      mutations: [],
      startedAt: 'now',
      completedAt: 'now',
      tags: [],
    };
    mem.store(snap);
    const patterns = mem.extractWinningPatterns();
    expect(patterns.length).toBeGreaterThanOrEqual(1);
  });
});

describe('ToolExecutionGateway', () => {
  it('initializes with default config', () => {
    const gw = new ToolExecutionGateway(42);
    expect(gw.isToolAllowed('github')).toBe(true);
    expect(gw.isToolAllowed('deploy')).toBe(true);
    expect(gw.requiresApproval('deploy')).toBe(true);
    expect(gw.requiresApproval('github')).toBe(false);
    expect(gw.getCallLog()).toEqual([]);
  });

  it('tracks call statistics', () => {
    const gw = new ToolExecutionGateway(42);
    const stats = gw.getCallStats();
    expect(stats.total).toBe(0);
    expect(stats.success).toBe(0);
    expect(stats.failed).toBe(0);
  });
});

describe('InterruptProtocol', () => {
  it('raises and resolves interrupts', () => {
    const ip = new InterruptProtocol(42);
    expect(ip.hasActiveInterrupt()).toBe(false);

    ip.raiseInterrupt('deployment_approval', [
      {
        questionId: 'q1',
        type: 'yes_no',
        title: 'Deploy?',
        description: 'Deploy to production?',
        required: true,
        context: {},
      },
    ]);
    expect(ip.hasActiveInterrupt()).toBe(true);

    const resolved = ip.resolveInterrupt([{ questionId: 'q1', answer: 'yes' }]);
    expect(resolved).toBe(true);
    expect(ip.hasActiveInterrupt()).toBe(false);
  });

  it('detects ambiguity in empty input', () => {
    const ip = new InterruptProtocol(42);
    const questions = ip.detectAmbiguity('', {});
    expect(questions.length).toBeGreaterThanOrEqual(1);
    expect(questions[0]!.title).toBeTruthy();
  });

  it('creates deployment approval request', () => {
    const ip = new InterruptProtocol(42);
    const state = ip.requestDeploymentApproval('vercel', 'my-repo');
    expect(state.reason).toBe('deployment_approval');
    expect(state.questions.length).toBe(1);
    expect(state.questions[0]!.type).toBe('yes_no');
  });
});

describe('ObservabilityLayer', () => {
  it('traces events and categorizes them', () => {
    const obs = new ObservabilityLayer(42);
    obs.start();
    obs.trace('decision', 'Test decision');
    obs.trace('error', 'Test error');
    obs.trace('deployment', 'Test deploy');

    const errors = obs.getTraceByCategory('error');
    expect(errors.length).toBe(1);
    expect(errors[0]!.message).toContain('Test error');

    expect(obs.getTrace().length).toBe(4); // start + 3 traces
  });

  it('generates execution report', () => {
    const obs = new ObservabilityLayer(42);
    obs.start();
    obs.trace('decision', 'A decision');
    obs.trace('tool_call', 'A tool call');

    const report = obs.exportFullExecutionReport('hackathon', [], [], [], [], null);
    expect(report.reportId).toMatch(/^report-/);
    expect(report.systemTrace.length).toBeGreaterThanOrEqual(2);
    expect(report.summary.totalDecisions).toBe(0);
  });
});

describe('RuntimeInput Validation', () => {
  it('fails with empty input', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const input: RuntimeInput = {};
    // Should succeed with fallback parsing
    const output = await runtime.run(input);
    expect(output.success).toBe(false);
  }, 10000);
});
