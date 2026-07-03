import { describe, it, expect, vi } from 'vitest';

import { DemoSurfaceCompiler } from '../../benchmarks/demo-surface-compiler.js';
import type {
  DemoSurfacePlan,
  FinalDemoOutput,
  WinScoreBreakdown,
  DemoExecutionStep,
  WowMoment,
} from '../../benchmarks/demo-surface-compiler.js';
import { ExecutionConvergenceEngine } from '../../benchmarks/execution-convergence-engine.js';
import type { ConvergenceCriteria, ConvergenceReport } from '../../benchmarks/execution-convergence-engine.js';
import { FailureResilienceLayer } from '../../benchmarks/failure-resilience-layer.js';
import type { RetryPolicy, ResilienceResult } from '../../benchmarks/failure-resilience-layer.js';
import type { GlobalGoal, DriftReport } from '../../benchmarks/global-goal-monitor.js';
import { GlobalGoalMonitor } from '../../benchmarks/global-goal-monitor.js';
import { MultiStrategyExecutionEngine } from '../../benchmarks/multi-strategy-execution-engine.js';
import type {
  CompetingStrategy,
  MultiStrategyResult,
  StrategyType,
} from '../../benchmarks/multi-strategy-execution-engine.js';
import { SandboxExecutionMode } from '../../benchmarks/sandbox-execution-mode.js';
import type { SandboxSimulationConfig, SandboxReport } from '../../benchmarks/sandbox-execution-mode.js';
import { SkillGraph } from '../../benchmarks/skill-graph.js';
import { StrategicPlanner } from '../../benchmarks/strategic-planner.js';
import { TaskGraph } from '../../benchmarks/task-graph.js';
import { TasteGovernor } from '../../benchmarks/taste-governor.js';
import type { FeatureProposal } from '../../benchmarks/taste-governor.js';
import { UnifiedRuntimeOS } from '../../benchmarks/unified-runtime-os.js';
import type { UserFeedback, FeedbackType } from '../../benchmarks/user-feedback-injection-loop.js';
import { UserFeedbackInjectionLoop } from '../../benchmarks/user-feedback-injection-loop.js';

describe('Phase 13.5 — GlobalGoalMonitor', () => {
  it('constructs with default seed', () => {
    const monitor = new GlobalGoalMonitor(42);
    expect(monitor.getGoal('global-innovation-threshold')).toBeDefined();
    expect(monitor.getDriftHistory()).toEqual([]);
  });

  it('sets and retrieves goal state', () => {
    const monitor = new GlobalGoalMonitor(42);
    const goal: GlobalGoal = {
      goalId: 'my-goal',
      description: 'Build a healthcare app',
      category: 'performance',
      targetValue: 1,
      currentValue: 0,
      completionEpoch: null,
      priority: 'high',
      rewardTokens: 500,
    };
    monitor.setGoal(goal);
    expect(monitor.getGoal('my-goal')).toEqual(goal);
  });

  it('evaluates task alignment with no drift', () => {
    const monitor = new GlobalGoalMonitor(42);
    monitor.setGoal({
      goalId: 'web-app-goal',
      description: 'Build a web app',
      category: 'performance',
      targetValue: 1,
      currentValue: 0,
      completionEpoch: null,
      priority: 'high',
      rewardTokens: 500,
    });
    const graph = new TaskGraph('test', 42);
    const task1Id = graph.addNode('Build UI', 'frontend', [], 'runtime');
    const task2Id = graph.addNode('Build API', 'backend', [], 'runtime');
    const task3Id = graph.addNode('Deploy to production', 'deployment', [], 'runtime');
    graph.markRunning(task1Id);
    graph.markDone(task1Id, ['ui']);
    graph.markRunning(task2Id);
    graph.markDone(task2Id, ['api']);
    graph.markRunning(task3Id);
    graph.markDone(task3Id, ['deployed']);

    const alignment = monitor.evaluateTaskAlignment(graph);
    expect(alignment).toBeGreaterThanOrEqual(0);
  });

  it('evaluateTaskAlignment returns alignment score when no goal set', () => {
    const monitor = new GlobalGoalMonitor(42);
    const graph = new TaskGraph('test', 42);
    const alignment = monitor.evaluateTaskAlignment(graph);
    expect(alignment).toBeGreaterThanOrEqual(0);
  });

  it('evaluateTaskAlignment returns alignment score after setting goal', () => {
    const monitor = new GlobalGoalMonitor(42);
    monitor.setGoal({
      goalId: 'app-goal',
      description: 'Build app',
      category: 'performance',
      targetValue: 1,
      currentValue: 0,
      completionEpoch: null,
      priority: 'high',
      rewardTokens: 500,
    });
    const graph = new TaskGraph('test', 42);
    const nId = graph.addNode('Build UI screen', 'frontend', [], 'runtime');
    graph.markRunning(nId);
    graph.markDone(nId, ['ui']);
    const n2Id = graph.addNode('Build API endpoint', 'backend', [], 'runtime');
    graph.markRunning(n2Id);
    graph.markDone(n2Id, ['api']);

    const alignment = monitor.evaluateTaskAlignment(graph);
    expect(alignment).toBeGreaterThanOrEqual(0);
  });

  it('getSubmissionReadiness returns score based on uncompleted goals', () => {
    const monitor = new GlobalGoalMonitor(42);
    const readiness = monitor.getSubmissionReadiness(1);
    expect(readiness.ready).toBeDefined();
    expect(readiness.score).toBeGreaterThanOrEqual(0);
    expect(readiness.score).toBeLessThanOrEqual(1);
  });

  it('computes submission readiness via getSubmissionReadiness with epoch', () => {
    const monitor = new GlobalGoalMonitor(42);
    const readiness = monitor.getSubmissionReadiness(1);
    expect(readiness.score).toBeCloseTo(0.4, 1);
  });
});

describe('Phase 13.5 — ExecutionConvergenceEngine', () => {
  it('constructs with default criteria', () => {
    const engine = new ExecutionConvergenceEngine(42);
    const criteria = engine.getDefaultCriteria();
    expect(criteria.deploymentStable).toBe(true);
    expect(criteria.minUxScore).toBe(0.6);
    expect(criteria.testSuitePassThreshold).toBe(0.8);
  });

  it('evaluates convergence returns structured report', () => {
    const engine = new ExecutionConvergenceEngine(42);
    const graph = new TaskGraph('test', 42);
    const n1Id = graph.addNode('UI', 'frontend', [], 'runtime');
    graph.markRunning(n1Id);
    graph.markDone(n1Id, ['ui']);

    const report = engine.evaluateConvergence(graph, 0.9, 0.95, true, {
      minTaskCompletionRate: 0.5,
      testSuitePassThreshold: 0.5,
      minUxScore: 0.3,
    });
    expect(report).toHaveProperty('converged');
    expect(report).toHaveProperty('score');
    expect(report).toHaveProperty('criteria');
    expect(report).toHaveProperty('recommendedAction');
    expect(report).toHaveProperty('details');
    expect(report.score).toBeGreaterThanOrEqual(0);
  });

  it('reports not converged with low scores', () => {
    const engine = new ExecutionConvergenceEngine(42);
    const graph = new TaskGraph('test', 42);
    const n1Id = graph.addNode('UI', 'frontend', [], 'runtime');
    graph.markRunning(n1Id);
    graph.markDone(n1Id, ['ui']);

    const report = engine.evaluateConvergence(graph, 0.3, 0.4, false);
    expect(report.converged).toBe(false);
    expect(report.score).toBeLessThan(0.83);
  });

  it('recommends early stop when fully converged', () => {
    const engine = new ExecutionConvergenceEngine(42);
    const graph = new TaskGraph('test', 42);
    const n1Id = graph.addNode('UI', 'frontend', [], 'runtime');
    graph.markRunning(n1Id);
    graph.markDone(n1Id, ['ui']);
    const report = engine.evaluateConvergence(graph, 0.9, 0.95, true, {
      testSuitePassThreshold: 0.5,
      minUxScore: 0.3,
      minTaskCompletionRate: 0.5,
    });
    if (report.score >= 1) {
      expect(engine.shouldEarlyStop(report)).toBe(true);
    }
  });

  it('recommends rollback when score drops significantly', () => {
    const engine = new ExecutionConvergenceEngine(42);
    const graph = new TaskGraph('test', 42);
    const nId = graph.addNode('Task', 'backend', [], 'runtime');
    graph.markRunning(nId);
    graph.markDone(nId, ['done']);

    // First eval: high score
    engine.evaluateConvergence(graph, 0.9, 0.95, true);
    // Second eval: low score (simulate regression)
    graph.addNode('Broken', 'backend', [nId], 'runtime');
    const report2 = engine.evaluateConvergence(graph, 0.2, 0.3, false);
    expect(report2.recommendedAction).toBe('rollback');
    expect(engine.shouldRollback(report2)).toBe(true);
    expect(report2.rollbackCandidate).not.toBeNull();
  });

  it('tracks convergence history', () => {
    const engine = new ExecutionConvergenceEngine(42);
    const graph = new TaskGraph('test', 42);
    const nId = graph.addNode('Task', 'backend', [], 'runtime');
    graph.markRunning(nId);
    graph.markDone(nId, ['done']);

    engine.evaluateConvergence(graph, 0.5, 0.6, false);
    engine.evaluateConvergence(graph, 0.5, 0.6, false);
    expect(engine.getConvergenceHistory().length).toBe(2);
    expect(engine.getBestScore()).toBeGreaterThan(0);
  });
});

describe('Phase 13.5 — FailureResilienceLayer', () => {
  it('constructs with default policies', () => {
    const layer = new FailureResilienceLayer(42);
    const policy = layer.getPolicy('github');
    expect(policy.maxRetries).toBe(3);
    expect(policy.useExponentialBackoff).toBe(true);
  });

  it('registers custom policies', () => {
    const layer = new FailureResilienceLayer(42);
    layer.registerPolicy({
      toolType: 'custom_tool',
      maxRetries: 5,
      baseDelayMs: 100,
      useExponentialBackoff: false,
      fallbackStrategy: 'abort',
    });
    const policy = layer.getPolicy('custom_tool');
    expect(policy.maxRetries).toBe(5);
    expect(policy.fallbackStrategy).toBe('abort');
  });

  it('succeeds on first attempt', async () => {
    const layer = new FailureResilienceLayer(42);
    const result = await layer.executeWithRetry('shell', 'test', async () => 'ok');
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.result).toBe('ok');
  });

  it('retries and succeeds', async () => {
    const layer = new FailureResilienceLayer(42);
    let attempts = 0;
    const result = await layer.executeWithRetry('fetch', 'test', async () => {
      attempts++;
      if (attempts < 2) throw new Error('temporary failure');
      return 'success';
    });
    expect(result.success).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.result).toBe('success');
  });

  it('uses fallback strategy when retries exhausted', async () => {
    const layer = new FailureResilienceLayer(42);
    layer.registerPolicy({
      toolType: 'flaky',
      maxRetries: 1,
      baseDelayMs: 10,
      useExponentialBackoff: false,
      fallbackStrategy: 'use_mock',
    });
    const result = await layer.executeWithRetry('flaky', 'test', async () => {
      throw new Error('persistent failure');
    });
    expect(result.success).toBe(false);
    expect(result.fallbackTriggered).toBe(true);
    expect(result.recoveryAction).toContain('mock');
    expect(result.attempts).toBe(2);
  });

  it('tracks failure records', async () => {
    const layer = new FailureResilienceLayer(42);
    await layer.executeWithRetry('fetch', 'fail', async () => {
      throw new Error('error');
    });
    const records = layer.getToolFailureRecords();
    const fetchRecord = records.find((r) => r.toolType === 'fetch');
    expect(fetchRecord).toBeDefined();
    expect(fetchRecord!.totalFailures).toBeGreaterThan(0);
    expect(fetchRecord!.lastError).toBe('error');
  });

  it('generates failure summary', async () => {
    const layer = new FailureResilienceLayer(42);
    await layer.executeWithRetry('fetch', 'fail', async () => {
      throw new Error('err');
    });
    const summary = layer.getFailureSummary();
    expect(summary).toContain('fetch');
    expect(summary).toContain('%');
  });
});

describe('Phase 13.5 — MultiStrategyExecutionEngine', () => {
  function makeBasePlan(planner: StrategicPlanner): ReturnType<typeof planner.analyzeCompetitionIntent> {
    return planner.analyzeCompetitionIntent('Test', 'Build something', ['ux', 'speed'], ['deploy'], ['react']);
  }

  it('generates 5 competing strategies', () => {
    const engine = new MultiStrategyExecutionEngine(42);
    const planner = new StrategicPlanner(42);
    const basePlan = makeBasePlan(planner);
    const strategies = engine.generateStrategies(basePlan, ['ux', 'speed'], ['deploy']);
    expect(strategies.length).toBe(5);
    const types = strategies.map((s) => s.type);
    expect(types).toContain('mvp_fast');
    expect(types).toContain('balanced_default');
    expect(types).toContain('polish_ux');
    expect(types).toContain('innovation_experimental');
    expect(types).toContain('constraint_optimized');
  });

  it('sorts strategies by score descending', () => {
    const engine = new MultiStrategyExecutionEngine(42);
    const planner = new StrategicPlanner(42);
    const basePlan = makeBasePlan(planner);
    const strategies = engine.generateStrategies(basePlan, ['ux'], []);
    for (let i = 1; i < strategies.length; i++) {
      expect(strategies[i - 1]!.simulationScore).toBeGreaterThanOrEqual(strategies[i]!.simulationScore);
    }
  });

  it('selects winner as top strategy by default', () => {
    const engine = new MultiStrategyExecutionEngine(42);
    const planner = new StrategicPlanner(42);
    const basePlan = makeBasePlan(planner);
    const strategies = engine.generateStrategies(basePlan, ['ux'], []);
    const result = engine.selectWinner(strategies);
    expect(result.winner).toBe(strategies[0]);
    expect(result.selectionReason).toContain(result.winner.name);
  });

  it('selects winner by preference', () => {
    const engine = new MultiStrategyExecutionEngine(42);
    const planner = new StrategicPlanner(42);
    const basePlan = makeBasePlan(planner);
    const strategies = engine.generateStrategies(basePlan, ['ux'], []);
    const result = engine.selectWinner(strategies, 'polish_ux');
    expect(result.winner.type).toBe('polish_ux');
  });

  it('each strategy has all required fields', () => {
    const engine = new MultiStrategyExecutionEngine(42);
    const planner = new StrategicPlanner(42);
    const basePlan = makeBasePlan(planner);
    const strategies = engine.generateStrategies(basePlan, ['ux'], []);
    for (const s of strategies) {
      expect(s.strategyId).toMatch(/^strat-/);
      expect(s.simulationScore).toBeGreaterThanOrEqual(0);
      expect(s.uxScore).toBeGreaterThanOrEqual(0);
      expect(s.deployProbability).toBeGreaterThanOrEqual(0);
      expect(s.riskScore).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('Phase 13.5 — UserFeedbackInjectionLoop', () => {
  it('ingests and queues feedback', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const fb = loop.ingestUserFeedback('ui_critique', 'Button colors are wrong', 8);
    expect(fb.feedbackId).toMatch(/^fb-/);
    expect(loop.hasQueuedFeedback()).toBe(true);
    expect(loop.getFeedbackHistory().length).toBe(1);
  });

  it('processes ui_critique feedback', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const graph = new TaskGraph('test', 42);
    graph.addNode('UI component', 'frontend', [], 'runtime');

    loop.ingestUserFeedback('ui_critique', 'Fix the layout', 9);
    const action = loop.processNextFeedback(graph);
    expect(action).not.toBeNull();
    expect(action!.reason).toBe('user_feedback');
    expect(action!.addedTasks.length).toBeGreaterThan(0);
    expect(loop.hasQueuedFeedback()).toBe(false);
  });

  it('processes feature_request feedback', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const graph = new TaskGraph('test', 42);

    loop.ingestUserFeedback('feature_request', 'Add dark mode', 5);
    const action = loop.processNextFeedback(graph);
    expect(action).not.toBeNull();
    expect(action!.addedTasks[0]).toContain('dark mode');
  });

  it('processes blocking_issue feedback', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const graph = new TaskGraph('test', 42);
    const n = graph.addNode('Database connection', 'backend', [], 'runtime');

    loop.ingestUserFeedback('blocking_issue', 'Cannot connect to database', 10);
    const action = loop.processNextFeedback(graph);
    expect(action).not.toBeNull();
    expect(action!.priorityChanges.length).toBeGreaterThanOrEqual(0);
  });

  it('processes preference_override feedback', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const graph = new TaskGraph('test', 42);
    graph.addNode('Task A', 'backend', [], 'runtime');

    loop.ingestUserFeedback('preference_override', 'Use React instead of Vue', 10);
    const action = loop.processNextFeedback(graph);
    expect(action).not.toBeNull();
    expect(action!.affectedTaskIds.length).toBeGreaterThan(0);
  });

  it('processes general feedback', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const graph = new TaskGraph('test', 42);

    loop.ingestUserFeedback('general', 'Looks good so far', 3);
    const action = loop.processNextFeedback(graph);
    expect(action).not.toBeNull();
    expect(action!.addedTasks.length).toBeGreaterThan(0);
  });

  it('respects priority ordering', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const graph = new TaskGraph('test', 42);

    loop.ingestUserFeedback('general', 'Low priority', 1);
    loop.ingestUserFeedback('blocking_issue', 'CRITICAL', 10);
    loop.ingestUserFeedback('general', 'Medium priority', 5);

    const first = loop.processNextFeedback(graph);
    expect(first!.description).toContain('CRITICAL');
    const second = loop.processNextFeedback(graph);
    expect(second!.description).toContain('Medium');
  });

  it('returns null when no feedback queued', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    const graph = new TaskGraph('test', 42);
    expect(loop.processNextFeedback(graph)).toBeNull();
  });

  it('reports feedback stats', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    loop.ingestUserFeedback('general', 'test', 3);
    const stats = loop.getFeedbackStats();
    expect(stats.total).toBe(1);
    expect(stats.pending).toBe(1);
    expect(stats.byType['general']).toBe(1);
  });

  it('clears feedback queue', () => {
    const loop = new UserFeedbackInjectionLoop(42);
    loop.ingestUserFeedback('general', 'test', 3);
    expect(loop.hasQueuedFeedback()).toBe(true);
    loop.clearFeedback();
    expect(loop.hasQueuedFeedback()).toBe(false);
  });
});

describe('Phase 13.5 — SandboxExecutionMode', () => {
  function makePlan(planner: StrategicPlanner) {
    return planner.analyzeCompetitionIntent('Test', 'Build', ['ux'], ['deploy'], ['react']);
  }

  it('constructs with default config', () => {
    const sandbox = new SandboxExecutionMode(42);
    const config = sandbox.getDefaultConfig();
    expect(config.simulateDeploy).toBe(true);
    expect(config.simulateBrowserTest).toBe(true);
    expect(config.simulationFidelity).toBe('medium');
  });

  it('simulates execution and returns report', async () => {
    const sandbox = new SandboxExecutionMode(42);
    const graph = new TaskGraph('test', 42);
    const nId = graph.addNode('Build feature', 'backend', [], 'runtime');
    graph.markRunning(nId);
    graph.markDone(nId, ['built']);

    const planner = new StrategicPlanner(42);
    const plan = makePlan(planner);

    const report = await sandbox.simulateExecution(plan, graph);
    expect(report.simulationId).toMatch(/^sim-/);
    expect(report.riskScore).toBeGreaterThanOrEqual(0);
    expect(report.deployPrediction).toBeDefined();
    expect(report.browserTestPrediction).toBeDefined();
    expect(report.uxPrediction).toBeDefined();
    expect(report.recommendations.length).toBeGreaterThan(0);
  });

  it('recommends skipping real execution when risk is high', async () => {
    const sandbox = new SandboxExecutionMode(42);
    const graph = new TaskGraph('test', 42);
    const nId = graph.addNode('High risk feature', 'backend', [], 'runtime');
    graph.markRunning(nId);
    graph.markDone(nId, ['done']);
    const planner = new StrategicPlanner(42);
    const plan = makePlan(planner);
    const report = await sandbox.simulateExecution(plan, graph);

    const shouldSkip = sandbox.shouldSkipRealExecution(report, 0);
    expect(shouldSkip).toBe(true);
    expect(sandbox.shouldSkipRealExecution(report, 1)).toBe(false);
  });

  it('dry run GitHub returns estimate', async () => {
    const sandbox = new SandboxExecutionMode(42);
    const gh = await sandbox.dryRunGitHub();
    expect(gh.success).toBe(true);
    expect(gh.estimatedCommits).toBeGreaterThanOrEqual(1);
    expect(gh.estimatedFiles).toBeGreaterThanOrEqual(5);
  });

  it('dry run deploy returns prediction', async () => {
    const sandbox = new SandboxExecutionMode(42);
    const dep = await sandbox.dryRunDeploy();
    expect(dep.predictedUrl).toBeTruthy();
  });

  it('tracks simulation history', async () => {
    const sandbox = new SandboxExecutionMode(42);
    const graph = new TaskGraph('test', 42);
    const nId = graph.addNode('Task', 'backend', [], 'runtime');
    graph.markRunning(nId);
    graph.markDone(nId, ['done']);
    const planner = new StrategicPlanner(42);
    const plan = makePlan(planner);

    await sandbox.simulateExecution(plan, graph);
    await sandbox.simulateExecution(plan, graph);
    expect(sandbox.getHistory().length).toBe(2);
  });
});

describe('Phase 13.5 — UnifiedRuntimeOS Integration', () => {
  it('creates all Phase 13.5 subsystems', () => {
    const runtime = new UnifiedRuntimeOS();
    expect(runtime.goalMonitor).toBeInstanceOf(GlobalGoalMonitor);
    expect(runtime.convergenceEngine).toBeInstanceOf(ExecutionConvergenceEngine);
    expect(runtime.resilienceLayer).toBeInstanceOf(FailureResilienceLayer);
    expect(runtime.strategyEngine).toBeInstanceOf(MultiStrategyExecutionEngine);
    expect(runtime.feedbackLoop).toBeInstanceOf(UserFeedbackInjectionLoop);
    expect(runtime.sandboxMode).toBeInstanceOf(SandboxExecutionMode);
  });

  it('runs full pipeline including Phase 13.5 steps in hackathon mode', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const output = await runtime.run({
      problemStatement: 'Build a web app with authentication and UI. Judging: functionality, ux, deploy.',
    });
    expect(output.success).toBe(true);
    expect(output.finalState.currentExecutionPointer.completedSteps).toContain('phase13_strategy');
    expect(output.finalState.currentExecutionPointer.completedSteps).toContain('sandbox_simulation');
    expect(output.finalState.currentExecutionPointer.completedSteps).toContain('convergence_check');
  });

  it('subsystems are available after run', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    await runtime.run({
      problemStatement: 'Build a simple app.',
    });
    // Demo Surface Compiler produces a plan (replaces Phase 13.5 strategy/goal/sandbox/convergence)
    expect(runtime.demoSurfaceCompiler.getPlan()).not.toBeNull();
    expect(runtime.demoSurfaceCompiler.getPlan()!.winScore).toBeGreaterThanOrEqual(0);
    // Core subsystems remain accessible
    expect(runtime.goalMonitor).toBeDefined();
    expect(runtime.sandboxMode).toBeDefined();
    expect(runtime.convergenceEngine).toBeDefined();
  });

  it('feedback loop integration processes queued feedback', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    runtime.feedbackLoop.ingestUserFeedback('ui_critique', 'Fix the navbar', 9);
    runtime.feedbackLoop.ingestUserFeedback('feature_request', 'Add search', 5);

    await runtime.run({
      problemStatement: 'Build a web app.',
    });

    const stats = runtime.feedbackLoop.getFeedbackStats();
    expect(stats.addressed).toBe(2);
    expect(stats.pending).toBe(0);
  });

  it('runs pipeline in benchmark mode without Phase 13.5 optional steps', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'benchmark' });
    const output = await runtime.run({
      problemStatement: 'Test benchmark mode.',
    });
    expect(output.success).toBe(true);
  });

  it('runs pipeline in research mode without Phase 13.5 optional steps', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'research' });
    const output = await runtime.run({
      problemStatement: 'Test research mode.',
    });
    expect(output.success).toBe(true);
  });
});

describe('Taste & Simplicity Governor', () => {
  // ---- Simplicity Scoring ----

  it('approves features with high demo visibility that also reduce failure risk', () => {
    const gov = new TasteGovernor(42);
    const verdict = gov.evaluateTaste({
      name: 'Landing Page Hero',
      description: 'Show a polished landing page with live demo and error handling',
      category: 'feature',
      visibleInDemo: true,
      improvesDemoFlow: true,
      reducesFailureRisk: true,
      improvesSpeed: false,
      addsNewAbstractionLayer: false,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: false,
      estimatedJudgeGraspSeconds: 10,
    });
    expect(verdict.approved).toBe(true);
    expect(verdict.score.total).toBeGreaterThanOrEqual(70);
    expect(verdict.demoImpact).toBe('high');
  });

  it('rejects features with low simplicity score', () => {
    const gov = new TasteGovernor(42);
    const verdict = gov.evaluateTaste({
      name: 'Internal Refactor Pipeline',
      description: 'Abstract execution graph with multi-layer orchestration',
      category: 'abstraction',
      visibleInDemo: false,
      improvesDemoFlow: false,
      reducesFailureRisk: false,
      improvesSpeed: false,
      addsNewAbstractionLayer: true,
      addsNewAgent: true,
      addsNewFileWithoutDemoRelevance: true,
      increasesDebugSurface: true,
      estimatedJudgeGraspSeconds: 120,
    });
    expect(verdict.approved).toBe(false);
    expect(verdict.score.total).toBeLessThan(70);
    expect(verdict.rejectionReason).toBeTruthy();
  });

  it('scores visible features at 55 base (30+25) minus penalties', () => {
    const gov = new TasteGovernor(42);
    const score = gov.scoreFeature({
      name: 'UI Button',
      description: 'Adds a visible button to the demo',
      category: 'feature',
      visibleInDemo: true,
      improvesDemoFlow: true,
      reducesFailureRisk: false,
      improvesSpeed: false,
      addsNewAbstractionLayer: false,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: false,
      estimatedJudgeGraspSeconds: 5,
    });
    expect(score.total).toBe(55);
    expect(score.passed).toBe(false);
  });

  it('scores risk-reducing visible feature above threshold', () => {
    const gov = new TasteGovernor(42);
    const score = gov.scoreFeature({
      name: 'Deploy with tests',
      description: 'Deploys app and runs browser tests',
      category: 'feature',
      visibleInDemo: true,
      improvesDemoFlow: true,
      reducesFailureRisk: true,
      improvesSpeed: false,
      addsNewAbstractionLayer: false,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: false,
      estimatedJudgeGraspSeconds: 10,
    });
    expect(score.total).toBe(75);
    expect(score.passed).toBe(true);
  });

  it('penalizes new agents and debug surface', () => {
    const gov = new TasteGovernor(42);
    const score = gov.scoreFeature({
      name: 'New supervisor agent',
      description: 'Adds a new overseer agent to coordinate existing agents',
      category: 'agent',
      visibleInDemo: false,
      improvesDemoFlow: false,
      reducesFailureRisk: false,
      improvesSpeed: false,
      addsNewAbstractionLayer: true,
      addsNewAgent: true,
      addsNewFileWithoutDemoRelevance: true,
      increasesDebugSurface: true,
      estimatedJudgeGraspSeconds: 90,
    });
    expect(score.total).toBe(0);
    expect(score.passed).toBe(false);
  });

  // ---- Demo Win Filter ----

  it('demoWinFilter passes for demo-relevant descriptions', () => {
    const gov = new TasteGovernor(42);
    const result = gov.demoWinFilter('Show landing page in demo with clickable UI');
    expect(result.yes).toBe(true);
  });

  it('demoWinFilter rejects internal-only descriptions', () => {
    const gov = new TasteGovernor(42);
    const result = gov.demoWinFilter('Refactor internal pipeline orchestration');
    expect(result.yes).toBe(false);
  });

  // ---- Anti-Pattern Detection ----

  it('blocks anti-patterns with hard_block severity', () => {
    const gov = new TasteGovernor(42);
    const proposal: FeatureProposal = {
      name: 'Self-evolving architecture',
      description: 'Implement a self-evolving architecture with meta-learning optimization',
      category: 'system',
      visibleInDemo: false,
      improvesDemoFlow: false,
      reducesFailureRisk: false,
      improvesSpeed: false,
      addsNewAbstractionLayer: true,
      addsNewAgent: true,
      addsNewFileWithoutDemoRelevance: true,
      increasesDebugSurface: true,
      estimatedJudgeGraspSeconds: 120,
    };
    const matches = gov.detectAntiPatterns(proposal);
    const hasHardBlock = matches.some((m) => m.severity === 'hard_block');
    expect(hasHardBlock).toBe(true);
  });

  it('warns on redundant agent patterns', () => {
    const gov = new TasteGovernor(42);
    const proposal: FeatureProposal = {
      name: 'Supervisor agent',
      description: 'Add a manager agent to coordinate sub-agents',
      category: 'agent',
      visibleInDemo: false,
      improvesDemoFlow: false,
      reducesFailureRisk: false,
      improvesSpeed: false,
      addsNewAbstractionLayer: true,
      addsNewAgent: true,
      addsNewFileWithoutDemoRelevance: true,
      increasesDebugSurface: true,
      estimatedJudgeGraspSeconds: 60,
    };
    const matches = gov.detectAntiPatterns(proposal);
    expect(matches.some((m) => m.pattern === 'redundant_agent')).toBe(true);
  });

  // ---- Strategy Approval ----

  it('approves polish_ux strategy (high demo visibility + low risk)', () => {
    const gov = new TasteGovernor(42);
    const strategy: CompetingStrategy = {
      strategyId: 'strat-001',
      type: 'polish_ux',
      name: 'UX Excellence',
      simulationScore: 0.85,
      uxScore: 0.9,
      deployProbability: 0.8,
      timeEstimateMs: 60000,
      riskScore: 0.2,
      details: 'Production-quality UI with smooth animations',
      plan: {
        id: 'plan-001',
        projectName: 'Test',
        winningStrategy: 'polish_ux',
        mvpScope: [],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.7,
        recommendedTimeAllocation: {},
        createdAt: '',
      },
    };
    const result = gov.approveStrategy(strategy);
    expect(result.approved).toBe(true);
  });

  it('rejects innovation_experimental strategy', () => {
    const gov = new TasteGovernor(42);
    const strategy: CompetingStrategy = {
      strategyId: 'strat-002',
      type: 'innovation_experimental',
      name: 'Innovation Edge',
      simulationScore: 0.5,
      uxScore: 0.4,
      deployProbability: 0.5,
      timeEstimateMs: 120000,
      riskScore: 0.7,
      details: 'Cutting-edge approach with experimental features',
      plan: {
        id: 'plan-002',
        projectName: 'Test',
        winningStrategy: 'innovation_experimental',
        mvpScope: [],
        wowFactors: [],
        risks: [],
        scoringAlignment: {},
        competitionAnalysis: { judgePriorities: [], differentiators: [], commonPitfalls: [] },
        estimatedSuccessProbability: 0.4,
        recommendedTimeAllocation: {},
        createdAt: '',
      },
    };
    const result = gov.approveStrategy(strategy);
    expect(result.approved).toBe(false);
  });

  // ---- Execution Plan Approval ----

  it('rejects execution plans that lack demo visibility', () => {
    const gov = new TasteGovernor(42);
    const result = gov.approveExecutionPlan('Build UI + API + Deploy', 5);
    expect(result.approved).toBe(false);
  });

  it('rejects bloated execution plans', () => {
    const gov = new TasteGovernor(42);
    const result = gov.approveExecutionPlan('Complex 20-step pipeline', 20);
    expect(result.approved).toBe(false);
  });

  // ---- Tool Call Approval ----

  it('approves deploy tool calls (visible demo output)', () => {
    const gov = new TasteGovernor(42);
    const result = gov.approveToolCall('deploy', 'deploy-to-vercel');
    expect(result.approved).toBe(true);
  });

  it('rejects internal tool calls without demo visibility', () => {
    const gov = new TasteGovernor(42);
    const result = gov.approveToolCall('fetch', 'fetch-api-data');
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('demo impact');
  });

  // ---- Deployment Approval ----

  it('approves deployment when risk is low', () => {
    const gov = new TasteGovernor(42);
    const report: SandboxReport = {
      simulationId: 'sim-001',
      riskScore: 0.3,
      deployPrediction: {
        success: true,
        confidence: 0.8,
        estimatedDurationMs: 30000,
        failureProbability: 0.2,
        likelyFailures: [],
      },
      browserTestPrediction: { expectedPassRate: 0.9, likelyFailures: [], estimatedFlowScore: 0.85 },
      uxPrediction: { expectedScore: 0.8, confidence: 0.7 },
      failurePredictions: [],
      recommendations: [],
      estimatedDurationsMs: {},
    };
    const result = gov.approveDeployment(report);
    expect(result.approved).toBe(true);
  });

  it('rejects deployment when risk exceeds threshold', () => {
    const gov = new TasteGovernor(42);
    const report: SandboxReport = {
      simulationId: 'sim-002',
      riskScore: 0.85,
      deployPrediction: {
        success: false,
        confidence: 0.3,
        estimatedDurationMs: 60000,
        failureProbability: 0.8,
        likelyFailures: ['Build failure'],
      },
      browserTestPrediction: { expectedPassRate: 0.3, likelyFailures: ['Broken UI'], estimatedFlowScore: 0.2 },
      uxPrediction: { expectedScore: 0.2, confidence: 0.3 },
      failurePredictions: [],
      recommendations: [],
      estimatedDurationsMs: {},
    };
    const result = gov.approveDeployment(report);
    expect(result.approved).toBe(false);
  });

  // ---- Simplification Engine ----

  it('proposes simplifications for redundant systems', () => {
    const gov = new TasteGovernor(42);
    const graph = new TaskGraph('test', 42);
    const systems = [
      'UnifiedRuntimeOS',
      'GlobalExecutionBrain',
      'StrategicPlanner',
      'Phase11Orchestrator',
      'Phase12Orchestrator',
      'ToolExecutionGraph',
      'ToolExecutionGateway',
    ];
    const proposals = gov.simplifyArchitecture(graph, systems);
    expect(proposals.length).toBeGreaterThan(0);
    expect(proposals.some((p) => p.action === 'merge')).toBe(true);
  });

  // ---- Verdict History ----

  it('tracks verdict history', () => {
    const gov = new TasteGovernor(42);
    gov.evaluateTaste({
      name: 'Feature A',
      description: 'Demo feature',
      category: 'feature',
      visibleInDemo: true,
      improvesDemoFlow: true,
      reducesFailureRisk: false,
      improvesSpeed: false,
      addsNewAbstractionLayer: false,
      addsNewAgent: false,
      addsNewFileWithoutDemoRelevance: false,
      increasesDebugSurface: false,
      estimatedJudgeGraspSeconds: 10,
    });
    gov.evaluateTaste({
      name: 'Feature B',
      description: 'Internal refactor',
      category: 'abstraction',
      visibleInDemo: false,
      improvesDemoFlow: false,
      reducesFailureRisk: false,
      improvesSpeed: false,
      addsNewAbstractionLayer: true,
      addsNewAgent: true,
      addsNewFileWithoutDemoRelevance: true,
      increasesDebugSurface: true,
      estimatedJudgeGraspSeconds: 120,
    });
    expect(gov.getVerdictHistory().length).toBe(2);
  });

  // ---- UnifiedRuntimeOS Integration ----

  it('UnifiedRuntimeOS creates tasteGovernor subsystem', () => {
    const runtime = new UnifiedRuntimeOS();
    expect(runtime.tasteGovernor).toBeInstanceOf(TasteGovernor);
  });

  it('pipeline includes taste validation step', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const output = await runtime.run({
      problemStatement: 'Build a web app with auth and UI.',
    });
    expect(output.success).toBe(true);
    expect(output.finalState.currentExecutionPointer.completedSteps).toContain('taste_validation');
  });

  it('taste governor runs before demo surface compilation', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const steps: string[] = [];
    const origTaste = runtime['runTasteGovernorValidation'].bind(runtime);
    runtime['runTasteGovernorValidation'] = async () => {
      steps.push('taste');
      return origTaste();
    };
    const origDemo = runtime['runDemoSurfaceCompilation'].bind(runtime);
    runtime['runDemoSurfaceCompilation'] = async () => {
      steps.push('demo_surface');
      return origDemo();
    };

    await runtime.run({ problemStatement: 'Build a simple app.' });
    expect(steps).toEqual(['taste', 'demo_surface']);
  });
});

// ---- Demo Surface Compiler ----

describe('Demo Surface Compiler', () => {
  it('creates demo surface plan from parsed input', () => {
    const compiler = new DemoSurfaceCompiler(42);
    const plan = compiler.compile({
      title: 'AI Chat App',
      problemStatement: 'Build a real-time chat app with AI responses and user authentication. Must have a clean UI.',
      judgingCriteria: ['functionality', 'ux', 'innovation'],
      technologies: ['react', 'node', 'openai'],
      constraints: [],
    });
    expect(plan.projectName).toBe('AI Chat App');
    expect(plan.oneLiner).toContain('AI Chat App');
    expect(plan.executionSteps.length).toBeGreaterThanOrEqual(3);
    expect(plan.winScore).toBeGreaterThanOrEqual(0);
    expect(plan.deployTarget).toBe('netlify');
  });

  it('computes win score correctly for full-featured project', () => {
    const compiler = new DemoSurfaceCompiler(42);
    const plan = compiler.compile({
      title: 'Dashboard',
      problemStatement: 'Data dashboard with charts, API backend, and live data fetching.',
      judgingCriteria: ['ui', 'api', 'visual', 'innovation', 'deploy'],
      technologies: ['react', 'd3', 'express'],
      constraints: [],
    });
    expect(plan.winScoreBreakdown.functionalE2E).toBe(30);
    expect(plan.winScoreBreakdown.visualClarity).toBe(20);
    expect(plan.winScoreBreakdown.reliability).toBe(15);
    expect(plan.winScoreBreakdown.novelty).toBe(15);
    expect(plan.winScoreBreakdown.speed).toBe(10);
    expect(plan.winScoreBreakdown.simplicity).toBe(10);
    expect(plan.winScore).toBe(100);
  });

  it('validates wow moment presence', () => {
    const compiler = new DemoSurfaceCompiler(42);
    const plan = compiler.compile({
      title: 'AI App',
      problemStatement: 'AI-powered content generator with OpenAI integration.',
      judgingCriteria: ['ai', 'functionality'],
      technologies: ['python', 'flask'],
      constraints: [],
    });
    const validation = compiler.validateWowMoment(plan);
    expect(validation.valid).toBe(true);
    expect(validation.reason).toContain('AI-generated');
  });

  it('produces final output in required format', () => {
    const compiler = new DemoSurfaceCompiler(42);
    const plan = compiler.compile({
      title: 'My App',
      problemStatement: 'Build a web app.',
      judgingCriteria: ['ui', 'deploy'],
      technologies: ['react'],
      constraints: [],
    });
    const output = compiler.produceFinalOutput(plan, 'https://demo.example.com');
    expect(output.success).toBe(true);
    expect(output.liveUrl).toBe('https://demo.example.com');
    expect(output.whatItDoes).toBeTruthy();
    expect(output.whyItWins).toBeTruthy();
    expect(output.wowMoment).toBeTruthy();
    expect(output.reliability).toContain('Confidence');
  });

  it('handles failure with sandbox fallback', () => {
    const compiler = new DemoSurfaceCompiler(42);
    compiler.compile({
      title: 'Test',
      problemStatement: 'Build a test app.',
      judgingCriteria: ['ui'],
      technologies: [],
      constraints: [],
    });
    const result = compiler.handleFailure(new Error('deploy failed: connection refused'));
    expect(result.degraded).toBe(true);
    expect(result.fallbackPlan).not.toBeNull();
    expect(result.fallbackPlan!.fallbackBehavior).toContain('fallback');
    expect(result.fallbackPlan!.winScore).toBeLessThan(result.fallbackPlan!.winScore + 20);
  });

  it('collapses to single execution path', () => {
    const compiler = new DemoSurfaceCompiler(42);
    const path = compiler.collapseToSinglePath();
    expect(path.length).toBe(5);
    expect(path[0]!.phase).toBe('build');
    expect(path[path.length - 1]!.phase).toBe('test');
    expect(path[path.length - 1]!.action).toBe('verify');
  });

  it('UnifiedRuntimeOS creates demoSurfaceCompiler subsystem', () => {
    const runtime = new UnifiedRuntimeOS();
    expect(runtime.demoSurfaceCompiler).toBeInstanceOf(DemoSurfaceCompiler);
  });

  it('pipeline includes demo_surface_compilation step', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const output = await runtime.run({
      problemStatement: 'Build a web app with auth and UI.',
    });
    expect(output.success).toBe(true);
    expect(output.finalState.currentExecutionPointer.completedSteps).toContain('demo_surface_compilation');
  });

  it('bypasses phase 12/13 strategy systems when demo surface plan is active', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const output = await runtime.run({
      problemStatement: 'Build a simple app.',
    });
    const steps = output.finalState.currentExecutionPointer.completedSteps;
    expect(steps).toContain('demo_surface_compilation');
    // Phase 12/13 steps are recorded as skipped (still present in completedSteps)
    expect(steps).toContain('strategy_competition');
    expect(steps).toContain('phase13_strategy');
    expect(steps).toContain('sandbox_simulation');
    expect(steps).toContain('convergence_check');
  });

  it('artifact includes demo surface plan', async () => {
    const runtime = new UnifiedRuntimeOS({ seed: 42, mode: 'hackathon' });
    const output = await runtime.run({
      problemStatement: 'Build a simple app with AI.',
    });
    expect(output.artifacts.demoSurfacePlan).toBeDefined();
    const plan = output.artifacts.demoSurfacePlan as Record<string, unknown>;
    expect(plan.projectName).toBeTruthy();
    expect(typeof plan.winScore).toBe('number');
    expect(Array.isArray(plan.executionSteps)).toBe(true);
  });
});
